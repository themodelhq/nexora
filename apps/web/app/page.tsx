import Link from 'next/link';
import { BRAND } from '@nexora/config';
import { TokenSummary } from '@/components/TokenSummary';

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">Nexora · NXR</p>
          <h1 className="text-4xl font-bold leading-tight text-text-primary lg:text-6xl">
            {BRAND.tagline}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">{BRAND.subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/token"
              className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-hover"
            >
              Explore NXR
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-line bg-overlay px-6 py-3 font-medium text-text-primary hover:bg-overlay/70"
            >
              Connect Wallet
            </Link>
            <a
              href="/docs"
              className="rounded-lg border border-line px-6 py-3 font-medium text-text-secondary hover:text-text-primary"
            >
              Read Documentation
            </a>
          </div>
        </div>
      </section>

      {/* Live token summary (fetched on-chain, shows "Coming soon" if not deployed) */}
      <TokenSummary />

      {/* Allocation overview */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold text-text-primary">Token Allocation</h2>
          <p className="mt-2 text-text-secondary">
            Fixed supply of 1,000,000,000 NXR, allocated transparently at genesis.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Community & Ecosystem', '35%', '350M'],
              ['Liquidity', '15%', '150M'],
              ['Treasury', '15%', '150M'],
              ['Team', '10%', '100M'],
              ['Advisors & Partners', '5%', '50M'],
              ['Public Sale', '10%', '100M'],
              ['Development & Grants', '10%', '100M'],
            ].map(([cat, pct, amt]) => (
              <div key={cat} className="rounded-xl border border-line bg-elevated p-5">
                <p className="text-lg font-semibold text-text-primary">{pct}</p>
                <p className="text-sm text-text-secondary">{cat}</p>
                <p className="mt-1 text-xs text-text-muted">{amt} NXR</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ecosystem overview */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold text-text-primary">A Growing Web3 Ecosystem</h2>
          <p className="mt-2 text-text-secondary">
            NXR powers community rewards, staking, governance, airdrops and future DeFi/Web3 products — designed to
            expand without rewriting the core token.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {['Airdrops & Rewards', 'Staking & Governance', 'Treasury & Vesting'].map((t) => (
              <div key={t} className="rounded-xl border border-line bg-elevated p-5 text-text-primary">
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
