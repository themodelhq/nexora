/** Nexora shared domain types. */

export type ChainConfig = {
  id: number;
  name: string;
  network: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorers: Array<{ name: string; url: string }>;
  testnet: boolean;
};

export type VestingTerms = {
  /** Seconds before any tokens unlock. */
  cliffDuration: bigint;
  /** Total vesting period in seconds (includes cliff). */
  totalDuration: bigint;
  /** Whether the schedule can be revoked by an authorized party. */
  revocable: boolean;
};

export type AllocationBucket = {
  id: string;
  category: string;
  amount: bigint;
  percent: number;
  destination: string;
  vesting: boolean;
  terms?: VestingTerms;
  description: string;
};

export type Tokenomics = {
  name: string;
  symbol: string;
  decimals: number;
  maxSupply: bigint;
  maxSupplyHuman: number;
  buckets: AllocationBucket[];
};

// ---------------------------------------------------------------------------
// Backend / API DTOs
// ---------------------------------------------------------------------------

export type WalletConnection = {
  address: string;
  chainId: number;
  /** EIP-4361 (SIWE) message + signature for backend auth. */
  message?: string;
  signature?: string;
};

export type AirdropClaimStatus = {
  isClaimed: boolean;
  claimedAt?: number;
  amount?: string;
  txHash?: string;
};

export type VestingScheduleView = {
  id: string;
  beneficiary: string;
  totalAllocation: string;
  claimed: string;
  remaining: string;
  nextUnlock?: number;
  vestingPercent: number;
  startTimestamp: number;
  cliffDuration: number;
  totalDuration: number;
  revocable: boolean;
};

export type StakingPosition = {
  stakedAmount: string;
  rewards: string;
  stakedAt: number;
  lastRewardUpdate: number;
};

export type GovernanceProposal = {
  id: string;
  proposer: string;
  title: string;
  description: string;
  targets: string[];
  values: string[];
  calldatas: string[];
  startBlock: number;
  endBlock: number;
  state: string;
};

export type TreasuryTransaction = {
  txHash: string;
  token: string;
  amount: string;
  category?: string;
  timestamp: number;
  from: string;
  to: string;
};

export type DashboardData = {
  address: string;
  nxrBalance: string;
  claimableAirdrop?: string;
  stakedNxr: string;
  pendingRewards: string;
  vestingBalance: string;
  governancePower: string;
  recentTransactions: Array<{ txHash: string; type: string; amount: string; timestamp: number }>;
  portfolioValue?: string;
};

export type MerkleAirdropEntry = {
  address: string;
  amount: string;
};

export type MerkleTreeResult = {
  root: string;
  entries: MerkleAirdropEntry[];
  /** Address -> { proof, amount } for claim-time lookups. */
  proofs: Record<string, { proof: string[]; amount: string }>;
};
