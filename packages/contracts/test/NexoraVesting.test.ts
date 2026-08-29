import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { ZeroAddress } from 'ethers';
import type { NexoraToken, NexoraVesting } from '../typechain-types';

const DAY = BigInt(24 * 3600);

describe('NexoraVesting', () => {
  async function deployFixture() {
    const [deployer, admin, ben, ben2, manager, recovery, stranger] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([
      { recipient: deployer.address, amount: ethers.parseEther('1000000000') },
    ])) as NexoraToken;
    await token.waitForDeployment();

    const vestingFactory = await ethers.getContractFactory('NexoraVesting');
    const vesting = (await vestingFactory.deploy(await token.getAddress(), admin.address)) as NexoraVesting;
    await vesting.waitForDeployment();

    return { token, vesting, deployer, admin, ben, ben2, manager, recovery, stranger };
  }

  async function createAndFund(
    v: NexoraVesting,
    t: NexoraToken,
    tokenAddr: string,
    from: { address: string; transfer: (a: string, b: bigint) => Promise<unknown> },
    beneficiary: string,
    amount: bigint,
    start: bigint,
    cliff: bigint,
    dur: bigint,
    revocable: boolean,
  ) {
    // Fund vesting contract with `amount`.
    await t.connect(from as never).transfer(tokenAddr, amount);
    // Approve vesting to pull (fund not needed since contract already holds).
    return v.createSchedule(beneficiary, amount, start, cliff, dur, revocable);
  }

  describe('Deployment & schedule creation', () => {
    it('sets token and roles', async () => {
      const { vesting, token, admin } = await loadFixture(deployFixture);
      expect(await vesting.token()).to.equal(await token.getAddress());
      expect(await vesting.hasRole(await vesting.MANAGER_ROLE(), admin.address)).to.be.true;
    });

    it('creates a schedule and stores parameters', async () => {
      const { vesting, token, deployer, ben, admin } = await loadFixture(deployFixture);
      const start = BigInt(await time.latest()) + DAY + 3600n;
      await token.connect(deployer).transfer(await vesting.getAddress(), ethers.parseEther('100000'));
      const id = await vesting.nextScheduleId();
      await (await vesting.connect(admin).createSchedule(
        ben.address,
        ethers.parseEther('100000'),
        start,
        30n * DAY,
        120n * DAY,
        false,
      )).wait();
      const s = await vesting.schedules(id);
      expect(s.beneficiary).to.equal(ben.address);
      expect(s.totalAmount).to.equal(ethers.parseEther('100000'));
      expect(s.startTime).to.equal(start);
      expect(s.revocable).to.be.false;
    });

    it('only manager can create schedules', async () => {
      const { vesting, ben, admin, stranger } = await loadFixture(deployFixture);
      const start = BigInt(await time.latest()) + DAY + 3600n;
      await expect(
        vesting.connect(stranger).createSchedule(ben.address, ethers.parseEther('100'), start, 0, DAY, false),
      ).to.be.revertedWithCustomError(vesting, 'AccessControlUnauthorizedAccount');
    });

    it('reverts invalid parameters', async () => {
      const { vesting, admin, ben } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      // cliff > duration
      await expect(
        vesting.connect(admin).createSchedule(ben.address, ethers.parseEther('100'), now + DAY, 200n * DAY, 100n * DAY, false),
      ).to.be.revertedWith('NexoraVesting: cliff > duration');
      // start in past
      await expect(
        vesting.connect(admin).createSchedule(ben.address, ethers.parseEther('100'), now - 1n, 0, DAY, false),
      ).to.be.revertedWith('NexoraVesting: start in past');
    });
  });

  describe('Vesting & claiming', () => {
    it('releases nothing before the cliff', async () => {
      const { vesting, token, deployer, ben, admin } = await loadFixture(deployFixture);
      const start = BigInt(await time.latest()) + DAY + 3600n;
      const amount = ethers.parseEther('100000');
      await token.connect(deployer).transfer(await vesting.getAddress(), amount);
      await vesting.connect(admin).createSchedule(ben.address, amount, start, 30n * DAY, 120n * DAY, false);
      const id = await vesting.nextScheduleId() - 1n;

      // Before start: 0 vested.
      expect(await vesting.vestedAmount(id)).to.equal(0n);
      expect(await vesting.claimableAmount(id)).to.equal(0n);
    });

    it('releases tokens linearly after the cliff', async () => {
      const { vesting, token, deployer, ben, admin } = await loadFixture(deployFixture);
      const start = BigInt(await time.latest()) + 3600n;
      const amount = ethers.parseEther('100000');
      const cliff = 30n * DAY;
      const dur = 120n * DAY;
      await token.connect(deployer).transfer(await vesting.getAddress(), amount);
      await vesting.connect(admin).createSchedule(ben.address, amount, start, cliff, dur, false);
      const id = await vesting.nextScheduleId() - 1n;

      // Advance to half the duration past cliff.
      await time.increaseTo(start + cliff + dur / 2n);
      const expected = (amount * (cliff + dur / 2n)) / dur;
      expect(await vesting.vestedAmount(id)).to.equal(expected);

      // Advance to full end: fully vested.
      await time.increaseTo(start + dur);
      expect(await vesting.vestedAmount(id)).to.equal(amount);
    });

    it('beneficiary can claim the vested amount', async () => {
      const { vesting, token, deployer, ben, admin } = await loadFixture(deployFixture);
      const start = BigInt(await time.latest()) + 3600n;
      const amount = ethers.parseEther('100000');
      const dur = 120n * DAY;
      await token.connect(deployer).transfer(await vesting.getAddress(), amount);
      await vesting.connect(admin).createSchedule(ben.address, amount, start, 0, dur, false);
      const id = await vesting.nextScheduleId() - 1n;

      await time.increaseTo(start + dur);
      const before = await token.balanceOf(ben.address);
      await vesting.connect(ben).claim(id);
      const after = await token.balanceOf(ben.address);
      expect(after - before).to.equal(amount);
      const s = await vesting.schedules(id);
      expect(s.claimed).to.equal(amount);
      expect(await vesting.claimableAmount(id)).to.equal(0n);
    });

    it('only the beneficiary can claim', async () => {
      const { vesting, token, deployer, ben, admin, stranger } = await loadFixture(deployFixture);
      const start = BigInt(await time.latest()) + 3600n;
      const amount = ethers.parseEther('1000');
      await token.connect(deployer).transfer(await vesting.getAddress(), amount);
      await vesting.connect(admin).createSchedule(ben.address, amount, start, 0, DAY, false);
      const id = await vesting.nextScheduleId() - 1n;
      await time.increaseTo(start + DAY);
      await expect(vesting.connect(stranger).claim(id)).to.be.revertedWith('NexoraVesting: not beneficiary');
    });
  });

  describe('Revocable schedules', () => {
    it('revokes and returns unvested to recovery', async () => {
      const { vesting, token, deployer, ben, admin, recovery } = await loadFixture(deployFixture);
      const start = BigInt(await time.latest()) + 3600n;
      const amount = ethers.parseEther('100000');
      const dur = 120n * DAY;
      await token.connect(deployer).transfer(await vesting.getAddress(), amount);
      await vesting.connect(admin).createSchedule(ben.address, amount, start, 0, dur, true);
      const id = await vesting.nextScheduleId() - 1n;

      await time.increaseTo(start + dur / 2n);
      await vesting.connect(admin).revoke(id);
      const s = await vesting.schedules(id);
      expect(s.revoked).to.be.true;
      // The amount vested at revocation is frozen and stays claimable.
      const frozen = s.vestedAtRevoke;
      expect(frozen).to.be.gt(0n);
      expect(await vesting.vestedAmount(id)).to.equal(frozen);
      expect(await vesting.claimableAmount(id)).to.equal(frozen);

      // Beneficiary can still claim the frozen vested amount.
      await vesting.connect(ben).claim(id);
      expect(await token.balanceOf(ben.address)).to.equal(frozen);

      // Sweep the unvested remainder to recovery.
      const unvested = amount - frozen;
      await vesting.connect(admin).sweepRevoked(id, recovery.address);
      expect(await token.balanceOf(recovery.address)).to.equal(unvested);
    });

    it('cannot revoke a non-revocable schedule', async () => {
      const { vesting, token, deployer, ben, admin } = await loadFixture(deployFixture);
      const start = BigInt(await time.latest()) + 3600n;
      const amount = ethers.parseEther('1000');
      await token.connect(deployer).transfer(await vesting.getAddress(), amount);
      await vesting.connect(admin).createSchedule(ben.address, amount, start, 0, DAY, false);
      const id = await vesting.nextScheduleId() - 1n;
      await expect(vesting.connect(admin).revoke(id)).to.be.revertedWith('NexoraVesting: not revocable');
    });
  });
});

describe('NexoraVesting reserved/recovery accounting', () => {
  async function setup() {
    const [deployer, admin, ben, recovery] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([{ recipient: deployer.address, amount: ethers.parseEther('1000000000') }])) as NexoraToken;
    const vestingFactory = await ethers.getContractFactory('NexoraVesting');
    const vesting = (await vestingFactory.deploy(await token.getAddress(), admin.address)) as NexoraVesting;
    const now = BigInt(await time.latest());
    // Fund the vesting contract.
    await token.transfer(await vesting.getAddress(), ethers.parseEther('10000'));
    return { token, vesting, admin, ben, recovery, now };
  }

  it('reserves active schedule amounts and prevents sweeping them', async () => {
    const { vesting, token, admin, ben, recovery } = await setup();
    const start = BigInt(await time.latest()) + 3600n;
    const amount = ethers.parseEther('5000');
    await vesting.connect(admin).createSchedule(ben.address, amount, start, 0, 100n * DAY, false);
    expect(await vesting.reservedTokens()).to.equal(amount);
    // availableRecovery = balance(10000) - reserved(5000) = 5000.
    expect(await vesting.availableRecovery()).to.equal(ethers.parseEther('5000'));
    // Sweep only the unreserved 5000.
    await vesting.connect(admin).sweep(await token.getAddress(), recovery.address);
    expect(await token.balanceOf(recovery.address)).to.equal(ethers.parseEther('5000'));
    // Reserved amount still fully intact.
    expect(await vesting.reservedTokens()).to.equal(ethers.parseEther('5000'));
  });

  it('reduces reserved as beneficiaries claim', async () => {
    const { vesting, token, admin, ben } = await setup();
    const start = BigInt(await time.latest()) + 1n;
    const amount = ethers.parseEther('4000');
    await vesting.connect(admin).createSchedule(ben.address, amount, start, 0, DAY, false);
    const id = await vesting.nextScheduleId() - 1n;
    expect(await vesting.reservedTokens()).to.equal(ethers.parseEther('4000'));
    await time.increaseTo(start + DAY);
    await vesting.connect(ben).claim(id);
    expect(await vesting.reservedTokens()).to.equal(0n);
  });
});

describe('NexoraVesting solvency (funding-linked)', () => {
  async function setup() {
    const [deployer, admin, ben, recovery] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([{ recipient: deployer.address, amount: ethers.parseEther('1000000000') }])) as NexoraToken;
    const vestingFactory = await ethers.getContractFactory('NexoraVesting');
    const vesting = (await vestingFactory.deploy(await token.getAddress(), admin.address)) as NexoraVesting;
    await token.transfer(admin.address, ethers.parseEther('100000'));
    return { token, vesting, deployer, admin, ben, recovery };
  }

  it('cannot create an unfunded schedule (insufficient unreserved)', async () => {
    const { vesting, admin, ben } = await setup();
    const start = BigInt(await time.latest()) + 3600n;
    // No tokens in the contract.
    await expect(
      vesting.connect(admin).createSchedule(ben.address, ethers.parseEther('1000'), start, 0, DAY, false),
    ).to.be.revertedWith('NexoraVesting: insufficient funding');
  });

  it('fundAndCreateSchedule atomically funds and creates', async () => {
    const { token, vesting, admin, ben } = await setup();
    const start = BigInt(await time.latest()) + 3600n;
    await token.connect(admin).approve(await vesting.getAddress(), ethers.parseEther('5000'));
    const idBefore = await vesting.nextScheduleId();
    await vesting.connect(admin).fundAndCreateSchedule(ben.address, ethers.parseEther('5000'), start, 0, DAY, false);
    const id = idBefore;
    expect(await vesting.reservedTokens()).to.equal(ethers.parseEther('5000'));
    expect((await vesting.schedules(id)).totalAmount).to.equal(ethers.parseEther('5000'));
  });

  it('createSchedule works when tokens are already funded', async () => {
    const { token, vesting, deployer, admin, ben } = await setup();
    const start = BigInt(await time.latest()) + 3600n;
    await token.transfer(await vesting.getAddress(), ethers.parseEther('8000'));
    await vesting.connect(admin).createSchedule(ben.address, ethers.parseEther('8000'), start, 0, DAY, false);
    expect(await vesting.reservedTokens()).to.equal(ethers.parseEther('8000'));
    // unreserved now 0.
    expect(await vesting.unreserved()).to.equal(0n);
  });

  it('reserved tokens cannot be recovered; only unreserved can', async () => {
    const { token, vesting, deployer, admin, ben, recovery } = await setup();
    const start = BigInt(await time.latest()) + 3600n;
    // Fund 10000 total, reserve 6000.
    await token.transfer(await vesting.getAddress(), ethers.parseEther('10000'));
    await vesting.connect(admin).createSchedule(ben.address, ethers.parseEther('6000'), start, 0, DAY, false);
    // unreserved = 4000; sweep only that.
    expect(await vesting.availableRecovery()).to.equal(ethers.parseEther('4000'));
    await vesting.connect(admin).sweep(await token.getAddress(), recovery.address);
    expect(await token.balanceOf(recovery.address)).to.equal(ethers.parseEther('4000'));
    // Reserved 6000 untouched.
    expect(await vesting.reservedTokens()).to.equal(ethers.parseEther('6000'));
  });
});
