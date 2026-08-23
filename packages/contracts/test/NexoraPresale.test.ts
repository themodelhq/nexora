import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import type { NexoraToken, NexoraPresale } from '../typechain-types';

async function buildConfig(start: bigint, end: bigint, overrides: Record<string, unknown> = {}) {
  return {
    startTime: start,
    endTime: end,
    refundEndTime: end,
    rate: ethers.parseEther('1000'), // 1000 NXR per ETH
    minPurchase: ethers.parseEther('0.01'),
    maxPurchase: ethers.parseEther('10'),
    perWalletCap: ethers.parseEther('5'),
    globalCap: ethers.parseEther('100'),
    tgeUnlockBps: 2000, // 20% at TGE
    vestingStartTime: start,
    vestingCliff: 1000, // seconds — isolates the TGE portion from vesting in tests
    vestingDuration: 2000, // seconds
    refundEnabled: true,
    claimEnabled: true,
    ...overrides,
  };
}

describe('NexoraPresale', () => {
  async function deployFixture() {
    const [deployer, admin, alice, bob] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([
      { recipient: deployer.address, amount: ethers.parseEther('1000000000') },
    ])) as NexoraToken;
    await token.waitForDeployment();

    const presaleFactory = await ethers.getContractFactory('NexoraPresale');
    // acceptedToken = ZeroAddress → native ETH.
    const presale = (await presaleFactory.deploy(await token.getAddress(), ethers.ZeroAddress, admin.address)) as NexoraPresale;
    await presale.waitForDeployment();

    const now = BigInt(await time.latest());
    const start = now + 10n;
    const end = now + 10000n;
    const cfg = await buildConfig(start, end);
    await presale.connect(admin).configureSale(cfg);
    // Fund the presale with NXR to sell.
    await token.transfer(await presale.getAddress(), ethers.parseEther('1000000'));

    return { token, presale, admin, alice, bob, start, end, cfg };
  }

  async function enterSale(p: NexoraPresale) {
    const cfg = await p.saleConfig();
    await time.increaseTo(cfg.startTime + 1n);
  }

  describe('Default state & enablement', () => {
    it('is DISABLED by default and rejects purchases', async () => {
      const { presale, alice } = await loadFixture(deployFixture);
      expect(await presale.enabled()).to.be.false;
      await enterSale(presale);
      await expect(presale.connect(alice).purchaseNative({ value: ethers.parseEther('1') })).to.be.revertedWith(
        'NexoraPresale: disabled',
      );
    });

    it('only manager can enable', async () => {
      const { presale, alice, admin } = await loadFixture(deployFixture);
      await expect(presale.connect(alice).enable()).to.be.revertedWithCustomError(
        presale,
        'AccessControlUnauthorizedAccount',
      );
      await presale.connect(admin).enable();
      expect(await presale.enabled()).to.be.true;
    });
  });

  describe('Purchase (native, explicit value)', () => {
    async function enabledFixture(overrides: Record<string, unknown> = {}) {
      const f = await loadFixture(deployFixture);
      if (Object.keys(overrides).length) {
        const now = BigInt(await time.latest());
        await f.presale.connect(f.admin).configureSale(
          await buildConfig(now + 10n, now + 10000n, overrides),
        );
      }
      await f.presale.connect(f.admin).enable();
      return f;
    }

    it('accepts a purchase with explicit msg.value and records entitlement', async () => {
      const { presale, token, alice } = await enabledFixture();
      await enterSale(presale);
      await presale.connect(alice).purchaseNative({ value: ethers.parseEther('1') });
      const rec = await presale.purchases(alice.address);
      expect(rec.contributed).to.equal(ethers.parseEther('1'));
      expect(rec.totalTokens).to.equal(ethers.parseEther('1000'));
      expect(await presale.totalContributions()).to.equal(ethers.parseEther('1'));
      expect(await presale.totalTokensSold()).to.equal(ethers.parseEther('1000'));
    });

    it('reverts outside the sale window', async () => {
      const { presale, alice } = await enabledFixture();
      await expect(presale.connect(alice).purchaseNative({ value: ethers.parseEther('1') })).to.be.revertedWith(
        'NexoraPresale: not in sale window',
      );
    });

    it('enforces per-wallet cap', async () => {
      const { presale, alice } = await enabledFixture();
      await enterSale(presale);
      await presale.connect(alice).purchaseNative({ value: ethers.parseEther('4') });
      await expect(presale.connect(alice).purchaseNative({ value: ethers.parseEther('2') })).to.be.revertedWith(
        'NexoraPresale: wallet cap exceeded',
      );
    });

    it('enforces global cap', async () => {
      const { presale, alice, bob } = await enabledFixture({ maxPurchase: ethers.parseEther('60'), perWalletCap: ethers.parseEther('60'), globalCap: ethers.parseEther('100') });
      await enterSale(presale);
      // globalCap = 100; buy 50 each.
      await presale.connect(alice).purchaseNative({ value: ethers.parseEther('50') });
      await presale.connect(bob).purchaseNative({ value: ethers.parseEther('50') });
      await expect(presale.connect(bob).purchaseNative({ value: ethers.parseEther('1') })).to.be.revertedWith(
        'NexoraPresale: global cap exceeded',
      );
    });

    it('enforces minimum purchase', async () => {
      const { presale, alice } = await enabledFixture();
      await enterSale(presale);
      await expect(presale.connect(alice).purchaseNative({ value: ethers.parseEther('0.001') })).to.be.revertedWith(
        'NexoraPresale: below min',
      );
    });
  });

  describe('TGE + vesting claiming', () => {
    async function claimedFixture() {
      const f = await loadFixture(deployFixture);
      await f.presale.connect(f.admin).enable();
      await enterSale(f.presale);
      await f.presale.connect(f.alice).purchaseNative({ value: ethers.parseEther('1') }); // 1000 NXR, 20% TGE
      return f;
    }

    it('unlocks only the TGE portion before vesting', async () => {
      const { presale, alice } = await claimedFixture();
      // 20% of 1000 = 200 claimable.
      expect(await presale.claimableAmount(alice.address)).to.equal(ethers.parseEther('200'));
    });

    it('claims the TGE portion and keeps the vested remainder accounted', async () => {
      const { presale, token, alice } = await claimedFixture();
      await presale.connect(alice).claim();
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther('200'));
      const rec = await presale.purchases(alice.address);
      expect(rec.claimed).to.equal(ethers.parseEther('200'));
      expect(rec.totalTokens).to.equal(ethers.parseEther('1000'));
      // Remaining claimable after TGE = 0 before vesting begins.
      expect(await presale.claimableAmount(alice.address)).to.equal(0n);
    });

    it('claims the full amount after vesting completes', async () => {
      const { presale, token, alice, cfg } = await claimedFixture();
      await presale.connect(alice).claim(); // TGE 200
      // Advance past vesting end.
      await time.increaseTo(cfg.vestingStartTime + BigInt(cfg.vestingDuration) + 1n);
      await presale.connect(alice).claim();
      // Total claimed = 1000.
      const rec = await presale.purchases(alice.address);
      expect(rec.claimed).to.equal(ethers.parseEther('1000'));
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther('1000'));
      expect(await presale.claimableAmount(alice.address)).to.equal(0n);
    });

    it('cannot claim more than entitlement (no double claim)', async () => {
      const { presale, alice } = await claimedFixture();
      await presale.connect(alice).claim();
      await expect(presale.connect(alice).claim()).to.be.revertedWith('NexoraPresale: nothing to claim');
    });
  });

  describe('Refund solvency', () => {
    it('refunds within the window and reduces obligations', async () => {
      const { presale, token, alice, admin } = await loadFixture(deployFixture);
      await presale.connect(admin).enable();
      await enterSale(presale);
      await presale.connect(alice).purchaseNative({ value: ethers.parseEther('2') });
      // outstanding obligation = 2 ETH.
      expect(await presale.outstandingRefundObligation()).to.equal(ethers.parseEther('2'));
      await presale.connect(alice).refund();
      expect(await presale.purchases(alice.address).then((r) => r.contributed)).to.equal(0n);
      expect(await presale.outstandingRefundObligation()).to.equal(0n);
    });

    it('cannot withdraw funds reserved for outstanding refunds', async () => {
      const { presale, alice, admin } = await loadFixture(deployFixture);
      await presale.connect(admin).enable();
      await enterSale(presale);
      // alice contributes 2 ETH (refundable), admin tries to withdraw all.
      await presale.connect(alice).purchaseNative({ value: ethers.parseEther('2') });
      // withdrawable = 2 - 2 = 0.
      expect(await presale.withdrawableFunds()).to.equal(0n);
      await expect(presale.connect(admin).withdrawFunds(admin.address)).to.be.revertedWith(
        'NexoraPresale: nothing to withdraw',
      );
    });

    it('allows withdrawal of the non-reserved portion and keeps refunds working', async () => {
      const { presale, token, alice, admin } = await loadFixture(deployFixture);
      await presale.connect(admin).enable();
      await enterSale(presale);
      // alice buys 1 (refundable), bob buys 3 (we'll claim/disable refund for bob)
      // To create a non-reserved portion: two buyers, one claims (forfeits refund).
      const bob = (await ethers.getSigners())[4];
      await presale.connect(alice).purchaseNative({ value: ethers.parseEther('1') });
      await presale.connect(bob).purchaseNative({ value: ethers.parseEther('3') });
      // Bob claims → forfeits refund; his 3 ETH becomes withdrawable.
      const cfg = await presale.saleConfig();
      await time.increaseTo(cfg.vestingStartTime + BigInt(cfg.vestingCliff) + 1n);
      await presale.connect(bob).claim();
      // outstanding now only = alice's 1 ETH.
      expect(await presale.outstandingRefundObligation()).to.equal(ethers.parseEther('1'));
      // withdrawable = 4 - 1 = 3.
      expect(await presale.withdrawableFunds()).to.equal(ethers.parseEther('3'));

      // Admin withdraws the 3 ETH (the funded part). Alice can still refund.
      await presale.connect(admin).withdrawFunds(admin.address);
      await presale.connect(alice).refund();
      expect(await presale.purchases(alice.address).then((r) => r.contributed)).to.equal(0n);
    });

    it('rejects refund after claiming (double benefit)', async () => {
      const { presale, alice } = await loadFixture(deployFixture);
      const admin = (await ethers.getSigners())[1];
      await presale.connect(admin).enable();
      await enterSale(presale);
      await presale.connect(alice).purchaseNative({ value: ethers.parseEther('1') });
      const cfg = await presale.saleConfig();
      await time.increaseTo(cfg.vestingStartTime + BigInt(cfg.vestingCliff) + 1n);
      await presale.connect(alice).claim();
      await expect(presale.connect(alice).refund()).to.be.revertedWith('NexoraPresale: nothing to refund');
    });
  });

  describe('Withdrawal & token balance', () => {
    it('withdraws only when funds are available', async () => {
      const { presale, admin } = await loadFixture(deployFixture);
      // No purchases, no funds → nothing to withdraw.
      await expect(presale.connect(admin).withdrawFunds(admin.address)).to.be.revertedWith(
        'NexoraPresale: nothing to withdraw',
      );
    });
  });
});
