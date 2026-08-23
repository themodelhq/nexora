import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import type { NexoraToken, NexoraFactory, NexoraAllocationVault, NexoraVesting, NexoraPresale, NexoraVoteToken, NexoraVoteWrapper } from '../typechain-types';

const MAX = ethers.parseEther('1000000000');

/** Mirrors the deployment-config bucket amounts for validation. */
const BUCKETS = {
  community: ethers.parseEther('350000000'),
  liquidity: ethers.parseEther('150000000'),
  treasury: ethers.parseEther('150000000'),
  team: ethers.parseEther('100000000'),
  advisors: ethers.parseEther('50000000'),
  sale: ethers.parseEther('100000000'),
  development: ethers.parseEther('100000000'),
};

async function deployFullFixture() {
  const [deployer, admin] = await ethers.getSigners();

  // 1. Factory + vaults (token-agnostic, before token).
  const factory = (await (await ethers.getContractFactory('NexoraFactory')).deploy()) as NexoraFactory;
  await factory.waitForDeployment();

  const vaultFactory = await ethers.getContractFactory('NexoraAllocationVault');
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(vaultFactory.interface.deploy.inputs, [deployer.address]);
  const initcode = (vaultFactory.bytecode + encodedArgs.slice(2));
  const salts = ['nexora-team-vault', 'nexora-advisor-vault', 'nexora-sale-vault'];
  const vaultAddrs: string[] = [];
  for (const s of salts) {
    const salt = ethers.id(s);
    const predicted = await factory.predictAddress(salt, initcode);
    await (await factory.deploy(salt, initcode)).wait();
    vaultAddrs.push(predicted);
  }
  const [teamVault, advisorVault, saleVault] = vaultAddrs;

  // 2. Allocation recipients (all distinct; admin is signer[1]).
  const signers = await ethers.getSigners();
  const c1 = signers[2];
  const c2 = signers[3];
  const c3 = signers[4];
  const dev = signers[5];
  const allocations = [
    { recipient: c1.address, amount: BUCKETS.community },
    { recipient: c2.address, amount: BUCKETS.liquidity },
    { recipient: c3.address, amount: BUCKETS.treasury },
    { recipient: teamVault, amount: BUCKETS.team },
    { recipient: advisorVault, amount: BUCKETS.advisors },
    { recipient: saleVault, amount: BUCKETS.sale },
    { recipient: dev.address, amount: BUCKETS.development },
  ];

  // 3. Token.
  const token = (await (await ethers.getContractFactory('NexoraToken')).deploy(allocations)) as NexoraToken;
  await token.waitForDeployment();

  // 4. Vesting (team + advisors), presale, then auto-release vaults.
  const vesting = (await (await ethers.getContractFactory('NexoraVesting')).deploy(await token.getAddress(), deployer.address)) as NexoraVesting;
  const vestingAdvisors = (await (await ethers.getContractFactory('NexoraVesting')).deploy(await token.getAddress(), deployer.address)) as NexoraVesting;
  const presale = (await (await ethers.getContractFactory('NexoraPresale')).deploy(await token.getAddress(), ethers.ZeroAddress, deployer.address)) as NexoraPresale;

  const tv = await ethers.getContractAt('NexoraAllocationVault', teamVault);
  const av = await ethers.getContractAt('NexoraAllocationVault', advisorVault);
  const sv = await ethers.getContractAt('NexoraAllocationVault', saleVault);
  await tv.releaseAll(await token.getAddress(), await vesting.getAddress());
  await av.releaseAll(await token.getAddress(), await vestingAdvisors.getAddress());
  await sv.releaseAll(await token.getAddress(), await presale.getAddress());

  return { token, vesting, vestingAdvisors, presale, deployer, admin, teamVault, advisorVault, saleVault, allocations };
}

describe('Genesis allocation architecture (vaults + auto-release)', () => {
  it('total supply == 1B and full supply is accounted across final destinations', async () => {
    const f = await loadFixture(deployFullFixture);
    expect(await f.token.totalSupply()).to.equal(MAX);
    // Final holders: external recipients + vesting + advisor vesting + presale.
    const signers = await ethers.getSigners();
    let sum = 0n;
    for (const idx of [2, 3, 4, 5]) sum += await f.token.balanceOf(signers[idx].address);
    sum += await f.token.balanceOf(await f.vesting.getAddress());
    sum += await f.token.balanceOf(await f.vestingAdvisors.getAddress());
    sum += await f.token.balanceOf(await f.presale.getAddress());
    expect(sum).to.equal(MAX);
  });

  it('deployer receives no unintended allocation', async () => {
    const f = await loadFixture(deployFullFixture);
    expect(await f.token.balanceOf(f.deployer.address)).to.equal(0n);
  });

  it('all allocation recipients are distinct and non-zero', async () => {
    const f = await loadFixture(deployFullFixture);
    const addrs = f.allocations.map((a) => a.recipient.toLowerCase());
    expect(new Set(addrs).size).to.equal(addrs.length);
    for (const a of f.allocations) expect(a.recipient).to.not.equal(ethers.ZeroAddress);
  });

  it('vaults are drained into their real destinations (team/advisor/sale)', async () => {
    const f = await loadFixture(deployFullFixture);
    // Vaults empty.
    expect(await f.token.balanceOf(f.teamVault)).to.equal(0n);
    expect(await f.token.balanceOf(f.advisorVault)).to.equal(0n);
    expect(await f.token.balanceOf(f.saleVault)).to.equal(0n);
    // Destinations funded.
    expect(await f.token.balanceOf(await f.vesting.getAddress())).to.equal(BUCKETS.team);
    expect(await f.token.balanceOf(await f.vestingAdvisors.getAddress())).to.equal(BUCKETS.advisors);
    expect(await f.token.balanceOf(await f.presale.getAddress())).to.equal(BUCKETS.sale);
  });

  it('explicit external destinations hold their exact amounts', async () => {
    const f = await loadFixture(deployFullFixture);
    const signers = await ethers.getSigners();
    expect(await f.token.balanceOf(signers[2].address)).to.equal(BUCKETS.community);
    expect(await f.token.balanceOf(signers[3].address)).to.equal(BUCKETS.liquidity);
    expect(await f.token.balanceOf(signers[4].address)).to.equal(BUCKETS.treasury);
    expect(await f.token.balanceOf(signers[5].address)).to.equal(BUCKETS.development);
  });

  it('allocation is auditable: each bucket balance matches tokenomics', async () => {
    const f = await loadFixture(deployFullFixture);
    const signers = await ethers.getSigners();
    const checks: [string, bigint, bigint][] = [
      [signers[2].address, BUCKETS.community, 350_000_000n * 10n ** 18n],
      [signers[3].address, BUCKETS.liquidity, 150_000_000n * 10n ** 18n],
      [signers[4].address, BUCKETS.treasury, 150_000_000n * 10n ** 18n],
    ];
    for (const [addr, a, b] of checks) {
      expect(await f.token.balanceOf(addr)).to.equal(a);
      expect(a).to.equal(b);
    }
  });
});
