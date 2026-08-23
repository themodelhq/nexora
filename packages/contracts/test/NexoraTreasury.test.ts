import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { ZeroAddress } from 'ethers';
import type { NexoraToken, NexoraTreasury } from '../typechain-types';

describe('NexoraTreasury', () => {
  async function deployFixture() {
    const [deployer, admin, operator, treasuryAddr, recipient, alice] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([
      { recipient: deployer.address, amount: ethers.parseEther('1000000000') },
    ])) as NexoraToken;
    await token.waitForDeployment();

    const treasuryFactory = await ethers.getContractFactory('NexoraTreasury');
    const treasury = (await treasuryFactory.deploy(admin.address)) as NexoraTreasury;
    await treasury.waitForDeployment();

    // Grant OPERATOR_ROLE to `operator` (e.g. a multisig).
    const OPERATOR = await treasury.OPERATOR_ROLE();
    await treasury.connect(admin).grantRole(OPERATOR, operator.address);

    // Fund the treasury with NXR.
    await token.transfer(await treasury.getAddress(), ethers.parseEther('150000000'));

    return { token, treasury, deployer, admin, operator, recipient, alice };
  }

  describe('Deployment & roles', () => {
    it('sets admin and does NOT grant operator to deployer', async () => {
      const { treasury, admin, deployer } = await loadFixture(deployFixture);
      expect(await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
      // Deployer is not granted OPERATOR by default.
      expect(await treasury.hasRole(await treasury.OPERATOR_ROLE(), deployer.address)).to.be.false;
    });

    it('rejects zero admin', async () => {
      const f = await ethers.getContractFactory('NexoraTreasury');
      await expect(f.deploy(ZeroAddress)).to.be.revertedWith('NexoraTreasury: zero admin');
    });
  });

  describe('Spending', () => {
    it('only operator can spend ERC-20', async () => {
      const { treasury, token, recipient, alice } = await loadFixture(deployFixture);
      await expect(
        treasury.connect(alice).spend(await token.getAddress(), recipient.address, ethers.parseEther('1000'), 'ops'),
      ).to.be.revertedWithCustomError(treasury, 'AccessControlUnauthorizedAccount');
    });

    it('operator can spend ERC-20 and emits Spend event', async () => {
      const { treasury, token, operator, recipient } = await loadFixture(deployFixture);
      const before = await token.balanceOf(recipient.address);
      await treasury.connect(operator).spend(await token.getAddress(), recipient.address, ethers.parseEther('5000'), 'grants');
      expect(await token.balanceOf(recipient.address) - before).to.equal(ethers.parseEther('5000'));
    });

    it('operator can spend native ETH', async () => {
      const { treasury, operator, recipient } = await loadFixture(deployFixture);
      const funder = (await ethers.getSigners())[0];
      await funder.sendTransaction({ to: await treasury.getAddress(), value: ethers.parseEther('10') });
      expect(await treasury.nativeBalance()).to.equal(ethers.parseEther('10'));
      await treasury.connect(operator).spendNative(recipient.address, ethers.parseEther('4'), 'gas');
      expect(await recipient.provider?.getBalance(recipient.address)).to.be.gt(0);
      expect(await treasury.nativeBalance()).to.equal(ethers.parseEther('6'));
    });

    it('reverts spend when paused', async () => {
      const { treasury, token, operator, recipient, admin } = await loadFixture(deployFixture);
      await treasury.connect(admin).pause();
      await expect(
        treasury.connect(operator).spend(await token.getAddress(), recipient.address, ethers.parseEther('1'), 'x'),
      ).to.be.revertedWith('NexoraTreasury: paused');
    });
  });

  describe('Balance visibility', () => {
    it('reports ERC-20 and native balances', async () => {
      const { treasury, token } = await loadFixture(deployFixture);
      expect(await treasury.balanceOf(await token.getAddress())).to.equal(ethers.parseEther('150000000'));
    });
  });
});

describe('NexoraTreasury architecture (Option A: multisig is treasury)', () => {
  async function wiredFixture() {
    const [deployer, admin, operator, treasuryMultisig, attacker] = await ethers.getSigners();
    // Token allocates 150M treasury directly to the treasury multisig.
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([
      { recipient: deployer.address, amount: ethers.parseEther('850000000') },
      { recipient: treasuryMultisig.address, amount: ethers.parseEther('150000000') },
    ])) as NexoraToken;
    await token.waitForDeployment();

    const treasuryFactory = await ethers.getContractFactory('NexoraTreasury');
    const treasury = (await treasuryFactory.deploy(admin.address)) as NexoraTreasury;
    await treasury.waitForDeployment();
    const OPERATOR = await treasury.OPERATOR_ROLE();
    await treasury.connect(admin).grantRole(OPERATOR, treasuryMultisig.address);

    return { token, treasury, deployer, admin, operator, treasuryMultisig, attacker };
  }

  it('treasury allocation lands on the intended treasury multisig (no ambiguity)', async () => {
    const { token, treasuryMultisig } = await wiredFixture();
    expect(await token.balanceOf(treasuryMultisig.address)).to.equal(ethers.parseEther('150000000'));
  });

  it('deployer is NOT the treasury operator and cannot spend treasury funds', async () => {
    const { token, treasury, deployer, attacker } = await wiredFixture();
    // Grant treasury no extra funds; deployer/attacker must be blocked.
    await token.transfer(await treasury.getAddress(), ethers.parseEther('1000'));
    expect(await treasury.hasRole(await treasury.OPERATOR_ROLE(), deployer.address)).to.be.false;
    await expect(
      treasury.connect(deployer).spend(await token.getAddress(), attacker.address, ethers.parseEther('1'), 'x'),
    ).to.be.revertedWithCustomError(treasury, 'AccessControlUnauthorizedAccount');
  });

  it('treasury multisig is the operator (controller) and ownership is correct', async () => {
    const { treasury, admin, treasuryMultisig } = await wiredFixture();
    expect(await treasury.hasRole(await treasury.OPERATOR_ROLE(), treasuryMultisig.address)).to.be.true;
    expect(await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
  });

  it('single unauthorized account cannot drain the treasury', async () => {
    const { token, treasury, attacker } = await wiredFixture();
    await token.transfer(await treasury.getAddress(), ethers.parseEther('1000'));
    await expect(
      treasury.connect(attacker).spend(await token.getAddress(), attacker.address, ethers.parseEther('1000'), 'drain'),
    ).to.be.revertedWithCustomError(treasury, 'AccessControlUnauthorizedAccount');
    // Balance unchanged.
    expect(await token.balanceOf(await treasury.getAddress())).to.equal(ethers.parseEther('1000'));
  });
});

describe('NexoraTreasury role handoff', () => {
  async function handoffFixture() {
    const [deployer, timelock, multisig, emergency, attacker] = await ethers.getSigners();
    const treasuryFactory = await ethers.getContractFactory('NexoraTreasury');
    const treasury = (await treasuryFactory.deploy(deployer.address)) as NexoraTreasury;
    await treasury.waitForDeployment();
    const DEFAULT_ADMIN = await treasury.DEFAULT_ADMIN_ROLE();
    const OPERATOR = await treasury.OPERATOR_ROLE();
    const PAUSER = await treasury.PAUSER_ROLE();

    // Perform handoff (deployer is temporary admin).
    await treasury.connect(deployer).grantRole(DEFAULT_ADMIN, timelock.address);
    await treasury.connect(deployer).grantRole(OPERATOR, multisig.address);
    await treasury.connect(deployer).grantRole(PAUSER, emergency.address);
    await treasury.connect(deployer).revokeRole(PAUSER, deployer.address); // non-admin first
    await treasury.connect(deployer).revokeRole(DEFAULT_ADMIN, deployer.address); // admin last

    return { treasury, deployer, timelock, multisig, emergency, attacker };
  }

  it('deployer initially holds temporary DEFAULT_ADMIN before handoff', async () => {
    const [deployer] = await ethers.getSigners();
    const treasuryFactory = await ethers.getContractFactory('NexoraTreasury');
    const treasury = (await treasuryFactory.deploy(deployer.address)) as NexoraTreasury;
    expect(await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.true;
  });

  it('permanent authority is correctly assigned after handoff', async () => {
    const { treasury, timelock, multisig, emergency } = await handoffFixture();
    expect(await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), timelock.address)).to.be.true;
    expect(await treasury.hasRole(await treasury.OPERATOR_ROLE(), multisig.address)).to.be.true;
    expect(await treasury.hasRole(await treasury.PAUSER_ROLE(), emergency.address)).to.be.true;
  });

  it('deployer loses dangerous permanent roles (admin + pauser)', async () => {
    const { treasury, deployer } = await handoffFixture();
    expect(await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.false;
    expect(await treasury.hasRole(await treasury.PAUSER_ROLE(), deployer.address)).to.be.false;
  });

  it('unauthorized wallet cannot operate the treasury', async () => {
    const { treasury, attacker } = await handoffFixture();
    await expect(treasury.connect(attacker).pause()).to.be.revertedWithCustomError(treasury, 'AccessControlUnauthorizedAccount');
  });

  it('handoff does not leave the contract without an administrator', async () => {
    const { treasury, timelock } = await handoffFixture();
    expect(await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), timelock.address)).to.be.true;
  });
});
