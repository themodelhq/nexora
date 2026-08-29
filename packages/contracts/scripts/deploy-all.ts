

// ============================================================================
// NEXORA J-Y MAINNET AUTHORIZATION HARDENING
// ============================================================================
//
// SAFETY REQUIREMENTS:
//
// 1. Base Mainnet only
// 2. DEPLOY_TO_MAINNET=true
// 3. APP_ENV=production
// 4. --i-confirm explicitly supplied
// 5. Runtime chain ID must equal 8453
//
// This block MUST execute before any deployment operation.
// ============================================================================

function assertJYMainnetAuthorization(
  actualChainId: bigint | number
): void {

  const expectedChainId = 8453n;

  if (BigInt(actualChainId) !== expectedChainId) {
    throw new Error(
      `J-Y STOP: Wrong network. Expected Base Mainnet chain ID ` +
      `${expectedChainId}, received ${actualChainId}.`
    );
  }

  if (process.env.DEPLOY_TO_MAINNET !== "true") {
    throw new Error(
      "J-Y STOP: DEPLOY_TO_MAINNET=true is required."
    );
  }

  if (process.env.APP_ENV !== "production") {
    throw new Error(
      "J-Y STOP: APP_ENV=production is required."
    );
  }

  const args = process.argv.slice(2);

  if (!args.includes("--i-confirm")) {
    throw new Error(
      "J-Y STOP: Explicit --i-confirm authorization is required."
    );
  }

  console.log("");
  console.log("============================================================");
  console.log("J-Y MAINNET AUTHORIZATION");
  console.log("============================================================");
  console.log("Network       : Base Mainnet");
  console.log("Chain ID      : 8453");
  console.log("APP_ENV       : production");
  console.log("DEPLOY_TO_MAINNET : true");
  console.log("--i-confirm   : PRESENT");
  console.log("============================================================");
  console.log("");
}

// ============================================================================
// END J-Y MAINNET AUTHORIZATION HARDENING
// ============================================================================


/**
 * Nexora — full ecosystem deployment orchestrator (deterministic allocation).
 *
 * Deploys the entire contract suite in a deterministic, safe order:
 *   1. NexoraFactory (CREATE2) — provides pre-computable addresses.
 *   2. Allocation vaults (team, advisors, public-sale) via CREATE2, token-agnostic,
 *      deployed BEFORE the token so the fixed-supply token can mint to them.
 *   3. NXR token with the approved deterministic genesis allocation.
 *   4. Governance stack (NXVT, VoteWrapper, Timelock, Governor).
 *   5. Ecosystem contracts (Vesting, Staking, Treasury, Airdrop, Presale).
 *   6. AUTOMATIC vault release: team -> team Vesting, advisors -> advisor Vesting,
 *      public-sale -> Presale. No manual movement.
 *
 * Role hardening: wrapper is the ONLY NXVT minter (deployer MINTER revoked).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-all.ts --network localhost        # testnet fallback
 *   npx hardhat run scripts/deploy-all.ts --network baseSepolia
 *   APP_ENV=production npx hardhat run scripts/deploy-all.ts --network base
 */
import hre from 'hardhat';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { deploy, recordDeployment, verifyContract, deploymentsDir } from './helpers';
import { resolveAllocations, ALLOCATIONS, resolveVestingSchedules } from './deployment-config';
import {
  resolvePermanentAuthorities,
  performRoleHandoff,
  buildRoleExpectations,
  verifyRoleTable,
  validateTreasuryConfiguration,
} from './roles';

const VOTING_DELAY = 1;
const VOTING_PERIOD = 100;
const PROPOSAL_THRESHOLD = 0n;
const QUORUM_NUMERATOR = 4;
const TIMELOCK_MIN_DELAY = 3600;
const STAKING_DURATION = 30n * 24n * 3600n; // 30 days
const AIRDROP_DEADLINE_DAYS = 30;

/** Encode a contract's CREATE2 initcode = creation bytecode + encoded ctor args. */
async function initcodeFor(name: string, args: unknown[] = []): Promise<{ initcode: string }> {
  const factory = await ethers.getContractFactory(name);
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(factory.interface.deploy.inputs, args);
  const initcode = (factory.bytecode + encodedArgs.slice(2)) as string;
  return { initcode };
}

/**
 * Full deterministic deployment of the Nexora ecosystem.
 * Exported so `deploy-sepolia.ts` / `deploy-mainnet.ts` can import and call it
 * exactly once. When run directly (require.main === module) it executes.
 * Returns the deployment manifest (and throws on any failure).
 */
export async function main(): Promise<unknown> {
  const network = hre.network.name;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const isProduction = process.env.APP_ENV === 'production' || network === 'base';
  const [deployer] = await ethers.getSigners();

  // Idempotency: if a valid manifest already exists for this network and we are
  // NOT explicitly forcing a redeploy, reuse it (never duplicate the ecosystem).
  const manifestFile = path.join(deploymentsDir(), `${network}.json`);
  if (fs.existsSync(manifestFile) && process.env.FORCE_REDEPLOY !== 'true') {
    const existing = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (existing.chainId !== Number(chainId)) {
      throw new Error(
        `Existing deployment manifest for "${network}" has chainId ${existing.chainId}, ` +
          `but the connected chain is ${chainId}. Refusing to mix networks.`,
      );
    }
    console.log(`Deployment already recorded for "${network}" (chainId ${existing.chainId}). Reusing existing manifest.`);
    console.log('Set FORCE_REDEPLOY=true to intentionally redeploy the entire ecosystem (this overwrites the record).');
    return existing;
  }

  console.log(`Deploying Nexora suite on network="${network}" chainId=${chainId} (${isProduction ? 'PRODUCTION' : 'testnet'})`);
  console.log(`Deployer: ${deployer.address}`);

  const contracts: Record<string, string> = {};

  // ------------------------------------------------------------------
  // 1. CREATE2 factory.
  // ------------------------------------------------------------------
  const factory = await deploy('NexoraFactory');
  contracts.factory = factory;
  const factoryC = await ethers.getContractAt('NexoraFactory', factory);

  // ------------------------------------------------------------------
  // 2. Allocation vaults (token-agnostic, deployed before the token).
  //    Owner = deployer (temporary controller); released to destinations below.
  // ------------------------------------------------------------------
  const vaultAddresses: Record<string, string> = {};
  const vaultInitcode: Record<string, string> = {};
  const vaultInfo = ALLOCATIONS.filter((a) => a.kind === 'vault');
  for (const spec of vaultInfo) {
    const { initcode } = await initcodeFor('NexoraAllocationVault', [deployer.address]);
    vaultInitcode[spec.salt!] = initcode;
    const predicted = await factoryC.predictAddress(ethers.id(spec.salt!), initcode);
    // Deploy via CREATE2.
    const tx = await factoryC.deploy(ethers.id(spec.salt!), initcode);
    await tx.wait();
    vaultAddresses[spec.salt!] = predicted;
    console.log(`  deployed ${spec.bucket} vault -> ${predicted}`);
  }

  // ------------------------------------------------------------------
  // 3. Resolve + validate the genesis allocation (uses vault addresses).
  // ------------------------------------------------------------------
  const { entries: allocations, vaultRecipients, deploymentType } = resolveAllocations(
    deployer.address,
    isProduction,
    vaultAddresses,
  );
  console.log(`Allocation resolved (${deploymentType}), ${allocations.length} recipients, sum=${ethers.formatEther(allocations.reduce((a, e) => a + e.amount, 0n))} NXR`);
  for (const e of allocations) {
    console.log(`  ${ethers.formatEther(e.amount)} NXR -> ${e.recipient}`);
  }

  // Deploy the token with the deterministic genesis allocation.
  const token = await deploy('NexoraToken', [allocations.map((a) => ({ recipient: a.recipient, amount: a.amount }))]);
  contracts.nxrToken = token;

  // ------------------------------------------------------------------
  // 4. Governance stack.
  // ------------------------------------------------------------------
  const voteToken = await deploy('NexoraVoteToken', [deployer.address]);
  contracts.voteToken = voteToken;

  const voteWrapper = await deploy('NexoraVoteWrapper', [token, voteToken]);
  contracts.voteWrapper = voteWrapper;

  // Wrapper is the ONLY NXVT minter; revoke deployer MINTER.
  const vt = await ethers.getContractAt('NexoraVoteToken', voteToken);
  const MINTER = await vt.MINTER_ROLE();
  await vt.grantRole(MINTER, voteWrapper);
  if (await vt.hasRole(MINTER, deployer.address)) {
    await vt.revokeRole(MINTER, deployer.address);
    console.log('  revoked MINTER_ROLE from deployer (wrapper is now the only minter)');
  }

  const timelock = await deploy('TimelockController', [TIMELOCK_MIN_DELAY, [], [], deployer.address]);
  contracts.timelock = timelock;

  // Move the vote token's DEFAULT_ADMIN from the deployer to the timelock so
  // the deployer can no longer grant MINTER_ROLE to anyone after deployment.
  if (await vt.hasRole(await vt.DEFAULT_ADMIN_ROLE(), deployer.address)) {
    await vt.grantRole(await vt.DEFAULT_ADMIN_ROLE(), timelock);
    await vt.revokeRole(await vt.DEFAULT_ADMIN_ROLE(), deployer.address);
    console.log('  transferred vote token DEFAULT_ADMIN from deployer to timelock');
  }

  const governor = await deploy('NexoraGovernor', [
    voteToken, timelock, VOTING_DELAY, VOTING_PERIOD, PROPOSAL_THRESHOLD, QUORUM_NUMERATOR,
  ]);
  contracts.governor = governor;

  const timelockC = await ethers.getContractAt('TimelockController', timelock);
  await timelockC.grantRole(await timelockC.PROPOSER_ROLE(), governor);
  await timelockC.grantRole(await timelockC.EXECUTOR_ROLE(), governor);
  await timelockC.grantRole(await timelockC.CANCELLER_ROLE(), governor);

  // ------------------------------------------------------------------
  // 5. Ecosystem contracts.
  // ------------------------------------------------------------------
  // Two vesting instances: team + advisors (each holds its own allocation).
  contracts.vesting = await deploy('NexoraVesting', [token, deployer.address]); // team
  contracts.vestingAdvisors = await deploy('NexoraVesting', [token, deployer.address]); // advisors
  contracts.staking = await deploy('NexoraStaking', [token, deployer.address, STAKING_DURATION]);
  contracts.treasury = await deploy('NexoraTreasury', [deployer.address]);

  // Airdrop starts with a zero root; a real Merkle root must be set before claims.
  const airdropDeadline = BigInt(Math.floor(Date.now() / 1000)) + BigInt(AIRDROP_DEADLINE_DAYS) * 24n * 3600n;
  contracts.airdrop = await deploy('NexoraAirdrop', [token, ethers.ZeroHash, airdropDeadline, deployer.address]);
  contracts.presale = await deploy('NexoraPresale', [token, ethers.ZeroAddress, deployer.address]); // DISABLED by default

  // ------------------------------------------------------------------
  // 6. Automatic vault release into their real destinations.
  //    team -> team Vesting, advisors -> advisor Vesting, sale -> Presale.
  // ------------------------------------------------------------------
  const vaultByBucket: Record<string, string> = {};
  for (const spec of ALLOCATIONS) {
    if (spec.kind === 'vault') vaultByBucket[spec.bucket] = vaultAddresses[spec.salt!]!;
  }
  const release = async (bucket: string, dest: string) => {
    const vaultAddr = vaultByBucket[bucket];
    if (!vaultAddr) return;
    const vault = await ethers.getContractAt('NexoraAllocationVault', vaultAddr);
    await vault.releaseAll(token, dest);
    console.log(`  released ${bucket} vault -> ${dest}`);
  };
  await release('team', contracts.vesting!);
  await release('advisors', contracts.vestingAdvisors!);
  await release('public-sale', contracts.presale!);

  // Allocation vaults are one-shot deployment escrows. After their tokens are
  // released they retain no purpose; renounce ownership so no deployer (or any
  // single party) retains administrative power over them. Only renounce after
  // verifying each vault is empty.
  for (const spec of ALLOCATIONS) {
    if (spec.kind !== 'vault') continue;
    const vaultAddr = vaultAddresses[spec.salt!];
    if (!vaultAddr) continue;
    const vault = await ethers.getContractAt('NexoraAllocationVault', vaultAddr);
    const bal = await vault.balanceOf(token);
    if (bal !== 0n) {
      throw new Error(`Vault ${spec.bucket} not empty (${bal}) before renounce — refusing to renounce ownership`);
    }
    await vault.renounceOwnership();
    console.log(`  renounced ownership of ${spec.bucket} vault (empty)`);
  }

  // ------------------------------------------------------------------
  // 6b. Create explicit vesting schedules (team + advisors) once the vault
  //     tokens are funded into the vesting contracts. Refuses on invalid or
  //     missing production configuration.
  // ------------------------------------------------------------------
  // Start vesting 1 hour in the future so createSchedule (which requires
  // start >= block.timestamp) never fails mid-deployment.
  const schedules = resolveVestingSchedules(isProduction, BigInt(Math.floor(Date.now() / 1000)) + 3600n);
  const vestingC = await ethers.getContractAt('NexoraVesting', contracts.vesting!);
  const vestingAdvC = await ethers.getContractAt('NexoraVesting', contracts.vestingAdvisors!);
  const sTeam = schedules.team;
  const sAdv = schedules.advisors;
  // Team schedule.
  await vestingC.createSchedule(
    sTeam.beneficiary,
    sTeam.totalAmount,
    sTeam.start,
    sTeam.cliff,
    sTeam.duration,
    sTeam.revocable,
  );
  console.log(`  team vesting schedule: beneficiary=${sTeam.beneficiary} amount=${ethers.formatEther(sTeam.totalAmount)} start=${sTeam.start} cliff=${sTeam.cliff} dur=${sTeam.duration}`);
  // Advisor schedule.
  await vestingAdvC.createSchedule(
    sAdv.beneficiary,
    sAdv.totalAmount,
    sAdv.start,
    sAdv.cliff,
    sAdv.duration,
    sAdv.revocable,
  );
  console.log(`  advisor vesting schedule: beneficiary=${sAdv.beneficiary} amount=${ethers.formatEther(sAdv.totalAmount)} start=${sAdv.start} cliff=${sAdv.cliff} dur=${sAdv.duration}`);

  // ------------------------------------------------------------------
  // 6c. Treasury + staking role handoff (Phase 2/3).
  //     Permanent authority: governance timelock (DEFAULT_ADMIN), treasury
  //     multisig (OPERATOR / REWARD_GRANTOR), emergency authority (PAUSER).
  //     Deployer keeps roles ONLY temporarily and is revoked once the
  //     permanent roles are granted + verified. Never revokes the last admin.
  // ------------------------------------------------------------------
  const treasuryDestination = allocations[ALLOCATIONS.findIndex((a) => a.bucket === 'treasury')]?.recipient!;
  const authorities = resolvePermanentAuthorities(isProduction, timelock, treasuryDestination);

  // Treasury relationship (Option A): in production the treasury destination
  // and the treasury multisig must be the SAME Safe.
  const treasuryConfigErrors = validateTreasuryConfiguration({
    treasuryAddress: treasuryDestination,
    treasuryMultisig: authorities.treasuryMultisig,
    deployer: deployer.address,
    isProduction,
  });
  if (treasuryConfigErrors.length > 0) {
    throw new Error('Invalid treasury configuration: ' + treasuryConfigErrors.join('; '));
  }

  // Perform the role handoff across ALL privileged contracts (Timelock,
  // Treasury, Staking, Team/Advisor Vesting, Airdrop, Presale, VoteToken).
  await performRoleHandoff({
    contracts: {
      treasuryAddr: contracts.treasury!,
      stakingAddr: contracts.staking!,
      voteTokenAddr: voteToken,
      voteWrapperAddr: voteWrapper,
      timelockAddr: timelock,
      teamVestingAddr: contracts.vesting!,
      advisorVestingAddr: contracts.vestingAdvisors!,
      airdropAddr: contracts.airdrop!,
      presaleAddr: contracts.presale!,
    },
    deployer: deployer.address,
    governance: timelock,
    authorities,
    log: (s) => console.log(s),
  });

  // Build + verify the authoritative role table (exit non-zero on failure).
  const expectations = await buildRoleExpectations({
    contracts,
    deployer: deployer.address,
    governance: timelock,
    authorities,
  });
  const { rows, allOk } = await verifyRoleTable(expectations);
  console.log('\nCONTRACT | ROLE | EXPECTED | ACTUAL | STATUS');
  for (const r of rows) {
    console.log(`  ${r.c} | ${r.role} | ${r.expected ? 'HAS' : 'MUST NOT HAVE'} | has=${r.has} | ${r.ok ? 'PASS' : 'FAIL'}`);
  }
  if (!allOk) {
    throw new Error('Role handoff verification failed — aborting before writing manifest');
  }
  const finalRoleState = {
    authorities: {
      governanceTimelock: authorities.governance,
      treasuryMultisig: authorities.treasuryMultisig,
      emergencyAuthority: authorities.emergencyAuthority,
    },
    roleTable: rows.map((r) => ({ contract: r.c, role: r.role, expected: r.expected, actual: r.has, status: r.ok ? 'PASS' : 'FAIL' })),
  };

  // ------------------------------------------------------------------
  // 7. Record, write manifest, verify.
  // ------------------------------------------------------------------
  const manifest = {
    network,
    chainId: Number(chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    version: '0.1.0',
    gitCommit: process.env.GITHUB_SHA ?? 'unknown',
    deploymentType,
    contracts,
    allocation: allocations.map((a) => ({ recipient: a.recipient, amount: a.amount.toString() })),
    treasury: {
      allocationAmount: '150000000000000000000000000',
      destination: treasuryDestination,
      multisig: authorities.treasuryMultisig,
      controller: authorities.treasuryMultisig,
      contract: contracts.treasury,
    },
    vestingSchedules: {
      team: { beneficiary: sTeam.beneficiary, amount: sTeam.totalAmount.toString(), start: sTeam.start.toString(), cliff: sTeam.cliff.toString(), duration: sTeam.duration.toString(), revocable: sTeam.revocable, contract: contracts.vesting },
      advisors: { beneficiary: sAdv.beneficiary, amount: sAdv.totalAmount.toString(), start: sAdv.start.toString(), cliff: sAdv.cliff.toString(), duration: sAdv.duration.toString(), revocable: sAdv.revocable, contract: contracts.vestingAdvisors },
    },
    roles: {
      governanceTimelock: authorities.governance,
      treasuryMultisig: authorities.treasuryMultisig,
      emergencyAuthority: authorities.emergencyAuthority,
      voteTokenMinter: voteWrapper,
      governor,
      timelock,
      treasuryOperator: authorities.treasuryMultisig,
      stakingRewardGrantor: authorities.treasuryMultisig,
      vestingManager: authorities.governance,
      vestingRecovery: authorities.treasuryMultisig,
      airdropAdmin: authorities.governance,
      presaleManager: authorities.governance,
    },
    finalRoleState,
    finalizationStatus: 'FINALIZED',
    verificationStatus: 'NOT VERIFIED',
    presaleStatus: 'DISABLED',
    airdropStatus: 'DISABLED',
  };
  const file = path.join(deploymentsDir(), `${network}.json`);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  console.log(`Deployment manifest written: ${file}`);

  if (network === 'baseSepolia') {
    fs.writeFileSync(path.join(deploymentsDir(), 'base-sepolia.json'), JSON.stringify(manifest, null, 2));
  }
  if (network === 'base') {
    fs.writeFileSync(path.join(deploymentsDir(), 'base.json'), JSON.stringify(manifest, null, 2));
  }

  recordDeployment({ network, chainId: Number(chainId), deployedAt: manifest.deployedAt, contracts });
  console.log('\nAll contracts deployed.');
  for (const [name, addr] of Object.entries(contracts)) {
    console.log(`  ${name}: ${addr}`);
  }
  return manifest;
}

// Run only when this file is the entry point (never merely because it is imported).
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
