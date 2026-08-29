# Nexora (NXR) — Tokenomics

**Token:** Nexora · **Symbol:** NXR · **Decimals:** 18

**Maximum / fixed total supply: 1,000,000,000 NXR (1 billion).**

The supply is **fixed**. There is no unrestricted owner-controlled minting.
The smart contract enforces the maximum supply mathematically and the initial
supply equals the maximum supply. If future minting were ever technically
introduced (for upgradeability or ecosystem needs), it would be **disabled by
default** and governed by strict, decentralized controls with transparent
on-chain events.

## Initial Allocation

| Category | % | Amount (NXR) | Destination | Vesting |
|---|---|---|---|---|
| Community & Ecosystem | 35% | 350,000,000 | Community multi-sig / ecosystem wallet | — |
| Liquidity | 15% | 150,000,000 | DEX liquidity (NXR/USDC) & management | — |
| Treasury | 15% | 150,000,000 | Treasury multi-sig | — |
| Team | 10% | 100,000,000 | Team vesting contract | 12-mo cliff + 36-mo linear |
| Advisors & Strategic Partners | 5% | 50,000,000 | Advisor vesting contract | 6-mo cliff + 24-mo linear |
| Public Sale | 10% | 100,000,000 | Compliant public distribution | — |
| Development & Grants | 10% | 100,000,000 | Grants / dev multi-sig | subject to schedule |
| **Total** | **100%** | **1,000,000,000** | | |

> Percentages sum to 100% and amounts sum to the 1 billion maximum supply.
> This is enforced programmatically by
> `scripts/tokenomics/verify-allocations.ts`.

## Allocation Notes

- **Community & Ecosystem (35%)** funds airdrops, community rewards,
  ecosystem incentives, developer incentives, partnerships and growth
  programs. Distribution is transparent and on-chain.
- **Liquidity (15%)** provides initial DEX liquidity (target pair **NXR/USDC**)
  and ongoing liquidity management.
- **Treasury (15%)** supports long-term development, infrastructure,
  partnerships, operations and future ecosystem initiatives. Controlled by a
  **multisig + timelock** — never a single wallet.
- **Team (10%)** is subject to a **12-month cliff** followed by **36-month
  linear vesting** to align incentives with long-term value creation.
- **Advisors & Strategic Partners (5%)** vest transparently (6-month cliff,
  24-month linear).
- **Public Sale (10%)** is reserved for any legally compliant public or
  community token distribution, enabled only after legal/compliance review.
- **Development & Grants (10%)** funds open-source development, developer
  grants, integrations and ecosystem builders.

## Transparency

All allocation destinations, vesting schedules, the airdrop contract, treasury
addresses and the token contract are published publicly. Critical operations
are visible on-chain. NXR is a utility token for a digital ecosystem; it is
**not** a promise of profit, and its value is subject to market volatility.
