/**
 * Nexora — Base mainnet deployment (explicit, human-controlled).
 *
 * SAFETY: This script will NOT run automatically. It requires:
 *   1. `mainnet-preflight.ts` to have passed.
 *   2. `DEPLOY_TO_MAINNET=true` in the environment.
 *   3. A second interactive confirmation (`--i-confirm` flag).
 *   4. Real production recipient addresses via env (no deployer fallback).
 *
 * It does NOT add liquidity, enable staking, start the presale, or create
 * governance proposals. Those are separate, explicit human steps.
 */
import { ethers } from 'hardhat';

const BASE_MAINNET_CHAIN_ID = 8453;

async function main() {
  const confirmFlag = process.argv.find((a) => a === '--i-confirm');

  if (process.env.DEPLOY_TO_MAINNET !== 'true') {
    throw new Error('Refusing: DEPLOY_TO_MAINNET=true is required (explicit opt-in).');
  }
  if (!confirmFlag) {
    throw new Error(
      'Refusing: second confirmation required. Re-run with --i-confirm after mainnet-preflight passes.',
    );
  }
  if (process.env.APP_ENV !== 'production') {
    throw new Error('Refusing: APP_ENV=production is required.');
  }

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== BigInt(BASE_MAINNET_CHAIN_ID)) {
    throw new Error(`Refusing: expected Base mainnet chain id ${BASE_MAINNET_CHAIN_ID}, got ${network.chainId}`);
  }

  console.log('=== BASE MAINNET DEPLOYMENT ===');
  console.log('This is a deliberate, human-controlled action.');

  // Delegate to the full deterministic deployment orchestrator.
  const { main: deployAll } = await import('./deploy-all');
  const result = await deployAll();
  console.log('Base mainnet deployment complete.');
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
