import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import type { NexoraToken, NexoraVoteToken, NexoraVoteWrapper } from '../typechain-types';

describe('NexoraVoteWrapper (1:1 NXR ↔ NXVT)', () => {
  async function deployFixture() {
    const [admin, alice, bob, attacker] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([
      { recipient: alice.address, amount: ethers.parseEther('999999999') },
      { recipient: bob.address, amount: ethers.parseEther('1') },
    ])) as NexoraToken;
    await token.waitForDeployment();
    await token.connect(alice).transfer(bob.address, ethers.parseEther('300'));

    const voteTokenFactory = await ethers.getContractFactory('NexoraVoteToken');
    const voteToken = (await voteTokenFactory.deploy(admin.address)) as NexoraVoteToken;
    await voteToken.waitForDeployment();

    const MINTER = await voteToken.MINTER_ROLE();
    const wrapperFactory = await ethers.getContractFactory('NexoraVoteWrapper');
    const wrapper = (await wrapperFactory.deploy(await token.getAddress(), await voteToken.getAddress())) as NexoraVoteWrapper;
    await wrapper.waitForDeployment();

    // Final role state (production intent): wrapper is the ONLY minter.
    await voteToken.connect(admin).grantRole(MINTER, await wrapper.getAddress());
    await voteToken.connect(admin).revokeRole(MINTER, admin.address);

    return { token, voteToken, wrapper, admin, alice, bob, attacker, MINTER };
  }

  it('mints NXVT 1:1 on deposit and backs the supply', async () => {
    const { token, voteToken, wrapper, alice } = await loadFixture(deployFixture);
    await token.connect(alice).approve(await wrapper.getAddress(), ethers.parseEther('1000'));
    await wrapper.connect(alice).deposit(ethers.parseEther('1000'));
    expect(await voteToken.balanceOf(alice.address)).to.equal(ethers.parseEther('1000'));
    expect(await wrapper.backedSupply()).to.equal(ethers.parseEther('1000'));
  });

  it('withdraws NXR 1:1 by burning NXVT', async () => {
    const { token, voteToken, wrapper, alice } = await loadFixture(deployFixture);
    await token.connect(alice).approve(await wrapper.getAddress(), ethers.parseEther('1000'));
    await wrapper.connect(alice).deposit(ethers.parseEther('1000'));
    const before = await token.balanceOf(alice.address);
    await wrapper.connect(alice).withdraw(ethers.parseEther('400'));
    expect(await voteToken.balanceOf(alice.address)).to.equal(ethers.parseEther('600'));
    expect(await token.balanceOf(alice.address)).to.equal(before + ethers.parseEther('400'));
  });

  it('role state: wrapper is MINTER; admin and random are NOT', async () => {
    const { voteToken, wrapper, admin, attacker, MINTER } = await loadFixture(deployFixture);
    expect(await voteToken.hasRole(MINTER, await wrapper.getAddress())).to.be.true;
    expect(await voteToken.hasRole(MINTER, admin.address)).to.be.false;
    expect(await voteToken.hasRole(MINTER, attacker.address)).to.be.false;
  });

  it('admin cannot mint (MINTER revoked from admin)', async () => {
    const { voteToken, admin, alice } = await loadFixture(deployFixture);
    await expect(
      voteToken.connect(admin).mint(alice.address, ethers.parseEther('1')),
    ).to.be.revertedWithCustomError(voteToken, 'AccessControlUnauthorizedAccount');
  });

  it('random account cannot mint', async () => {
    const { voteToken, attacker, alice } = await loadFixture(deployFixture);
    await expect(
      voteToken.connect(attacker).mint(alice.address, ethers.parseEther('1')),
    ).to.be.revertedWithCustomError(voteToken, 'AccessControlUnauthorizedAccount');
  });

  it('wrapper cannot mint without receiving NXR (deposit pulls tokens)', async () => {
    const { token, voteToken, wrapper, alice } = await loadFixture(deployFixture);
    const balBefore = await token.balanceOf(alice.address);
    // Deposit without approval → transferFrom reverts, so no NXVT is minted.
    await expect(wrapper.connect(alice).deposit(ethers.parseEther('10'))).to.be.reverted;
    expect(await voteToken.balanceOf(alice.address)).to.equal(0n);
    expect(await token.balanceOf(alice.address)).to.equal(balBefore);
  });

  it('wrapper cannot burn another user\'s NXVT', async () => {
    const { token, voteToken, wrapper, alice, bob } = await loadFixture(deployFixture);
    await token.connect(alice).approve(await wrapper.getAddress(), ethers.parseEther('100'));
    await wrapper.connect(alice).deposit(ethers.parseEther('100'));
    // Alice's wrapper.withdraw only burns HER OWN NXVT (msg.sender).
    expect(await voteToken.balanceOf(alice.address)).to.equal(ethers.parseEther('100'));
    expect(await voteToken.balanceOf(bob.address)).to.equal(0n);
  });

  it('total NXVT supply equals total NXR locked in wrapper (backing invariant)', async () => {
    const { token, voteToken, wrapper, alice, bob } = await loadFixture(deployFixture);
    await token.connect(alice).approve(await wrapper.getAddress(), ethers.parseEther('500'));
    await token.connect(bob).approve(await wrapper.getAddress(), ethers.parseEther('300'));
    await wrapper.connect(alice).deposit(ethers.parseEther('500'));
    await wrapper.connect(bob).deposit(ethers.parseEther('300'));
    // Backing invariant: totalSupply == NXR locked in the wrapper.
    expect(await voteToken.totalSupply()).to.equal(await wrapper.backedSupply());
    expect(await wrapper.backedSupply()).to.equal(ethers.parseEther('800'));
    // Partial withdraw keeps it 1:1.
    await wrapper.connect(alice).withdraw(ethers.parseEther('200'));
    expect(await voteToken.totalSupply()).to.equal(await wrapper.backedSupply());
    expect(await wrapper.backedSupply()).to.equal(ethers.parseEther('600'));
  });
});
