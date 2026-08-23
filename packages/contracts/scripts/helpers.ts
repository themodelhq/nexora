/**
 * Nexora deployment helpers.
 *
 * Shared utilities for recording deployment metadata and verifying
 * contracts. Used by the local/sepolia/mainnet deploy scripts.
 */

import fs from 'fs';
import path from 'path';
import { ethers } from 'hardhat';
import hre from 'hardhat';

export interface DeploymentRecord {
  network: string;
  chainId: number;
  deployedAt: string;
  contracts: Record<string, string>;
}

const DEPLOYMENTS_DIR = path.join(__dirname, '..', 'deployments');

export function deploymentsDir(): string {
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  return DEPLOYMENTS_DIR;
}

export function recordDeployment(record: DeploymentRecord): string {
  const file = path.join(deploymentsDir(), `${record.network}.deployment.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  return file;
}

export function readDeployment(network: string): DeploymentRecord | null {
  const file = path.join(DEPLOYMENTS_DIR, `${network}.deployment.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as DeploymentRecord;
}

/** Deploy a contract factory and return its address. */
export async function deploy(name: string, args: unknown[] = []): Promise<string> {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...(args as never[]));
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  deployed ${name} → ${address}`);
  return address;
}

/** Verify a contract on the block explorer for the active network. */
export async function verifyContract(
  address: string,
  constructorArgs: unknown[] = [],
): Promise<void> {
  const network = hre.network.name;
  // Verify only on real networks with an explorer API key configured.
  if (network === 'hardhat' || network === 'localhost') {
    console.log('  (skipping verification on local network)');
    return;
  }
  if (!process.env.BASESCAN_API_KEY) {
    console.warn('  BASESCAN_API_KEY not set — skipping verification');
    return;
  }
  try {
    await hre.run('verify:verify', {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`  verified ${address}`);
  } catch (err) {
    console.warn('  verification failed:', (err as Error).message);
  }
}
