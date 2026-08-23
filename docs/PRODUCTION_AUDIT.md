# Nexora — Production Audit & Remediation Matrix

**Status: AUDIT COMPLETE — remediation in progress.**
This document is the authoritative record of what exists, what works, what is
broken or incomplete, and the prioritized remediation plan. It was produced by
inspecting the entire repository before making modifications.

> Scope note: This is an internal engineering audit of the Nexora codebase, not
> an independent third-party audit. It does not certify correctness or
> regulatory compliance.

---

## 1. Repository state at audit time

- Monorepo: `apps/{web,admin,api}`, `packages/{contracts,blockchain,config,types,ui}`,
  `scripts/`, `tests/e2e`, `docs/`, `infrastructure/`, `.github/`.
- Solidity: 7 contracts + OpenZeppelin, compiler `0.8.28` / EVM `cancun`.
- Hardhat-based (not Foundry) — no Foundry fuzz/invariant tooling configured yet.
- Tests: 68 passing across token, airdrop, vesting, staking, treasury, governance, presale.
- Deployment: `deploy-all.ts` verified against an in-memory Hardhat node only;
  no live Base Sepolia deployment has been executed.
- `node_modules` are not committed/snapshotted (regenerated via `npm install`).

---

## 2. Working features (verified by tests)

- **Token**: fixed supply, no mint, permit, allocation-sum enforcement, no honeypot controls.
- **Airdrop**: Merkle proof verification, single-claim, deadline, pause, post-deadline recovery.
- **Vesting**: cliff + linear release, revocable schedules with frozen vested amount.
- **Staking**: reward-per-share accrual, stake/withdraw/claim, pause.
- **Treasury**: role-gated spend (ERC-20 + native), balances, pause.
- **Governance**: Governor + Timelock end-to-end (propose → vote → queue → execute) tested.
- **Presale**: basic purchase/claim/refund tested, but architecture is NOT production-ready (see below).

## 3. CRITICAL findings (must fix first)

### C1 — Presale is not production-ready
- **Purchase amount derived from `balanceOf(msg.sender)`** instead of an explicit
  user-supplied amount. This is fragile and can pull unintended amounts.
  → Redesign: `purchase(paymentAmount)` / `purchaseNative()` with explicit validation.
- **No per-buyer purchase record**; only a single `contributions` counter. Cannot
  support TGE + vesting relationship, double-claim/refund prevention, or entitlements.
- **`claim()` wipes the entire contribution** and pays `contribution*rate*tgeUnlockBps`,
  which "loses" the unclaimed/vested remainder from accounting.
- **`refund()` always refunds the full contribution** and can be called even while
  a buyer has claim entitlement, with no refund/claim accounting separation.
- **`withdrawFunds()` can drain the contract** below what is owed for outstanding
  refunds (no solvency accounting).
- No global presale cap, no `enabled` flag (must default to DISABLED).
- No KYC/jurisdiction/terms-compliance hooks.

### C2 — Deployment can allocate everything to the deployer
- `deploy-all.ts` routes all 1B NXR to `deployer.address`. Unacceptable for production.
  → Deterministic allocation system with explicit recipient configuration and a
  validation that `SUM == MAX_SUPPLY` and NO deployer windfall.

### C3 — Token NatSpec claims duplicate recipients are prohibited but code does not enforce it
- `NexoraToken` constructor doc: "No address may appear twice", but there is no
  duplicate check. Either enforce on-chain or correct the spec.
  → Enforce duplicate-recipient rejection on-chain + test.

### C4 — Staking solvency not enforced against funded reward reserve
- Rewards accrue based on `rewardRate`, but nothing guarantees the contract holds
  enough to cover accrued obligations. `emergencySweep` math is inconsistent
  (`totalRewardsMinted` is never incremented in the new model). A reward-pool
  shortfall can make claims revert.
  → Redesign with explicit funded-reward reserve and `promised <= funded` invariant.

### C5 — Admin dashboard uses demo authentication
- `setAuthed(true)` / "Sign in (demo)". No SIWE, no real session. Frontend-only auth.
  → Replace with EIP-4361 (SIWE) + server-side session/role verification.

## 4. HIGH findings

- **H1 — Governance vote token (NXVT) is admin-mintable** with `MINTER_ROLE`
  granted to a single admin. Voting power can be arbitrarily inflated.
  → Re-architect so voting power derives transparently from NXR (stake/delegate)
  or document + constrain the wrapper; remove arbitrary single-admin minting.
- **H2 — Backend sessions are an in-memory `Map`**; no persistence, no Redis,
  no secure cookies, no CSRF. Lost on restart; not multi-instance safe.
- **H3 — Indexer is a foundation only**: no reorg handling, no robust checkpoint
  recovery, no retry, missing many event types and DB tables.
- **H4 — Database schema is missing tables** required by the spec (sessions,
  presale_purchases/claims/refunds, staking_rewards, governance_votes already
  present but indexer/checkpoint and many others missing).
- **H5 — Vesting `sweep()` can send unreserved tokens but there is no
  `reservedTokens()`/`availableRecovery()` accounting** — recovery could sweep
  tokens reserved for active schedules.
- **H6 — Presale not gated behind an explicit `enabled` flag** and has no global cap.
- **H7 — Placeholder/zero Merkle root in deploy-all** and no airdrop validation
  gate before publishing a root.

## 5. MEDIUM / LOW / INFORMATIONAL findings

- M1: `deploy-sepolia.ts` / `deploy-mainnet.ts` do not yet deploy the full suite.
- M2: No mainnet preflight gate (`DEPLOY_TO_MAINNET` + second confirmation).
- M3: No post-deployment finalization / role-revocation script.
- M4: Frontend shows "Coming soon"/placeholders instead of live data on several pages.
- M5: `docs/WHITEPAPER.md` and README claim more than is deployed; need TESTNET/PLANNED separation.
- M6: No LISTING_CHECKLIST, LEGAL_COMPLIANCE_CHECKLIST, ROLE_MATRIX, FINAL_SECURITY_REPORT,
  PRODUCTION_READINESS docs yet.
- M7: No contract `registry.json`; addresses only in deployment JSON.
- M8: No reorg handling in indexer; no unique-constraint-backed dedupe for all tables.
- M9: `emergencySweep` and `totalRewardsMinted` accounting inconsistent (see C4).
- I1: No `docs/PRESALE.md`, no `/ready` health endpoint, no metrics.
- I2: XSS/input handling should be audited in frontend (Next.js escapes by default, but links/URLs need review).

## 6. Prioritized remediation matrix

| Priority | ID | Action | Target |
|---|---|---|---|
| CRITICAL | C1 | Redesign `NexoraPresale` (explicit purchase, purchase record, TGE+vesting, refund solvency, enabled flag, global cap) | contracts + tests |
| CRITICAL | C2 | Deterministic allocation system with explicit recipients + validation | deployment + config + tests |
| CRITICAL | C3 | Enforce duplicate-recipient rejection in token | contracts + tests |
| CRITICAL | C4 | Staking solvency: funded reward reserve + `promised <= funded` invariant | contracts + tests |
| CRITICAL | C5 | Replace admin demo auth with SIWE + server-side session/role | admin + api + tests |
| HIGH | H1 | Constrain/redocument governance vote-token minting; derive from NXR | contracts + docs |
| HIGH | H2 | Redis-backed persistent sessions, secure cookies, CSRF | api |
| HIGH | H3 | Indexer reliability: checkpoint/reorg/retry + all event types | api |
| HIGH | H4 | Add missing DB tables + constraints | migrations |
| HIGH | H5 | Vesting `reservedTokens()`/`availableRecovery()` | contracts + tests |
| MED | M1–M8 | Deployment suite, preflight, finalization, docs, registry, live data | scripts + docs + frontend |

---

## 7. How this audit was performed

- Read all Solidity contracts and tests.
- Read deployment scripts, config, frontend/apps, backend routes, indexer, migrations.
- Confirmed the identified issues (deployer-allocation, demo auth, presale balanceOf,
  staking solvency gap, duplicate-recipient discrepancy, etc.).
- The full test suite (68 tests) and compile/static-analysis (solhint) results are
  recorded in the Phase reports; see `docs/FINAL_SECURITY_REPORT.md`.

## 8. Not addressed in this phase

- Live Base Sepolia deployment (requires funded wallet + RPC + BaseScan key — human action).
- Independent third-party security audit.
- Legal/compliance review (see `LEGAL_COMPLIANCE_CHECKLIST.md`).
