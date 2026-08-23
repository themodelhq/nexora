/**
 * Nexora — Backend API.
 *
 * Responsibilities: health, wallet SIWE auth, Merkle airdrop generation,
 * on-chain dashboard data (via viem), analytics, admin functions, audit log.
 *
 * SECURITY: the API never holds private keys or seed phrases. All privileged
 * actions require wallet-signature (SIWE) authentication + JWT sessions.
 * Sensitive endpoints are rate-limited.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { config } from './config';
import { pool } from './db';
import { validateEnv } from './validateEnv';
import { logger } from './logger';
import { authRouter } from './routes/auth';
import { airdropRouter } from './routes/airdrop';
import { dashboardRouter } from './routes/dashboard';
import { adminRouter } from './routes/admin';

// Fail loudly at startup if required environment variables are missing/invalid.
validateEnv();

const app = express();

// Request logging with a request id (observability).
app.use((req, res, next) => {
  const requestId = logger.newRequestId();
  (req as unknown as { requestId: string }).requestId = requestId;
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http.request', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip ?? undefined,
    });
  });
  next();
});

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

// Rate limiting (auth + admin are sensitive endpoints).
const authLimiter = new RateLimiterMemory({
  points: 10, // 10 requests
  duration: 60, // per 60s per IP
});
const adminLimiter = new RateLimiterMemory({ points: 120, duration: 60 });

// Lightweight operational metrics.
app.get('/metrics', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        (SELECT count(*) FROM transactions) AS transactions,
        (SELECT count(*) FROM airdrop_claims) AS airdrop_claims,
        (SELECT count(*) FROM audit_logs) AS audit_logs,
        (SELECT count(*) FROM sessions WHERE revoked = false) AS active_sessions`,
    );
    res.type('text/plain').send(
      Object.entries(rows[0] ?? {})
        .map(([k, v]) => `nexora_${k} ${v}`)
        .join('\n'),
    );
  } catch {
    res.status(503).type('text/plain').send('nexora_db_up 0');
  }
});

app.use('/api/auth', async (req, res, next) => {
  try {
    await authLimiter.consume(req.ip ?? 'unknown');
    next();
  } catch {
    res.status(429).json({ error: 'too many requests' });
  }
});
app.use('/api/admin', async (req, res, next) => {
  try {
    await adminLimiter.consume(req.ip ?? 'unknown');
    next();
  } catch {
    res.status(429).json({ error: 'too many requests' });
  }
});

// Health check (liveness).
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: config.env, chainId: config.chainId, time: new Date().toISOString() });
});

// Readiness check — verifies DB connectivity and required env.
app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    const required = ['ADMIN_JWT_SECRET'];
    const missing = required.filter((k) => !process.env[k] || process.env[k] === 'replace-me');
    res.status(missing.length ? 503 : 200).json({
      status: missing.length ? 'not_ready' : 'ready',
      missing,
      time: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'not_ready', error: 'database unreachable' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/airdrop', airdropRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/admin', adminRouter);

// 404 + error handlers (structured, never leak stack traces to end users).
app.use((req, res) => {
  logger.warn('http.not_found', {
    requestId: (req as unknown as { requestId?: string }).requestId,
    path: req.originalUrl,
  });
  res.status(404).json({ error: 'Not found' });
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('http.error', {
    requestId: (req as unknown as { requestId?: string }).requestId,
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info('server.started', { port: config.port, env: config.env, chainId: config.chainId });
});

// Graceful shutdown.
async function shutdown() {
  console.log('Shutting down...');
  await pool.end().catch(() => undefined);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
