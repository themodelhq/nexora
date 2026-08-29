# Nexora — API Reference

Base URL: `http://localhost:4000` (dev). The API never holds private keys.

## Authentication
Wallet-signature (SIWE). The backend verifies a signed message — it never sees
a private key.
- `POST /api/auth/connect` — body `{ address, message, signature }` → returns
  a session token. Send as `Authorization: Bearer <token>` for protected routes.
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Public
- `GET /health` — service status, env, chainId.
- `GET /api/dashboard?address=0x...` — on-chain token info + user balance
  (fetched via viem; no fabricated data).

## Airdrop (auth)
- `POST /api/airdrop/generate` — body `{ csv }` or `{ allocations }` → `{ root, count }`.
- `POST /api/airdrop/proof` — body `{ address }` → stored allocation.

## Admin (auth + admin wallet)
- `GET /api/admin/status` — contract/ownership overview.
- `GET /api/admin/token`
- `GET /api/admin/airdrop/allocations?round=genesis`
- `POST /api/admin/airdrop/import` — body `{ round, allocations }`.
- `GET /api/admin/airdrop/claims`
- `GET /api/admin/vesting/schedules`
- `GET /api/admin/treasury`
- `GET /api/admin/audit`

## Errors
`{ "error": "<message>" }` with appropriate HTTP status (400, 401, 403, 404, 500, 502).
