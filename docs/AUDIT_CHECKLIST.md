# Nexora — Audit & Pre-Deployment Checklist

Use this checklist to track security review and deployment readiness. **None of
these items should be assumed complete until actually verified by a competent
reviewer.**

## 1. Smart Contract Audit

- [ ] Every contract reviewed for:
  - [ ] Reentrancy (external calls after state changes)
  - [ ] Access control correctness (each privileged fn has correct role)
  - [ ] Integer overflow / underflow (Solidity 0.8 default checks; watch explicit arithmetic)
  - [ ] Input validation (bounds, deadlines, addresses)
  - [ ] Front-running / MEV exposure (esp. airdrop deadline, presale)
  - [ ] Denial of service (e.g. huge arrays, griefing)
  - [ ] Oracle/price assumptions (none used; avoid unverified prices)
- [ ] Static analysis run: **Slither** and **solhint**
- [ ] Foundry/Hardhat fuzz + invariant tests for critical contracts
- [ ] Dependency audit (`npm audit --audit-level=high`)
- [ ] Compiler pinned to a single stable version; deterministic build
- [ ] **Independent third-party audit** completed OR explicitly marked not completed

## 2. Token / Tokenomics

- [ ] Fixed supply confirmed (no mint function)
- [ ] Allocation recipients verified (real multisigs / vesting contracts)
- [ ] No hidden tax, restriction, blacklist, or confiscation paths
- [ ] `verify-allocations.ts` passes (sums to 100% / 1B)

## 3. Wallet & Key Management

- [ ] Deployer key loaded from secure secret store, never committed
- [ ] Treasury/multisig signers on hardware wallets / institutional custody
- [ ] No private keys in frontend, database, or env files
- [ ] Two-step ownership transfer where ownership exists

## 4. Governance / Treasury

- [ ] Multisig configured and signers verified
- [ ] Timelock delay set; critical actions timelock-gated
- [ ] Governor proposer/executor/canceller roles correct
- [ ] Quorum and voting periods reasonable

## 5. Airdrop

- [ ] Merkle root generated off-chain; proofs verified against contract on testnet
- [ ] Claim deadline set
- [ ] Funding amount matches total allocations
- [ ] Recovery role is governance-controlled

## 6. Vesting / Staking

- [ ] Vesting schedules correct (cliff, duration, revocability)
- [ ] Staking reward rate reviewed; governance-controlled
- [ ] Staking cannot drain principal

## 7. Liquidity

- [ ] Initial liquidity (NXR/USDC) funded on the DEX
- [ ] Liquidity address distinguished from treasury/team/vesting
- [ ] No fabricated price/volume display before real liquidity

## 8. Backend / Frontend Security

- [ ] SIWE authentication; no passwords/seed phrases
- [ ] JWT secret rotated and strong; secure sessions
- [ ] Rate limiting enabled
- [ ] Security headers (helmet, CSP) present
- [ ] Input validation; CSRF protection where cookies used
- [ ] Audit logging of admin actions

## 9. Legal / Compliance

- [ ] Legal review of token sale / presale (presale is OFF by default)
- [ ] No guaranteed-profit or guaranteed-listing claims
- [ ] Risk disclosures present (whitepaper, site)
- [ ] Tax / securities advice obtained

## 10. Operations

- [ ] Backup / recovery procedures for keys & database
- [ ] Monitoring + alerting for critical events
- [ ] Incident response plan
- [ ] Explorer verification of all contracts
