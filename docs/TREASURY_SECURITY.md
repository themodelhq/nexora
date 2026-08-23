# Nexora — Treasury Security

## Treasury address & control model

The treasury holds 150,000,000 NXR (plus any stablecoins / ETH received). It is
**never** controlled by a single private key. The intended production control
is a **multisig (Safe)** with a **timelock** in front of spending.

- **Treasury contract:** `NexoraTreasury` (role-gated spending).
- **Operator:** the treasury multisig (not the deployer; deployer is never
  granted `OPERATOR_ROLE` in production).
- **Deployment config requirement:** `TREASURY_MULTISIG_ADDRESS` must be set and
  validated (not zero, not deployer, not a team/advisor beneficiary, and must
  contain contract code where a Safe is expected).

## Multisig implementation (Safe)

If Safe is used:
- Signers and threshold are configured **externally** (Safe UI / Safe contract),
  never invented here.
- The Safe is granted `OPERATOR_ROLE` on `NexoraTreasury`.
- **Threshold/signers must be verified externally before mainnet** — this
  repository does not claim a specific signer set.

## Ownership

- `DEFAULT_ADMIN_ROLE` on `NexoraTreasury` is expected to be held by the
  timelock / governance multisig, not the deployer, after finalization.
- Deployer temporary roles are revoked by the finalization script.

## Spending controls

- `OPERATOR_ROLE` (multisig) may call `spend()` / `spendNative()`.
- Spending emits `Spend(token, to, amount, category)` for transparency.
- `PAUSER_ROLE` can pause spending in an emergency.
- Critical large spends should additionally flow through the timelock.

## Emergency controls

- **Who can pause:** `PAUSER_ROLE` (multisig/timelock), never a single EOA.
- **What can be paused:** all treasury spending.
- **How to unpause:** the same pauser role, after review.
- Emergency controls are **not** arbitrary owner controls — they are role-based
  and, in production, gated by the multisig/timelock.

## Timelock relationship

- Critical treasury actions are expected to be routed through the governance
  timelock so no single wallet can move funds immediately.
- The Governor + Timelock are the highest-authority control path for protocol
  changes.

## Verification requirements (mainnet preflight)

- Address exists and is not zero.
- Address is not the deployer.
- Address is not a team or advisor beneficiary.
- Address contains contract code where a Safe/multisig is expected.
- Multisig threshold/signers verified externally before mainnet.
- No single EOA holds treasury operator authority.
