# Nexora — Technical Architecture

This document describes the overall architecture of the Nexora (NXR) ecosystem.
It is the reference for contributors and reviewers.

## 1. Goals

- **Real** blockchain infrastructure (no mocks, no fabricated data).
- **Modular** — new ecosystem products can be added without rewriting the token.
- **Transparent** — key operations are on-chain and publicly verifiable.
- **Secure** — least privilege, no hidden admin functionality, no honeypots.
- **Auditable** — straightforward, battle-tested components (OpenZeppelin).
- **Compliant-minded** — no guaranteed-profit claims; legal review required.

## 2. High-Level Components

```
                     ┌────────────────────────────┐
                     │  Users (wallets)           │
                     └─────────────┬──────────────┘
                                   │  wagmi / viem (signed txs)
      ┌────────────────────────────┼────────────────────────────┐
      │                            │                             │
      │   apps/web              apps/admin                   apps/api
      │   (public site +        (role-based,               (backend API,
      │    user dashboard)       secure ops)               auth, merkle, indexing)
      │                            │                             │
      └────────────────────────────┼─────────────────────────────┘
                                   │ RPC + wallet signatures
                    ┌──────────────▼──────────────┐
                    │   Base / EVM chain (BaseSepolia testnet first)
                    │   NexoraToken, Airdrop, Vesting, Staking,
                    │   Treasury(multisig), Governor, Timelock, Presale
                    └──────────────────────────────┘
                                   │ events
                    ┌──────────────▼──────────────┐
                    │  Indexer → PostgreSQL       │
                    │  Redis (cache/queues/rate)  │
                    └─────────────────────────────┘
```

### Responsibilities

| Component | Responsibility | Custodies keys? |
|-----------|----------------|-----------------|
| `apps/web` | Public site, token page, airdrop claim, staking, vesting dashboard, governance voting UI, connect wallet | No — builds unsigned txs |
| `apps/admin` | Airdrop CSV → Merkle root, vesting creation, treasury monitoring, security views, audit log | No |
| `apps/api` | Auth (SIWE), Merkle generation, indexing, analytics, notifications, admin functions, audit logging | No |
| `packages/contracts` | All on-chain logic | No |
| `packages/blockchain` | viem client helpers, ABIs, explorer links | No |

The **only** entity that ever holds a private key is the deployer's wallet
(during deployment) and the multisig signers (for privileged actions). Those
keys live in hardware wallets / institutional custody — never in source, the
database, the frontend, or plaintext env files.

## 3. Smart Contract Architecture

Separated into focused contracts (in `packages/contracts/src/`):

```
src/
├─ token/        NexoraToken.sol          — fixed-supply ERC-20
├─ airdrop/      NexoraAirdrop.sol        — Merkle-based claims
├─ vesting/      NexoraVesting.sol        — cliff + linear vesting
├─ staking/      NexoraStaking.sol        — configurable staking
├─ treasury/     NexoraTreasury.sol       — guarded treasury ops
├─ governance/   NexoraGovernor.sol       — OpenZeppelin Governor + Timelock
├─ presale/      NexoraPresale.sol        — compliant sale module (opt-in)
├─ interfaces/   shared interfaces
└─ libraries/    shared helpers
```

Design principles:

- **Core token is immutable / non-upgradeable** to minimize trust and attack
  surface. If future minting is needed it is disabled by default and
  decentralized + transparent.
- **Role-based access control** (`AccessControl`) for privileged ops, plus
  `Ownable2Step` for simple ownership where ownership is required.
- **ReentrancyGuard** on any contract transferring tokens or native value.
- **SafeERC20** everywhere tokens are moved by the protocol.
- **Pausable** on airdrop/presale for emergency stops.

## 4. Data Flows

### Airdrop claim
1. Admin generates Merkle tree from CSV (`scripts/airdrop/generate-merkle.ts`).
2. Root is published on `NexoraAirdrop`.
3. User connects wallet → backend returns their proof → frontend builds a
   `claim(amount, proof)` tx → user signs in wallet → contract verifies
   proof + non-claimed status → transfers NXR. Double claims impossible.

### Vesting
1. Admin creates on-chain schedule(s) via `NexoraVesting`.
2. Beneficiaries see their schedule on the public dashboard.
3. `claim()` transfers the currently vested, unclaimed amount.

### Staking
1. User approves + stakes NXR in `NexoraStaking`.
2. Rewards accrue per block; parameters are governance-set, never a promise
   of fixed returns. User claims rewards / unstakes.

### Governance
1. Stakers/token holders delegate voting power.
2. Proposals are created on `NexoraGovernor`.
3. Voting, then queued through `Timelock`, then executed by anyone.
   Critical treasury actions require the timelock (not a single wallet).

## 5. Trust Model

- **Users** trust the token contract not to be a honeypot: fixed supply, no
  hidden tax, no hidden restrictions, no owner confiscation.
- **Operators** (admin roles) can configure airdrop/vesting/staking params
  but **cannot** mint, confiscate, or modify user balances.
- **Treasury** is controlled by a multisig + timelock — never a single key.
- The **system** never assumes the deployer wallet is the permanent owner;
  ownership is transferred to governance/multisig post-launch.

## 6. Security Controls

- Reentrancy protection (ReentrancyGuard + checks-effects-interactions).
- Access control (roles, two-step ownership).
- Input validation (address checksums, bounds, deadline checks).
- Merkle proof validation (cryptographically verified on-chain).
- Emergency pause (Pausable) on claim/sale contracts.
- Timelocks for critical governance/treasury actions.
- SIWE wallet-signature authentication; no passwords for Web3 auth.
- Rate limiting, helmet headers, JWT session security on the API.
- Secret scanning + `npm audit` + Slither in CI.

See `docs/SECURITY.md`, `docs/THREAT_MODEL.md`, `docs/AUDIT_CHECKLIST.md`.

## 7. Network Strategy

- **Testnet-first:** everything targets **Base Sepolia** (chain id 84532).
- **Mainnet:** Base (8453) requires explicit human-controlled deploy.
- EVM-compatible architecture keeps the door open for Ethereum, BNB Chain,
  Polygon later without contract rewrites.

## 8. Deployment Pipeline

Local → Base Sepolia → (explicit, gated) → Base mainnet.

Each deploy: compile → test → verify config → deploy → record addresses →
verify source on explorer → write deployment artifact → update frontend config.
Mainnet is never automatic. See `docs/DEPLOYMENT.md`.
