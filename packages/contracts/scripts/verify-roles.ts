/**
 * Nexora — authoritative role verification after deployment.
 *
 * Reads the deployment manifest for the active network, builds the expected
 * final role table, and checks the live on-chain role state. Exits:
 *   0  if all required roles PASS
 *   1  if ANY critical role FAILS (usable in CI)
 *
 * Usage:
 *   npx hardhat run scripts/verify-roles.ts --network <network>
 */
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { buildRoleExpectations, verifyRoleTable, resolvePermanentAuthorities } from './roles';

async function main() {
  const network = require('hardhat').network.name;
  const manifestFile = path.resolve('deployments', `${network}.json`);
  if (!fs.existsSync(manifestFile)) {
    console.error(`No deployment manifest for network "${network}"`);
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const c = m.contracts;
  const deployer = m.deployer ?? process.env.DEPLOYER_ADDRESS ?? ethers.ZeroAddress;
  const isProduction = process.env.APP_ENV === 'production' || network === 'base';
  const treasuryDestination = m.treasury?.destination ?? ethers.ZeroAddress;

  // Resolve permanent authorities from config (or from the recorded manifest).
  const authorities = m.finalRoleState?.authorities
    ? {
        governance: m.finalRoleState.authorities.governanceTimelock,
        treasuryMultisig: m.finalRoleState.authorities.treasuryMultisig,
        emergencyAuthority: m.finalRoleState.authorities.emergencyAuthority,
      }
    : resolvePermanentAuthorities(isProduction, c.timelock ?? ethers.ZeroAddress, treasuryDestination);

  console.log(`=== Nexora role verification (${network}) ===\n`);

  const expectations = await buildRoleExpectations({
    contracts: c,
    deployer,
    governance: authorities.governance,
    authorities,
  });

  const { rows, allOk } = await verifyRoleTable(expectations);

  console.log('CONTRACT | ROLE | EXPECTED | ACTUAL HOLDER | STATUS');
  for (const r of rows) {
    console.log(
      `  ${r.c} | ${r.role} | ${r.expected ? 'HAS ROLE' : 'NO ROLE'} | has=${r.has} | ${r.ok ? 'PASS' : 'FAIL'}`,
    );
  }

  console.log('\n=== ' + (allOk ? 'ALL REQUIRED ROLES PASS' : 'CRITICAL ROLE CHECK(S) FAILED') + ' ===');
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
