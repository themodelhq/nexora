# Nexora — Known Limitations

This document records known limitations and uncompleted items. It is kept up to
date and must be read before any deployment. It is organized by status.

## CURRENT LIMITATIONS

1. **No independent security audit has been completed.** Static analysis
   (solhint, Foundry fuzz/invariant) has been run, but a formal independent
   third-party audit is **pending**. The code must not be considered audited
   until this is closed. → REQUIRES INDEPENDENT SECURITY AUDIT.

2. **No live Base Sepolia deployment has been executed.** The deployment
   orchestrator has been verified against an in-memory Hardhat node, but a live
   testnet deployment requires a funded deployer wallet + RPC + BaseScan API
   key. → REQUIRES HUMAN ACTION.

3. **Airdrop is DISABLED until a valid Merkle root is published.** `deploy-all`
   deploys the airdrop contract with a zero (blocking) root; claims are
   impossible until a validated root (via `validate-merkle.ts`) is set. This is
   an intentional gated/disabled state, not a fake active root.

4. **Presale is DISABLED by default** and remains so unless explicitly enabled
   after legal/compliance review. Its exact economics (TGE unlock, refund
   policy) require legal finalisation. → REQUIRES LEGAL REVIEW.

5. **Governance is architecture-ready but not active on a live network.** The
   Governor/Timelock deploy and function in tests; live activation requires
   operator sign-off and a vote-token distribution strategy.

6. **Blockchain analytics dashboards** are not fully populated; they rely on
   the indexer and read-only on-chain queries.

7. **Cross-chain support is architectural only.** Base (Sepolia) is the only
   deployment target.

## RESOLVED ISSUES (historical)

1. ~~Admin dashboard "Sign in (demo)"~~ — **RESOLVED**: replaced with full
   SIWE (EIP-4361) wallet-signature authentication, server-side role
   enforcement, and audit logging.
2. ~~Backend sessions use an in-memory Map~~ — **RESOLVED**: replaced with
   persistent `sessions` + `nonces` DB tables, secure revocable sessions,
   rate limiting, and nonce TTL/replay prevention.
3. ~~Indexer lacks reorg handling~~ — **RESOLVED**: the indexer now has
   persistent checkpoints, block-hash tracking, six-confirmation finality,
   reorg detection/recovery, retry/backoff, and event-specific classification.
4. ~~Staking reward scaling `/1e18` bug~~ — **RESOLVED**: units isolated;
   `rewardRate` is wei/sec with no spurious `/1e18` in time/rate or reserve
   math; `availableSurplus()` + `outstandingRewardObligations()` added.
5. ~~NXVT deployer retained MINTER~~ — **RESOLVED**: wrapper is the only
   minter; deployer MINTER revoked and verified.
6. ~~Genesis allocation destinations ambiguous~~ — **RESOLVED**: CREATE2
   allocation vaults + automatic release into team/advisors vesting and
   presale; `validate-genesis-allocation.ts` verifies the 1B split.
7. ~~Vesting schedules unfunded~~ — **RESOLVED**: `createSchedule` requires
   unreserved funding; `fundAndCreateSchedule` is atomic; reservation tracked.
8. ~~Mainnet preflight always-PASS bug~~ — **RESOLVED**: reversed `check()`
   arguments fixed; every check now correctly reports PASS/FAIL.

## REQUIRES HUMAN ACTION

- Provide a funded Base Sepolia deployer wallet + RPC + BaseScan API key.
- Set the production allocation recipient addresses (or accept testnet defaults).
- Generate and publish a validated airdrop Merkle root to enable claims.
- Configure the treasury Safe/multisig and team/advisor vesting beneficiaries
  for production.

## MAINNET BLOCKERS

- Independent smart-contract audit.
- Legal/compliance review (including any presale).
- Production treasury multisig and beneficiaries.
- Production vesting terms confirmed.
- Live Base Sepolia validation.
- Explicit human approval.

## TESTNET STATUS

- Base Sepolia: **NOT VERIFIED** — deployment tooling and tests are complete
  and verified locally; a live testnet deployment has not been executed.
