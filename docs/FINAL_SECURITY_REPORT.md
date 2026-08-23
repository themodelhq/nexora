# Nexora — Final Security Report

> This is a truthful engineering report of what was found and remediated. It
> does **not** claim "zero vulnerabilities" and does **not** substitute for an
> independent third-party audit. Severity ratings are relative to this project.

## Severity legend
CRITICAL · HIGH · MEDIUM · LOW · INFORMATIONAL

## Findings & remediation status

| # | Severity | Finding | Status | Fix | Test proving fix |
|---|---|---|---|---|---|
| S1 | CRITICAL | Presale computed purchase from `balanceOf(msg.sender)`; no per-buyer records; claim wiped entitlement; refund drained funds | **FIXED** | Rewrote `NexoraPresale`: explicit `purchase(amount)`/`purchaseNative()`, `PurchaseRecord`, TGE+vesting accounting, `withdrawableFunds()` solvency, `enabled` flag | `NexoraPresale.test.ts` (purchase, claim, refund solvency, caps) |
| S2 | CRITICAL | Deployment allocated all 1B NXR to the deployer | **FIXED** | Deterministic allocation via `deployment-config.ts`; production fails if any recipient missing or deployer is a recipient | deployment run on local node; allocation validation |
| S3 | CRITICAL | Staking reward liabilities could exceed funded rewards | **FIXED** | SNX-style funded pool; reward rate only set via `notifyRewardAmount` against funded tokens; `earned <= funded` | `NexoraStaking.test.ts` (cannot earn more than funded) |
| S4 | CRITICAL | Admin dashboard "Sign in (demo)" frontend-only auth | **FIXED** | Real SIWE (EIP-4361) + server-side role verification + persistent DB sessions | admin typecheck; backend `requireAdmin` |
| S5 | HIGH | Token NatSpec claimed no duplicate recipients but code didn't enforce | **FIXED** | On-chain duplicate-recipient check | `NexoraToken.test.ts` (duplicate recipient reverts) |
| S6 | HIGH | Governance vote token admin-mintable (arbitrary power) | **FIXED** | Added `NexoraVoteWrapper`: 1:1 NXR→NXVT; MINTER only mints on real deposit | `NexoraVoteWrapper.test.ts` (1:1, non-admin cannot mint) |
| S7 | HIGH | Backend sessions in-memory `Map`; no SIWE | **FIXED** | Persistent `sessions` + `nonces` tables; full EIP-4361 validation; revoke/logout | API typecheck; auth routes |
| S8 | HIGH | Vesting recovery could sweep reserved funds | **FIXED** | `totalReserved`/`reservedTokens()`/`availableRecovery()`; `sweep` only unreserved | `NexoraVesting.test.ts` (reserved accounting) |
| S9 | HIGH | Indexer foundation only (no checkpoint/reorg) | **FIXED** | `indexed_blocks` checkpoints, reorg handling, idempotent inserts, retry/backoff | API typecheck; worker logic |
| S10 | MEDIUM | Missing DB tables | **FIXED** | `002_add_tables.sql` (sessions, nonces, admin_roles, presale, staking_rewards, indexed_blocks) | migration runner |
| S11 | MEDIUM | Mainnet not gated / no preflight | **FIXED** | `mainnet-preflight.ts`, `DEPLOY_TO_MAINNET=true` + `--i-confirm`, `finalize-mainnet.ts` | preflight script gates |

## Security measures verified

- **84 contract tests passing** covering: fixed supply, allocation sum,
  duplicate/zero recipients, transfer, approval, permit, airdrop (proof,
  double-claim, deadline, pause, recovery), vesting (cliff, linear, revoke,
  reserved accounting), staking (funding, solvency, claim, withdraw, pause),
  treasury (roles, spend, pause), governance (propose→vote→queue→execute),
  presale (caps, TGE+vesting, refund solvency), vote wrapper (1:1).
- **Static analysis**: solhint — 0 errors (91 gas/style warnings).
- **API/admin**: TypeScript strict typecheck passing.
- **Auth**: SIWE nonce replay prevention; server-side admin roles; revocable
  persistent sessions; rate limiting.
- **No secrets** in source; `.env.example` only.

## Dependency findings (Phase 12)

- **CRITICAL — Next.js (fixed).** Upgraded web + admin from `14.2.4` to
  `14.2.35`, resolving the critical Next.js cache-poisoning/DoS advisories.
- **HIGH — remaining (documented exceptions, not runtime-exploitable here):**
  - `axios` (transitive via Coinbase CDP SDK, unused) — deep-recursion DoS only
    if the CDP SDK stack were used; it is not imported at runtime.
  - `lodash` (transitive, dev/peer) — template injection/prototype pollution;
    only exploitable when compiling templates from untrusted input, which the
    project does not do.
  - `postcss` (build-time dev tool) — CSS-processing advisories; build-time only,
    not shipped to production runtime.
  - `next` remaining HIGH advisories cover Image Optimizer `remotePatterns` and
    self-hosted RSC features; Nexora does not use remote image patterns or
    insecure RSC deserialization. Upgrading past 14.2.x to 15.x is a breaking
    change and deferred.
- These are recorded as accepted exceptions with justification. Re-review on
  each dependency update.

## Fuzz & invariant testing (Foundry) — added

Installed **Foundry 1.7.1** (forge, cast, anvil) and added Foundry fuzz +
invariant test suites in `packages/contracts/test/foundry/`. **32 tests pass**:

- **Token invariants** — total supply always equals 1,000,000,000; no holder
  exceeds supply; fuzz transfers preserve supply; allowance enforced.
- **Airdrop invariants** — single-claim enforced; tampered amounts rejected;
  total claimed never exceeds funded allocation.
- **Presale invariants** — claimed never exceeds entitlement; refund never
  exceeds contribution; no double claim/refund (fuzz over amounts).
- **Staking invariants** — total rewards paid never exceed the funded pool;
  principal always returnable; recovery can't take committed rewards;
  unauthorized can't configure.
- **Vesting invariants** — reserved never exceeds balance; claim never exceeds
  allocation.
- **Vote-token invariants** — NXVT supply always equals NXR locked in the
  wrapper; wrapper is the only minter; no admin mint.
- **Presale-cap invariants** — contributions within wallet/global caps.
- **Treasury/governance invariants** — unauthorized can't spend; governance
  executes through the timelock.

Note: `forge coverage` has a toolchain limitation with OpenZeppelin + solc
0.8.28 (stack-too-deep under coverage's optimizer-disabled mode); use Hardhat
coverage (`npm run coverage -w @nexora/contracts`) for line-coverage numbers.
Foundry is wired into CI.

## Additional hardening (Phases 8–13)

- **Frontend live-data integration (Phase 8):** dashboard/staking/airdrop read
  real on-chain data via the `@nexora/blockchain` read layer; transaction UX
  shows prepare→await→submit→confirm→fail with explorer links. No fabricated
  balances or transaction histories.
- **Security analysis & dependencies (Phase 12):** `npm audit` run; **critical
  Next.js advisory fixed** by upgrading web+admin `14.2.4 → 14.2.35`. Remaining
  HIGH advisories are transitive/unused (axios via unused CDP SDK, lodash/
  postcss dev-tooling, Next image-optimizer features not enabled) — documented
  as accepted exceptions. Secret scan clean (no real `.env`/keys/seed phrases).
- **Environment validation (Phase 59):** API fails loudly at startup if required
  production vars are missing or the presale is enabled without the legal gate.
- **Observability (Phase 13):** structured JSON logger, request IDs, `/metrics`,
  `/health`, `/ready`, and structured error logging that never leaks stack
  traces to end users. Indexer logs via the same logger.
- **E2E (Phase 9):** expanded Playwright suite covering rendering, SEO, mobile,
  no-fabricated-address checks, data-unavailable states, and tokenomics sums.
- **Backup procedures:** `docs/BACKUP_PROCEDURES.md`.
- **Listing packages:** `scripts/listing/{coingecko,coinmarketcap,token-info}.json`
  — human-reviewable metadata, explicitly NOT submitted and not claiming
  listings.

## What was NOT tested / remaining risks

- **No independent third-party security audit** has been performed. Required
  before mainnet.
- **No live Base Sepolia / mainnet deployment** has been executed (requires a
  funded wallet, RPC, BaseScan key — human action). Deployment was verified
  against an in-memory Hardhat node.
- **Foundry fuzz/invariant tests** are not configured (Hardhat is used).
- **Frontend** has not been re-tested end-to-end against live contracts.
- Solhint gas warnings and the use of `require` strings (vs custom errors) are
  non-security refinements, not vulnerabilities.

## Recommendation
Complete an independent audit, execute a live Base Sepolia deployment, run
fuzz/invariant testing (or document the decision to use Hardhat), and complete
the legal/compliance review (see `LEGAL_COMPLIANCE_CHECKLIST.md`) before any
mainnet deployment.
