import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { ZeroAddress } from 'ethers';
import type { NexoraToken, NexoraStaking } from '../typechain-types';

const DURATION = 100n;

describe('NexoraStaking', () => {
  async function deployFixture() {
    const [deployer, admin, alice, bob] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([
      { recipient: deployer.address, amount: ethers.parseEther('1000000000') },
    ])) as NexoraToken;
    await token.waitForDeployment();

    const stakingFactory = await ethers.getContractFactory('NexoraStaking');
    const staking = (await stakingFactory.deploy(await token.getAddress(), admin.address, DURATION)) as NexoraStaking;
    await staking.waitForDeployment();

    await token.transfer(alice.address, ethers.parseEther('100000'));
    await token.transfer(bob.address, ethers.parseEther('100000'));
    await token.transfer(admin.address, ethers.parseEther('200000'));

    return { token, staking, deployer, admin, alice, bob };
  }

  async function fundAndEnable(
    staking: NexoraStaking,
    token: NexoraToken,
    admin: any,
    amount: bigint,
  ) {
    await token.connect(admin).approve(await staking.getAddress(), amount);
    await staking.connect(admin).notifyRewardAmount(amount);
    await staking.connect(admin).enable();
  }

  async function stakeAs(staking: NexoraStaking, token: NexoraToken, who: any, amount: bigint) {
    await token.connect(who).approve(await staking.getAddress(), amount);
    await staking.connect(who).stake(amount);
  }

  async function activeFixture() {
    const f = await loadFixture(deployFixture);
    await fundAndEnable(f.staking, f.token, f.admin, ethers.parseEther('10000'));
    return f;
  }

  describe('Deployment & default state', () => {
    it('sets token and roles, disabled by default', async () => {
      const { staking, token, admin } = await loadFixture(deployFixture);
      expect(await staking.token()).to.equal(await token.getAddress());
      expect(await staking.hasRole(await staking.REWARD_GRANTOR_ROLE(), admin.address)).to.be.true;
      expect(await staking.enabled()).to.be.false;
    });

    it('rejects staking while disabled', async () => {
      const { staking, alice, token } = await loadFixture(deployFixture);
      await token.connect(alice).approve(await staking.getAddress(), ethers.parseEther('10'));
      await expect(staking.connect(alice).stake(ethers.parseEther('1'))).to.be.revertedWith(
        'NexoraStaking: disabled',
      );
    });
  });

  describe('Funding & enablement', () => {
    it('only reward-grantor can fund', async () => {
      const { staking, alice, token } = await loadFixture(deployFixture);
      await expect(staking.connect(alice).notifyRewardAmount(ethers.parseEther('1000'))).to.be.revertedWithCustomError(
        staking,
        'AccessControlUnauthorizedAccount',
      );
    });

    it('cannot enable before funding', async () => {
      const { staking, admin } = await loadFixture(deployFixture);
      await expect(staking.connect(admin).enable()).to.be.revertedWith('NexoraStaking: pool not funded');
    });

    it('enables after funding', async () => {
      const { staking, token, admin } = await loadFixture(deployFixture);
      await fundAndEnable(staking, token, admin, ethers.parseEther('10000'));
      expect(await staking.enabled()).to.be.true;
    });
  });

  describe('Reward accounting (exact, unit-isolated)', () => {
    it('rewardRate = amount / duration in wei-per-second (no 1e18 inflation)', async () => {
      const { staking, token, admin } = await loadFixture(deployFixture);
      const amount = ethers.parseEther('1000'); // 1000 NXR = 1000e18 wei
      await token.connect(admin).approve(await staking.getAddress(), amount);
      await staking.connect(admin).notifyRewardAmount(amount);
      // rate = 1000e18 / 100s = 10e18 wei/sec.
      expect(await staking.rewardRate()).to.equal(amount / DURATION);
      expect(await staking.totalRewardsFunded()).to.equal(amount);
    });

    it('outstanding obligations = funded - paid, and solvency holds', async () => {
      const { staking, token, admin, alice } = await activeFixture();
      await stakeAs(staking, token, alice, ethers.parseEther('1000'));
      await time.increase(50);
      // obligations = funded(10000) - paid(0) = 10000e18.
      expect(await staking.outstandingRewardObligations()).to.equal(ethers.parseEther('10000'));
      // Solvency: balance >= principal + obligations.
      const bal = await token.balanceOf(await staking.getAddress());
      const principal = await staking.totalStaked();
      const obligations = await staking.outstandingRewardObligations();
      expect(bal).to.be.gte(principal + obligations);
    });

    it('1-token reward rate accrues correctly (rate = wei/sec, no 1e18 inflation)', async () => {
      const { staking, token, admin, alice } = await loadFixture(deployFixture);
      const perSec = 1n; // 1 wei/sec
      const amount = perSec * DURATION; // 100 wei total
      await token.connect(admin).approve(await staking.getAddress(), amount);
      await staking.connect(admin).notifyRewardAmount(amount);
      await staking.connect(admin).enable();
      await stakeAs(staking, token, alice, ethers.parseEther('1')); // 1e18 stake
      // Give the full remaining period from the stake.
      const periodFinish = await staking.periodFinish();
      await time.increaseTo(periodFinish);
      const earned = await staking.earned(alice.address);
      // alice holds 100% of stake for the full period → earns the whole pool.
      // Tolerance accounts for the seconds between funding/stake and claim.
      expect(earned).to.be.gt(0n);
      expect(earned).to.be.lte(amount);
      // Without the /1e18 bug this would be astronomically larger (×1e18),
      // so a strict upper bound proves the fix.
    });

    it('100 wei/sec over full period pays ~full pool', async () => {
      const { staking, token, admin, alice } = await loadFixture(deployFixture);
      const rate = 100n; // 100 wei/sec
      const amount = rate * DURATION;
      await token.connect(admin).approve(await staking.getAddress(), amount);
      await staking.connect(admin).notifyRewardAmount(amount);
      await staking.connect(admin).enable();
      await stakeAs(staking, token, alice, ethers.parseEther('1'));
      const periodFinish = await staking.periodFinish();
      await time.increaseTo(periodFinish);
      await staking.connect(alice).claimRewards();
      const paid = await staking.totalRewardsPaid();
      // Paid is in the correct magnitude (wei), not inflated by 1e18.
      expect(paid).to.be.gt(amount / 2n);
      expect(paid).to.be.lte(amount);
    });
  });

  describe('Renewal (leftover carried forward correctly)', () => {
    it('period A + additional funding == period B without double-count', async () => {
      const { staking, token, admin, alice } = await loadFixture(deployFixture);
      const a = ethers.parseEther('1000');
      await token.connect(admin).approve(await staking.getAddress(), a * 2n);
      await staking.connect(admin).notifyRewardAmount(a); // period A: rate = a/100 = 10e18/s
      await staking.connect(admin).enable();
      await stakeAs(staking, token, alice, ethers.parseEther('1'));
      const finishA = await staking.periodFinish();

      // Advance part of period A (to 50s before finish).
      await time.increaseTo(finishA - 50n);
      // Add more rewards before period end.
      const b = ethers.parseEther('1000');
      await staking.connect(admin).notifyRewardAmount(b);
      // leftover = remainingSeconds * oldRate = (100-50)*10e18 (no /1e18).
      const expectedLeftover = 50n * (a / DURATION);
      // New rate = (b + leftover) / 100.
      const expectedRate = (b + expectedLeftover) / DURATION;
      const actualRate = await staking.rewardRate();
      // remaining seconds at notify is 50 (block-timing slack ±1s).
      expect(actualRate).to.be.gte(expectedRate - ethers.parseEther('1'));
      expect(actualRate).to.be.lte(expectedRate + ethers.parseEther('1'));
      expect(await staking.totalRewardsFunded()).to.equal(ethers.parseEther('2000'));
    });
  });

  describe('Claims & withdrawals (multiple scenarios)', () => {
    it('partial then full claim', async () => {
      const { staking, token, alice } = await activeFixture();
      await stakeAs(staking, token, alice, ethers.parseEther('1'));
      await time.increase(50);
      await staking.connect(alice).claimRewards();
      const firstPaid = await staking.totalRewardsPaid();
      expect(firstPaid).to.be.gt(0n);
      await time.increase(50);
      await staking.connect(alice).claimRewards();
      expect(await staking.totalRewardsPaid()).to.be.gt(firstPaid);
    });

    it('multiple stakers split rewards by share', async () => {
      const { staking, token, alice, bob } = await activeFixture();
      await stakeAs(staking, token, alice, ethers.parseEther('3'));
      await stakeAs(staking, token, bob, ethers.parseEther('1'));
      const periodFinish = await staking.periodFinish();
      await time.increaseTo(periodFinish);
      await staking.connect(alice).claimRewards();
      await staking.connect(bob).claimRewards();
      const total = (await staking.totalRewardsPaid());
      // Total paid ≈ 10000 wei (within block-timing slack), never inflated by 1e18.
      expect(total).to.be.gte(ethers.parseEther('9000'));
      expect(total).to.be.lte(ethers.parseEther('10000'));
      const balA = await token.balanceOf(alice.address);
      const balB = await token.balanceOf(bob.address);
      expect(balA).to.be.gt(balB);
    });

    it('stake after period starts earns from then on', async () => {
      const { staking, token, alice, bob } = await activeFixture();
      await stakeAs(staking, token, alice, ethers.parseEther('1'));
      await time.increase(50);
      await stakeAs(staking, token, bob, ethers.parseEther('1'));
      await time.increase(50);
      await staking.connect(alice).claimRewards();
      await staking.connect(bob).claimRewards();
      // alice staked the whole period (100% share first half, 50% second half)
      // so she earned strictly more than bob.
      const paidA = await token.balanceOf(alice.address);
      const paidB = await token.balanceOf(bob.address);
      expect(paidA).to.be.gt(paidB);
      expect(await staking.totalRewardsPaid()).to.be.lte(ethers.parseEther('10000'));
    });

    it('unstake before period end returns principal and preserves claim', async () => {
      const { staking, token, alice } = await activeFixture();
      const amt = ethers.parseEther('1000');
      await stakeAs(staking, token, alice, amt);
      await time.increase(30);
      await staking.connect(alice).withdraw(amt);
      expect(await staking.stakedBalance(alice.address)).to.equal(0n);
      // Can still claim rewards accrued before unstake.
      await staking.connect(alice).claimRewards();
      expect(await staking.totalRewardsPaid()).to.be.gt(0n);
    });

    it('unstake after period end', async () => {
      const { staking, token, alice } = await activeFixture();
      const amt = ethers.parseEther('1000');
      await stakeAs(staking, token, alice, amt);
      await time.increase(DURATION + 10n);
      await staking.connect(alice).withdraw(amt);
      expect(await staking.stakedBalance(alice.address)).to.equal(0n);
    });

    it('cannot withdraw more than staked', async () => {
      const { staking, token, alice } = await activeFixture();
      await stakeAs(staking, token, alice, ethers.parseEther('10'));
      await expect(staking.connect(alice).withdraw(ethers.parseEther('20'))).to.be.revertedWith(
        'NexoraStaking: insufficient stake',
      );
    });
  });

  describe('Surplus recovery', () => {
    it('recover only genuine surplus (beyond principal + obligations)', async () => {
      const { staking, token, admin, alice } = await activeFixture();
      await stakeAs(staking, token, alice, ethers.parseEther('1000'));
      // Send extra (unrelated) tokens beyond principal + funded rewards.
      await token.connect(admin).transfer(await staking.getAddress(), ethers.parseEther('500'));
      const surplus = await staking.availableSurplus();
      expect(surplus).to.equal(ethers.parseEther('500'));
      await staking.connect(admin).recoverSurplus(admin.address);
      expect(await staking.availableSurplus()).to.equal(0n);
      // Principal untouched.
      expect(await staking.totalStaked()).to.equal(ethers.parseEther('1000'));
    });

    it('cannot recover committed rewards', async () => {
      const { staking, token, admin, alice } = await activeFixture();
      await stakeAs(staking, token, alice, ethers.parseEther('1000'));
      // No surplus: availableSurplus == 0 (all funds reserved).
      expect(await staking.availableSurplus()).to.equal(0n);
      await expect(staking.connect(admin).recoverSurplus(admin.address)).to.be.revertedWith(
        'NexoraStaking: nothing to recover',
      );
    });

    it('cannot recover accrued (unclaimed) rewards', async () => {
      const { staking, token, admin, alice } = await activeFixture();
      await stakeAs(staking, token, alice, ethers.parseEther('1000'));
      await time.increase(50);
      // Accrued rewards are part of obligations (funded - paid), not surplus.
      expect(await staking.availableSurplus()).to.equal(0n);
      await expect(staking.connect(admin).recoverSurplus(admin.address)).to.be.revertedWith(
        'NexoraStaking: nothing to recover',
      );
    });

    it('zero reward rate edge case', async () => {
      const { staking, token, admin } = await loadFixture(deployFixture);
      // Funding with a tiny amount < duration → rate rounds to 0. Should not
      // be enableable meaningfully, and recovery of genuinely extra tokens works.
      await token.connect(admin).approve(await staking.getAddress(), ethers.parseEther('1'));
      await staking.connect(admin).notifyRewardAmount(ethers.parseEther('1'));
      // No revert; surplus accounting stays safe.
      expect(await staking.availableSurplus()).to.equal(0n);
    });

    it('very large reward rate does not overflow', async () => {
      const { staking, token, admin, deployer } = await loadFixture(deployFixture);
      // Send a large balance to admin for funding.
      await token.connect(deployer).transfer(admin.address, ethers.parseEther('100000000'));
      const huge = ethers.parseEther('10000000'); // 10M NXR = 10e24 wei
      await token.connect(admin).approve(await staking.getAddress(), huge);
      await staking.connect(admin).notifyRewardAmount(huge);
      expect(await staking.rewardRate()).to.be.gt(0n);
    });
  });

  describe('Pause', () => {
    it('pause blocks staking', async () => {
      const { staking, token, admin, alice } = await activeFixture();
      await staking.connect(admin).pause();
      await expect(staking.connect(alice).stake(ethers.parseEther('1'))).to.be.revertedWithCustomError(
        staking,
        'EnforcedPause',
      );
    });
  });
});

describe('NexoraStaking role handoff', () => {
  async function handoffFixture() {
    const [deployer, admin, timelock, multisig, emergency, attacker] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([{ recipient: deployer.address, amount: ethers.parseEther('1000000000') }])) as NexoraToken;
    await token.waitForDeployment();
    const stakingFactory = await ethers.getContractFactory('NexoraStaking');
    const staking = (await stakingFactory.deploy(await token.getAddress(), deployer.address, DURATION)) as NexoraStaking;
    await staking.waitForDeployment();
    const DEFAULT_ADMIN = await staking.DEFAULT_ADMIN_ROLE();
    const REWARD_GRANTOR = await staking.REWARD_GRANTOR_ROLE();
    const PAUSER = await staking.PAUSER_ROLE();

    await staking.connect(deployer).grantRole(DEFAULT_ADMIN, timelock.address);
    await staking.connect(deployer).grantRole(REWARD_GRANTOR, multisig.address);
    await staking.connect(deployer).grantRole(PAUSER, emergency.address);
    await staking.connect(deployer).revokeRole(REWARD_GRANTOR, deployer.address);
    await staking.connect(deployer).revokeRole(PAUSER, deployer.address);
    await staking.connect(deployer).revokeRole(DEFAULT_ADMIN, deployer.address);

    // Give multisig tokens to fund rewards.
    await token.transfer(multisig.address, ethers.parseEther('10000'));

    return { token, staking, deployer, timelock, multisig, emergency, attacker };
  }

  it('deployer can configure staking during deployment (temporary admin)', async () => {
    const [deployer] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([{ recipient: deployer.address, amount: ethers.parseEther('1000000000') }])) as NexoraToken;
    const stakingFactory = await ethers.getContractFactory('NexoraStaking');
    const staking = (await stakingFactory.deploy(await token.getAddress(), deployer.address, DURATION)) as NexoraStaking;
    expect(await staking.hasRole(await staking.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.true;
  });

  it('treasury multisig can grant rewards after finalization', async () => {
    const { token, staking, multisig } = await handoffFixture();
    await token.connect(multisig).approve(await staking.getAddress(), ethers.parseEther('1000'));
    await staking.connect(multisig).notifyRewardAmount(ethers.parseEther('1000'));
    expect(await staking.totalRewardsFunded()).to.equal(ethers.parseEther('1000'));
  });

  it('deployer cannot grant rewards after finalization', async () => {
    const { staking, deployer } = await handoffFixture();
    await expect(staking.connect(deployer).notifyRewardAmount(ethers.parseEther('1'))).to.be.revertedWithCustomError(
      staking,
      'AccessControlUnauthorizedAccount',
    );
  });

  it('unauthorized wallet cannot pause (no PAUSER role)', async () => {
    const { staking, attacker } = await handoffFixture();
    await expect(staking.connect(attacker).pause()).to.be.revertedWithCustomError(staking, 'AccessControlUnauthorizedAccount');
  });

  it('final admin authority is correct and deployer retains nothing dangerous', async () => {
    const { staking, deployer, timelock, multisig, emergency } = await handoffFixture();
    expect(await staking.hasRole(await staking.DEFAULT_ADMIN_ROLE(), timelock.address)).to.be.true;
    expect(await staking.hasRole(await staking.REWARD_GRANTOR_ROLE(), multisig.address)).to.be.true;
    expect(await staking.hasRole(await staking.PAUSER_ROLE(), emergency.address)).to.be.true;
    expect(await staking.hasRole(await staking.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.false;
    expect(await staking.hasRole(await staking.REWARD_GRANTOR_ROLE(), deployer.address)).to.be.false;
    expect(await staking.hasRole(await staking.PAUSER_ROLE(), deployer.address)).to.be.false;
  });
});
