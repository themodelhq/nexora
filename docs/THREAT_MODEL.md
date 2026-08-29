# Nexora — Threat Model

> This threat model describes the trust boundaries, threat actors, assets and
> mitigations of the Nexora ecosystem. It is a design artifact, not a
> certification. See `KNOWN_LIMITATIONS.md` and `AUDIT_CHECKLIST.md`.

## 1. Assets

- **NXR tokens** (fixed supply 1B) held by users, treasury, vesting, airdrop, staking, presale, liquidity.
- **User wallets / balances** — must never be modifiable by any privileged party.
- **Voting power** and governance state.
- **Treasury funds** (NXR, stablecoins, ETH).
- **Contract ownership/roles**.
- **Backend user data** (wallet addresses, session tokens, allocations).
- **Private keys / seed phrases** (deployment keys, multisig signers) — must never be in code.

## 2. Trust boundaries

| Boundary | Trusted | Untrusted |
|---|---|---|
| Token contract | Token holders, OpenZeppelin base | Any external caller |
| Airdrop | Claimants with valid Merkle proofs; admin (root/deadline); recovery role | Malicious claimants |
| Vesting | Beneficiaries, manager, recovery | Malicious beneficiaries, external |
| Staking | Stakers, reward-rate role | Malicious stakers |
| Treasury | Operator (multisig/timelock), pauser | Single EOA, external |
| Governance | Voters, proposers, timelock | Sybil voters |
| Backend/API | Users with valid SIWE sessions, admins | Unauthenticated, attackers |

## 3. Threat actors

- **Compromised deployer/admin** — if a single key controls minting/confiscation. Mitigated: fixed supply (no mint), no owner confiscation, two-step ownership, multisig+timelock for treasury.
- **Malicious airdrop claimant** — double-claim, forged proofs, amount manipulation. Mitigated: MerkleProof verification + `hasClaimed` flag.
- **Reentrancy attacker** — re-enters during token transfers. Mitigated: `ReentrancyGuard` + checks-effects-interactions on all transfer functions.
- **Governance attacker** — flash-loan/Sybil voting, griefing. Mitigated: ERC20Votes time-snapshots, quorum, timelock delay, proposal threshold.
- **Frontend/backend attacker** — phish seed phrases, inject JS, CSRF, rate-limit abuse. Mitigated: SIWE (no passwords/keys), security headers, CSRF protection, rate limiting, input validation, audit logging.
- **Price/valuation manipulator** — fake price or liquidity display. Mitigated: no fabricated stats; price shown only after real liquidity.

## 4. Attack surface & mitigations summary

| Attack | Surface | Mitigation |
|---|---|---|
| Mint inflation | Token | No mint function; MAX_SUPPLY enforced at construction |
| Token confiscation | Token | No owner; balances only change via ERC-20 transfers |
| Hidden tax/honeypot | Token | No transfer fees/restrictions/blacklist |
| Airdrop double-claim | Airdrop | `hasClaimed` + MerkleProof |
| Invalid proof | Airdrop | On-chain `MerkleProof.verify` |
| Claim after deadline | Airdrop | Deadline check |
| Unclaimed-token theft | Airdrop | Recovery role + post-deadline only |
| Vesting claim by non-beneficiary | Vesting | `msg.sender == beneficiary` |
| Vesting start manipulation | Vesting | Immutable schedule fields; start not in past |
| Staking reward inflation | Staking | Reward-per-share accrual model; settled on stake/withdraw |
| Treasury single-key spend | Treasury | OPERATOR_ROLE not granted to deployer; expected multisig+timelock |
| Governance single-wallet execution | Governance | Timelock delay + voting + quorum |
| Reentrancy | All transfer functions | ReentrancyGuard + CEI |
| Seed-phrase phishing | Frontend | Never ask for seed phrases; SIWE only |
| Secret leakage | Repo/CI | `.gitignore`, gitleaks, `.env.example` only |

## 5. Residual risks

- Solidity/compiler bugs in third-party deps (mitigate via pinned, audited versions + dependency audit).
- Operational key compromise (mitigate via hardware wallets/institutional custody + multisig).
- Governance capture via concentrated voting (mitigate via quorum, delegation transparency).
- No independent audit completed yet (see `KNOWN_LIMITATIONS.md`).
