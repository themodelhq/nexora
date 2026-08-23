import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import type { NexoraVoteToken, NexoraGovernor, TimelockController } from '../typechain-types';

const VOTING_DELAY = 1;
const VOTING_PERIOD = 30; // blocks
const PROPOSAL_THRESHOLD = 0n;
const QUORUM_NUMERATOR = 4; // 4%
const MIN_DELAY = 3600; // 1 hour

async function deployGovernance() {
  const [admin, alice, bob, carol] = await ethers.getSigners();

  const voteTokenFactory = await ethers.getContractFactory('NexoraVoteToken');
  const voteToken = (await voteTokenFactory.deploy(admin.address)) as NexoraVoteToken;
  await voteToken.waitForDeployment();

  // Mint voting tokens and delegate.
  await voteToken.connect(admin).mint(alice.address, ethers.parseEther('60000'));
  await voteToken.connect(admin).mint(bob.address, ethers.parseEther('30000'));
  await voteToken.connect(admin).mint(carol.address, ethers.parseEther('10000'));

  // Delegate votes (from their balances).
  await voteToken.connect(alice).delegate(alice.address);
  await voteToken.connect(bob).delegate(bob.address);
  await voteToken.connect(carol).delegate(carol.address);

  // Timelock.
  const timelockFactory = await ethers.getContractFactory('TimelockController');
  const timelock = (await timelockFactory.deploy(
    MIN_DELAY,
    [], // proposers
    [], // executors
    admin.address, // admin
  )) as TimelockController;
  await timelock.waitForDeployment();

  // Governor.
  const governorFactory = await ethers.getContractFactory('NexoraGovernor');
  const governor = (await governorFactory.deploy(
    await voteToken.getAddress(),
    await timelock.getAddress(),
    VOTING_DELAY,
    VOTING_PERIOD,
    PROPOSAL_THRESHOLD,
    QUORUM_NUMERATOR,
  )) as NexoraGovernor;
  await governor.waitForDeployment();

  // Set up roles: the governor proposes+executes via timelock.
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  await timelock.connect(admin).grantRole(PROPOSER_ROLE, await governor.getAddress());
  await timelock.connect(admin).grantRole(EXECUTOR_ROLE, await governor.getAddress());
  await timelock.connect(admin).grantRole(CANCELLER_ROLE, await governor.getAddress());
  // Revoke admin so the timelock is self-governing (optional).
  await timelock.connect(admin).renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), admin.address);

  // Fund the timelock so proposals can transfer tokens out of it.
  await voteToken.connect(admin).mint(await timelock.getAddress(), ethers.parseEther('10000'));

  return { admin, alice, bob, carol, voteToken, timelock, governor };
}

describe('NexoraGovernor', () => {
  it('deploys with expected settings', async () => {
    const { governor } = await loadFixture(deployGovernance);
    expect(await governor.name()).to.equal('NexoraGovernor');
    expect(await governor.votingDelay()).to.equal(VOTING_DELAY);
    expect(await governor.votingPeriod()).to.equal(VOTING_PERIOD);
  });

  it('proposal can be created by a voter and passes through to timelock', async () => {
    const { governor, alice, bob, carol, voteToken } = await loadFixture(deployGovernance);

    // Build a proposal: transfer some vote tokens to alice via timelock.
    const targets = [await voteToken.getAddress()];
    const values = [0n];
    const calldatas = [voteToken.interface.encodeFunctionData('transfer', [alice.address, ethers.parseEther('1')])];
    const description = 'Proposal #1: test';

    const proposalId = await governor.connect(alice).propose.staticCall(targets, values, calldatas, description);
    await (await governor.connect(alice).propose(targets, values, calldatas, description)).wait();

    // State is Pending during voting delay.
    expect(await governor.state(proposalId)).to.equal(0); // Pending

    // Advance past voting delay and cast votes.
    await time.advanceBlock(VOTING_DELAY + 1);

    // Alice votes For (weight = 60000), Bob Against (30000), Carol For (10000).
    await (await governor.connect(alice).castVote(proposalId, 1)).wait();
    await (await governor.connect(bob).castVote(proposalId, 0)).wait();
    await (await governor.connect(carol).castVote(proposalId, 1)).wait();

    // Quorum is 4% of total supply (100000) = 4000. For votes = 70000 > quorum.
    // Advance to end of voting period.
    await time.advanceBlock(VOTING_PERIOD + 1);
    expect(await governor.state(proposalId)).to.equal(4); // Succeeded

    // Queue through timelock.
    const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));
    await (await governor.queue(targets, values, calldatas, descriptionHash)).wait();
    expect(await governor.state(proposalId)).to.equal(5); // Queued

    // Advance past the timelock delay and execute.
    await time.increase(MIN_DELAY + 1);
    await (await governor.execute(targets, values, calldatas, descriptionHash)).wait();

    // Proposal executed and transfer happened.
    expect(await governor.state(proposalId)).to.equal(7); // Executed
    expect(await voteToken.balanceOf(alice.address)).to.equal(ethers.parseEther('60001'));
  });

  it('fails quorum if too few votes', async () => {
    const { governor, alice, voteToken } = await loadFixture(deployGovernance);
    const targets = [await voteToken.getAddress()];
    const values = [0n];
    const calldatas = [voteToken.interface.encodeFunctionData('transfer', [alice.address, ethers.parseEther('1')])];
    const description = 'Proposal with no votes';
    const proposalId = await governor.connect(alice).propose.staticCall(targets, values, calldatas, description);
    await (await governor.connect(alice).propose(targets, values, calldatas, description)).wait();
    await time.advanceBlock(VOTING_DELAY + VOTING_PERIOD + 2);
    // No one voted → below quorum → Defeated.
    expect(await governor.state(proposalId)).to.equal(3); // Defeated
  });
});
