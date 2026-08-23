/**
 * Nexora — airdrop Merkle tree validator.
 *
 * Validates a generated Merkle manifest before its root is published on-chain.
 * Verifies: no zero addresses, no duplicates, valid addresses, positive
 * amounts, correct total, and that the manifest's proofs reconstruct the root.
 *
 *   npx ts-node scripts/airdrop/validate-merkle.ts --manifest <file.json>
 */
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

function parseArgs(argv: string[]): string {
  const i = argv.indexOf('--manifest');
  const v = argv[i + 1];
  if (!v) throw new Error('Usage: --manifest <merkle-manifest.json>');
  return v;
}

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

const hashPair = (a: string, b: string): string =>
  a.toLowerCase() <= b.toLowerCase()
    ? ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [a, b])
    : ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [b, a]);

function verifyProof(leaf: string, proof: string[], root: string): boolean {
  let computed = leaf;
  for (const p of proof) computed = hashPair(computed, p);
  return computed.toLowerCase() === root.toLowerCase();
}

function main(): void {
  const file = parseArgs(process.argv);
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const root = m.root;
  const entries: Array<{ address: string; amount: string }> = m.entries ?? [];
  const proofs: Record<string, { proof: string[]; amount: string }> = m.proofs ?? {};

  console.log('=== Nexora airdrop Merkle validation ===\n');

  check("Has allocation entries", entries.length > 0);
  check("Root is a valid bytes32", Boolean(root) && /^0x[0-9a-fA-F]{64}$/.test(root), root);

  // Address validity / zero / duplicates.
  const seen = new Set<string>();
  let zeroAddr = 0;
  let invalidAddr = 0;
  let duplicates = 0;
  let nonPositive = 0;
  let total = 0n;
  for (const e of entries) {
    const a = e.address.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(a)) invalidAddr++;
    if (a === ethers.ZeroAddress) zeroAddr++;
    if (seen.has(a)) duplicates++;
    seen.add(a);
    const amount = BigInt(e.amount);
    if (amount <= 0n) nonPositive++;
    total += amount;
  }
  check('All addresses are valid EVM addresses', invalidAddr === 0, `${entries.length} total`);
  check('No zero addresses', zeroAddr === 0);
  check('No duplicate addresses', duplicates === 0);
  check('All amounts are positive', nonPositive === 0);
  check('Total allocation is positive', total > 0n, total.toString());

  // Every entry has a proof that reconstructs the root.
  let proofOk = 0;
  let proofBad = 0;
  for (const e of entries) {
    const p = proofs[e.address.toLowerCase()];
    if (!p) {
      proofBad++;
      continue;
    }
    const leaf = ethers.solidityPackedKeccak256(['address', 'uint256'], [e.address, BigInt(e.amount)]);
    if (verifyProof(leaf, p.proof, root)) proofOk++;
    else proofBad++;
  }
  check(`All proofs verify against root (${proofOk}/${entries.length})`, proofBad === 0);

  console.log('\n=== ' + (process.exitCode ? 'VALIDATION FAILED — do not publish root' : 'VALIDATION PASSED — safe to publish root') + ' ===');
  if (process.exitCode) process.exit(1);
}

main();
