/**
 * Nexora — Merkle Airdrop tree generator.
 *
 * Reads a CSV/JSON of wallet allocations and produces:
 *   1. The Merkle root to publish on the on-chain airdrop contract.
 *   2. Per-wallet proofs for the claim UI.
 *   3. A JSON manifest for the frontend/backend.
 *
 * Leaves are `keccak256(abi.encodePacked(address, amount))`, matching the
 * NexoraAirdrop claim function. This generator is independent of the chain
 * so it can run anywhere, including in CI.
 *
 * Usage:
 *   npx ts-node scripts/airdrop/generate-merkle.ts \
 *     --input ./allocations.csv --out ./dist/airdrop-manifest.json
 *
 * CSV format (header row): address,amount
 *   amount is in base units (wei, i.e. NXR * 1e18) for the on-chain proof.
 */

import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import type { MerkleTreeResult } from '@nexora/types';

interface ParsedEntry {
  address: string;
  amount: bigint;
}

function parseArgs(argv: string[]): { input: string; out: string } {
  const get = (flag: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : '';
  };
  const input = get('--input');
  const out = get('--out');
  if (!input || !out) {
    throw new Error('Usage: --input <file.csv|json> --out <output.json>');
  }
  return { input, out };
}

function normalizeAddress(a: string): string {
  const clean = a.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(clean)) {
    throw new Error(`Invalid Ethereum address: "${a}"`);
  }
  return ethers.getAddress(clean); // checksum + validation
}

function parseCsv(text: string): ParsedEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !/^address/i.test(l));

  return lines.map((line) => {
    const parts = line.split(',').map((p) => p.trim());
    const address = normalizeAddress(parts[0] ?? '');
    const amount = BigInt(parts[1] ?? '0');
    if (amount <= 0n) throw new Error(`Non-positive amount for ${address}`);
    return { address, amount };
  });
}

/** Validate the parsed allocation set and return a report. Throws on hard errors. */
export function validateAllocations(entries: ParsedEntry[]): {
  ok: boolean;
  count: number;
  total: bigint;
  duplicates: string[];
  zeroAddresses: string[];
  warnings: string[];
} {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const zeroAddresses: string[] = [];
  const warnings: string[] = [];
  let total = 0n;

  for (const e of entries) {
    const key = e.address.toLowerCase();
    if (key === '0x0000000000000000000000000000000000000000') {
      zeroAddresses.push(e.address);
      throw new Error(`Zero address is not a valid allocation recipient: ${e.address}`);
    }
    if (seen.has(key)) duplicates.push(e.address);
    seen.add(key);
    total += e.amount;
  }

  return { ok: true, count: entries.length, total, duplicates, zeroAddresses, warnings };
}

function parseJson(text: string): ParsedEntry[] {
  const data = JSON.parse(text);
  const entries = Array.isArray(data) ? data : data.allocations;
  return (entries as Array<{ address: string; amount: string | number }>).map((e) => ({
    address: normalizeAddress(e.address),
    amount: BigInt(e.amount),
  }));
}

/**
 * Compute a Merkle tree over leaves = keccak256(address, amount).
 * Returns root + per-address proofs.
 */
export function buildMerkleTree(entries: ParsedEntry[]): MerkleTreeResult {
  if (entries.length === 0) throw new Error('No allocations provided');

  // Sort deterministically so the root is stable regardless of input order.
  const sorted = [...entries].sort((a, b) =>
    a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1,
  );

  const leafOf = (addr: string, amount: bigint) =>
    ethers.solidityPackedKeccak256(['address', 'uint256'], [addr, amount]);

  /**
   * Hash a pair of sibling hashes, sorting them first — this exactly matches
   * OpenZeppelin's `MerkleProof._hashPair` so proofs verify on-chain.
   */
  const hashPair = (a: string, b: string): string =>
    a.toLowerCase() <= b.toLowerCase()
      ? ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [a, b])
      : ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [b, a]);

  // Hash table: address -> { proof, amount } (unsorted index mapping)
  const indexByAddress = new Map<string, number>();
  const leaves: string[] = [];
  sorted.forEach((e, i) => {
    leaves.push(leafOf(e.address, e.amount));
    indexByAddress.set(e.address.toLowerCase(), i);
  });

  // Standard Merkle tree with zero-fill on odd nodes (matching
  // OpenZeppelin's MerkleProof expectations: unbalanced trees are padded
  // by duplicating the last node).
  let layer: string[] = leaves;
  const levels: string[][] = [layer];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left; // pad odd node with itself
      next.push(hashPair(left, right));
    }
    layer = next;
    levels.push(layer);
  }
  const root = layer[0]!;

  // Build proofs: for each leaf, collect sibling hashes up the tree.
  const proofs: MerkleTreeResult['proofs'] = {};
  for (const e of sorted) {
    const idx = indexByAddress.get(e.address.toLowerCase())!;
    let cursor = idx;
    const proof: string[] = [];
    for (let level = 0; level < levels.length - 1; level++) {
      const current = levels[level]!;
      const siblingIdx = cursor % 2 === 0 ? cursor + 1 : cursor - 1;
      const sibling = current[siblingIdx] ?? current[cursor]!; // pad
      proof.push(sibling);
      cursor = Math.floor(cursor / 2);
    }
    proofs[e.address.toLowerCase()] = { proof, amount: e.amount.toString() };
  }

  return {
    root,
    entries: sorted.map((e) => ({ address: e.address, amount: e.amount.toString() })),
    proofs,
  };
}

async function main() {
  const { input, out } = parseArgs(process.argv);
  const raw = fs.readFileSync(input, 'utf8');
  const isCsv = path.extname(input).toLowerCase() === '.csv';
  const parsed = isCsv ? parseCsv(raw) : parseJson(raw);

  // Validate before building the tree (hard-fail on duplicates/zero/negative).
  const report = validateAllocations(parsed);
  if (report.duplicates.length > 0) {
    throw new Error(`Duplicate recipients detected: ${report.duplicates.slice(0, 5).join(', ')}`);
  }
  if (report.zeroAddresses.length > 0) {
    throw new Error(`Zero-address recipients detected — aborting`);
  }

  const result = buildMerkleTree(parsed);

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const manifest = {
    ...result,
    generatedAt: new Date().toISOString(),
    validation: {
      ...report,
      total: report.total.toString(),
      ok: report.ok && report.duplicates.length === 0 && report.zeroAddresses.length === 0,
    },
  };
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2));

  // Also write a standalone airdrop-validation-report.json next to the output.
  const reportFile = path.join(path.dirname(path.resolve(out)), 'airdrop-validation-report.json');
  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        generatedAt: manifest.generatedAt,
        valid: manifest.validation.ok,
        count: report.count,
        totalAllocation: report.total.toString(),
        duplicates: report.duplicates,
        zeroAddresses: report.zeroAddresses,
        merkleRoot: result.root,
      },
      null,
      2,
    ),
  );

  console.log(`Allocations:   ${result.entries.length}`);
  console.log(`Merkle root:   ${result.root}`);
  console.log(`Total allocation: ${report.total.toString()}`);
  console.log(`Validation report: ${reportFile}`);
  console.log(`Proofs written: ${Object.keys(result.proofs).length}`);
  console.log(`Output:        ${out}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
