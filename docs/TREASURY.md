# Nexora — Treasury

The treasury holds long-term development, infrastructure, partnership and
operational funds.

## Control
- Treasury funds are managed by `NexoraTreasury` with role-based spending.
- `OPERATOR_ROLE` is **not** granted to the deployer. In production the
  operator is expected to be a **multisig** (e.g. Safe) and spending flows
  through a **Timelock** — never a single private key.
- Spending emits `Spend` events (token, recipient, amount, category) for
  full transparency.

## Dashboard
The treasury dashboard shows:
- NXR holdings (on-chain).
- Stablecoin / native ETH holdings (on-chain).
- Treasury transactions & spending history (indexed).
- Allocation categories.

## Key management
- Private keys never in frontend, git, database, or plaintext env.
- Production signers use hardware wallets / institutional custody.
