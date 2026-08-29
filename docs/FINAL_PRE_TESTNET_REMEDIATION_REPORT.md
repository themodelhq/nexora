# Nexora — Final Pre-Testnet Remediation Report

## 1. Issues identified
1. NexoraTreasury deployer role handoff incomplete (deployer kept DEFAULT_ADMIN/PAUSER).
2. NexoraStaking deployer role handoff incomplete (deployer kept DEFAULT_ADMIN/REWARD_GRANTOR/PAUSER).
3. Treasury multisig/operator relationship not enforced.
4. Treasury address vs treasury multisig could be inconsistent.
5. Mainnet preflight used text-matching (`grep "failing"`) to detect test success.
6. Contract verification documented more strongly than implemented (helper existed but never called).
7. Final readiness docs ahead of actual role-handoff state.
8. Deployment validation did not verify all role transitions.

## 2. Issues fixed
All 8. Plus two directly-related bugs exposed while fixing them:
- **DEFAULT_ADMIN_ROLE hash bug**: OpenZeppelin's `DEFAULT_ADMIN_ROLE` is
  `bytes32(0)`, not `keccak256("DEFAULT_ADMIN_ROLE")`. Fixed in `roles.ts`.
- **Role revocation ordering bug**: revoked deployer `DEFAULT_ADMIN` before
  `PAUSER`, leaving no admin to revoke `PAUSER`. Fixed to revoke non-admin roles
  first, `DEFAULT_ADMIN` last.

## 3. Files changed
- `packages/contracts/scripts/roles.ts` (new) — shared role-handoff + verification.
- `packages/contracts/scripts/deploy-all.ts` — treasury/staking handoff, role
  table verification, manifest final role state, treasury multisig relationship.
- `packages/contracts/scripts/verify-roles.ts` — authoritative exit-code table.
- `packages/contracts/scripts/validate-deployment.ts` — role-transition checks.
- `packages/contracts/scripts/mainnet-preflight.ts` — process-exit-code test gates.
- `packages/contracts/scripts/verify-contracts.ts` (new) — manifest-based verification.
- `packages/contracts/hardhat.config.ts` — removed duplicate hardhat-verify import.
- `packages/contracts/test/NexoraTreasury.test.ts`, `NexoraStaking.test.ts` — role handoff tests.
- `docs/FINAL_PRE_TESTNET_READINESS.md` — explicit code/deploy/verify/live statuses.

## 4. Treasury architecture
Option A: the treasury Safe/multisig (`TREASURY_ADDRESS` === `TREASURY_MULTISIG_ADDRESS`) is the treasury; 150M lands there; `NexoraTreasury` is an optional facade controlled by that multisig.

## 5. Staking role architecture
`DEFAULT_ADMIN_ROLE` -> governance timelock; `REWARD_GRANTOR_ROLE` -> treasury multisig; `PAUSER_ROLE` -> emergency authority.

## 6. Final role map
| Contract | Role | Expected holder | Deployer holds? |
|---|---|---|---|
| NexoraTreasury | DEFAULT_ADMIN_ROLE | Timelock | No |
| NexoraTreasury | OPERATOR_ROLE | Treasury Multisig | No |
| NexoraTreasury | PAUSER_ROLE | Emergency Authority | No |
| NexoraStaking | DEFAULT_ADMIN_ROLE | Timelock | No |
| NexoraStaking | REWARD_GRANTOR_ROLE | Treasury Multisig | No |
| NexoraStaking | PAUSER_ROLE | Emergency Authority | No |
| NexoraVoteToken | MINTER_ROLE | VoteWrapper | No |
| NexoraVoteToken | DEFAULT_ADMIN_ROLE | Timelock | No |

## 7. Deployment improvements
- Idempotent (reuses existing manifest; `FORCE_REDEPLOY=true` to override).
- Role handoff performed + verified before writing the manifest (aborts on failure).

## 8. Verification improvements
- `verify-contracts.ts` reads the manifest and verifies each contract, failing on
  failure (no fabricated verification).
- `verify-roles.ts` and `validate-deployment.ts` return exit 1 on any FAIL.

## 9–11. Tests
- Executed: Hardhat + Foundry. Passed: **127 Hardhat** + **32 Foundry**. Failed: 0.

## 12. Local deployment status
**DEPLOYED** (local Hardhat node) — full ecosystem deployed; role table all PASS;
manifest written with final role state.

## 13. Base Sepolia deployment status
**NOT DEPLOYED** — REQUIRES CREDENTIALS (funded testnet wallet + Base Sepolia RPC + BaseScan API key).

## 14. Base Sepolia verification status
**NOT VERIFIED** — no live deployment to verify.

## 15. Live transaction status
**NOT TESTED** — no live testnet transactions performed.

## 16. Remaining limitations
- No independent security audit. No legal/compliance review.
- No live Base Sepolia deployment / verification / live testing.

## 17. Human actions required
- Provide Base Sepolia credentials (wallet, RPC, BaseScan key).
- Configure production treasury multisig + beneficiaries + vesting.
- Generate + publish a validated airdrop Merkle root to enable claims.

## 18. Mainnet blockers
Independent audit; legal review; production multisig/beneficiaries/vesting;
live testnet validation; explicit human approval. Mainnet double-gated, never
automatic.
