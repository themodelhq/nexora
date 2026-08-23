# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately — **do not** open a public
issue for a live or unverified vulnerability.

- Email / private contact to be published by the team, or
- Open a **private** security advisory via GitHub → Security → Report a vulnerability.

Please include:
- The affected component (contract, API, frontend, docs).
- A description and, where possible, a proof of concept.
- Impact and proposed mitigation.

## Scope

- All smart contracts in `packages/contracts/src`.
- The backend API in `apps/api`.
- The web/admin applications in `apps/web` and `apps/admin`.

## Disclosure

We aim to acknowledge reports within 72 hours and provide a timeline for a fix.

## Note

As of this writing the project has **not** completed an independent third-party
audit. See `docs/KNOWN_LIMITATIONS.md`. Deployment to mainnet should not occur
until the audit checklist in `docs/AUDIT_CHECKLIST.md` is satisfied.
