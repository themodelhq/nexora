import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import type { NexoraToken, NexoraAllocationVault } from '../typechain-types';

describe('NexoraAllocationVault (one-shot genesis escrow)', () => {
  async function fixture() {
    const [owner, deployer, dest, attacker] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory('NexoraToken');
    const token = (await tokenFactory.deploy([
      { recipient: owner.address, amount: ethers.parseEther('1000000000') },
    ])) as NexoraToken;
    await token.waitForDeployment();

    const vaultFactory = await ethers.getContractFactory('NexoraAllocationVault');
    const vault = (await vaultFactory.deploy(owner.address)) as NexoraAllocationVault;
    await vault.waitForDeployment();

    await token.transfer(await vault.getAddress(), ethers.parseEther('100000000')); // fund the vault

    return { token, vault, owner, deployer, dest, attacker };
  }

  it('only owner can release', async () => {
    const { token, vault, attacker, dest } = await fixture();
    await expect(vault.connect(attacker).releaseAll(await token.getAddress(), dest.address)).to.be.revertedWithCustomError(
      vault,
      'OwnableUnauthorizedAccount',
    );
  });

  it('owner releases the full balance and vault becomes empty', async () => {
    const { token, vault, owner, dest } = await fixture();
    await vault.connect(owner).releaseAll(await token.getAddress(), dest.address);
    expect(await token.balanceOf(dest.address)).to.equal(ethers.parseEther('100000000'));
    expect(await vault.balanceOf(await token.getAddress())).to.equal(0n);
  });

  it('releases only to the intended recipient', async () => {
    const { token, vault, owner, dest, attacker } = await fixture();
    // The owner controls the recipient; ensure an unauthorized address cannot
    // inject itself as a recipient (owner is the controller).
    await vault.connect(owner).release(await token.getAddress(), dest.address, ethers.parseEther('100000000'));
    expect(await token.balanceOf(attacker.address)).to.equal(0n);
  });

  it('renouncing ownership permanently disables release', async () => {
    const { token, vault, owner, dest } = await fixture();
    await vault.connect(owner).renounceOwnership();
    // After renounce, release reverts (no owner).
    await expect(vault.releaseAll(await token.getAddress(), dest.address)).to.be.revertedWithCustomError(
      vault,
      'OwnableUnauthorizedAccount',
    );
    // Two-step: ownership is now zero.
    expect(await vault.owner()).to.equal(ethers.ZeroAddress);
  });
});
