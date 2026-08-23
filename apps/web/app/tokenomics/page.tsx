import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tokenomics',
  description: 'Nexora (NXR) tokenomics — fixed 1 billion supply with transparent on-chain allocation.',
};

const buckets = [
  ['Community & Ecosystem', 35, '350,000,000', 'Airdrops, rewards, incentives, partnerships, growth.'],
  ['Liquidity', 15, '150,000,000', 'Initial DEX liquidity (NXR/USDC) and market infrastructure.'],
  ['Treasury', 15, '150,000,000', 'Long-term development, infrastructure, operations, ecosystem.'],
  ['Team', 10, '100,000,000', '12-month cliff + 36-month linear vesting.'],
  ['Advisors & Strategic Partners', 5, '50,000,000', 'Transparent vesting schedule.'],
  ['Public Sale', 10, '100,000,000', 'Legally compliant public distribution (after review).'],
  ['Development & Grants', 10, '100,000,000', 'Open-source development, grants, ecosystem builders.'],
];

export default function TokenomicsPage() {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-text-primary">Tokenomics</h1>
        <p className="mt-3 text-text-secondary">
          A fixed maximum supply of <strong className="text-text-primary">1,000,000,000 NXR</strong>, allocated
          transparently and enforced on-chain. There is no unrestricted minting.
        </p>

        <div className="mt-10">
          {/* Visual allocation bar */}
          <div className="flex h-8 w-full overflow-hidden rounded-lg">
            {buckets.map(([cat, pct]) => {
              const colors = ['bg-brand', 'bg-accent', 'bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
              const color = colors[buckets.findIndex((b) => b[0] === cat)] ?? 'bg-brand';
              return (
                <div
                  key={cat}
                  className={color}
                  style={{ width: `${pct}%` }}
                  title={`${cat} — ${pct}%`}
                />
              );
            })}
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-overlay text-left text-text-muted">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Allocation</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map(([cat, pct, amt, note]) => (
                  <tr key={cat} className="border-t border-line">
                    <td className="px-4 py-3 text-text-primary">{cat}</td>
                    <td className="px-4 py-3 text-text-primary">{pct}%</td>
                    <td className="px-4 py-3 text-text-secondary">{amt} NXR</td>
                    <td className="px-4 py-3 text-text-secondary">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-sm text-text-muted">
            Percentages sum to 100% and amounts sum to the 1 billion maximum supply. All destinations are publicly
            visible on-chain.
          </p>
        </div>
      </div>
    </div>
  );
}
