# Nexora — Deployment

This document explains how to deploy Nexora locally, to the Base Sepolia
testnet, and (with explicit human confirmation) to Base mainnet.

> **Mainnet is never deployed automatically.** A human must explicitly run the
> mainnet deploy script with the confirmation flag, after completing the
> Production Safety Checklist in the root `README.md`.

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- PostgreSQL and Redis (for the API)
- For testnet/mainnet: a funded deployer wallet and a BaseScan API key

## 1. Local Development

```bash
cp .env.example .env.local    # fill in local values
npm install
npm run compile               # compile Solidity
npm run test:contracts        # run contract tests
npm run deploy:local          # start local node + deploy + record addresses
npm run dev:web               # web app on :3000
npm run dev:admin             # admin app on :3001
npm run dev:api               # API on :4000
```

Deployment addresses are written to
`packages/contracts/deployments/<network>.deployment.json`.

## 2. Base Sepolia Testnet (testnet-first)

```bash
# In your local `.env` (never committed):
#   RPC_URL=https://sepolia.base.org
#   DEPLOYER_PRIVATE_KEY=<your testnet deployer key>
#   BASESCAN_API_KEY=<your BaseScan API key>

npm run deploy:sepolia
```

This compiles, runs tests, deploys the full contract suite to Base Sepolia,
records addresses and verifies source on BaseScan.

You can also trigger the manual `deploy-sepolia` GitHub Actions workflow
(GitHub → Actions → Deploy → Run workflow) using CI secrets.

## 3. Base Mainnet (explicit, human-controlled)

```bash
# .env:
#   MAINNET_RPC_URL=https://mainnet.base.org
#   DEPLOYER_PRIVATE_KEY=<from a SECURE secret store — never a committed file>
#   BASESCAN_API_KEY=<your BaseScan API key>

APP_ENV=production npm run compile && npm run test:contracts
npx hardhat run packages/contracts/scripts/deploy-mainnet.ts --network base --yes-i-understand
```

The script **refuses** to run without the `--yes-i-understand` confirmation
flag and validates the network is Base mainnet (chain id 8453).

### Pre-mainnet checklist (must all be true)

- [ ] Smart contracts tested
- [ ] Security analysis completed
- [ ] Independent audit completed **or** explicitly marked as not completed
- [ ] Tokenomics reviewed
- [ ] Wallet permissions reviewed
- [ ] Multisig configured
- [ ] Vesting configured
- [ ] Airdrop verified
- [ ] Liquidity configuration verified
- [ ] Legal/compliance review completed
- [ ] Backup/recovery procedures completed

## Deployed Address Registry

After each deployment, addresses are recorded in
`packages/contracts/deployments/`. The `@nexora/config` package reads this
registry, and the frontend renders actual contract addresses. Until a contract
is deployed and recorded, the UI shows **"Coming soon" / "Data unavailable"**
rather than fabricated values.
