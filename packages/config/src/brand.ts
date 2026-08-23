/**
 * Nexora brand constants shared across the frontend and docs.
 */

export const BRAND = {
  name: 'Nexora',
  ticker: 'NXR',
  tagline: 'Building the Next Digital Economy',
  subtitle: 'NXR powers a growing ecosystem of community rewards, decentralized applications and Web3 utilities.',
  website: 'https://nexora.io',
  twitter: 'https://x.com/nexora',
  discord: 'https://discord.gg/nexora',
  github: 'https://github.com/nexora',
  docs: 'https://docs.nexora.io',
  positioning: 'Nexora is a next-generation digital ecosystem powered by NXR.',
} as const;

export const NETWORK_LABELS: Record<string, string> = {
  baseSepolia: 'Base Sepolia (Testnet)',
  base: 'Base',
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  bnbChain: 'BNB Smart Chain',
};
