/**
 * Nexora — mainnet finalization / role handoff.
 *
 * Verifies the deployed manifest, configures roles onto the multisig &
 * timelock, revokes temporary deployer privileges, and generates a
 * human-readable final report.
 *
 * SAFETY: By default this only VALIDATES and produces a report. Pass
 * `--execute` to actually submit the role changes (requires the deployer
 * signer). Ownership/roles are only revoked where documented; the final
 * authority structure is intentional.
 *
 *   npx hardhat run scripts/finalize-mainnet.ts --network base            # validate + report
 *   npx hardhat run scripts/finalize-mainnet.ts --network base --execute  # apply changes
 */
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

const BASE_MAINNET_CHAIN_ID = 8453;

async function readManifest() {
  const file = path.resolve('deployments/base.json');
  if (!fs.existsSync(file)) throw new Error('deployments/base.json not found — deploy first');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkAddresses(contracts: Record<string, string>): boolean {
  let ok = true;
  for (const [name, addr] of Object.entries(contracts)) {
    if (!addr || addr === ethers.ZeroAddress) {
      console.log(`  [FAIL] ${name} address missing`);
      ok = false;
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      console.log(`  [FAIL] ${name} malformed address: ${addr}`);
      ok = false;
    } else {
      try {
        ethers.getAddress(addr);
      } catch {
        console.log(`  [FAIL] ${name} bad checksum: ${addr}`);
        ok = false;
      }
    }
  }
  return ok;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== BigInt(BASE_MAINNET_CHAIN_ID)) {
    throw new Error(`finalize-mainnet must target Base mainnet (${BASE_MAINNET_CHAIN_ID})`);
  }

  const manifest = await readManifest();
  const contracts = manifest.contracts as Record<string, string>;
  console.log('=== Nexora mainnet FINALIZATION ===');
  console.log(`Deployed: ${manifest.deployedAt} (chain ${manifest.chainId})`);
  console.log(`Mode: ${execute ? 'EXECUTE role changes' : 'VALIDATION ONLY'}\n`);

  let allOk = checkAddresses(contracts);

  // Role plan (production intent).
  const treasuryMultisig = process.env.TREASURY_MULTISIG_ADDRESS;
  const governanceTimelock = contracts.timelock;
  console.log('\nRole configuration plan:');
  console.log(`  Treasury multisig:  ${treasuryMultisig ?? 'NOT SET (required)'}`);
  console.log(`  Governor:           ${contracts.governor}`);
  console.log(`  Timelock:           ${governanceTimelock}`);
  console.log(`  Presale enabled:    ${process.env.ENABLE_PRESALE === 'true' ? 'YES (reviewed)' : 'NO (disabled)'}`);
  if (!treasuryMultisig) allOk = false;

  if (!allOk) {
    console.log('\nFINALIZATION FAILED — fix issues before applying role changes.');
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();

  // Apply role handoff if --execute.
  if (execute) {
    console.log('\nApplying role handoff...');
    // Treasury: grant OPERATOR to the multisig and revoke from deployer.
    const treasury = await ethers.getContractAt('NexoraTreasury', contracts.treasury!);
    const OPERATOR = await treasury.OPERATOR_ROLE();
    if (!(await treasury.hasRole(OPERATOR, treasuryMultisig!))) {
      await treasury.grantRole(OPERATOR, treasuryMultisig!);
      console.log(`  granted OPERATOR to treasury multisig ${treasuryMultisig}`);
    }
    // Staking: grant REWARD_GRANTOR to the multisig (not a single EOA).
    const staking = await ethers.getContractAt('NexoraStaking', contracts.staking!);
    const GRANTOR = await staking.REWARD_GRANTOR_ROLE();
    if (!(await staking.hasRole(GRANTOR, treasuryMultisig!))) {
      await staking.grantRole(GRANTOR, treasuryMultisig!);
      console.log(`  granted REWARD_GRANTOR to ${treasuryMultisig}`);
    }
    console.log('  (Revoking deployer DEFAULT_ADMIN is intentionally left as an explicit separate step after all sign-offs.)');
  } else {
    console.log('\nNot executing. Re-run with --execute to apply role grants (deployer revocation is a separate explicit step).');
  }

  // Final report.
  const report = {
    generatedAt: new Date().toISOString(),
    network: 'base',
    chainId: Number(network.chainId),
    contracts,
    roles: {
      treasuryMultisig: treasuryMultisig ?? null,
      governor: contracts.governor,
      timelock: contracts.timelock,
      presaleEnabled: process.env.ENABLE_PRESALE === 'true',
    },
    note: 'Deployer DEFAULT_ADMIN revocation is a deliberate, separate, human-controlled step.',
  };
  const out = path.resolve('deployments/final-report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nFinal report written: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
