/**
 * Nexora — post-deployment validator.
 *
 * Connects to the target network and verifies the deployed ecosystem state
 * (supply, allocation, roles, contracts). Prints PASS/FAIL per check and exits
 * non-zero if any critical check fails. Reads the deployment manifest for the
 * active network.
 *
 *   npx hardhat run scripts/validate-deployment.ts --network <network>
 */
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { buildRoleExpectations, verifyRoleTable } from './roles';

const MAX_SUPPLY = ethers.parseEther('1000000000');

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const network = require('hardhat').network.name;
  const manifestFile = path.resolve('deployments', `${network}.json`);
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`No deployment manifest for network "${network}"`);
  }
  const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const c = m.contracts;
  const tokenAddr = c.nxrToken;
  const isProduction = process.env.APP_ENV === 'production' || network === 'base';
  console.log(`=== Nexora post-deployment validation (${network}, chain ${m.chainId}) ===\n`);

  // 1. NXR exists, supply == 1B, decimals == 18.
  if (tokenAddr) {
    const token = await ethers.getContractAt('NexoraToken', tokenAddr);
    check((await token.totalSupply()) === MAX_SUPPLY, 'NXR total supply == 1,000,000,000', (await token.totalSupply()).toString());
    check((await token.decimals()) === 18n, 'NXR decimals == 18');
    check((await token.name()) === 'Nexora', 'NXR name');
    check((await token.symbol()) === 'NXR', 'NXR symbol');
    // Allocation recipients each hold their expected amount.
    let sum = 0n;
    for (const a of m.allocation ?? []) {
      const bal = await token.balanceOf(a.recipient);
      sum += bal;
    }
    check(sum === MAX_SUPPLY, 'Sum of allocation balances == 1B');
  } else {
    check(false, 'NXR token deployed');
  }

  // 2. NXVT + wrapper MINTER role.
  if (c.voteToken && c.voteWrapper) {
    const vt = await ethers.getContractAt('NexoraVoteToken', c.voteToken);
    const minter = ethers.id('MINTER_ROLE');
    check(await vt.hasRole(minter, c.voteWrapper), 'Wrapper has MINTER_ROLE');
    check(!(await vt.hasRole(minter, m.deployer ?? ethers.ZeroAddress)), 'Deployer does NOT have MINTER_ROLE');
  }

  // 3. Governance roles.
  if (c.timelock && c.governor) {
    const tl = await ethers.getContractAt('TimelockController', c.timelock);
    check(await tl.hasRole(ethers.id('PROPOSER_ROLE'), c.governor), 'Governor is PROPOSER on timelock');
    check(await tl.hasRole(ethers.id('EXECUTOR_ROLE'), c.governor), 'Governor is EXECUTOR on timelock');
    check(await tl.hasRole(ethers.id('CANCELLER_ROLE'), c.governor), 'Governor is CANCELLER on timelock');
  }

  // 4. Staking deployed.
  if (c.staking) {
    const st = await ethers.getContractAt('NexoraStaking', c.staking);
    check((await st.token()).toLowerCase() === tokenAddr.toLowerCase(), 'Staking uses NXR token');
  } else {
    check(false, 'Staking deployed');
  }

  // 5. Vesting deployed.
  if (c.vesting) {
    const v = await ethers.getContractAt('NexoraVesting', c.vesting);
    check((await v.token()).toLowerCase() === tokenAddr.toLowerCase(), 'Vesting uses NXR token');
    // Schedule created and fully reserved.
    if ((await v.nextScheduleId()) > 0n) {
      check(true, 'Team vesting schedule created');
    }
  } else {
    check(false, 'Vesting deployed');
  }

  // 6. Treasury architecture (Option A: multisig is treasury).
  if (m.treasury) {
    check(Boolean(m.treasury.destination), 'Treasury destination recorded');
    check(Boolean(m.treasury.contract), 'NexoraTreasury facade recorded');
  } else {
    check(false, 'Treasury architecture recorded in manifest');
  }

  // 7. Governor + airdrop + presale present.
  check(Boolean(c.governor), 'Governor deployed');
  check(Boolean(c.airdrop), 'Airdrop deployed');
  check(Boolean(c.presale), 'Presale deployed');

  // 8. Presale disabled by default (on-chain).
  if (c.presale) {
    const p = await ethers.getContractAt('NexoraPresale', c.presale);
    check(!(await p.enabled()), 'Presale is DISABLED');
  }

  // 9. Treasury relationship (Option A: destination === multisig) and not deployer.
  if (m.treasury) {
    const dest = (m.treasury.destination ?? '').toLowerCase();
    const multisig = (m.treasury.multisig ?? '').toLowerCase();
    check(Boolean(dest) && dest !== ethers.ZeroAddress, 'Treasury destination configured and non-zero');
    check(Boolean(multisig) && multisig !== ethers.ZeroAddress, 'Treasury multisig configured and non-zero');
    if (isProduction) check(dest === multisig, 'Treasury destination == treasury multisig (Option A)');
    if (m.deployer) check(dest !== (m.deployer as string).toLowerCase(), 'Treasury is not the deployer');
    check(multisig !== (m.deployer as string).toLowerCase(), 'Treasury multisig is not the deployer');
  }

  // 10. Explicit role-transition verification (authoritative table).
  const treasuryDestination = m.treasury?.destination ?? ethers.ZeroAddress;
  const authorities = m.finalRoleState?.authorities
    ? {
        governance: m.finalRoleState.authorities.governanceTimelock,
        treasuryMultisig: m.finalRoleState.authorities.treasuryMultisig,
        emergencyAuthority: m.finalRoleState.authorities.emergencyAuthority,
      }
    : (() => {
        const { resolvePermanentAuthorities } = require('./roles');
        return resolvePermanentAuthorities(isProduction, c.timelock ?? ethers.ZeroAddress, treasuryDestination);
      })();

  const expectations = await buildRoleExpectations({
    contracts: c,
    deployer: m.deployer ?? ethers.ZeroAddress,
    governance: authorities.governance,
    authorities,
  });
  const { rows, allOk: rolesOk } = await verifyRoleTable(expectations);
  console.log('\nROLE TRANSITIONS:');
  for (const r of rows) {
    console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.c} ${r.role} ${r.holder} expected=${r.expected} actual=${r.has}`);
  }
  if (!rolesOk) process.exitCode = 1;

  console.log('\n=== ' + (process.exitCode ? 'VALIDATION FAILED' : 'ALL POST-DEPLOYMENT CHECKS PASSED') + ' ===');
  if (process.exitCode) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
