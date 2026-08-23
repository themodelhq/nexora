# Nexora — Role & Permissions Matrix

This matrix defines the least-privilege permissions model. No single role
should have unnecessary access. Critical production control is split across a
multisig and the timelock — never a single EOA.

## Roles (smart-contract AccessControl)

| Role | Contract | Can | Cannot | Production holder |
|---|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | all | Grant/revoke roles | (broad) | Timelock / multisig only |
| `PAUSER_ROLE` | airdrop, staking, treasury, presale | Pause / unpause | Move funds | Multisig / timelock |
| `RECOVERY_ROLE` | airdrop, vesting | Recover unclaimed/unreserved tokens | Touch reserved funds | Timelock |
| `MANAGER_ROLE` | vesting, presale | Create schedules, configure/enable sale | Change user entitlements | Multisig |
| `REWARD_GRANTOR_ROLE` | staking | Fund reward pool, enable/disable, recover surplus | Exceed funded rewards | Multisig / timelock |
| `OPERATOR_ROLE` | treasury | Spend treasury funds | Bypass timelock | Multisig (never deployer) |
| `MINTER_ROLE` | vote token | Mint/burn NXVT | — | VoteWrapper only (1:1 backed) |

## Off-chain roles (backend / admin)

| Role | Permissions |
|---|---|
| `superadmin` | All admin API; manage admin roles; grant/revoke admins |
| `admin` | Airdrop import, vesting views, treasury views, audit read |
| `viewer` | Read-only dashboard |
| `user` | Wallet auth, own dashboard data only |

Backend authorization is enforced server-side from the `admin_roles` DB table
and the authenticated SIWE session — never from frontend state.

## Entity → control mapping

| Entity | Controller |
|---|---|
| NXR token | No owner; fixed supply; no mint/confiscate |
| Treasury | Multisig (OPERATOR) + timelock |
| Governance | Governor + Timelock |
| Airdrop | Admin (root/deadline) + recovery (timelock) |
| Vesting | Manager (schedules) + recovery (timelock) |
| Staking | Reward-grantor (multisig) |
| Presale | Disabled by default; manager only after legal review |
| Deployer | Temporary; revoked after finalization |

## Allocation vaults (genesis)

| Vault | Owner (temporary) | Purpose | Final state |
|---|---|---|---|
| Team vault | deployer (controller) | Holds 100M team NXR pre-vesting | Released to team Vesting; empty |
| Advisor vault | deployer (controller) | Holds 50M advisor NXR | Released to advisor Vesting; empty |
| Public-sale vault | deployer (controller) | Holds 100M sale NXR | Released to Presale; empty |

Vaults are token-agnostic CREATE2 escrows; the owner releases the full balance
to the destination during deployment. After release they are empty and hold no
ongoing authority.

## Production rules

- **Deployer**: temporary, deployment-only. Revoked in `finalize-mainnet.ts`.
- **Treasury** must be a multisig — never the deployer or a single EOA.
- **NXVT `MINTER_ROLE`** is held ONLY by the VoteWrapper (deployer revoked).
- **No single EOA** holds `DEFAULT_ADMIN_ROLE` on any production contract.
- Role handoff: grant permanent roles (treasury multisig, governor, timelock),
  verify them, then revoke deployer roles and verify they are gone. See
  `scripts/verify-roles.ts`.
