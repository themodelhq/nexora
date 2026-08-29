# Nexora — Genesis Allocation Architecture

The NXR token has a **fixed** 1,000,000,000 supply minted at construction, so
every allocation recipient must be a legitimate, known destination **at the
moment the token deploys**. This document explains exactly how each address is
determined and why it receives its allocation.

## Allocation (unchanged from approved tokenomics)

| Bucket | Amount | Kind | Destination |
|---|---|---|---|
| Community & Ecosystem | 350,000,000 | external | Community airdrop/ecosystem multisig |
| Liquidity | 150,000,000 | external | DEX liquidity wallet |
| Treasury | 150,000,000 | external | Treasury multisig |
| Team | 100,000,000 | vault → Vesting | `NexoraAllocationVault` (CREATE2) → team `NexoraVesting` |
| Advisors & Strategic Partners | 50,000,000 | vault → Vesting | `NexoraAllocationVault` (CREATE2) → advisor `NexoraVesting` |
| Public Sale | 100,000,000 | vault → Presale | `NexoraAllocationVault` (CREATE2) → `NexoraPresale` |
| Development & Grants | 100,000,000 | external | Development/grants wallet |
| **Total** | **1,000,000,000** | | |

## How each address is generated

### External recipients (Community, Liquidity, Treasury, Development)
- **Production:** taken from environment variables
  (`COMMUNITY_ADDRESS`, `LIQUIDITY_ADDRESS`, `TREASURY_ADDRESS`,
  `DEVELOPMENT_ADDRESS`). Missing values cause a **hard failure** — never a
  silent deployer fallback.
- **Testnet/local:** dedicated, deterministic, non-deployer test addresses
  (see `deployment-config.ts`).

### Vault recipients (Team, Advisors, Public Sale)
The team/advisor/sale destinations must be the actual `NexoraVesting` and
`NexoraPresale` contracts, but those require the token address in their
constructor (circular dependency). We resolve this with **token-agnostic
`NexoraAllocationVault` escrows deployed via CREATE2 BEFORE the token**:

1. `NexoraFactory` (CREATE2) is deployed first.
2. For each vault, its deterministic address is computed:
   `address = keccak256(0xff, factory, salt, keccak256(initcode))[12:]`, where
   the initcode is the token-agnostic vault creation bytecode (constructor arg:
   temporary owner).
3. The token is deployed minting the team/advisor/sale allocations directly to
   these pre-computed vault addresses.
4. The deployment flow then deploys the real `NexoraVesting` (team + advisors)
   and `NexoraPresale`, and **automatically releases** each vault's full balance
   into its destination via `NexoraAllocationVault.releaseAll`.

Result: **no manual post-deployment movement** and **no deployer windfall**.
The vaults are drained to empty during the same deployment flow.

## Why each destination receives its allocation

- **Team → Vesting:** 100M NXR with 12-month cliff + 36-month linear vesting,
  released on-chain only per schedule.
- **Advisors → Vesting:** 50M NXR with an explicit advisor vesting schedule.
- **Treasury → multisig:** 150M NXR for long-term development and operations,
  held by the treasury multisig + timelock.
- **Public Sale → Presale:** 100M NXR reserved for the (disabled-by-default)
  presale; disabled until legal review.
- **Liquidity → wallet:** 150M NXR for NXR/USDC DEX liquidity provisioning.
- **Community → multisig:** 350M NXR for airdrops and ecosystem incentives.
- **Development → wallet:** 100M NXR for developer grants and open-source work.

## How tokens enter vesting / custody

- **Team & Advisor vesting:** token minted to vault → automatically released
  into `NexoraVesting` → beneficiaries claim per schedule. The vesting contract
  holds the tokens; no human moves them.
- **Treasury custody:** token minted directly to the treasury multisig address.
- **Public sale:** token minted to vault → automatically released into
  `NexoraPresale` (which is disabled until legal review).

## Validation

`scripts/deployment/validate-genesis-allocation.ts` verifies:
- sum == 1,000,000,000
- all recipients unique, non-zero
- deployer is never a recipient (production)
- the correct number of vault-based recipients
- team/advisor/treasury/sale/liquidity/community/development all configured

The token constructor independently enforces sum, uniqueness and non-zero
recipients (tested in `test/NexoraToken.test.ts` and
`test/GenesisAllocation.test.ts`).
