# Nexora — Final Pre-Testnet Readiness

## EXECUTIVE SUMMARY
Nexora is prepared for a real **Base Sepolia** deployment. All final targeted
remediation is complete and verified locally: deployment scripts are correct and
idempotent, GitHub Actions deployment is fixed, treasury architecture is
unambiguous, team/advisor vesting is configured, allocation-vault ownership is
resolved, role handoff is defined, and tests pass. **Base mainnet remains NOT
READY.**

## Component status

- **SMART CONTRACTS:** READY for testnet (117 Hardhat + 32 Foundry tests pass; solhint 0 errors). Independent audit pending.
- **TOKENOMICS:** READY (fixed 1B; genesis allocation validates).
- **STAKING:** READY for testnet (solvent funded-reward model; surplus/obligations tracked).
- **VESTING:** READY for testnet (team 100M + advisors 50M schedules configured at deploy).
- **GOVERNANCE:** READY for testnet (Governor + Timelock; wrapper-only NXVT mint).
- **TREASURY:** READY (Option A: multisig is treasury; documented).
- **AIRDROP:** DISABLED until a validated Merkle root is published (safe gated state).
- **PRESALE:** DISABLED by default (correctly).
- **ADMIN SECURITY:** READY (SIWE, server-side roles, persistent sessions).
- **INDEXER:** READY (checkpoints, reorg, event classification) — requires live chain to validate.
- **DEPLOYMENT:** READY — `deploy-all` works locally, idempotent, exports `main` correctly; `deploy:sepolia` wired.
- **TEST STATUS:** Hardhat 117 passing, Foundry 32 passing.

## BASE SEPOLIA STATUS (explicit, non-overlapping)

- **BASE SEPOLIA CODE STATUS:** READY
  - Deployment scripts work and are idempotent.
  - Treasury + staking role handoff implemented and verified (127 Hardhat +
    32 Foundry tests pass; role table all PASS on local deploy).
  - GitHub Actions deployment wired (manual `workflow_dispatch`; presale false).
  - Treasury architecture unambiguous (Option A: multisig is treasury).
  - Team/advisor vesting schedules configured at deploy.
  - Allocation-vault ownership renounced after release.
  - Mainnet preflight uses actual process exit codes.
- **BASE SEPOLIA DEPLOYMENT STATUS:** NOT DEPLOYED
  - A live Base Sepolia deployment has NOT been executed (requires a funded
    testnet wallet + Base Sepolia RPC + BaseScan API key).
- **BASE SEPOLIA VERIFICATION STATUS:** NOT VERIFIED
  - No contract has been verified on BaseScan (no live deployment).
  - `verify-contracts.ts` is ready but has not run against a live manifest.
- **BASE SEPOLIA LIVE TEST STATUS:** NOT TESTED
  - No live testnet transactions have been performed.

## MAINNET STATUS
**NOT READY.** Blockers: independent audit, legal/compliance review, production
treasury multisig + beneficiaries, production vesting terms, production airdrop
allocation, and explicit human approval. Mainnet is double-gated and never
automatic.

## REMAINING BLOCKERS
1. Live Base Sepolia deployment (human + credentials).
2. Contract verification on BaseScan.
3. Live testnet E2E + indexer + admin SIWE validation.

## REQUIRES HUMAN ACTION
- Funded Base Sepolia deployer wallet + RPC + BaseScan API key.
- Production allocation recipient addresses / treasury multisig / vesting
  beneficiaries.
- Generate + publish a validated airdrop Merkle root to enable claims.
