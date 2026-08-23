'use client';

import { useEffect, useState } from 'react';
import { useAccount, useConnect, useChainId, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { shortAddress } from '@nexora/blockchain';
import { readDashboard } from '@nexora/blockchain';
import { loadAddresses, CHAINS } from '@nexora/config';
import type { NxrDashboardData } from '@nexora/blockchain';

const EMPTY: NxrDashboardData = {
  balance: '0',
  staked: '0',
  pendingRewards: '0',
  airdropClaimed: false,
  governancePower: '0',
  treasuryNxr: '0',
  treasuryEth: '0',
  totalSupply: '0',
};

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [data, setData] = useState<NxrDashboardData>(EMPTY);
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!address) return;
    const addrs = loadAddresses();
    if (!addrs.nxrToken) {
      setStatus('NXR contract is not yet deployed to the active network.');
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const d = await readDashboard(address as `0x${string}`);
        setData(d);
      } catch (e) {
        setStatus(`Could not read on-chain data: ${(e as Error).message}`);
      } finally {
        setLoaded(true);
      }
    })();
  }, [address]);

  const connectWallet = () => connect({ connector: injected() });
  const switchToTestnet = () => switchChain({ chainId: 84532 });

  if (!isConnected || !address) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center py-16">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-text-primary">Connect your wallet</h1>
          <p className="mt-3 text-text-secondary">
            Connect to view your NXR balance, airdrop status, staking and governance. Nexora never requests your seed
            phrase or private key.
          </p>
          <button
            onClick={connectWallet}
            className="mt-6 rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-hover"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  const chainName = CHAINS.baseSepolia!.name;

  return (
    <div className="py-16">
      <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Wallet: {shortAddress(address)} · {chainName}
      </p>

      {chainId !== 84532 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-200">You are on an unsupported network (chain {chainId}).</p>
          <button onClick={switchToTestnet} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-black">
            Switch to Base Sepolia
          </button>
        </div>
      )}

      {status && <div className="mt-4 rounded-lg border border-line bg-elevated p-4 text-sm text-text-secondary">{status}</div>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="NXR Balance" value={data.balance} />
        <Stat label="Staked NXR" value={data.staked} />
        <Stat label="Pending Rewards" value={data.pendingRewards} />
        <Stat label="Airdrop" value={data.airdropClaimed ? 'Claimed' : 'Not claimed'} />
        <Stat label="Governance Power (NXVT)" value={data.governancePower} />
        <Stat label="Total Supply" value={data.totalSupply} />
      </div>

      <div className="mt-8 rounded-xl border border-line bg-elevated p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Treasury (on-chain)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="NXR" value={data.treasuryNxr} />
          <Stat label="ETH" value={data.treasuryEth} />
        </div>
        {!loaded && <p className="mt-3 text-sm text-text-muted">Loading…</p>}
      </div>

      {loadAddresses().nxrToken && (
        <p className="mt-6 break-all font-mono text-xs text-text-muted">NXR: {loadAddresses().nxrToken}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-5">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 break-all text-2xl font-semibold text-text-primary">{value === '0' ? value : value}</p>
    </div>
  );
}
