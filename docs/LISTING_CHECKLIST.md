# Nexora — Data / Listing Application Checklist

> **No listing is claimed or guaranteed.** This checklist prepares the metadata
> required for a human to apply to DEX screeners and data aggregators. Nothing
> here is a submission; nothing here is an approval.

## Required metadata

| Field | Value | Source |
|---|---|---|
| Name | Nexora | brand |
| Symbol | NXR | brand |
| Chain | Base | config |
| Contract address | `packages/contracts/deployments/base.json` → nxrToken | deployment manifest |
| Decimals | 18 | contract |
| Total supply | 1,000,000,000 (fixed) | contract |
| Website | https://nexora.io | brand |
| Documentation | https://docs.nexora.io | docs |
| Explorer | https://basescan.org | config |
| DEX / pair | NXR/USDC (once live) | on-chain |
| Logo | `apps/web/public/logo.png` | brand |
| Description | Whitepaper summary (no profit claims) | docs/WHITEPAPER.md |
| Social | Twitter/Discord/GitHub | brand |

## Application targets
- **DEX Screener** (public token data).
- **GeckoTerminal** (pools on Base).
- **CoinGecko** — requires live trading volume + holders; no fabricated data.
- **CoinMarketCap** — similar; requires real market data.

## Pre-submission gates
- [ ] Token live on Base mainnet with verified contract.
- [ ] Real liquidity (NXR/USDC) exists on a DEX.
- [ ] Real trading volume (not fabricated).
- [ ] Real holder count.
- [ ] Official explorer verification passes.
- [ ] Logo assets final.
- [ ] No guaranteed-profit claims in any submitted copy.

## Human-only steps
- Submit to each platform manually.
- Complete any KYC/listing forms they require.
- Respond to verification requests.

**Never submit until the token is genuinely live with real on-chain data.**
