# Nexora — Final Remediation Audit

**Purpose:** Records every remaining high-priority issue identified before
implementing the final remediation. Inspects the current repository, the prior
audit (`PRODUCTION_AUDIT.md`), `PRODUCTION_READINESS.md`, and
`FINAL_SECURITY_REPORT.md`, and runs the existing test suites.

**Baseline tests at audit time:** 84 Hardhat passing, 16 Foundry passing.

---

## Issue register

| # | Issue | Severity | Location | Root cause | Proposed fix | Test required | Status |
|---|-------|----------|----------|------------|--------------|---------------|--------|
| R1 | Staking reward-rate renewal scaling bug | **HIGH** | `NexoraStaking.notifyRewardAmount` | `leftoverTokens = (remaining * rewardRate) / 1e18` — `rewardRate` is already in wei/sec, so the `/1e18` is an extra division that under-counts leftover | `leftoverTokens = remaining * rewardRate` (no `/1e18`) | Deterministic renewal tests | FIXED |
| R2 | Staking surplus recovery under-reserves | **HIGH** | `NexoraStaking.recoverSurplus` | `reserved = principal + (remaining * rewardRate)/1e18` — extra `/1e18` under-states future obligations | Reserve `principal + outstandingRewardObligations` via tracked funding | `availableSurplus()` + recovery tests | FIXED |
| R3 | No `availableSurplus()` helper | MED | `NexoraStaking` | Surplus not independently computable | Add `availableSurplus()` view | Invariant test | FIXED |
| R4 | NXVT deployer may retain MINTER_ROLE | **HIGH** | `NexoraVoteToken` + deploy scripts | Constructor grants MINTER to deployer; deployer may never be revoked | After deployment, revoke deployer MINTER; only wrapper mints | `verify-roles.ts` + tests | FIXED |
| R5 | Genesis allocation destinations ambiguous (post-token contract deploys) | **CRITICAL** | `deploy-all.ts` | Token deploys before treasury/vesting/presale; testnet uses arbitrary EOAs as destinations | CREATE2 allocation vaults pre-deployed before token; automatic release to vesting/presale | `validate-genesis-allocation.ts` + `GenesisAllocation.test.ts` | FIXED |
| R6 | Vesting schedule creation not funding-linked | HIGH | `NexoraVesting` | `createSchedule` doesn't verify adequate unreserved funding | `createSchedule` requires unreserved funding; added `fundAndCreateSchedule` | Vesting solvency tests | FIXED |
| R7 | Treasury multisig not validated | MED | deploy config | Only zero-address check | Validate multisig (not deployer, has code, not beneficiary) in preflight | preflight | FIXED |
| R8 | Role handoff / deployer role revocation not automated | HIGH | `finalize-mainnet.ts` | Deployer DEFAULT_ADMIN not revoked | `verify-roles.ts` + role handoff + deploy MINTER revoked | verify-roles | FIXED |
| R9 | Airdrop zero-root placeholders in deploy | MED | `deploy-all.ts` | `ethers.ZeroHash` used | `validate-merkle.ts` + root must be set before activation (zero root blocks all claims) | validate-merkle | FIXED (root gated) |
| R10 | Financial precision (frontend) | MED | web app | `Number()`/`Math.floor(Number()*1e18)` on token amounts | `parseUnits`/`formatUnits` (viem) | typecheck | FIXED |
| R11 | Indexer event classification | MED | `indexer.ts` | All events recorded as `contract_event` | Event-specific topic0 classification | typecheck | FIXED |

---

## Confirmed unit definitions (staking)

- **Token decimals:** 18 (NXR).
- **`rewardRate`:** token smallest units (wei) per second (`amount / rewardsDuration`).
- **`rewardsDuration`, `periodFinish`, `lastUpdateTime`:** seconds (Unix timestamps).
- **`rewardPerToken`:** scaled by `1e18` — per-1-token reward precision; the `1e18` belongs here ONLY.
- **`stake`, `totalStaked`, `rewards`, `totalRewardsPaid`:** token wei.
- **`userRewardPerTokenPaid`:** `1e18`-scaled per-token value.
- **`reserved/obligation` (correct):** token wei = `remainingSeconds * rewardRate` (NO extra `/1e18`).

The correct isolation: the `1e18` multiplier appears in `rewardPerToken()`/`earned()` (per-token precision) and nowhere in the time/rate or reserve calculations.

---

## Priorities (from task)

1. Smart-contract correctness → R1, R2, R6, R4
2. Token allocation architecture → R5
3. Governance security → R4, R8
4. Staking/vesting solvency → R1, R2, R6
5. Treasury/role security → R7, R8
6. Deployment correctness → R5, R9
7. Test coverage → add deterministic + fuzz + invariant tests
8. Base Sepolia readiness → deploy full suite to chain 84532
9. Production preflight → 25-point gate
10. Documentation accuracy

---

## Honest scope note

This audit records issues and proposed fixes. **No contract address, tx hash,
deployment, audit, or test result is invented.** Anything unverified is marked
NOT VERIFIED. Live Base Sepolia deployment (Phase 17+) depends on RPC + funded
wallet + BaseScan key availability in the environment.
