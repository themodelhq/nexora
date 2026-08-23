import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import type { NexoraToken } from '../typechain-types';

const MAX_SUPPLY = ethers.parseEther('1000000000'); // 1,000,000,000 NXR
const ONE_NXR = ethers.parseEther('1');

describe('NexoraToken', () => {
  async function deployFixture() {
    const [deployer, community, liquidity, treasury, team, advisor, sale, devGrants, alice, bob] =
      await ethers.getSigners();

    const allocations = [
      { recipient: community.address, amount: ethers.parseEther('350000000') }, // 35%
      { recipient: liquidity.address, amount: ethers.parseEther('150000000') }, // 15%
      { recipient: treasury.address, amount: ethers.parseEther('150000000') }, // 15%
      { recipient: team.address, amount: ethers.parseEther('100000000') }, // 10%
      { recipient: advisor.address, amount: ethers.parseEther('50000000') }, // 5%
      { recipient: sale.address, amount: ethers.parseEther('100000000') }, // 10%
      { recipient: devGrants.address, amount: ethers.parseEther('100000000') }, // 10%
    ];

    const factory = await ethers.getContractFactory('NexoraToken');
    const token = (await factory.deploy(allocations)) as NexoraToken;
    await token.waitForDeployment();

    return { token, deployer, community, liquidity, treasury, team, advisor, sale, devGrants, alice, bob };
  }

  describe('Deployment & supply', () => {
    it('has correct name, symbol, decimals', async () => {
      const { token } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal('Nexora');
      expect(await token.symbol()).to.equal('NXR');
      expect(await token.decimals()).to.equal(18);
    });

    it('has a fixed maximum supply of 1,000,000,000', async () => {
      const { token } = await loadFixture(deployFixture);
      expect(await token.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });

    it('mints the entire supply at construction (totalSupply == MAX_SUPPLY)', async () => {
      const { token } = await loadFixture(deployFixture);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it('reverts if allocation total does not equal max supply', async () => {
      const [, a, b] = await ethers.getSigners();
      const factory = await ethers.getContractFactory('NexoraToken');
      const tooLittle = [
        { recipient: a.address, amount: ethers.parseEther('500000000') },
        { recipient: b.address, amount: ethers.parseEther('499999999') }, // one short
      ];
      await expect(factory.deploy(tooLittle)).to.be.revertedWith('NexoraToken: allocation total mismatch');
    });

    it('reverts on zero recipient', async () => {
      const [, a] = await ethers.getSigners();
      const factory = await ethers.getContractFactory('NexoraToken');
      const bad = [
        { recipient: ethers.ZeroAddress, amount: MAX_SUPPLY },
        { recipient: a.address, amount: 0 },
      ];
      await expect(factory.deploy(bad)).to.be.revertedWith('NexoraToken: zero recipient');
    });

    it('reverts on zero amount', async () => {
      const [, a] = await ethers.getSigners();
      const factory = await ethers.getContractFactory('NexoraToken');
      const bad = [{ recipient: a.address, amount: 0 }];
      await expect(factory.deploy(bad)).to.be.revertedWith('NexoraToken: zero amount');
    });

    it('reverts if no allocations provided', async () => {
      const factory = await ethers.getContractFactory('NexoraToken');
      await expect(factory.deploy([])).to.be.revertedWith('NexoraToken: no allocations');
    });

    it('reverts on a duplicate recipient (address appearing twice)', async () => {
      const [, a, b] = await ethers.getSigners();
      const factory = await ethers.getContractFactory('NexoraToken');
      const dup = [
        { recipient: a.address, amount: ethers.parseEther('600000000') },
        { recipient: b.address, amount: ethers.parseEther('200000000') },
        { recipient: a.address, amount: ethers.parseEther('200000000') }, // duplicate
      ];
      await expect(factory.deploy(dup)).to.be.revertedWith('NexoraToken: duplicate recipient');
    });

    it('the sum of all allocation recipients equals the total supply', async () => {
      const { token, community, liquidity, treasury, team, advisor, sale, devGrants } =
        await loadFixture(deployFixture);
      const sum =
        (await token.balanceOf(community.address)) +
        (await token.balanceOf(liquidity.address)) +
        (await token.balanceOf(treasury.address)) +
        (await token.balanceOf(team.address)) +
        (await token.balanceOf(advisor.address)) +
        (await token.balanceOf(sale.address)) +
        (await token.balanceOf(devGrants.address));
      expect(sum).to.equal(MAX_SUPPLY);
    });
  });

  describe('Initial allocation transparency', () => {
    it('credits each recipient the expected amount', async () => {
      const { token, community, liquidity, treasury, team, advisor, sale, devGrants } =
        await loadFixture(deployFixture);
      expect(await token.balanceOf(community.address)).to.equal(ethers.parseEther('350000000'));
      expect(await token.balanceOf(liquidity.address)).to.equal(ethers.parseEther('150000000'));
      expect(await token.balanceOf(treasury.address)).to.equal(ethers.parseEther('150000000'));
      expect(await token.balanceOf(team.address)).to.equal(ethers.parseEther('100000000'));
      expect(await token.balanceOf(advisor.address)).to.equal(ethers.parseEther('50000000'));
      expect(await token.balanceOf(sale.address)).to.equal(ethers.parseEther('100000000'));
      expect(await token.balanceOf(devGrants.address)).to.equal(ethers.parseEther('100000000'));
    });

    it('records the allocation count', async () => {
      const { token } = await loadFixture(deployFixture);
      expect(await token.allocationCount()).to.equal(7n);
    });

    it('emits InitialAllocation for each recipient', async () => {
      const { token, community } = await loadFixture(deployFixture);
      const filter = token.filters.InitialAllocation();
      const events = await token.queryFilter(filter);
      expect(events.length).to.equal(7);
      expect(events[0]?.args.recipient).to.equal(community.address);
      expect(events[0]?.args.amount).to.equal(ethers.parseEther('350000000'));
    });
  });

  describe('Standard ERC-20 behaviour', () => {
    it('transfers tokens between holders', async () => {
      const { token, community, alice } = await loadFixture(deployFixture);
      await token.connect(community).transfer(alice.address, ONE_NXR * 100n);
      expect(await token.balanceOf(alice.address)).to.equal(ONE_NXR * 100n);
      expect(await token.balanceOf(community.address)).to.equal(ethers.parseEther('350000000') - ONE_NXR * 100n);
    });

    it('allows approve + transferFrom (allowance flow)', async () => {
      const { token, community, alice, bob } = await loadFixture(deployFixture);
      await token.connect(community).approve(alice.address, ONE_NXR * 50n);
      expect(await token.allowance(community.address, alice.address)).to.equal(ONE_NXR * 50n);
      await token.connect(alice).transferFrom(community.address, bob.address, ONE_NXR * 25n);
      expect(await token.balanceOf(bob.address)).to.equal(ONE_NXR * 25n);
      expect(await token.allowance(community.address, alice.address)).to.equal(ONE_NXR * 25n);
    });

    it('reverts transfer when sender has insufficient balance', async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(token.connect(alice).transfer(bob.address, ONE_NXR)).to.be.reverted;
    });

    it('supports Permit (off-chain approval)', async () => {
      const { token, deployer, alice } = await loadFixture(deployFixture);
      const { chainId } = await ethers.provider.getNetwork();
      const nonce = await token.nonces(deployer.address);
      const deadline = BigInt((await time.latest()) + 3600);
      const domain = {
        name: 'Nexora',
        version: '1',
        chainId: Number(chainId),
        verifyingContract: await token.getAddress(),
      };
      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };
      const value = { owner: deployer.address, spender: alice.address, value: ONE_NXR * 10n, nonce, deadline };
      const signature = await deployer.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);
      await token.permit(deployer.address, alice.address, ONE_NXR * 10n, deadline, v, r, s);
      expect(await token.allowance(deployer.address, alice.address)).to.equal(ONE_NXR * 10n);
    });
  });

  describe('Fixed supply guarantees', () => {
    it('cannot be minted (no mint function exists)', async () => {
      const { token } = await loadFixture(deployFixture);
      // A contract that has no owner/mint cannot add supply.
      const any = token as unknown as { mint: (to: string, amount: bigint) => Promise<unknown> };
      expect(typeof any.mint).to.equal('undefined');
    });

    it('totalSupply can never exceed max supply', async () => {
      const { token } = await loadFixture(deployFixture);
      expect(await token.totalSupply()).to.equal(await token.MAX_SUPPLY());
    });
  });
});
