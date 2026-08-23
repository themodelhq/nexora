# Nexora — Airdrop

## Overview
The community allocation is distributed through `NexoraAirdrop`, a
Merkle-tree based claim contract. Eligibility is proven cryptographically on-chain.

## Claim flow
1. Admin generates allocations CSV → Merkle root
   (`npx ts-node scripts/airdrop/generate-merkle.ts --input allocations.csv --out manifest.json`).
2. Admin publishes the root + deadline on `NexoraAirdrop` and funds the contract.
3. User connects wallet → frontend fetches their proof → submits `claim(amount, proof)`.
4. Contract verifies the proof, deadline, and that the address hasn't claimed, then transfers NXR.

## Safety
- Double claims impossible (`hasClaimed` + proof).
- Invalid/tampered proofs rejected (`MerkleProof.verify`).
- Claim deadline enforced.
- Unclaimed tokens recoverable only after deadline by the `RECOVERY_ROLE` (governance-controlled).

## Admin
Use the admin dashboard (Airdrop section) or `POST /api/airdrop/generate` to
produce roots. Import allocations via `POST /api/admin/airdrop/import`.
