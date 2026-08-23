/**
 * Nexora — startup environment validation.
 *
 * In production, missing or placeholder required variables cause a hard
 * failure ("fail loudly") rather than silently using demo/fallback values.
 */
import { config } from './config';

const isProduction = config.env === 'production';

/** Values that indicate an unset/placeholder secret. */
const PLACEHOLDERS = [
  'replace-me',
  'change-me',
  'demo',
  'development-only',
  'dev-only-change-me',
];

function isPlaceholder(v: string): boolean {
  const s = v.toLowerCase();
  return PLACEHOLDERS.some((p) => s.includes(p));
}

export function validateEnv(): void {
  const problems: string[] = [];

  // Production must have a strong JWT secret (no placeholder).
  if (isProduction && isPlaceholder(config.adminJwtSecret)) {
    problems.push('ADMIN_JWT_SECRET must be a strong random value in production');
  }

  // RPC required.
  if (!config.rpcUrl) {
    problems.push('RPC_URL is required');
  }

  // CORS origins must not be empty in production.
  if (isProduction && config.corsOrigins.length === 0) {
    problems.push('CORS_ORIGINS must be set in production');
  }

  // Presale must be disabled unless explicitly enabled (safety gate).
  if (process.env.ENABLE_PRESALE === 'true' && isProduction) {
    // Allowed only with explicit confirmation env.
    if (process.env.PRESALE_LEGAL_REVIEW_CONFIRMED !== 'true') {
      problems.push('ENABLE_PRESALE requires PRESALE_LEGAL_REVIEW_CONFIRMED=true (legal review gate)');
    }
  }

  if (problems.length > 0) {
    throw new Error(
      'Environment validation FAILED (failing loudly):\n  - ' + problems.join('\n  - '),
    );
  }
}
