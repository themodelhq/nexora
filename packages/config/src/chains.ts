/**
 * Chain configuration for Nexora.
 *
 * The primary production target is Base (EIP-155 chain id 8453).
 * Base Sepolia (84532) is the testnet used for all development journeys.
 * The architecture is EVM-compatible so additional networks can be added
 * without changing contracts (contracts are network-agnostic ERC-20/ecosystem).
 */

import type { ChainConfig } from '@nexora/types';

export const CHAIN_IDS = {
  baseSepolia: 84532,
  base: 8453,
  ethereum: 1,
  polygon: 137,
  bnbChain: 56,
} as const;

export type SupportedChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export interface NexoraChain extends ChainConfig {}

const baseSepolia: NexoraChain = {
  id: CHAIN_IDS.baseSepolia,
  name: 'Base Sepolia',
  network: 'baseSepolia',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia.base.org', 'https://base-sepolia.public.blastapi.io'],
  blockExplorers: [{ name: 'BaseScan Sepolia', url: 'https://sepolia.basescan.org' }],
  testnet: true,
};

const base: NexoraChain = {
  id: CHAIN_IDS.base,
  name: 'Base',
  network: 'base',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
  blockExplorers: [{ name: 'BaseScan', url: 'https://basescan.org' }],
  testnet: false,
};

const ethereum: NexoraChain = {
  id: CHAIN_IDS.ethereum,
  name: 'Ethereum',
  network: 'ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://ethereum-rpc.publicnode.com'],
  blockExplorers: [{ name: 'Etherscan', url: 'https://etherscan.io' }],
  testnet: false,
};

const polygon: NexoraChain = {
  id: CHAIN_IDS.polygon,
  name: 'Polygon',
  network: 'polygon',
  nativeCurrency: { name: 'MATIC', symbol: 'POL', decimals: 18 },
  rpcUrls: ['https://polygon-rpc.com'],
  blockExplorers: [{ name: 'PolygonScan', url: 'https://polygonscan.com' }],
  testnet: false,
};

const bnbChain: NexoraChain = {
  id: CHAIN_IDS.bnbChain,
  name: 'BNB Smart Chain',
  network: 'bnbChain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org'],
  blockExplorers: [{ name: 'BscScan', url: 'https://bscscan.com' }],
  testnet: false,
};

/**
 * Full registry of supported networks.
 *
 * NOTE: Only `baseSepolia` is actively enabled for deployment/testing at this
 * stage. Other networks are listed for architectural compatibility and are
 * gated behind `DEPLOYMENT_ENABLED` — they require explicit, human-controlled
 * enablement before use.
 */
export const CHAINS: Record<string, NexoraChain> = {
  baseSepolia,
  base,
  ethereum,
  polygon,
  bnbChain,
};

/** The currently active deployment chain. Set at build/deploy time. */
export function activeChain(env: string = process.env.NEXT_PUBLIC_APP_ENV ?? 'development'): NexoraChain {
  // Testnet-first: all development targets Base Sepolia until a human
  // explicitly opts into mainnet.
  if (env === 'production') {
    return base;
  }
  return baseSepolia;
}

export const DEFAULT_CHAIN_ID = CHAIN_IDS.baseSepolia;

export { baseSepolia, base, ethereum, polygon, bnbChain };
