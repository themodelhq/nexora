'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export function getAdminConfig() {
  return createConfig({
    chains: [baseSepolia],
    connectors: [injected()],
    transports: {
      [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? 'https://sepolia.base.org'),
    },
    ssr: true,
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [config] = useState(() => getAdminConfig());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
