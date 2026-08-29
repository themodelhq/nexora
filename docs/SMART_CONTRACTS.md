# Nexora — Smart Contracts Reference

Location: `packages/contracts/src/`. Solidity `^0.8.24`, EVM target `cancun`,
OpenZeppelin Contracts 5.x. Built with Hardhat.

## Contracts

### NexoraToken (`token/NexoraToken.sol`)
- ERC-20 + ERC-20Permit.
- Fixed `MAX_SUPPLY = 1,000,000,000 * 10**18`. **No mint function.**
- Constructor takes an allocation list; sum must equal `MAX_SUPPLY`.
- Immutable, non-upgradeable. No owner, no hidden controls.
- Verified by `test/NexoraToken.test.ts`.

### NexoraAirdrop (`airdrop/NexoraAirdrop.sol`)
- Merkle-tree claims (leaf = `keccak256(abi.encodePacked(address, amount))`).
- Roles: `PAUSER_ROLE`, `RECOVERY_ROLE`, `DEFAULT_ADMIN_ROLE`.
- Features: deadline, single claim, pause, post-deadline unclaimed recovery.
- Verified by `test/NexoraAirdrop.test.ts`.

### NexoraVesting (`vesting/NexoraVesting.sol`)
- Beneficiary schedules with cliff + linear release.
- Roles: `MANAGER_ROLE` (create/revoke), `RECOVERY_ROLE` (sweep).
- Revocable schedules freeze vested amount; unvested swept to recovery.
- Verified by `test/NexoraVesting.test.ts`.

### NexoraStaking (`staking/NexoraStaking.sol`)
- Reward-per-share accrual (stake × rate × time / 1e18).
- Roles: `REWARD_RATE_ROLE`, `PAUSER_ROLE`, `EMERGENCY_ROLE`.
- Stake/withdraw/claim; principal never at risk.
- Verified by `test/NexoraStaking.test.ts`.

### NexoraTreasury (`treasury/NexoraTreasury.sol`)
- ERC-20 + native spending; ERC-20/native balance views; pause.
- `OPERATOR_ROLE` is NOT granted to the deployer — production operator is a
  multisig/timelock. Verified by `test/NexoraTreasury.test.ts`.

### NexoraGovernor (`governance/NexoraGovernor.sol`)
- OpenZeppelin Governor (Settings + CountingSimple + Votes + QuorumFraction +
  TimelockControl). Requires a `NexoraVoteToken` and a `TimelockController`.
- Verified by `test/NexoraGovernor.test.ts` (propose → vote → queue → execute).

### NexoraVoteToken (`governance/NexoraVoteToken.sol`)
- ERC-20 + Permit + Votes (ERC6372), role-minted. Separate from NXR.

### NexoraPresale (`presale/NexoraPresale.sol`)
- Configurable sale (window, rate, min/max, per-wallet cap, TGE unlock bps,
  claim/refund toggles). **Disabled by default; legal review required.**
- Verified by `test/NexoraPresale.test.ts`.

## Deployment order

`TimelockController` → `NexoraVoteToken` → `NexoraGovernor` → `NexoraToken` →
`NexoraVesting` → `NexoraStaking` → `NexoraTreasury` → `NexoraAirdrop` →
`NexoraPresale` (see `scripts/deploy-all.ts`).

## ABIs

Generated at compile time into `packages/contracts/artifacts` and
`typechain-types`. The `@nexora/blockchain` package uses minimal hand-written
ABIs for read helpers.
