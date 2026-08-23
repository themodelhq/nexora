import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { Nav } from '@/components/Nav';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://nexora.io'),
  title: {
    default: 'Nexora — Building the Next Digital Economy',
    template: '%s · Nexora',
  },
  description:
    'Nexora (NXR) is a next-generation digital ecosystem. NXR powers community rewards, decentralized applications and Web3 utilities on Base.',
  keywords: [
    'Nexora', 'NXR token', 'Nexora cryptocurrency', 'NXR crypto', 'Nexora Web3', 'NXR airdrop', 'Nexora ecosystem',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Nexora',
    title: 'Nexora — Building the Next Digital Economy',
    description: 'NXR powers a growing ecosystem of community rewards, decentralized applications and Web3 utilities.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Nexora (NXR)' }],
  },
  twitter: { card: 'summary_large_image', title: 'Nexora (NXR)', description: 'A next-generation digital ecosystem powered by NXR.', images: ['/og.png'] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Nexora',
    alternateName: 'NXR',
    url: 'https://nexora.io',
    description:
      'Nexora is a next-generation digital ecosystem powered by NXR, an ERC-20 utility token on Base.',
  };
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="min-h-screen bg-base font-sans text-text-primary antialiased">
        <Providers>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
          <Nav />
          <main className="mx-auto max-w-7xl px-4">{children}</main>
          <footer className="mt-20 border-t border-line py-10">
            <div className="mx-auto max-w-7xl px-4 text-center text-sm text-text-muted">
              <p>Nexora (NXR) — Building the Next Digital Economy.</p>
              <p className="mt-2">
                NXR is a utility token for a digital ecosystem. Cryptocurrency markets are volatile; participation
                involves risk. Nothing here is a promise of profit or a guaranteed listing.
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
