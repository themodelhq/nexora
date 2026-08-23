# Nexora — Final Pre-Testnet Audit

This is the final targeted audit before a real Base Sepolia deployment. It was
produced by inspecting the actual source (not assuming prior docs are correct).

## Baseline at audit time
- Hardhat tests: **117 passing** (after adding treasury + vault tests)
- Foundry fuzz/invariant tests: **32 passing**
- solhint: 0 errors
- Deployment verified against a local Hardhat node.

## Issue register

| # | Issue | Severity | File | Root cause | Fix | Tests required | Final status |
|---|-------|----------|------|-----------|-----|----------------|--------------|
| P1 | `deploy-all.ts` does not export `main` and auto-runs on import | **HIGH** | `deploy-all.ts` | `async function main()` not exported; `main().catch()` called unconditionally → `deploy-sepolia/mainnet` get `undefined` and importing triggers a second deploy | `export async function main()`; guard with `if (require.main === module)`; return results | run `deploy:sepolia` + idempotency | FIXED |
| P2 | CI `on:` lacks `workflow_dispatch:` so dispatch job can never run | **HIGH** | `.github/workflows/ci.yml` | `on:` had only push/pull_request; job gated on `workflow_dispatch` | Add `workflow_dispatch:` with inputs (network/force_redeploy/enable_presale default false) | GitHub Actions review | FIXED |
| P3 | Treasury architecture ambiguous (allocation to `TREASURY_ADDRESS` vs `NexoraTreasury` contract) | **HIGH** | `deployment-config.ts`, `deploy-all.ts` | Two addresses with unclear roles | **Option A**: the multisig (`TREASURY_ADDRESS`) is the treasury; 150M lands there; `NexoraTreasury` is an optional facade | `NexoraTreasury` architecture tests | FIXED (documented in `TREASURY_ARCHITECTURE.md`) |
| P4 | Team/advisor vesting schedules not configured at deploy | MED | `deploy-all.ts` | Vault released tokens into vesting but no `createSchedule` | Add vesting config resolver + create team/advisor schedules; fail on invalid/missing production config | deployment run | FIXED |
| P5 | Allocation vaults retain deployer ownership after release | MED | `deploy-all.ts` | Owner (deployer) kept after one-shot release | Verify vault empty then `renounceOwnership()` | `NexoraAllocationVault.test.ts` | FIXED |
| P6 | `mainnet-preflight.ts` reversed `check()` args → always PASS | **HIGH** | `mainnet-preflight.ts` | `check(ok, name)` vs signature `check(name, ok)` | Rewrite all calls to `check(name, ok)` | manual review | FIXED |
| P7 | Manifest lacked deployer/treasury/vesting/roles | MED | `deploy-all.ts` | Manifest minimal | Add deployer, treasury, vestingSchedules, roles | inspect manifest | FIXED |
| P8 | Stale `KNOWN_LIMITATIONS` (demo auth, in-memory sessions, no reorg) | LOW | `KNOWN_LIMITATIONS.md` | Not updated after fixes | Rewrite with CURRENT/RESOLVED/REQUIRES-HUMAN-ACTION | doc review | FIXED |
| P9 | Vote token `DEFAULT_ADMIN` retained by deployer → could grant MINTER later | **HIGH** | `deploy-all.ts`, `verify-roles.ts` | Deployer kept `DEFAULT_ADMIN` on NXVT after MINTER revoke | Transfer NXVT `DEFAULT_ADMIN` to the timelock; verify deployer has neither MINTER nor DEFAULT_ADMIN | `VoteTokenInvariants` + Foundry | FIXED |

## Items requiring external credentials (NOT VERIFIED)
- Live Base Sepolia deployment (needs funded wallet + RPC + BaseScan key).
- Contract verification on BaseScan.
- Live testnet E2E transactions.
- Indexer against live chain.
- Admin SIWE against a live backend + DB.
