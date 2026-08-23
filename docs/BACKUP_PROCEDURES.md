# Nexora — Backup & Recovery Procedures

> Never back up private keys or seed phrases into the repository or any
> unencrypted artifact.

## What must be backed up

| Artifact | Where | Frequency | How |
|---|---|---|---|
| PostgreSQL database | `apps/api` (hosted) | Daily | `pg_dump` (see below) |
| Deployment manifests | `packages/contracts/deployments/*.json` | Every deploy | Commit to git (no secrets) |
| Contract registry | `packages/contracts/registry.json` | Every deploy | Commit to git |
| Configuration (non-secret) | `.env.example`, docs | On change | Git |
| Multisig configuration | Safe/treasury signer list | On change | External (hardware wallet) |
| Critical metadata | Whitepaper, tokenomics, vesting schedules | On change | Git + off-site copy |

## Database backup

```bash
# Logical dump (recommended for portability)
pg_dump "$DATABASE_URL" -F c -f nexora-$(date +%F).dump

# Restore
pg_restore -d "$DATABASE_URL" nexora-<date>.dump
```

For high availability, enable continuous WAL archiving or managed PITR
(e.g. RDS/Aurora point-in-time recovery).

## Key management (NOT backed up into the repo)

- Deployment/owner keys live on **hardware wallets** or an institutional
  custody service.
- Multisig (Safe) signers each hold their own key; no single copy exists.
- Recovery phrases are held by the owner offline, never in this repository.

## Recovery runbook

1. Restore the database from the latest dump.
2. Restore deployment manifests from git.
3. Verify contract addresses match `deployments/base.json`.
4. Verify the indexer resumes from its `indexed_blocks` checkpoint (or reset it
   to a safe block if the DB was restored from a stale point).
5. Run `/health`, `/ready`, and `/metrics` to confirm the system is operational.
6. Confirm the multisig/timelock roles are intact (see `ROLE_MATRIX.md`).

## Testing backups

Restore backups into a staging environment at least quarterly and verify data
integrity before relying on them.
