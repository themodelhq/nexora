/**
 * Nexora (NXR) tokenomics constants.
 *
 * These values are the single source of truth for the token allocation and
 * are used by the frontend, the docs, and the token-distribution scripts.
 * The smart contract itself enforces the fixed maximum supply; these constants
 * describe how that supply is allocated at genesis.
 */

import type { Tokenomics, AllocationBucket, VestingTerms } from '@nexora/types';

export const NXR = {
  name: 'Nexora',
  symbol: 'NXR',
  decimals: 18,
  /** Maximum and fixed total supply in base units (wei). */
  maxSupply: 1_000_000_000n * 10n ** 18n,
  /** Human-readable fixed supply. */
  maxSupplyHuman: 1_000_000_000,
};

/** Vesting terms (seconds). Team: 12-month cliff + 36-month linear vest. */
export const VESTING_TERMS: Record<string, VestingTerms> = {
  team: {
    cliffDuration: 365n * 24n * 60n * 60n * 1n, // 12 months
    totalDuration: 365n * 24n * 60n * 60n * 3n, // 36 months
    revocable: false,
  },
  advisors: {
    cliffDuration: 180n * 24n * 60n * 60n, // 6 months
    totalDuration: 365n * 24n * 60n * 60n * 2n, // 24 months
    revocable: false,
  },
  partners: {
    cliffDuration: 180n * 24n * 60n * 60n, // 6 months
    totalDuration: 365n * 24n * 60n * 60n * 2n, // 24 months
    revocable: true,
  },
  ecosystem: {
    cliffDuration: 0n,
    totalDuration: 365n * 24n * 60n * 60n, // 12 months
    revocable: false,
  },
};

export const ALLOCATION_BUCKETS: AllocationBucket[] = [
  {
    id: 'community-ecosystem',
    category: 'Community & Ecosystem',
    amount: 350_000_000n * 10n ** 18n,
    percent: 35,
    destination: 'Community multi-sig / ecosystem wallet',
    vesting: false,
    description:
      'Airdrops, community rewards, ecosystem incentives, developer incentives, partnerships and growth programs.',
  },
  {
    id: 'liquidity',
    category: 'Liquidity',
    amount: 150_000_000n * 10n ** 18n,
    percent: 15,
    destination: 'DEX liquidity pools (NXR/USDC) & liquidity management',
    vesting: false,
    description: 'Initial DEX liquidity, liquidity management and market infrastructure.',
  },
  {
    id: 'treasury',
    category: 'Treasury',
    amount: 150_000_000n * 10n ** 18n,
    percent: 15,
    destination: 'Treasury multi-sig',
    vesting: false,
    description: 'Long-term development, infrastructure, partnerships, operations, future ecosystem initiatives.',
  },
  {
    id: 'team',
    category: 'Team',
    amount: 100_000_000n * 10n ** 18n,
    percent: 10,
    destination: 'Team vesting contract (12-month cliff, 36-month linear)',
    vesting: true,
    terms: VESTING_TERMS.team,
    description: 'Core team allocation subject to long-term vesting.',
  },
  {
    id: 'advisors',
    category: 'Advisors & Strategic Partners',
    amount: 50_000_000n * 10n ** 18n,
    percent: 5,
    destination: 'Advisor vesting contract',
    vesting: true,
    terms: VESTING_TERMS.advisors,
    description: 'Advisors and strategic partners subject to transparent vesting.',
  },
  {
    id: 'public-sale',
    category: 'Public Sale',
    amount: 100_000_000n * 10n ** 18n,
    percent: 10,
    destination: 'Presale / compliant public distribution contract',
    vesting: false,
    description: 'Any legally compliant public or community token distribution.',
  },
  {
    id: 'dev-grants',
    category: 'Development & Grants',
    amount: 100_000_000n * 10n ** 18n,
    percent: 10,
    destination: 'Grants / development multi-sig',
    vesting: true,
    terms: VESTING_TERMS.ecosystem,
    description: 'Developer grants, open-source development, integrations and ecosystem builders.',
  },
];

export const TOKENOMICS: Tokenomics = {
  name: NXR.name,
  symbol: NXR.symbol,
  decimals: NXR.decimals,
  maxSupply: NXR.maxSupply,
  maxSupplyHuman: NXR.maxSupplyHuman,
  buckets: ALLOCATION_BUCKETS,
};

/** Verify that allocation percentages sum to 100 and amounts sum to max supply. */
export function assertTokenomicsValid(t: Tokenomics = TOKENOMICS): boolean {
  const percentSum = t.buckets.reduce((acc, b) => acc + b.percent, 0);
  const amountSum = t.buckets.reduce((acc, b) => acc + b.amount, 0n);
  return percentSum === 100 && amountSum === t.maxSupply;
}
