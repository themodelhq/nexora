/**
 * Nexora blockchain client layer.
 *
 * Built on viem. Provides read-only (public) clients. The frontend NEVER holds
 * private keys — it only builds unsigned transactions that the user signs in
 * their wallet.
 */

import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { activeChain } from '@nexora/config';

/**
 * Returns a read-only viem public client for the given chain id.
 * Defaults to the active deployment chain (Base Sepolia in development).
 *
 * The two chains' client types differ, so we narrow to the generic PublicClient
 * type; callers cast individual read results to concrete types in erc20.ts.
 */
export function getPublicClient(chainId?: number): PublicClient {
  const active = activeChain();
  const id = chainId ?? active.id;

  const isBase = id === 8453;
  const chain = isBase ? base : baseSepolia;

  const rpc =
    isBase
      ? process.env.MAINNET_RPC_URL ?? 'https://mainnet.base.org'
      : process.env.NEXT_PUBLIC_RPC_URL ?? 'https://sepolia.base.org';

  return createPublicClient({
    chain,
    transport: http(rpc),
  }) as unknown as PublicClient;
}

/** Whether a chain id is supported by the blockchain layer. */
export function isSupportedChain(chainId: number): boolean {
  return chainId === 8453 || chainId === 84532;
}

export function shortAddress(address: Address | string): string {
  if (!address) return '';
  const a = address as string;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function formatUnits(value: bigint, decimals = 18): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const str = abs.toString().padStart(decimals + 1, '0');
  const int = str.slice(0, str.length - decimals) || '0';
  const frac = str.slice(-decimals).replace(/0+$/, '');
  return `${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`;
}

export * from './erc20';
export * from './explorer';
export * from './nexora';
