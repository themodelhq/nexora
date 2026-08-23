# Contributing to Nexora

Thanks for your interest. Nexora is being developed in phases; contributions
must respect the phase gates and the security/transparency principles.

## Development Workflow

1. Branch from `develop` (`feature/...`, `fix/...`).
2. Work within the phase scope (see root `README.md` phase table).
3. Do **not** move to a later phase while earlier critical tests fail.
4. Run checks before pushing:
   ```bash
   npm run typecheck
   npm run lint
   npm run test:contracts   # after Phase 3
   ```
5. Open a PR to `develop`.

## Security & Transparency Rules

- **Never commit secrets.** Only `.env.example` is allowed.
- **Never add hidden or privileged functionality.** No honeypot mechanisms, no
  hidden minting, no hidden taxes, no owner confiscation.
- Smart contracts must use OpenZeppelin audited primitives and the patterns in
  `docs/SECURITY.md`.
- Do not fabricate statistics, addresses, users, volume, or liquidity.
- Do not make claims about guaranteed returns or guaranteed listings.

## Code of Conduct

Be respectful and constructive. We build in the open for user safety and
trust.

## Reporting Issues

- Bugs/features → open an issue.
- Security issues → use the security disclosure process (see `SECURITY.md`),
  not a public issue.
