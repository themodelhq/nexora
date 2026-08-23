# Nexora — Treasury Architecture

> This document resolves the treasury ambiguity: the NXR token allocates
> 150,000,000 NXR to `TREASURY_ADDRESS`, and there is also a `NexoraTreasury`
> contract. The architecture below makes the responsibilities of each explicit
> and non-overlapping.

## Decision: Option A — the treasury multisig is the treasury

The canonical treasury is the **`TREASURY_ADDRESS` (a Safe/multisig)**. The
genesis allocation mints **150,000,000 NXR directly to that address**. This is
where the treasury funds live and are controlled.

`NexoraTreasury` is retained as an **optional, role-gated spending controller**
(an operational facade) that the treasury multisig *may* choose to use for
governed spending. It is **NOT** the treasury allocation destination and is
**NOT** required for the treasury to hold funds.

### Answers to the required questions

| # | Question | Answer |
|---|---|---|
| 1 | Where does the 150M NXR treasury allocation go? | Directly to `TREASURY_ADDRESS` (the treasury Safe/multisig) at genesis. |
| 2 | Who controls it? | The treasury Safe/multisig signers (threshold set externally). |
| 3 | What contract controls spending? | The Safe itself. `NexoraTreasury` is an optional facade; if used, its `OPERATOR_ROLE` is granted to the same multisig. |
| 4 | Is a Safe/multisig used? | Yes — required in production (`TREASURY_MULTISIG_ADDRESS`). |
| 5 | Signer threshold? | Externally configured on the Safe; not invented here. Verified before mainnet. |
| 6 | Can the deployer control the treasury? | No. `TREASURY_ADDRESS` is never the deployer (enforced by allocation validator). `NexoraTreasury.OPERATOR_ROLE` is not granted to the deployer. |
| 7 | Can one wallet drain the treasury? | No — a Safe requires the configured threshold of signers. `NexoraTreasury` spending is `OPERATOR_ROLE`-gated and pausable. |
| 8 | Is there a timelock? | Recommended in front of `NexoraTreasury` spending and for large spends; governance timelock is the highest-authority path. |
| 9 | Emergency controls? | `NexoraTreasury.PAUSER_ROLE` can pause spending (multisig/timelock, not a single EOA). |
| 10 | How does governance interact? | Governance (Governor + Timelock) can route treasury decisions; the Safe remains the controlling signer set. |

### Treasury address / controller / roles

- **Treasury address:** `TREASURY_ADDRESS` (from deployment config; test fallback in testnet).
- **Controller:** treasury Safe/multisig (`TREASURY_MULTISIG_ADDRESS`).
- **Multisig address:** `TREASURY_MULTISIG_ADDRESS` (required in production).
- **Ownership:** the Safe owns the treasury funds; `NexoraTreasury.DEFAULT_ADMIN_ROLE` goes to the timelock/governance, not the deployer.
- **Roles:** `OPERATOR_ROLE` (multisig) · `PAUSER_ROLE` (multisig/timelock) on `NexoraTreasury`.
- **Threshold:** configured externally on the Safe.

### Allowed operations
- Spend treasury assets via the Safe (threshold of signers).
- Optionally route governed spends through `NexoraTreasury` (operator = multisig).
- Emergency pause of `NexoraTreasury` spending.

### Prohibited operations
- A single EOA (including the deployer) must never move treasury funds.
- No hidden/mining authority on the treasury; no owner confiscation.

### Why Option A
- Matches the existing tokenomics: the token mints treasury NXR to
  `TREASURY_ADDRESS`.
- Most auditable: "the Safe is the treasury" — no two wallets with unclear roles.
- No human must move 150M after deployment; it lands in the correct destination.
