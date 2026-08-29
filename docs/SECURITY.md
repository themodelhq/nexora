# Nexora — Security

> **Important disclaimer:** This document describes the security design and
> the *planned* security process of Nexora. **It does not constitute, and must
> not be read as, a completed independent security audit.** As of this writing
> the system has NOT been independently audited. You must complete your own
> review and, for production, an independent third-party audit before
> deployment. See [`AUDIT_CHECKLIST.md`](AUDIT_CHECKLIST.md) and
> [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

## Core Security Principles

1. **Least privilege** — every privileged role has the minimum power required.
2. **No honeypot / no hidden controls** — the token has no hidden tax, no
   hidden restrictions, no blacklist, no owner confiscation, no stealth mint.
3. **Fixed supply** — no unrestricted minting; maximum supply is
   mathematically enforced.
4. **No single point of failure** — critical treasury actions require
   multisig + timelock, never one wallet.
5. **No secrets in code** — private keys and seed phrases are never stored in
   source, frontend, database, or plaintext env files.

## Smart Contract Security

- Built on **OpenZeppelin Contracts** (audited, battle-tested base).
- **ReentrancyGuard** on contracts that transfer tokens or native value, plus
  checks-effects-interactions ordering.
- **AccessControl** (role-based) for privileged operations; **Ownable2Step**
  for two-step ownership transfer where ownership is required.
- **SafeERC20** used everywhere the protocol moves ERC-20 tokens.
- **Pausable** on claim/sale contracts for emergency stops.
- **MerkleProof** validation for airdrop claims (prevents double claims and
  invalid/tampered proofs).
- No arbitrary balance modification; no transfer restrictions on the token.

## Backend / Web Security

- **SIWE (EIP-4361)** wallet-signature authentication — no passwords, and the
  backend never sees a private key.
- **JWT sessions** with a strong, rotated signing secret; secure session
  management.
- **Rate limiting** (rate-limit-flexible) on auth and sensitive endpoints.
- **helmet** security headers, strict CORS allowlist, input validation.
- **Audit logging** of all admin actions (append-only in the DB).
- CSRF protection where cookies are used.

## Operational Security

- **Private keys** are deployment-only and loaded from secure secret stores
  (hardware wallets / institutional custody preferred). Never in env files
  that are committed, never in CI logs.
- **Multisig** (e.g. Safe) for treasury and critical governance actions.
- **Timelock** so no privileged action is immediately executable by one wallet.
- **Deployments** to mainnet require explicit, human-controlled confirmation;
  mainnet is never automated.

## CI / Dependency Security

- `npm audit --audit-level=high` runs in CI.
- Secret scanning (gitleaks) runs on every push/PR.
- Static analysis (Slither) runs in CI when available.
- Solidity compiler pinned to a single stable version with deterministic builds.

## Reporting a Vulnerability

Until a dedicated security contact is published, please open a **private**
security advisory via the repository's security policy, or contact the team
through the official channels. Do **not** open public issues for
vulnerabilities in live systems.
