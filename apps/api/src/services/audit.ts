/**
 * Nexora — audit logging.
 * Every privileged action is recorded. Never log private keys, seed phrases,
 * or secrets.
 */
import { query } from '../db';

export interface AuditMeta {
  ip?: string;
  requestId?: string;
  target?: string;
  previous?: unknown;
  current?: unknown;
  txHash?: string;
  [k: string]: unknown;
}

export async function audit(
  actor: string,
  action: string,
  resource?: string,
  metadata?: AuditMeta,
): Promise<void> {
  try {
    const safe = metadata
      ? Object.fromEntries(Object.entries(metadata).filter(([, v]) => !isSecret(v)))
      : undefined;
    await query(
      'INSERT INTO audit_logs (actor, action, resource, metadata) VALUES ($1, $2, $3, $4)',
      [actor, action, resource ?? null, safe ? JSON.stringify(safe) : null],
    );
  } catch (err) {
    // Audit logging must never break the main flow, but failures are surfaced
    // to the server log for operational monitoring.
    console.warn('audit log write failed:', (err as Error).message);
  }
}

function isSecret(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.toLowerCase();
  return (
    s.includes('private_key') ||
    s.includes('privatekey') ||
    s.includes('seedphrase') ||
    s.includes('seed_phrase') ||
    s.includes('mnemonic') ||
    s.includes('password') ||
    s.includes('jwt_secret')
  );
}
