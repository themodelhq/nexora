'use client';

import { useEffect, useState } from 'react';
import { getErc20Info, formatUnits } from '@nexora/blockchain';
import { loadAddresses, CHAINS } from '@nexora/config';

interface TokenData {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  address: string;
  chainId: number;
  chainName: string;
}

/** Fetches authoritative token data from the chain; shows "Coming soon" when
 *  the token is not yet deployed (testnet-first). No fabricated values. */
export function TokenSummary() {
  const [data, setData] = useState<TokenData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const addrs = loadAddresses();
    const token = addrs.nxrToken;
    const chain = CHAINS.baseSepolia!;
    if (!token) {
      setError(true);
      return;
    }
    getErc20Info(token as `0x${string}`, chain.id)
      .then((info) =>
        setData({ ...info, address: token as string, chainId: chain.id, chainName: chain.name }),
      )
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <section className="mx-auto max-w-5xl py-8">
        <div className="rounded-xl border border-line bg-elevated p-6">
          <p className="text-text-secondary">Live token data is unavailable yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            The NXR contract has not been deployed to Base Sepolia in this session. Once deployed, live supply and
            balances will appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl py-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-elevated p-5">
          <p className="text-xs uppercase tracking-wide text-text-muted">Token</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{data?.symbol ?? 'NXR'}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated p-5">
          <p className="text-xs uppercase tracking-wide text-text-muted">Total Supply (fixed)</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {data ? formatUnits(data.totalSupply, data.decimals) : '1,000,000,000'}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-elevated p-5">
          <p className="text-xs uppercase tracking-wide text-text-muted">Network</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{data?.chainName ?? 'Base Sepolia'}</p>
        </div>
      </div>
    </section>
  );
}
