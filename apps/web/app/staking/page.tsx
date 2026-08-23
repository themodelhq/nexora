'use client';

import { useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { loadAddresses } from '@nexora/config';
import { parseUnits } from 'viem';
import { useSendTx } from '@/lib/useSendTx';
import { erc20Abi, stakingAbi } from '@/lib/abis';

const TX_LABEL: Record<string, string> = {
  preparing: 'Preparing transaction…',
  awaiting_approval: 'Awaiting wallet approval…',
  submitted: 'Submitted — waiting for confirmation…',
  confirmed: 'Confirmed ✓',
  failed: 'Failed',
};

export default function StakingPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { send, status } = useSendTx();
  const [amount, setAmount] = useState('');
  const [needsApproval, setNeedsApproval] = useState(true);
  const addrs = loadAddresses();

  const staking = addrs.staking as `0x${string}` | undefined;
  const token = addrs.nxrToken as `0x${string}` | undefined;
  const live = Boolean(staking && token);

  const handleStake = async () => {
    if (!staking || !token || !amount) return;
    const wei = parseUnits(amount, 18); // exact decimal arithmetic (no float)
    // Approval first (simplified: always approve).
    await send({ address: token, abi: erc20Abi, functionName: 'approve', args: [staking, wei] });
    await send({ address: staking, abi: stakingAbi, functionName: 'stake', args: [wei] });
  };

  if (!isConnected || !address) {
    return (
      <div className="py-16">
        <div className="mx-auto max-w-2xl rounded-xl border border-line bg-elevated p-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary">Staking</h1>
          <p className="mt-3 text-text-secondary">Connect your wallet to stake NXR.</p>
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
        <h1 className="text-3xl font-bold text-text-primary">Staking</h1>
        <p className="mt-3 text-text-secondary">
          Stake NXR to participate in the ecosystem. Rewards are accrual-based and governed by transparent,
          configurable parameters — staking is not a promise of fixed returns.
        </p>

        {!live ? (
          <div className="mt-8 rounded-xl border border-line bg-elevated p-6">
            <p className="text-sm text-text-secondary">
              Staking contract not yet deployed to the active network. Data unavailable until deployment.
            </p>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-line bg-elevated p-6">
            <label className="text-sm text-text-muted">Amount (NXR)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-2 w-full rounded-md border border-line bg-overlay px-3 py-2 text-text-primary"
            />
            <button
              onClick={handleStake}
              disabled={status.stage === 'awaiting_approval' || status.stage === 'submitted'}
              className="mt-4 w-full rounded-lg bg-brand py-3 font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {needsApproval ? 'Approve & Stake' : 'Stake NXR'}
            </button>
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
            {status.error && <p className="mt-3 break-all text-sm text-red-400">{status.error}</p>}
          </div>
        )}

        <p className="mt-6 text-sm text-text-muted">
          Staking is optional and disabled by default until the reward pool is funded and enabled by an authorized
          role.
        </p>
      </div>
    </div>
  );
}
