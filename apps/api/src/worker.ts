/**
 * Nexora — indexer worker (reliable).
 *
 * Polls the chain, indexes new blocks with persistent checkpoints, handles
 * reorgs and retries. On crash it resumes from the last confirmed checkpoint.
 *
 *   npm run dev:worker
 */
import { getPublicClient } from '@nexora/blockchain';
import { indexRangeWithCheckpoint, getCheckpoint } from './services/indexer';
import { config } from './config';
import { logger } from './logger';

const POLL_MS = Number(process.env.INDEXER_POLL_MS ?? 15000);
const MAX_BATCH = 100n;

async function runCycle(): Promise<void> {
  const client = getPublicClient(config.chainId);
  const latest = await client.getBlockNumber();

  const cp = await getCheckpoint(config.chainId);
  let from = cp ? cp.block + 1n : (latest > MAX_BATCH ? latest - MAX_BATCH : 1n);
  const to = latest < from + MAX_BATCH ? latest : from + MAX_BATCH;
  if (to >= from) {
    const n = await indexRangeWithCheckpoint(config.chainId, from, to);
    if (n > 0) console.log(`indexed ${n} events (blocks ${from}..${to})`);
  }
}

async function main(): Promise<void> {
  logger.info('indexer.started', { chainId: config.chainId, pollMs: POLL_MS });
  let failures = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runCycle();
      failures = 0;
    } catch (err) {
      failures++;
      logger.warn('indexer.error', { failures, message: (err as Error).message });
    }
    // Exponential backoff after repeated failures, capped at 60s.
    const wait = Math.min(POLL_MS * Math.pow(2, Math.min(failures, 4)), 60000);
    await new Promise((r) => setTimeout(r, failures ? wait : POLL_MS));
  }
}

main().catch((err) => {
  console.error('indexer fatal:', err);
  process.exit(1);
});
