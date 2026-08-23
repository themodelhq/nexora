/**
 * Nexora — Merkle tree generator service (server-side).
 * Produces the root + per-address proofs, OpenZeppelin-compatible.
 */
import { ethers } from 'ethers';
import type { MerkleTreeResult } from '@nexora/types';

export interface Entry {
  address: string;
  amount: bigint;
}

function normalizeAddress(a: string): string {
  const clean = a.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(clean)) {
    throw new Error(`Invalid Ethereum address: ${a}`);
  }
  return ethers.getAddress(clean);
}

const hashPair = (a: string, b: string): string =>
  a.toLowerCase() <= b.toLowerCase()
    ? ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [a, b])
    : ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [b, a]);

export function buildMerkleTree(entries: Entry[]): MerkleTreeResult {
  if (entries.length === 0) throw new Error('No allocations provided');
  const sorted = [...entries].sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1));

  const leafOf = (addr: string, amount: bigint) =>
    ethers.solidityPackedKeccak256(['address', 'uint256'], [addr, amount]);

  const leaves = sorted.map((e) => leafOf(e.address, e.amount));
  const indexByAddress = new Map<string, number>();
  sorted.forEach((e, i) => indexByAddress.set(e.address.toLowerCase(), i));

  let layer = leaves;
  const levels: string[][] = [layer];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(hashPair(layer[i]!, layer[i + 1] ?? layer[i]!));
    }
    layer = next;
    levels.push(layer);
  }
  const root = layer[0]!;

  const proofs: MerkleTreeResult['proofs'] = {};
  for (const e of sorted) {
    let cursor = indexByAddress.get(e.address.toLowerCase())!;
    const proof: string[] = [];
    for (let level = 0; level < levels.length - 1; level++) {
      const current = levels[level]!;
      const sib = cursor % 2 === 0 ? cursor + 1 : cursor - 1;
      proof.push(current[sib] ?? current[cursor]!);
      cursor = Math.floor(cursor / 2);
    }
    proofs[e.address.toLowerCase()] = { proof, amount: e.amount.toString() };
  }

  return { root, entries: sorted.map((e) => ({ address: e.address, amount: e.amount.toString() })), proofs };
}

export function parseCsvAllocations(text: string): Entry[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !/^address/i.test(l))
    .map((line) => {
      const [addr, amt] = line.split(',').map((p) => p.trim());
      return { address: normalizeAddress(addr ?? ''), amount: BigInt(amt ?? '0') };
    })
    .filter((e) => e.amount > 0n);
}
