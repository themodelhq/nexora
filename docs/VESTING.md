# Nexora — Vesting

`NexoraVesting` enforces transparent, on-chain vesting for team, advisors,
partners, investors and grants.

## Schedule parameters
- **Beneficiary** — the address that can claim.
- **Total amount** — the full allocation (NXR base units).
- **Start time** — vesting begins.
- **Cliff** — no tokens unlock before `start + cliff`.
- **Duration** — total vesting period (includes cliff); linear release after cliff.
- **Revocable** — whether a manager can revoke the schedule.

## Beneficiary dashboard
Shows: total allocation, claimed amount, remaining amount, next unlock,
vesting percentage and schedule. Claims are executed on-chain by the
beneficiary.

## Revocation
Revocable schedules freeze the amount already vested (still claimable by the
beneficiary); the unvested remainder is swept by the `RECOVERY_ROLE` to the
treasury/governance address.
