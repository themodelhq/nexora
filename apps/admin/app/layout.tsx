import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexora Admin',
  description: 'Nexora administrative dashboard (SIWE-authenticated, role-based).',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-base font-sans text-text-primary">
        <header className="border-b border-line bg-elevated px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <span className="font-semibold text-text-primary">Nexora · Admin</span>
            <span className="text-xs text-text-muted">SIWE · role-based · audit logged</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
