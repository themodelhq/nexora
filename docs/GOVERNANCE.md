# Nexora — Governance

`NexoraGovernor` (OpenZeppelin) with a `TimelockController` provides on-chain
governance.

## Components
- **Proposals** — created by addresses meeting the proposal threshold.
- **Voting** — For/Against/Abstain, weight from `NexoraVoteToken` (ERC20Votes).
- **Delegation** — token holders delegate voting power.
- **Quorum** — a fraction of total supply required for validity.
- **Timelock** — approved proposals must wait the timelock delay before
  execution; they can be cancelled. No single wallet can force execution.

## Vote token
Governance uses a separate `NexoraVoteToken` (NXVT) so voting power can be
distributed without minting the fixed NXR supply. NXVT carries no economic value.

## Critical actions
Treasury/governance critical operations flow through the timelock and are
expected to be further gated by a multisig. See `docs/TREASURY.md`.
