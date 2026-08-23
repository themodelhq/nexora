/**
 * Nexora — wallet authentication (Sign-In With Ethereum / EIP-4361).
 *
 * The API never sees a private key. It issues a one-time nonce, verifies a
 * signed SIWE message (domain, URI, chain id, nonce, issued-at, expiration,
 * statement), then creates a persistent DB session. Sessions expire and can be
 * revoked. This replaces the previous demo/in-memory session approach.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { SiweMessage } from 'siwe';
import { randomBytes, createHash } from 'crypto';
import { queryOne, query } from '../db';
import { config } from '../config';

export const authRouter = Router();

const SIWE_DOMAIN = process.env.SIWE_DOMAIN ?? 'nexora.io';
const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours
const NONCE_TTL_SECONDS = 300; // 5 minutes

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * GET /api/auth/nonce?address=0x...
 * Issues a single-use nonce bound to the address.
 */
authRouter.get('/nonce', async (req, res) => {
  const address = String(req.query.address ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return res.status(400).json({ error: 'invalid address' });
  }
  const nonce = newToken();
  await query('INSERT INTO nonces (address, nonce) VALUES ($1, $2)', [address, nonce]);
  return res.json({ nonce });
});

/**
 * POST /api/auth/verify
 * Body: { message, signature }
 * Verifies the EIP-4361 message (domain, uri, chainId, nonce, iat, exp, sig),
 * consumes the nonce, and creates a persistent session.
 */
authRouter.post('/verify', async (req, res) => {
  const { message, signature } = req.body ?? {};
  if (!message || !signature) {
    return res.status(400).json({ error: 'message and signature required' });
  }

  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(message);
  } catch {
    return res.status(400).json({ error: 'invalid SIWE message' });
  }

  // Validate domain, URI, chain id, statement (EIP-4361 fields).
  if (siwe.domain !== SIWE_DOMAIN) {
    return res.status(400).json({ error: 'invalid SIWE domain' });
  }
  // URI must be one of the allowed origins (or the SIWE domain).
  if (siwe.uri) {
    const uriAllowed =
      config.corsOrigins.some((o) => siwe.uri!.startsWith(o)) ||
      siwe.uri!.startsWith(`https://${SIWE_DOMAIN}`);
    if (!uriAllowed) {
      return res.status(400).json({ error: 'invalid SIWE uri' });
    }
  }
  if (siwe.chainId !== Number(config.chainId)) {
    return res.status(400).json({ error: `wrong chain id (expected ${config.chainId})` });
  }
  if (!siwe.statement || !siwe.statement.includes('Nexora')) {
    return res.status(400).json({ error: 'invalid statement' });
  }
  // Issued-at freshness: reject messages too old or in the future.
  if (siwe.issuedAt) {
    const iat = new Date(siwe.issuedAt).getTime();
    const now = Date.now();
    if (Number.isNaN(iat) || iat > now + 60_000 || now - iat > NONCE_TTL_SECONDS * 1000) {
      return res.status(401).json({ error: 'message issued-at outside acceptable window' });
    }
  }
  // Expiration is enforced by siwe.verify below.

  // Consume + validate the one-time nonce (replay prevention) and its TTL.
  const stored = await queryOne<{ used: boolean; issued_at: Date }>('SELECT used, issued_at FROM nonces WHERE nonce = $1', [siwe.nonce]);
  if (!stored || stored.used) {
    return res.status(401).json({ error: 'invalid or expired nonce' });
  }
  const issuedAtMs = new Date(stored.issued_at).getTime();
  if (Number.isNaN(issuedAtMs) || Date.now() - issuedAtMs > NONCE_TTL_SECONDS * 1000) {
    return res.status(401).json({ error: 'nonce expired' });
  }
  await query('UPDATE nonces SET used = TRUE WHERE nonce = $1', [siwe.nonce]);

  try {
    const result = await siwe.verify({ signature });
    if (!result.success) throw new Error('verification failed');
  } catch {
    return res.status(401).json({ error: 'signature verification failed' });
  }

  // Upsert user + wallet.
  const address = siwe.address.toLowerCase();
  const wallet = await queryOne<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM wallets WHERE address = $1',
    [address],
  );
  let userId: string;
  if (wallet) {
    userId = wallet.user_id;
  } else {
    const user = await queryOne<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id', []);
    userId = user!.id;
    await query('INSERT INTO wallets (user_id, address) VALUES ($1, $2)', [userId, address]);
  }

  // Determine admin role from the DB admin_roles table (server-side truth).
  const roleRow = await queryOne<{ role: string }>(
    'SELECT role FROM admin_roles WHERE wallet = $1 AND role IN (\'admin\',\'superadmin\') LIMIT 1',
    [address],
  );
  const role = roleRow?.role ?? 'user';

  // Create a persistent session (not an in-memory map).
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    `INSERT INTO sessions (id, user_id, wallet, role, nonce, issued_at, expires_at, ip_address)
     VALUES ($1, $2, $3, $4, $5, now(), $6, $7)`,
    [hashToken(token), userId, address, role, siwe.nonce, expires.toISOString(), req.ip ?? null],
  );

  return res.json({ session: token, address, role, expiresAt: expires.toISOString() });
});

/**
 * POST /api/auth/logout — revokes the session (server-side).
 */
authRouter.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await query('UPDATE sessions SET revoked = TRUE, revoked_at = now() WHERE id = $1', [hashToken(token)]);
  }
  return res.json({ ok: true });
});

/**
 * GET /api/auth/me — returns the current session.
 */
authRouter.get('/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const s = await queryOne<{ wallet: string; role: string; expires_at: Date; revoked: boolean }>(
    'SELECT wallet, role, expires_at, revoked FROM sessions WHERE id = $1',
    [hashToken(token)],
  );
  if (!s || s.revoked || new Date(s.expires_at) < new Date()) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.json({ address: s.wallet, role: s.role });
});

// ------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const s = await queryOne<{ wallet: string; role: string; expires_at: Date; revoked: boolean }>(
    'SELECT wallet, role, expires_at, revoked FROM sessions WHERE id = $1',
    [hashToken(token)],
  );
  if (!s || s.revoked || new Date(s.expires_at) < new Date()) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  (req as unknown as { auth: { wallet: string; role: string } }).auth = { wallet: s.wallet, role: s.role };
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = (req as unknown as { auth?: { wallet: string; role: string } }).auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (auth.role !== 'admin' && auth.role !== 'superadmin') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  (req as unknown as { admin?: string }).admin = auth.wallet;
  next();
}
