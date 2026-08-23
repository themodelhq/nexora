'use client';

import { useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { loadAddresses } from '@nexora/config';
import { formatUnits } from 'viem';
import { useSendTx } from '@/lib/useSendTx';
import { airdropAbi } from '@/lib/abis';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TX_LABEL: Record<string, string> = {
  preparing: 'Preparing transaction…',
  awaiting_approval: 'Awaiting wallet approval…',
  submitted: 'Submitted — waiting for confirmation…',
  confirmed: 'Confirmed ✓',
  failed: 'Failed',
};

export default function AirdropPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { send, status } = useSendTx();
  const [allocation, setAllocation] = useState<string | null>(null);
  const [proof, setProof] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const addrs = loadAddresses();
  const airdrop = addrs.airdrop as `0x${string}` | undefined;
  const live = Boolean(airdrop);

  const checkEligibility = async () => {
    setError('');
    try {
      const res = await fetch(`${API}/api/airdrop/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error('failed to fetch eligibility');
      const data = await res.json();
      setAllocation(data.allocation);
      // Proof would be fetched from the backend manifest (per-address).
      setProof(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const claimAirdrop = async () => {
    if (!airdrop || !allocation) return;
    try {
      await send({ address: airdrop, abi: airdropAbi, functionName: 'claim', args: [BigInt(allocation), proof ?? []] });
    } catch {
      /* error surfaced by hook */
    }
  };

  if (!isConnected || !address) {
    return (
      <div className="py-16">
        <div className="mx-auto max-w-2xl rounded-xl border border-line bg-elevated p-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary">Airdrop</h1>
          <p className="mt-3 text-text-secondary">Connect your wallet to check eligibility and claim NXR.</p>
          <button onClick={() => connect({ connector: injected() })} className="mt-6 rounded-lg bg-brand px-5 py-2.5 text-white">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-text-primary">Airdrop</h1>
        <p className="mt-3 text-text-secondary">
          Claim your NXR community allocation. Eligibility is verified by a cryptographic Merkle proof — no double
          claims are possible.
        </p>

        {!live ? (
          <div className="mt-8 rounded-xl border border-line bg-elevated p-6">
            <p className="text-sm text-text-secondary">
              Airdrop contract not yet deployed to the active network. Data unavailable until deployment.
            </p>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-line bg-elevated p-6">
            <p className="text-sm text-text-secondary">
              Connected: <span className="font-mono text-text-primary">{address.slice(0, 8)}…{address.slice(-4)}</span>
            </p>
            <button
              onClick={checkEligibility}
              className="mt-4 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Check Eligibility
            </button>

            {allocation && (
              <div className="mt-4 rounded-md border border-line bg-overlay p-4">
                <p className="text-sm text-text-secondary">
                  Allocation: <span className="font-semibold text-text-primary">{formatUnits(BigInt(allocation), 18)} NXR</span>
                </p>
                <button
                  onClick={claimAirdrop}
                  disabled={status.stage === 'awaiting_approval' || status.stage === 'submitted'}
                  className="mt-3 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                >
                  Claim NXR
                </button>
              </div>
            )}

            {status.stage !== 'idle' && (
              <p className="mt-3 text-sm text-text-secondary">{TX_LABEL[status.stage]}</p>
            )}
            {status.hash && (
              <a
                href={`https://sepolia.basescan.org/tx/${status.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block break-all font-mono text-xs text-accent"
              >
                {status.hash}
              </a>
            )}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </div>
        )}

        <p className="mt-6 text-sm text-text-muted">
          Airdrop claims are executed on-chain and verifiable on the explorer. Nexora never asks for your seed phrase.
        </p>
      </div>
    </div>
  );
}
