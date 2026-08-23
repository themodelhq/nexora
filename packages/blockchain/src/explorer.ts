/**
 * Block explorer link helpers (BaseScan and friends).
 * Links point to the official explorers so users can verify on-chain.
 */

import { CHAINS } from '@nexora/config';

export function explorerUrl(chainId: number, path: string): string {
  const chain = Object.values(CHAINS).find((c) => c.id === chainId);
  const base = chain?.blockExplorers[0]?.url ?? 'https://basescan.org';
  return `${base}/${path.replace(/^\//, '')}`;
}

export function addressUrl(chainId: number, address: string): string {
  return explorerUrl(chainId, `address/${address}`);
}

export function txUrl(chainId: number, hash: string): string {
  return explorerUrl(chainId, `tx/${hash}`);
}

export function tokenUrl(chainId: number, address: string): string {
  return explorerUrl(chainId, `token/${address}`);
}
