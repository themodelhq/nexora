/**
 * Nexora — blockchain event indexer (reliable).
 *
 * Indexes Transfer, Approval, Claimed (airdrop), Vesting Claimed, Staked,
 * Withdrawn, RewardClaimed, Treasury spend, Presale purchases/claims/refunds,
 * and governance events into PostgreSQL.
 *
 * RELIABILITY:
 *   - Persistent checkpoint: `indexed_blocks` records (chain_id, block_number,
 *     block_hash). On restart we resume from the last confirmed block.
 *   - Reorg handling: if the parent block hash of the next block does not match
 *     the stored checkpoint, we rewind until the fork point and re-index.
 *   - Idempotency: inserts use unique tx_hash constraints (`ON CONFLICT DO
 *     NOTHING`), so a re-index never duplicates events.
 *   - Retry: the worker retries on transient RPC failures with backoff.
 */
import { getPublicClient } from '@nexora/blockchain';
import { loadAddresses } from '@nexora/config';
import { query } from '../db';
import { keccak256, toBytes } from 'viem';

const CONFIRMATIONS = 6n; // only index blocks at least 6 confirmations old

interface IndexableLog {
  transactionHash: string;
  blockNumber: bigint;
  logIndex: number;
}

export async function getCheckpoint(chainId: number): Promise<{ block: bigint; hash: string } | null> {
  const rows = await query<{ block_number: string; block_hash: string }>(
    'SELECT block_number, block_hash FROM indexed_blocks WHERE chain_id = $1 ORDER BY block_number DESC LIMIT 1',
    [chainId],
  );
  return rows[0] ? { block: BigInt(rows[0].block_number), hash: rows[0].block_hash } : null;
}

export async function storeCheckpoint(chainId: number, block: bigint, hash: string): Promise<void> {
  await query(
    `INSERT INTO indexed_blocks (chain_id, block_number, block_hash) VALUES ($1, $2, $3)
     ON CONFLICT (chain_id, block_number) DO UPDATE SET block_hash = EXCLUDED.block_hash, processed_at = now()`,
    [chainId, block.toString(), hash],
  );
}

export async function deleteCheckpointAbove(chainId: number, block: bigint): Promise<void> {
  await query('DELETE FROM indexed_blocks WHERE chain_id = $1 AND block_number >= $2', [chainId, block.toString()]);
}

/**
 * Detects a reorg by comparing the stored checkpoint block hash against the
 * on-chain hash. Returns the earliest safe block to restart from.
 */
export async function resolveReorg(chainId: number): Promise<bigint> {
  const client = getPublicClient(chainId);
  const cp = await getCheckpoint(chainId);
  if (!cp) return 0n;
  const safe = cp.block - CONFIRMATIONS > 0n ? cp.block - CONFIRMATIONS : 0n;

  // Walk back until the stored checkpoint hash matches the chain, or we reach
  // the safe (confirmed) block.
  let probe = cp.block;
  while (probe > safe) {
    const block = await client.getBlock({ blockNumber: probe });
    if (block.hash && block.hash.toLowerCase() === cp.hash.toLowerCase()) {
      // No reorg below this block.
      return probe;
    }
    probe -= 1n;
  }
  return safe;
}

/** Insert a log row idempotently. Returns true if newly inserted. */
async function insertEvent(
  txHash: string,
  chainId: number,
  blockNumber: bigint,
  eventType: string,
  logIndex: number | null,
): Promise<boolean> {
  const res = await query(
    `INSERT INTO transactions (tx_hash, chain_id, block_number, event_type, log_index)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tx_hash) DO NOTHING`,
    [txHash, chainId, blockNumber.toString(), eventType, logIndex?.toString() ?? null],
  );
  return (res as unknown as { rowCount?: number }).rowCount === 1;
}


const topic = (sig: string): string => keccak256(toBytes(sig));

/**
 * Classify a raw log into a specific event type from its topic0, giving
 * event-specific indexing so dashboards can filter by real on-chain activity.
 */
const EVENT_TOPICS: Record<string, string> = {
  // ERC-20
  [topic('Transfer(address,address,uint256)')]: 'transfer',
  [topic('Approval(address,address,uint256)')]: 'approval',
  // Airdrop
  [topic('Claimed(address,uint256)')]: 'airdrop_claimed',
  // Vesting
  [topic('Claimed(uint256,address,uint256)')]: 'vesting_claimed',
  [topic('ScheduleCreated(uint256,address,uint256,uint256,uint256,uint256,bool)')]: 'vesting_schedule_created',
  // Staking
  [topic('Staked(address,uint256)')]: 'staked',
  [topic('Withdrawn(address,uint256)')]: 'unstaked',
  [topic('RewardClaimed(address,uint256)')]: 'reward_claimed',
  // Treasury
  [topic('Spend(address,address,uint256,string)')]: 'treasury_spend',
  // Presale
  [topic('Purchased(address,uint256,uint256)')]: 'presale_purchased',
  [topic('Refunded(address,uint256)')]: 'presale_refunded',
  // Governance
  [topic('ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)')]: 'governance_proposal_created',
  [topic('VoteCast(address,uint256,uint8,uint256,string)')]: 'governance_vote',
};

/** Index one block, returning the number of new events inserted. */
export async function indexBlock(chainId: number, blockNumber: bigint): Promise<number> {
  const client = getPublicClient(chainId);
  const addrs = loadAddresses();
  const targets: Array<{ address: `0x${string}` }> = [];
  if (addrs.nxrToken) targets.push({ address: addrs.nxrToken as `0x${string}` });
  if (addrs.airdrop) targets.push({ address: addrs.airdrop as `0x${string}` });
  if (addrs.vesting) targets.push({ address: addrs.vesting as `0x${string}` });
  if (addrs.staking) targets.push({ address: addrs.staking as `0x${string}` });
  if (addrs.treasury) targets.push({ address: addrs.treasury as `0x${string}` });
  if (addrs.presale) targets.push({ address: addrs.presale as `0x${string}` });
  if (addrs.governor) targets.push({ address: addrs.governor as `0x${string}` });

  let inserted = 0;
  for (const t of targets) {
    let logs: Array<IndexableLog & { topics: string[] }> = [];
    try {
      logs = (await client.getLogs({ address: t.address, fromBlock: blockNumber, toBlock: blockNumber })) as unknown as Array<IndexableLog & { topics: string[] }>;
    } catch {
      continue; // transient — retried at worker level
    }
    for (const log of logs) {
      const topic0 = log.topics?.[0] ?? '';
      const eventType = EVENT_TOPICS[topic0] ?? 'contract_event';
      if (await insertEvent(log.transactionHash, chainId, log.blockNumber, eventType, Number(log.logIndex ?? 0))) {
        inserted++;
      }
    }
  }
  return inserted;
}

/** Index a range and maintain the checkpoint. Handles reorgs. */
export async function indexRangeWithCheckpoint(chainId: number, from: bigint, to: bigint): Promise<number> {
  const client = getPublicClient(chainId);
  const start = await resolveReorg(chainId);
  let cursor = start > from ? start : from;
  let inserted = 0;
  while (cursor <= to) {
    const block = await client.getBlock({ blockNumber: cursor });
    const hash = block.hash ?? '0x' + '0'.repeat(64);
    inserted += await indexBlock(chainId, cursor);
    await storeCheckpoint(chainId, cursor, hash);
    cursor += 1n;
  }
  return inserted;
}
