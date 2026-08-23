/**
 * Nexora API configuration (loads from environment, never from committed files).
 */
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://nexora:nexora@localhost:5432/nexora',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET ?? 'dev-only-change-me',
  adminWallets: (process.env.ADMIN_WALLETS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  rpcUrl: process.env.RPC_URL ?? 'https://sepolia.base.org',
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532),
} as const;

/** The API never stores or requires private keys. */
export function hasPrivateKey(): boolean {
  return Boolean(process.env.DEPLOYER_PRIVATE_KEY);
}
