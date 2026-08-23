'use client';

import Link from 'next/link';
import { useAccount, useDisconnect } from 'wagmi';
import { shortAddress } from '@nexora/blockchain';

const links = [
  { href: '/', label: 'Home' },
  { href: '/token', label: 'NXR' },
  { href: '/tokenomics', label: 'Tokenomics' },
  { href: '/airdrop', label: 'Airdrop' },
  { href: '/staking', label: 'Staking' },
  { href: '/vesting', label: 'Vesting' },
  { href: '/governance', label: 'Governance' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/transparency', label: 'Transparency' },
];

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-line bg-overlay px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
      >
        {shortAddress(address)}
      </button>
    );
  }
  return (
    <Link
      href="/dashboard"
      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
    >
      Connect Wallet
    </Link>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-base/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-accent text-sm font-bold text-white">
            N
          </div>
          <span className="text-lg font-semibold text-text-primary">Nexora</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-overlay hover:text-text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <ConnectWalletButton />
      </div>
    </header>
  );
}
