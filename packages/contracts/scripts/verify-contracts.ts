/**
 * Nexora — contract verification after deployment.
 *
 * Reads a deployment manifest and verifies every deployed contract on the
 * configured block explorer (via hardhat-verify). Does NOT claim verification
 * unless it actually succeeds. Prints:
 *   CONTRACT | ADDRESS | VERIFICATION STATUS | EXPLORER REFERENCE
 *
 * Exits non-zero if any verification fails.
 *
 * Usage:
 *   npx hardhat run scripts/verify-contracts.ts --network <network>
 *
 * Requires BASESCAN_API_KEY and network explorer configuration.
 */
import { ethers } from 'hardhat';
import hre from 'hardhat';
import fs from 'fs';
import path from 'path';

const PURPOSES: Record<string, string> = {
  nxrToken: 'NexoraToken',
  voteToken: 'NexoraVoteToken',
  voteWrapper: 'NexoraVoteWrapper',
  timelock: 'TimelockController',
  governor: 'NexoraGovernor',
  treasury: 'NexoraTreasury',
  vesting: 'NexoraVesting',
  vestingAdvisors: 'NexoraVesting',
  staking: 'NexoraStaking',
  airdrop: 'NexoraAirdrop',
  presale: 'NexoraPresale',
  factory: 'NexoraFactory',
};

async function main() {
  const network = hre.network.name;
  const manifestFile = path.resolve('deployments', `${network}.json`);
  if (!fs.existsSync(manifestFile)) {
    console.error(`No deployment manifest for network "${network}"`);
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const c = m.contracts;

  if (!process.env.BASESCAN_API_KEY) {
    console.error('BASESCAN_API_KEY is not set — cannot verify contracts.');
    console.error('Set BASESCAN_API_KEY and re-run. NOT claiming any verification.');
    process.exit(1);
  }

  console.log(`=== Nexora contract verification (${network}) ===\n`);
  console.log('CONTRACT | ADDRESS | STATUS | EXPLORER');

  const explorerBase =
    network === 'base'
      ? 'https://basescan.org/address/'
      : 'https://sepolia.basescan.org/address/';

  let failures = 0;
  for (const [name, addr] of Object.entries(c)) {
    const contractName = PURPOSES[name] ?? name;
    try {
      await hre.run('verify:verify', { address: addr, contract: `contracts/${pathFor(contractName)}:${contractName}` });
      console.log(`  ${name} | ${addr} | VERIFIED | ${explorerBase}${addr}`);
    } catch (e) {
      // hardhat-verify throws on already-verified; treat "already verified" as success.
      const msg = (e as Error).message;
      if (/already verified|already been verified/i.test(msg)) {
        console.log(`  ${name} | ${addr} | VERIFIED (already) | ${explorerBase}${addr}`);
      } else {
        failures++;
        console.log(`  ${name} | ${addr} | FAILED | ${explorerBase}${addr}`);
        console.log(`    ${msg.split('\n').slice(0, 2).join(' ')}`);
      }
    }
  }

  console.log('\n=== ' + (failures ? `VERIFICATION FAILED (${failures})` : 'ALL CONTRACTS VERIFIED') + ' ===');
  if (failures) process.exit(1);
}

function pathFor(name: string): string {
  // Map contract name to its source subdir.
  const map: Record<string, string> = {
    NexoraToken: 'token',
    NexoraAirdrop: 'airdrop',
    NexoraVesting: 'vesting',
    NexoraStaking: 'staking',
    NexoraTreasury: 'treasury',
    NexoraGovernor: 'governance',
    NexoraVoteToken: 'governance',
    NexoraVoteWrapper: 'governance',
    NexoraPresale: 'presale',
    TimelockController: '', // OpenZeppelin
    NexoraFactory: 'libraries',
  };
  return map[name] ?? 'token';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
