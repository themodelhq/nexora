import Link from 'next/link';
import type { Metadata } from 'next';
import { loadAddresses, CHAINS } from '@nexora/config';

export const metadata: Metadata = {
  title: 'NXR Token',
  description:
    'Nexora (NXR) — a fixed-supply ERC-20 utility token on Base. 18 decimals, 1,000,000,000 maximum supply, no hidden minting.',
};

export default function TokenPage() {
  const addrs = loadAddresses();
  const chain = CHAINS.baseSepolia!;
  const token = addrs.nxrToken;

  return (
    <div className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-text-primary">NXR — Nexora Token</h1>
        <p className="mt-3 text-text-secondary">
          NXR is the ERC-20 utility token of the Nexora ecosystem, deployed on Base.
        </p>

        <div className="mt-8 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody>
              {[
                ['Name', 'Nexora'],
                ['Symbol', 'NXR'],
                ['Decimals', '18'],
                ['Network', chain.name],
                ['Maximum Supply', '1,000,000,000 NXR (fixed)'],
                ['Circulating Supply', token ? 'Fetched on-chain (see dashboard)' : 'Unavailable — contract not deployed'],
                ['Contract Address', token ?? 'Coming soon'],
                ['Minting', 'None (fixed supply; no mint function)'],
                ['Transfer Restrictions', 'None'],
                ['Hidden Tax / Blacklist', 'None'],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="w-48 px-4 py-3 text-text-muted">{k}</td>
                  <td className="px-4 py-3 text-text-primary">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white">
            View Dashboard
          </Link>
          <a
            href={`https://sepolia.basescan.org${token ? `/token/${token}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-line px-5 py-2.5 text-sm text-text-secondary hover:text-text-primary"
          >
            View on BaseScan
          </a>
        </div>
      </div>
    </div>
  );
}
