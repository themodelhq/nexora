/**
 * Minimal ERC-20 read helpers backed by real on-chain data.
 * All values are fetched from the live contract — no fabricated balances.
 */

import type { Address, PublicClient } from 'viem';
import { getPublicClient } from './index';

const erc20Abi = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
] as const;

export interface Erc20Info {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

export async function getErc20Info(address: Address, chainId?: number): Promise<Erc20Info> {
  const client = getPublicClient(chainId);
  const name = await client.readContract({ address, abi: erc20Abi, functionName: 'name' });
  const symbol = await client.readContract({ address, abi: erc20Abi, functionName: 'symbol' });
  const decimals = await client.readContract({ address, abi: erc20Abi, functionName: 'decimals' });
  const totalSupply = await client.readContract({
    address,
    abi: erc20Abi,
    functionName: 'totalSupply',
  });
  return {
    name: name as string,
    symbol: symbol as string,
    decimals: decimals as number,
    totalSupply: totalSupply as bigint,
  };
}

export async function getBalance(
  address: Address,
  owner: Address,
  chainId?: number,
): Promise<bigint> {
  const client = getPublicClient(chainId);
  const balance = await client.readContract({
    address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });
  return balance as bigint;
}

export async function getAllowance(
  token: Address,
  owner: Address,
  spender: Address,
  chainId?: number,
): Promise<bigint> {
  const client = getPublicClient(chainId);
  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
  return allowance as bigint;
}
