import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import type { NexoraToken, NexoraTreasury, NexoraStaking, NexoraVesting, NexoraAirdrop, NexoraPresale, NexoraVoteToken, NexoraVoteWrapper, TimelockController, NexoraGovernor } from '../typechain-types';

/**
 * FINAL SECURITY PASS — regression tests proving the deployer loses ALL
 * dangerous permanent authority across the ecosystem after role finalization,
 * and that each contract remains governed by the intended authority.
 */

async function deployFinalized() {
  const [deployer, timelock, multisig, emergency, attacker, governorAddr] = await ethers.getSigners();

  // NXR token.
  const tokenFactory = await ethers.getContractFactory('NexoraToken');
  const token = (await tokenFactory.deploy([
    { recipient: deployer.address, amount: ethers.parseEther('1000000000') },
  ])) as NexoraToken;
  await token.waitForDeployment();

  // NXVT + wrapper (wrapper is the only minter).
  const vtFactory = await ethers.getContractFactory('NexoraVoteToken');
  const voteToken = (await vtFactory.deploy(deployer.address)) as NexoraVoteToken;
  const wrapperFactory = await ethers.getContractFactory('NexoraVoteWrapper');
  const wrapper = (await wrapperFactory.deploy(await token.getAddress(), await voteToken.getAddress())) as NexoraVoteWrapper;
  const MINTER = await voteToken.MINTER_ROLE();
  await voteToken.connect(deployer).grantRole(MINTER, await wrapper.getAddress());
  await voteToken.connect(deployer).revokeRole(MINTER, deployer.address);

  // Timelock (self-governed) + governor.
  const tlFactory = await ethers.getContractFactory('TimelockController');
  const timelockC = (await tlFactory.deploy(3600, [], [], deployer.address)) as TimelockController;
  const govFactory = await ethers.getContractFactory('NexoraGovernor');
  const governor = (await govFactory.deploy(
    await voteToken.getAddress(), await timelockC.getAddress(), 1, 10, 0, 4,
  )) as NexoraGovernor;
  await timelockC.connect(deployer).grantRole(await timelockC.PROPOSER_ROLE(), await governor.getAddress());
  await timelockC.connect(deployer).grantRole(await timelockC.EXECUTOR_ROLE(), await governor.getAddress());
  await timelockC.connect(deployer).grantRole(await timelockC.CANCELLER_ROLE(), await governor.getAddress());
  // Timelock self-admin.
  await timelockC.connect(deployer).grantRole(await timelockC.DEFAULT_ADMIN_ROLE(), await timelockC.getAddress());
  await timelockC.connect(deployer).revokeRole(await timelockC.DEFAULT_ADMIN_ROLE(), deployer.address);

  // Ecosystem contracts deployed with deployer as TEMPORARY admin.
  const treasury = (await (await ethers.getContractFactory('NexoraTreasury')).deploy(deployer.address)) as NexoraTreasury;
  const staking = (await (await ethers.getContractFactory('NexoraStaking')).deploy(await token.getAddress(), deployer.address, 100)) as NexoraStaking;
  const vestingTeam = (await (await ethers.getContractFactory('NexoraVesting')).deploy(await token.getAddress(), deployer.address)) as NexoraVesting;
  const vestingAdvisors = (await (await ethers.getContractFactory('NexoraVesting')).deploy(await token.getAddress(), deployer.address)) as NexoraVesting;
  const airdrop = (await (await ethers.getContractFactory('NexoraAirdrop')).deploy(await token.getAddress(), ethers.ZeroHash, 9999999999, deployer.address)) as NexoraAirdrop;
  const presale = (await (await ethers.getContractFactory('NexoraPresale')).deploy(await token.getAddress(), ethers.ZeroAddress, deployer.address)) as NexoraPresale;

  // Perform role handoff (governance = timelock, multisig, emergency).
  const DEFAULT_ADMIN = ethers.ZeroHash;
  const OPERATOR = ethers.id('OPERATOR_ROLE');
  const PAUSER = ethers.id('PAUSER_ROLE');
  const REWARD_GRANTOR = ethers.id('REWARD_GRANTOR_ROLE');
  const MANAGER = ethers.id('MANAGER_ROLE');
  const RECOVERY = ethers.id('RECOVERY_ROLE');

  // Treasury.
  await treasury.connect(deployer).grantRole(DEFAULT_ADMIN, timelock.address);
  await treasury.connect(deployer).grantRole(OPERATOR, multisig.address);
  await treasury.connect(deployer).grantRole(PAUSER, emergency.address);
  await treasury.connect(deployer).revokeRole(PAUSER, deployer.address);
  await treasury.connect(deployer).revokeRole(DEFAULT_ADMIN, deployer.address);
  // Staking.
  await staking.connect(deployer).grantRole(DEFAULT_ADMIN, timelock.address);
  await staking.connect(deployer).grantRole(REWARD_GRANTOR, multisig.address);
  await staking.connect(deployer).grantRole(PAUSER, emergency.address);
  await staking.connect(deployer).revokeRole(REWARD_GRANTOR, deployer.address);
  await staking.connect(deployer).revokeRole(PAUSER, deployer.address);
  await staking.connect(deployer).revokeRole(DEFAULT_ADMIN, deployer.address);
  // Vesting (team + advisors).
  for (const v of [vestingTeam, vestingAdvisors]) {
    await v.connect(deployer).grantRole(DEFAULT_ADMIN, timelock.address);
    await v.connect(deployer).grantRole(MANAGER, timelock.address);
    await v.connect(deployer).grantRole(RECOVERY, multisig.address);
    await v.connect(deployer).revokeRole(MANAGER, deployer.address);
    await v.connect(deployer).revokeRole(RECOVERY, deployer.address);
    await v.connect(deployer).revokeRole(DEFAULT_ADMIN, deployer.address);
  }
  // Airdrop.
  await airdrop.connect(deployer).grantRole(DEFAULT_ADMIN, timelock.address);
  await airdrop.connect(deployer).grantRole(PAUSER, emergency.address);
  await airdrop.connect(deployer).grantRole(RECOVERY, multisig.address);
  await airdrop.connect(deployer).revokeRole(PAUSER, deployer.address);
  await airdrop.connect(deployer).revokeRole(RECOVERY, deployer.address);
  await airdrop.connect(deployer).revokeRole(DEFAULT_ADMIN, deployer.address);
  // Presale.
  await presale.connect(deployer).grantRole(DEFAULT_ADMIN, timelock.address);
  await presale.connect(deployer).grantRole(MANAGER, timelock.address);
  await presale.connect(deployer).grantRole(PAUSER, emergency.address);
  await presale.connect(deployer).revokeRole(PAUSER, deployer.address);
  await presale.connect(deployer).revokeRole(MANAGER, deployer.address);
  await presale.connect(deployer).revokeRole(DEFAULT_ADMIN, deployer.address);
  // VoteToken DEFAULT_ADMIN -> timelock.
  await voteToken.connect(deployer).grantRole(DEFAULT_ADMIN, timelock.address);
  await voteToken.connect(deployer).revokeRole(DEFAULT_ADMIN, deployer.address);

  await token.transfer(multisig.address, ethers.parseEther('10000')); // for staking funding
  return { token, voteToken, wrapper, timelockC, governor, treasury, staking, vestingTeam, vestingAdvisors, airdrop, presale, deployer, timelock, multisig, emergency, attacker };
}

describe('FINAL SECURITY PASS — deployer has no permanent privileged authority', () => {
  it('TEST 1: deployer cannot retain Timelock DEFAULT_ADMIN after finalization', async () => {
    const f = await loadFixture(deployFinalized);
    expect(await f.timelockC.hasRole(ethers.ZeroHash, f.deployer.address)).to.be.false;
  });
  it('TEST 2: timelock remains governed by the governor (proposer/executor/canceller)', async () => {
    const f = await loadFixture(deployFinalized);
    const g = await f.governor.getAddress();
    expect(await f.timelockC.hasRole(await f.timelockC.PROPOSER_ROLE(), g)).to.be.true;
    expect(await f.timelockC.hasRole(await f.timelockC.EXECUTOR_ROLE(), g)).to.be.true;
    expect(await f.timelockC.hasRole(await f.timelockC.CANCELLER_ROLE(), g)).to.be.true;
    // timelock self-admin, not deployer.
    expect(await f.timelockC.hasRole(ethers.ZeroHash, await f.timelockC.getAddress())).to.be.true;
  });
  it('TEST 3: treasury remains controllable by intended governance + multisig', async () => {
    const f = await loadFixture(deployFinalized);
    expect(await f.treasury.hasRole(ethers.ZeroHash, f.timelock.address)).to.be.true;
    expect(await f.treasury.hasRole(ethers.id('OPERATOR_ROLE'), f.multisig.address)).to.be.true;
    expect(await f.treasury.hasRole(ethers.ZeroHash, f.deployer.address)).to.be.false;
  });
  it('TEST 4: staking reward grants require intended authority (multisig)', async () => {
    const f = await loadFixture(deployFinalized);
    expect(await f.staking.hasRole(ethers.id('REWARD_GRANTOR_ROLE'), f.multisig.address)).to.be.true;
    expect(await f.staking.hasRole(ethers.id('REWARD_GRANTOR_ROLE'), f.deployer.address)).to.be.false;
    // multisig can fund rewards.
    await f.token.connect(f.multisig).approve(await f.staking.getAddress(), ethers.parseEther('1000'));
    await f.staking.connect(f.multisig).notifyRewardAmount(ethers.parseEther('1000'));
    // deployer cannot.
    await expect(f.staking.connect(f.deployer).notifyRewardAmount(1)).to.be.revertedWithCustomError(f.staking, 'AccessControlUnauthorizedAccount');
  });
  it('TEST 5: vesting cannot be administratively modified by deployer after finalization', async () => {
    const f = await loadFixture(deployFinalized);
    expect(await f.vestingTeam.hasRole(ethers.id('MANAGER_ROLE'), f.deployer.address)).to.be.false;
    expect(await f.vestingTeam.hasRole(ethers.ZeroHash, f.deployer.address)).to.be.false;
    expect(await f.vestingTeam.hasRole(ethers.id('MANAGER_ROLE'), f.timelock.address)).to.be.true;
  });
  it('TEST 6: airdrop cannot be activated by deployer', async () => {
    const f = await loadFixture(deployFinalized);
    expect(await f.airdrop.hasRole(ethers.ZeroHash, f.deployer.address)).to.be.false;
    // deployer cannot set the root.
    await expect(f.airdrop.connect(f.deployer).setMerkleRoot(ethers.keccak256('0x1234'))).to.be.revertedWithCustomError(f.airdrop, 'AccessControlUnauthorizedAccount');
    // governance authority can.
    await f.airdrop.connect(f.timelock).setMerkleRoot(ethers.keccak256('0x1234'));
    expect(await f.airdrop.merkleRoot()).to.equal(ethers.keccak256('0x1234'));
  });
  it('TEST 7: presale cannot be activated by deployer', async () => {
    const f = await loadFixture(deployFinalized);
    expect(await f.presale.hasRole(ethers.ZeroHash, f.deployer.address)).to.be.false;
    expect(await f.presale.hasRole(ethers.id('MANAGER_ROLE'), f.deployer.address)).to.be.false;
    await expect(f.presale.connect(f.deployer).enable()).to.be.revertedWithCustomError(f.presale, 'AccessControlUnauthorizedAccount');
  });
  it('TEST 8: NXVT cannot be minted by deployer', async () => {
    const f = await loadFixture(deployFinalized);
    expect(await f.voteToken.hasRole(ethers.id('MINTER_ROLE'), f.deployer.address)).to.be.false;
    expect(await f.voteToken.hasRole(ethers.id('MINTER_ROLE'), await f.wrapper.getAddress())).to.be.true;
    await expect(f.voteToken.connect(f.deployer).mint(f.deployer.address, 1)).to.be.revertedWithCustomError(f.voteToken, 'AccessControlUnauthorizedAccount');
  });
  it('TEST 9: unauthorized account cannot obtain privileged roles', async () => {
    const f = await loadFixture(deployFinalized);
    // deployer is no longer DEFAULT_ADMIN anywhere, so cannot grant roles.
    await expect(f.treasury.connect(f.deployer).grantRole(ethers.id('OPERATOR_ROLE'), f.attacker.address)).to.be.revertedWithCustomError(f.treasury, 'AccessControlUnauthorizedAccount');
    await expect(f.staking.connect(f.deployer).grantRole(ethers.id('REWARD_GRANTOR_ROLE'), f.attacker.address)).to.be.revertedWithCustomError(f.staking, 'AccessControlUnauthorizedAccount');
    await expect(f.voteToken.connect(f.deployer).grantRole(ethers.id('MINTER_ROLE'), f.attacker.address)).to.be.revertedWithCustomError(f.voteToken, 'AccessControlUnauthorizedAccount');
  });
  it('TEST 10: treasury cannot be drained by an unauthorized account', async () => {
    const f = await loadFixture(deployFinalized);
    const { NexoraToken } = await import('../typechain-types');
    // Fund treasury, attacker must not spend.
    await f.token.transfer(await f.treasury.getAddress(), ethers.parseEther('100'));
    await expect(f.treasury.connect(f.attacker).spend(await f.token.getAddress(), f.attacker.address, ethers.parseEther('100'), 'x')).to.be.revertedWithCustomError(f.treasury, 'AccessControlUnauthorizedAccount');
    expect(await f.token.balanceOf(await f.treasury.getAddress())).to.equal(ethers.parseEther('100'));
  });
});
