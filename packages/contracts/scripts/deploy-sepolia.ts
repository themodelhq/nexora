/**
 * Nexora — Base Sepolia testnet deployment.
 *
 * Deploys the ACTUAL full ecosystem (token, timelock, governance, treasury,
 * vesting, staking, airdrop, presale, vote token/wrapper) via the deterministic
 * orchestrator, records every address to deployments/base-sepolia.json, and
 * verifies source on BaseScan.
 *
 *   npm run deploy:sepolia
 */
import { ethers } from 'hardhat';

const BASE_SEPOLIA_CHAIN_ID = 84532;

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== BigInt(BASE_SEPOLIA_CHAIN_ID)) {
    throw new Error(`deploy:sepolia must target Base Sepolia (${BASE_SEPOLIA_CHAIN_ID}), got ${network.chainId}`);
  }

  console.log('Deploying Nexora full ecosystem to Base Sepolia...');
  const { main: deployAll } = await import('./deploy-all');
  const result = await deployAll();
  console.log('Base Sepolia deployment complete.');
  return result;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
