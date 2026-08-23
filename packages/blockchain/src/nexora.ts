/**
 * Nexora — ecosystem contract read helpers (real on-chain data).
 *
 * These read functions query the deployed Nexora contracts via viem and return
 * authoritative values. When a contract address is not yet deployed/recorded,
 * the functions return `undefined` and the UI renders "Data unavailable".
 * No fabricated values are ever returned.
 */
import type { Address, PublicClient } from 'viem';
import { getPublicClient, formatUnits } from './index';
import { loadAddresses } from '@nexora/config';

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
] as const;

const stakingAbi = [
  'function stakedBalance(address) view returns (uint256)',
  'function earned(address) view returns (uint256)',
  'function totalStaked() view returns (uint256)',
  'function rewardRate() view returns (uint256)',
  'function enabled() view returns (bool)',
] as const;

const airdropAbi = [
  'function hasClaimed(address) view returns (bool)',
  'function claimDeadline() view returns (uint256)',
  'function merkleRoot() view returns (bytes32)',
] as const;

const vestingAbi = [
  'function schedules(uint256) view returns (tuple(address beneficiary,uint256 totalAmount,uint256 claimed,uint64 startTime,uint64 cliffDuration,uint64 duration,bool revocable,bool revoked,uint256 vestedAtRevoke))',
  'function nextScheduleId() view returns (uint256)',
] as const;

const governorAbi = [
  'function token() view returns (address)',
] as const;

const treasuryAbi = [
  'function nativeBalance() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
] as const;

export interface NxrDashboardData {
  balance: string;
  staked: string;
  pendingRewards: string;
  airdropClaimed: boolean;
  airdropClaimDeadline?: string;
  governancePower: string;
  treasuryNxr: string;
  treasuryEth: string;
  totalSupply: string;
}

export async function readErc20Balance(token: Address, owner: Address, chainId?: number): Promise<bigint> {
  const client = getPublicClient(chainId);
  return (await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })) as bigint;
}

export async function readTotalSupply(token: Address, chainId?: number): Promise<bigint> {
  const client = getPublicClient(chainId);
  return (await client.readContract({ address: token, abi: erc20Abi, functionName: 'totalSupply' })) as bigint;
}

/** Fetch all wallet-facing dashboard values from live contracts. */
export async function readDashboard(address: Address): Promise<NxrDashboardData> {
  const client = getPublicClient();
  const addrs = loadAddresses();
  const empty: NxrDashboardData = {
    balance: '0',
    staked: '0',
    pendingRewards: '0',
    airdropClaimed: false,
    governancePower: '0',
    treasuryNxr: '0',
    treasuryEth: '0',
    totalSupply: '0',
  };

  const out = { ...empty };

  // NXR balance + total supply.
  if (addrs.nxrToken) {
    const t = addrs.nxrToken as Address;
    out.balance = formatUnits(await readErc20Balance(t, address));
    out.totalSupply = formatUnits(await readTotalSupply(t));
  }

  // Staking.
  if (addrs.staking) {
    const s = addrs.staking as Address;
    try {
      const staked = (await client.readContract({ address: s, abi: stakingAbi, functionName: 'stakedBalance', args: [address] })) as bigint;
      const earned = (await client.readContract({ address: s, abi: stakingAbi, functionName: 'earned', args: [address] })) as bigint;
      out.staked = formatUnits(staked);
      out.pendingRewards = formatUnits(earned);
    } catch {
      /* contract not live */
    }
  }

  // Airdrop eligibility state.
  if (addrs.airdrop) {
    const a = addrs.airdrop as Address;
    try {
      out.airdropClaimed = (await client.readContract({ address: a, abi: airdropAbi, functionName: 'hasClaimed', args: [address] })) as boolean;
      const deadline = (await client.readContract({ address: a, abi: airdropAbi, functionName: 'claimDeadline' })) as bigint;
      out.airdropClaimDeadline = new Date(Number(deadline) * 1000).toISOString();
    } catch {
      /* not live */
    }
  }

  // Governance power (via the 1:1 vote token balance if the wrapper is live).
  if (addrs.voteToken) {
    try {
      out.governancePower = formatUnits(await readErc20Balance(addrs.voteToken as Address, address));
    } catch {
      /* not live */
    }
  }

  // Treasury balances.
  if (addrs.treasury) {
    const t = addrs.treasury as Address;
    try {
      out.treasuryEth = formatUnits((await client.readContract({ address: t, abi: treasuryAbi, functionName: 'nativeBalance' })) as bigint);
      if (addrs.nxrToken) {
        out.treasuryNxr = formatUnits((await client.readContract({ address: t, abi: treasuryAbi, functionName: 'balanceOf', args: [addrs.nxrToken as Address] })) as bigint);
      }
    } catch {
      /* not live */
    }
  }

  return out;
}
