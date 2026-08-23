import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Roadmap', description: 'The Nexora roadmap — Foundation, Launch, Ecosystem, Expansion.' };

const phases = [
  {
    name: 'Phase 1 — Foundation',
    status: 'In progress',
    items: ['Brand & visual identity', 'Website', 'Smart contracts', 'Testnet deployment', 'Documentation', 'Security testing'],
  },
  {
    name: 'Phase 2 — Launch',
    status: 'Upcoming',
    items: ['Mainnet deployment (explicit, human-controlled)', 'Contract verification', 'Initial liquidity (NXR/USDC)', 'Community distribution', 'Airdrop', 'Explorer integration'],
  },
  {
    name: 'Phase 3 — Ecosystem',
    status: 'Upcoming',
    items: ['Staking', 'Governance', 'Developer grants', 'Partnerships', 'Web3 applications'],
  },
  {
    name: 'Phase 4 — Expansion',
    status: 'Planned',
    items: ['Additional blockchain integrations', 'Additional ecosystem products', 'Cross-chain infrastructure where justified'],
  },
];

export default function RoadmapPage() {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-text-primary">Roadmap</h1>
        <p className="mt-3 text-text-secondary">
          A realistic, phased roadmap. Listing promises are not made unless an exchange has actually approved a listing.
        </p>
        <div className="mt-8 space-y-6">
          {phases.map((p) => (
            <div key={p.name} className="rounded-xl border border-line bg-elevated p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">{p.name}</h2>
                <span className="rounded-full border border-line px-3 py-1 text-xs text-text-secondary">{p.status}</span>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {p.items.map((i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                    <span className="text-accent">•</span> {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
