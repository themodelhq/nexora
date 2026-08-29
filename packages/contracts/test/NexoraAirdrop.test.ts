import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { ZeroAddress } from 'ethers';
import type { NexoraToken, NexoraAirdrop } from '../typechain-types';

// Replicate the Merkle generator (OpenZeppelin-compatible) for tests.
function keccakPair(a: string, b: string): string {
  const [lo, hi] = [a.toLowerCase(), b.toLowerCase()].sort();
  return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [lo, hi]);
}

function buildTree(entries: Array<{ address: string; amount: bigint }>) {
  const sorted = [...entries].sort((x, y) => (x.address.toLowerCase() < y.address.toLowerCase() ? -1 : 1));
  const leafOf = (addr: string, amt: bigint) =>
    ethers.solidityPackedKeccak256(['address', 'uint256'], [addr, amt]);
  const leaves = sorted.map((e) => leafOf(e.address, e.amount));
  const idx = new Map<string, number>();
  sorted.forEach((e, i) => idx.set(e.address.toLowerCase(), i));

  let layer = leaves;
  const levels: string[][] = [layer];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(keccakPair(layer[i]!, layer[i + 1] ?? layer[i]!));
    }
    layer = next;
    levels.push(layer);
  }
  const root = levels[levels.length - 1]![0]!;

  const proofs: Record<string, string[]> = {};
  for (const e of sorted) {
    let cursor = idx.get(e.address.toLowerCase())!;
    const proof: string[] = [];
    for (let l = 0; l < levels.length - 1; l++) {
      const level = levels[l]!;
      const sib = cursor % 2 === 0 ? cursor + 1 : cursor - 1;
      proof.push(level[sib] ?? level[cursor]!);
      cursor = Math.floor(cursor / 2);
    }
    proofs[e.address.toLowerCase()] = proof;
  }
  return { root, sorted, proofs };
}

describe('NexoraAirdrop', () => {
  async function deployFixture() {
    const [deployer, alice, bob, carol, recovery, admin, stranger] = await ethers.getSigners();

    // Token with a community allocation we can fund the airdrop with.
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([
      { recipient: deployer.address, amount: ethers.parseEther('1000000000') },
    ])) as NexoraToken;
    await token.waitForDeployment();

    // Allocations
    const entries = [
      { address: alice.address, amount: ethers.parseEther('25000') },
      { address: bob.address, amount: ethers.parseEther('10000') },
      { address: carol.address, amount: ethers.parseEther('5000') },
    ];
    const { root, proofs } = buildTree(entries);

    const deadline = BigInt(await time.latest()) + BigInt(30 * 24 * 3600);
    const airdropFactory = await ethers.getContractFactory('NexoraAirdrop');
    const airdrop = (await airdropFactory.deploy(
      await token.getAddress(),
      root,
      deadline,
      admin.address,
    )) as NexoraAirdrop;
    await airdrop.waitForDeployment();

    // Fund airdrop with enough NXR for all allocations.
    const totalNeeded = entries.reduce((a, e) => a + e.amount, 0n);
    await token.transfer(await airdrop.getAddress(), totalNeeded);

    return { token, airdrop, deployer, alice, bob, carol, recovery, admin, stranger, entries, proofs, deadline };
  }

  describe('Deployment', () => {
    it('sets token, root, deadline and roles', async () => {
      const { token, airdrop, admin, deadline } = await loadFixture(deployFixture);
      expect(await airdrop.token()).to.equal(await token.getAddress());
      expect(await airdrop.merkleRoot()).to.not.equal(ZeroAddress);
      expect(await airdrop.claimDeadline()).to.equal(deadline);
      expect(await airdrop.hasRole(await airdrop.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
    });

    it('reverts with zero token', async () => {
      const [d, a] = await ethers.getSigners();
      const f = await ethers.getContractFactory('NexoraAirdrop');
      const root = ethers.keccak256('0x00');
      await expect(f.deploy(ZeroAddress, root, (await time.latest()) + 1000, a.address)).to.be.revertedWith(
        'NexoraAirdrop: zero token',
      );
    });
  });

  describe('Claiming', () => {
    it('allows a valid claim and transfers NXR', async () => {
      const { airdrop, token, alice, entries, proofs } = await loadFixture(deployFixture);
      const before = await token.balanceOf(alice.address);
      await airdrop.connect(alice).claim(entries[0]!.amount, proofs[alice.address.toLowerCase()]!);
      const after = await token.balanceOf(alice.address);
      expect(after - before).to.equal(entries[0]!.amount);
      expect(await airdrop.hasClaimed(alice.address)).to.be.true;
      expect(await airdrop.totalClaimed()).to.equal(1n);
    });

    it('prevents double claiming', async () => {
      const { airdrop, alice, entries, proofs } = await loadFixture(deployFixture);
      const p = proofs[alice.address.toLowerCase()]!;
      await airdrop.connect(alice).claim(entries[0]!.amount, p);
      await expect(airdrop.connect(alice).claim(entries[0]!.amount, p)).to.be.revertedWith(
        'NexoraAirdrop: already claimed',
      );
    });

    it('rejects an invalid proof', async () => {
      const { airdrop, alice, entries } = await loadFixture(deployFixture);
      // Wrong proof (empty) → invalid.
      await expect(airdrop.connect(alice).claim(entries[0]!.amount, [])).to.be.revertedWith(
        'NexoraAirdrop: invalid proof',
      );
    });

    it('rejects a tampered amount (proof mismatch)', async () => {
      const { airdrop, alice, entries, proofs } = await loadFixture(deployFixture);
      const p = proofs[alice.address.toLowerCase()]!;
      // Claim a different amount than the leaf encodes.
      await expect(airdrop.connect(alice).claim(entries[0]!.amount + 1n, p)).to.be.revertedWith(
        'NexoraAirdrop: invalid proof',
      );
    });

    it('rejects a claim by a non-eligible address', async () => {
      const { airdrop, stranger, entries, proofs } = await loadFixture(deployFixture);
      // A valid proof for Alice, but invoked by an address not in the tree.
      const anyProof = Object.values(proofs)[0]!;
      await expect(airdrop.connect(stranger).claim(entries[0]!.amount, anyProof)).to.be.revertedWith(
        'NexoraAirdrop: invalid proof',
      );
    });

    it('rejects zero-amount claim', async () => {
      const { airdrop, alice, proofs } = await loadFixture(deployFixture);
      const p = proofs[alice.address.toLowerCase()]!;
      await expect(airdrop.connect(alice).claim(0, p)).to.be.revertedWith('NexoraAirdrop: zero amount');
    });

    it('rejects claims after the deadline', async () => {
      const { airdrop, alice, entries, proofs } = await loadFixture(deployFixture);
      const deadline = await airdrop.claimDeadline();
      await time.increaseTo(deadline + 1n);
      const p = proofs[alice.address.toLowerCase()]!;
      await expect(airdrop.connect(alice).claim(entries[0]!.amount, p)).to.be.revertedWith(
        'NexoraAirdrop: deadline passed',
      );
    });

    it('reverts claim when paused', async () => {
      const { airdrop, admin, alice, entries, proofs } = await loadFixture(deployFixture);
      await airdrop.connect(admin).pause();
      const p = proofs[alice.address.toLowerCase()]!;
      await expect(airdrop.connect(alice).claim(entries[0]!.amount, p)).to.be.revertedWithCustomError(
        airdrop,
        'EnforcedPause',
      );
    });
  });

  describe('Admin & recovery', () => {
    it('only admin can pause/unpause', async () => {
      const { airdrop, alice } = await loadFixture(deployFixture);
      await expect(airdrop.connect(alice).pause()).to.be.revertedWithCustomError(airdrop, 'AccessControlUnauthorizedAccount');
    });

    it('recovers unclaimed tokens only after deadline and by recovery role', async () => {
      const { airdrop, token, admin, alice, recovery, entries, proofs } = await loadFixture(deployFixture);
      // Alice claims hers; bob/carol do not.
      const p = proofs[alice.address.toLowerCase()]!;
      await airdrop.connect(alice).claim(entries[0]!.amount, p);

      const remainingBefore = await token.balanceOf(await airdrop.getAddress());
      await time.increaseTo((await airdrop.claimDeadline()) + 1n);

      // Non-role cannot recover.
      await expect(airdrop.connect(alice).recoverUnclaimed(recovery.address)).to.be.revertedWithCustomError(
        airdrop,
        'AccessControlUnauthorizedAccount',
      );

      // Admin holds RECOVERY_ROLE.
      await airdrop.connect(admin).recoverUnclaimed(recovery.address);
      expect(await token.balanceOf(recovery.address)).to.equal(remainingBefore);
    });

    it('cannot recover before deadline', async () => {
      const { airdrop, admin, recovery } = await loadFixture(deployFixture);
      await expect(airdrop.connect(admin).recoverUnclaimed(recovery.address)).to.be.revertedWith(
        'NexoraAirdrop: deadline not passed',
      );
    });
  });
});
