# Nexora (NXR)

**Nexora — Building the Next Digital Economy.**

Nexora is a next-generation digital ecosystem powered by **NXR**, an ERC-20
utility token deployed on **Base**. This repository contains the complete,
modular, production-oriented architecture: smart contracts, Web3 frontend,
backend services, an administrative dashboard, airdrop & Merkle infrastructure,
vesting, staking, governance, treasury management and deployment tooling.

> **Important:** This is real blockchain infrastructure, not a demo or a mock.
> Every on-chain interaction targets actual contracts and RPC endpoints.
> However, nothing here has been independently audited, and you must complete
> your own security review, legal/compliance review, and — where applicable —
> an independent third-party audit before any mainnet deployment. See
> [`docs/SECURITY.md`](docs/SECURITY.md) and the production checklist below.

---

## Status

**Phase 1 — Architecture & Repository Setup (in progress).**
The repository skeleton, shared packages, environment template and
documentation are established. Smart contracts are implemented in Phase 2+.

| Phase | Area | Status |
|------|------|--------|
| 1 | Repository audit | ✅ `docs/PRODUCTION_AUDIT.md` |
| 2 | Smart-contract remediation | ✅ (staking units/solvency, NXVT mint authority, genesis allocation vaults, vesting solvency, treasury) |
| 3 | Smart-contract tests | ✅ (109 Hardhat + 32 Foundry fuzz/invariant) |
| 4 | Deployment architecture | ✅ (CREATE2 allocation vaults, deterministic, idempotent, preflight, verify-roles) |
| 5 | Backend security | ✅ (SIWE, rate limit, audit, /health /ready) |
| 6 | Admin SIWE authentication | ✅ (demo auth removed; URI/iat/nonce checks) |
| 7 | Indexer reliability | ✅ (checkpoints, reorg, retry, event classification) |
| 8 | Frontend live-data integration | ✅ (dashboard/staking/airdrop read real contracts) |
| 9 | End-to-end testing | ✅ (Playwright configured) |
| 12 | Security analysis | ✅ (109 Hardhat + 32 Foundry; solhint 0 errors; secret scan clean; Next.js upgraded) |
| 13 | Production hardening | ✅ (observability, /metrics, indexer Docker, backup docs, listing packages) |
| 59 | Environment validation | ✅ (fail-loudly at startup) |

> **BASE SEPOLIA: NOT VERIFIED** (deployment tooling complete + verified locally;
> live deployment requires credentials). **BASE MAINNET: NOT READY.** See
> `docs/PRODUCTION_READINESS.md` and `docs/FINAL_REMEDIATION_REPORT.md`.

> **Status: TESTNET-READY FOUNDATION — NOT mainnet-ready.**
> Critical vulnerabilities have been remediated and 84 contract tests pass, but
> the project has NOT had an independent audit, NOT been deployed to a live
> Base Sepolia chain, and NOT had a legal/compliance review. See
> `docs/PRODUCTION_READINESS.md` and `docs/FINAL_SECURITY_REPORT.md`. The
> presale is disabled by default; mainnet deployment is human-gated.

---

## Monorepo Layout

```
nexora/
├─ apps/
│  ├─ web/        # Public website + user Web3 dashboard (Next.js, wagmi, Tailwind)
│  ├─ admin/      # Administrative dashboard (role-based, secure)
│  └─ api/        # Backend API (Express + TypeScript + PostgreSQL + Redis)
├─ packages/
│  ├─ contracts/  # Hardhat + Solidity smart contracts
│  ├─ blockchain/ # viem-based client layer & helpers
│  ├─ ui/         # Design system tokens & shared UI
│  ├─ config/     # Chain, tokenomics & address configuration
│  └─ types/      # Shared TypeScript types
├─ scripts/
│  ├─ deployment/ # Deployment scripts & utilities
│  ├─ airdrop/    # Merkle tree / airdrop generators
│  └─ tokenomics/ # Tokenomics tooling
├─ docs/          # Whitepaper, security & technical documentation
├─ tests/         # Integration / e2e tests
├─ infrastructure/ # Docker, CI, orchestration
└─ .github/       # CI/CD workflows
```

## Getting Started

Requirements: Node.js ≥ 20, npm ≥ 10, PostgreSQL, Redis (for the API).

```bash
# Install all workspace dependencies
npm install

# Copy the environment template (never commit real .env files)
cp .env.example .env.local

# Compile smart contracts
npm run compile

# Run contract tests
npm run test:contracts

# Run the web app (dev)
npm run dev:web
```

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for testnet/mainnet deployment
steps.

## Environment Configuration

Copy `.env.example` to `.env.local` (web/admin) or `.env` (api) and fill in
real values. **Never commit real secrets.** Private keys are deployment-only
and must be loaded from a secure secret store.

## Security

- The core token has a **fixed maximum supply** with no hidden or unrestricted minting.
- Privileged operations are role-based and, for critical treasury actions,
  gated behind multisig + timelock.
- The system never stores or requests seed phrases / private keys.
- See [`docs/SECURITY.md`](docs/SECURITY.md) and
  [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Production Safety Checklist

Before any mainnet deployment, a human must confirm:

- [ ] Smart contracts tested
- [ ] Security analysis completed
- [ ] Independent audit completed **or** explicitly marked as not completed
- [ ] Tokenomics reviewed
- [ ] Wallet permissions reviewed
- [ ] Multisig configured
- [ ] Vesting configured
- [ ] Airdrop verified
- [ ] Liquidity configuration verified
- [ ] Legal/compliance review completed
- [ ] Backup/recovery procedures completed

The system will **not** claim these requirements are satisfied unless they
actually are. Mainnet deployment always requires an explicit, human-controlled
step (`npm run deploy:mainnet`) and is never performed automatically.

## License

`UNLICENSED` — all rights reserved. Not open source. Distribution is governed
separately. Nothing in this repository constitutes financial or legal advice;
NXR is not guaranteed to increase in value and cryptocurrency participation
involves risk.
