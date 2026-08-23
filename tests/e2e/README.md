# Nexora — End-to-End Tests (Playwright)

## Setup

```bash
cd tests/e2e
npm install
npx playwright install chromium
```

## Run

Requires the web app running (testnet-first: Base Sepolia).

```bash
# Terminal 1 — run the web app
npm run dev:web

# Terminal 2 — run the tests
cd tests/e2e && npx playwright test
```

By default it targets `http://localhost:3000` (override with `E2E_BASE_URL`).

## What is covered

- Every public page renders and returns HTTP 200.
- SEO title present on the homepage.
- No fabricated contract addresses (`0x000...0`) are displayed.
- Transparency page shows "Coming soon" when no deployment is recorded.
- Mobile (390×844) layout renders correctly.
- Tokenomics percentages sum to the approved allocation.
- Dashboard prompts wallet connection when disconnected.
- Staking shows the data-unavailable state when no contract is deployed.

## Testnet validation (Phase 11)

Once a live Base Sepolia deployment exists, the E2E suite can be extended with
an on-chain user journey (connect wallet → check balance → claim airdrop →
stake → view treasury). That requires injected test wallets and a funded
deployer, so it is gated behind live-chain credentials. See
`docs/PRODUCTION_READINESS.md` for the testnet acceptance criteria.
