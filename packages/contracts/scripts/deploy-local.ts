/**
 * Nexora — Local deployment (in-memory Hardhat network / localhost).
 *
 * Deploys the full contract suite to a local node and records addresses.
 * NOTE: requires the contracts implemented in Phase 2+. This script is the
 * canonical "happy path" orchestrator for local development.
 */

import { ethers } from 'hardhat';
import { deploy, recordDeployment } from './helpers';

const TOKEN_SUPPLY = ethers.parseEther('1000000000'); // 1,000,000,000 NXR

async function main() {
  console.log('Deploying Nexora contracts to local network...');

  // --- Phase 2: Token ---
  const token = await deploy('NexoraToken');
  // Allocation wallets & vesting contracts are passed as constructor args in
  // the finalised flow (Phase 4/5). For local testability we deploy the token
  // with a placeholder treasury holder that can be updated later.

  console.log('Token deployed:', token);
  const record = recordDeployment({
    network: 'localhost',
    chainId: (await ethers.provider.getNetwork()).chainId,
    deployedAt: new Date().toISOString(),
    contracts: { nxrToken: token },
  });
  console.log('Deployment record:', record);

  console.log('\nLocal deployment complete.');
  console.log('Run `npm run test:contracts` to validate behaviour.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
