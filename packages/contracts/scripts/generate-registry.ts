/**
 * Nexora — public contract registry generator.
 *
 * Reads the deployment manifest(s) and produces `contracts/registry.json`
 * with contract purpose, address, network, chain id, version, and verification
 * status. Used by the transparency dashboard and listing packages.
 *
 *   npx hardhat run scripts/generate-registry.ts
 */
import fs from 'fs';
import path from 'path';

interface RegistryEntry {
  contract: string;
  purpose: string;
  address?: string;
  network: string;
  chainId: number;
  version: string;
  verification: 'pending' | 'not-applied';
}

const PURPOSES: Record<string, string> = {
  nxrToken: 'NXR ERC-20 token (fixed supply)',
  voteToken: 'Governance vote token (NXVT, ERC20Votes)',
  voteWrapper: '1:1 NXR -> NXVT vote wrapper',
  timelock: 'Governance timelock (delayed execution)',
  governor: 'On-chain governance (OpenZeppelin Governor)',
  treasury: 'Treasury (role-gated, multisig-controlled)',
  vesting: 'Token vesting (cliff + linear)',
  staking: 'NXR staking (funded solvent rewards)',
  airdrop: 'Merkle airdrop claims',
  presale: 'Token sale (DISABLED by default)',
};

function main() {
  const deploymentsDir = path.resolve('deployments');
  const registryDir = path.resolve('.'); // packages/contracts
  fs.mkdirSync(registryDir, { recursive: true });

  const registry: Record<string, RegistryEntry[]> = {};
  for (const file of fs.readdirSync(deploymentsDir)) {
    if (!file.endsWith('.json') || file === 'final-report.json' || file === 'hardhat.deployment.json') continue;
    let manifest: { network: string; chainId: number; version: string; contracts: Record<string, string> };
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(deploymentsDir, file), 'utf8'));
    } catch {
      continue;
    }
    const entries: RegistryEntry[] = Object.entries(manifest.contracts ?? {}).map(([name, addr]) => ({
      contract: name,
      purpose: PURPOSES[name] ?? 'ecosystem contract',
      address: addr,
      network: manifest.network,
      chainId: manifest.chainId,
      version: manifest.version ?? '0.1.0',
      verification: 'pending',
    }));
    registry[manifest.network] = entries;
  }

  const out = path.join(registryDir, 'registry.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), networks: registry }, null, 2));
  console.log(`Registry written: ${out}`);
}

main();
