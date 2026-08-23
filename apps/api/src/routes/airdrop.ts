/**
 * Airdrop routes: Merkle tree generation (admin) + public proof lookup.
 *
 * The Merkle root is published on-chain by an admin wallet; this API produces
 * the deterministic off-chain data. Proofs are public (they only reveal a
 * wallet's own eligibility) and are served to any caller so users can claim.
 */
import { Router } from 'express';
import { parseCsvAllocations, buildMerkleTree } from '../services/merkle';
import { requireAuth } from './auth';
import { query } from '../db';

export const airdropRouter = Router();

/**
 * POST /api/airdrop/generate  (admin)
 * Body: { csv: string } or { allocations: [...] }
 * Returns { root, count }. Admin publishes the root on-chain.
 */
airdropRouter.post('/generate', requireAuth, (req, res) => {
  try {
    const { csv, allocations } = req.body ?? {};
    let entries;
    if (csv) {
      entries = parseCsvAllocations(csv as string);
    } else if (Array.isArray(allocations)) {
      entries = (allocations as Array<{ address: string; amount: string }>).map((a) => ({
        address: a.address,
        amount: BigInt(a.amount),
      }));
    } else {
      return res.status(400).json({ error: 'Provide csv or allocations' });
    }
    const result = buildMerkleTree(entries);
    return res.json({ root: result.root, count: result.entries.length });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/airdrop/proof  (public)
 * Body: { address }
 * Returns the stored allocation amount + Merkle proof for a wallet, or null.
 * Merkle proofs are public data; this does not reveal third-party balances.
 */
airdropRouter.post('/proof', async (req, res) => {
  const { address } = req.body ?? {};
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'valid address required' });
  }
  const row = await query<{ address: string; amount: string; proof: string | null }>(
    'SELECT address, amount, proof FROM airdrop_allocations WHERE address = $1 LIMIT 1',
    [address.toLowerCase()],
  );
  if (!row[0]) return res.json({ address, allocation: null, proof: null });
  let proof: string[] = [];
  try {
    if (row[0].proof) proof = JSON.parse(row[0].proof);
  } catch {
    proof = [];
  }
  return res.json({ address, allocation: row[0].amount, proof });
});
