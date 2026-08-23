/**
 * Nexora — admin routes.
 *
 * Every endpoint verifies authorization SERVER-SIDE via the SIWE session and
 * the admin role stored in the database. It never trusts frontend-supplied
 * roles, wallets, or client auth state. All actions are audit-logged.
 */
import { Router } from 'express';
import { query } from '../db';
import { requireAuth, requireAdmin } from './auth';
import { audit } from '../services/audit';
import { loadAddresses } from '@nexora/config';

export const adminRouter = Router();

// GET /api/admin/status — contract/ownership overview.
adminRouter.get('/status', requireAuth, requireAdmin, async (req, res) => {
  const admin = (req as unknown as { admin: string }).admin;
  await audit(admin, 'admin.status');
  const deployments = loadAddresses();
  return res.json({ contracts: deployments, rpcUrl: process.env.RPC_URL });
});

// GET /api/admin/token
adminRouter.get('/token', requireAuth, requireAdmin, async (req, res) => {
  const admin = (req as unknown as { admin: string }).admin;
  await audit(admin, 'admin.token.read');
  return res.json({ token: loadAddresses().nxrToken });
});

// GET /api/admin/airdrop/allocations?round=genesis
adminRouter.get('/airdrop/allocations', requireAuth, requireAdmin, async (req, res) => {
  const round = (req.query.round as string) ?? 'genesis';
  const rows = await query('SELECT address, amount, airdrop_round FROM airdrop_allocations WHERE airdrop_round = $1', [round]);
  return res.json({ round, count: rows.length, allocations: rows });
});

// POST /api/admin/airdrop/import — persist a full Merkle manifest (server-side validated).
// Body: { round, merkleRoot, allocations: [{ address, amount, proof? }] }
adminRouter.post('/airdrop/import', requireAuth, requireAdmin, async (req, res) => {
  const admin = (req as unknown as { admin: string }).admin;
  const { round, merkleRoot, allocations } = req.body ?? {};
  if (!round || !Array.isArray(allocations)) return res.status(400).json({ error: 'round + allocations required' });

  let imported = 0;
  for (const a of allocations) {
    const addr = String(a.address ?? '').toLowerCase();
    const amount = String(a.amount ?? '');
    if (!/^0x[0-9a-f]{40}$/.test(addr)) {
      return res.status(400).json({ error: `invalid address in allocation: ${a.address}` });
    }
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
      return res.status(400).json({ error: `invalid amount for ${addr}` });
    }
    const proof = Array.isArray(a.proof) ? JSON.stringify(a.proof) : null;
    await query(
      `INSERT INTO airdrop_allocations (address, amount, airdrop_round, proof, merkle_root_round)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (airdrop_round, address) DO UPDATE SET amount = EXCLUDED.amount, proof = EXCLUDED.proof`,
      [addr, amount, round, proof, merkleRoot ?? null],
    );
    imported++;
  }
  await audit(admin, 'airdrop.import', round, { count: imported, merkleRoot: merkleRoot ?? null });
  return res.json({ ok: true, count: imported, merkleRoot: merkleRoot ?? null });
});

// GET /api/admin/airdrop/claims
adminRouter.get('/airdrop/claims', requireAuth, requireAdmin, async (req, res) => {
  const rows = await query('SELECT airdrop_round, address, amount, tx_hash, claimed_at FROM airdrop_claims ORDER BY claimed_at DESC LIMIT 100');
  return res.json({ claims: rows });
});

// GET /api/admin/vesting/schedules
adminRouter.get('/vesting/schedules', requireAuth, requireAdmin, async (req, res) => {
  const rows = await query('SELECT * FROM vesting_schedules ORDER BY created_at DESC LIMIT 100');
  return res.json({ schedules: rows });
});

// GET /api/admin/treasury
adminRouter.get('/treasury', requireAuth, requireAdmin, async (req, res) => {
  const rows = await query('SELECT * FROM treasury_transactions ORDER BY timestamp DESC LIMIT 100');
  return res.json({ transactions: rows });
});

// GET /api/admin/presale
adminRouter.get('/presale', requireAuth, requireAdmin, async (req, res) => {
  const purchases = await query('SELECT * FROM presale_purchases ORDER BY timestamp DESC LIMIT 100');
  const claims = await query('SELECT * FROM presale_claims ORDER BY timestamp DESC LIMIT 100');
  const refunds = await query('SELECT * FROM presale_refunds ORDER BY timestamp DESC LIMIT 100');
  return res.json({ purchases, claims, refunds });
});

// GET /api/admin/audit
adminRouter.get('/audit', requireAuth, requireAdmin, async (req, res) => {
  const rows = await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
  return res.json({ logs: rows });
});

// GET /api/admin/roles — server-side admin role list.
adminRouter.get('/roles', requireAuth, requireAdmin, async (req, res) => {
  const rows = await query('SELECT wallet, role, granted_by, granted_at FROM admin_roles');
  return res.json({ roles: rows });
});
