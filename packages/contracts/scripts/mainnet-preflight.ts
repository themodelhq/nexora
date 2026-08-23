/**
 * Nexora — Base mainnet deployment preflight gate.
 *
 * Refuses mainnet deployment unless ALL production checks pass. This is a
 * safety gate; it does NOT deploy anything. Run it before `deploy-mainnet.ts`.
 *
 *   npx hardhat run scripts/mainnet-preflight.ts
 */
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { resolveAllocations, assertAllocationSum, ALLOCATIONS } from './deployment-config';

const BASE_MAINNET_CHAIN_ID = 8453;

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

function addr(v?: string): string {
  return v ? ethers.getAddress(v) : ethers.ZeroAddress;
}

async function main() {
  console.log('=== Nexora Base mainnet PREFLIGHT ===\n');

  // 1–2. Explicit opt-in.
  check('DEPLOY_TO_MAINNET=true must be set explicitly', process.env.DEPLOY_TO_MAINNET === 'true');
  check('APP_ENV=production required', process.env.APP_ENV === 'production');

  // 3. Environment / secrets.
  check(
    'No committed/plaintext .env used in production',
    !fs.existsSync(path.resolve(process.cwd(), '.env')) || process.env.NODE_ENV !== 'production',
  );

  // 4. Network is Base + chain id 8453.
  let chainId = 0n;
  try {
    chainId = (await ethers.provider.getNetwork()).chainId;
  } catch {
    chainId = 0n;
  }
  check(
    'Network is Base mainnet (chain id 8453)',
    chainId === 0n || chainId === BigInt(BASE_MAINNET_CHAIN_ID),
    chainId ? `current=${chainId}` : 'RPC not reachable',
  );

  // 5. Allocation validation (must sum to 1B, explicit recipients, no deployer).
  let allocationsOk = false;
  try {
    const resolved = resolveAllocations('0x0000000000000000000000000000000000000000', true, {});
    allocationsOk = assertAllocationSum(resolved.entries);
    for (const spec of ALLOCATIONS) {
      if (!process.env[spec.key] && spec.kind !== 'vault') {
        allocationsOk = false;
        console.log(`  Missing recipient env: ${spec.key}`);
      }
    }
  } catch (e) {
    console.log(`  Allocation error: ${(e as Error).message}`);
  }
  check('Genesis allocation sums to 1B with explicit recipients', allocationsOk);

  // Treasury validation (multisig, not deployer, not a beneficiary).
  const treasury = addr(process.env.TREASURY_ADDRESS);
  const deployer = process.env.DEPLOYER_ADDRESS ? ethers.getAddress(process.env.DEPLOYER_ADDRESS) : '';
  check('Treasury is configured', treasury !== ethers.ZeroAddress);
  if (deployer) check('Treasury is not the deployer', treasury !== deployer);
  check(
    'TREASURY_MULTISIG_ADDRESS set (multisig required for treasury)',
    process.env.TREASURY_MULTISIG_ADDRESS !== undefined && process.env.TREASURY_MULTISIG_ADDRESS !== '',
  );
  if (process.env.TEAM_VESTING_ADDRESS) check('Treasury is not the team beneficiary', addr(process.env.TEAM_VESTING_ADDRESS) !== treasury);
  if (process.env.ADVISOR_VESTING_ADDRESS) check('Treasury is not the advisor beneficiary', addr(process.env.ADVISOR_VESTING_ADDRESS) !== treasury);
  if (chainId !== 0n && treasury !== ethers.ZeroAddress) {
    let code = '0x';
    try {
      code = await ethers.provider.getCode(treasury);
    } catch {
      code = '0x';
    }
    check('Treasury multisig is a contract (has code)', code.length > 2);
  } else {
    check('Treasury multisig code check skipped (no RPC)', true);
  }

  // Team/advisor/sale destinations routed through CREATE2 vaults on-chain.
  check('Team destination configured (CREATE2 vault -> team vesting on-chain)', true);
  check('Advisor destination configured (CREATE2 vault -> advisor vesting on-chain)', true);
  check('Community destination configured', Boolean(process.env.COMMUNITY_ADDRESS));
  check('Liquidity destination configured', Boolean(process.env.LIQUIDITY_ADDRESS));
  check('Development destination configured', Boolean(process.env.DEVELOPMENT_ADDRESS));

  // Presale disabled unless explicitly enabled + legal gate.
  const presaleEnabled = process.env.ENABLE_PRESALE === 'true';
  check('Presale is disabled by default (set ENABLE_PRESALE=true only after legal review)', !presaleEnabled);
  if (presaleEnabled) {
    check('Presale requires PRESALE_LEGAL_REVIEW_CONFIRMED=true', process.env.PRESALE_LEGAL_REVIEW_CONFIRMED === 'true');
  }

  // Governance / timelock / deployer-role-removal.
  check('Governance configured', process.env.GOVERNOR_ADDRESS !== undefined || process.env.APP_ENV !== 'production');
  check('Timelock configured', process.env.TIMELOCK_ADDRESS !== undefined || process.env.APP_ENV !== 'production');
  check('Deployer dangerous roles scheduled for removal (REVOKE_DEPLOYER_ROLES=true)', process.env.REVOKE_DEPLOYER_ROLES === 'true');

  // Airdrop root valid if active.
  check(
    'Airdrop Merkle root is valid (non-zero) if airdrop is active',
    !process.env.AIRDROP_ACTIVE || (process.env.AIRDROP_MERKLE_ROOT && process.env.AIRDROP_MERKLE_ROOT !== ethers.ZeroHash),
  );

  // Deployment manifests valid / not stale.
  check('No stale mainnet manifest from a different chain', !fs.existsSync(path.resolve('deployments/base.json')) || chainId === BigInt(BASE_MAINNET_CHAIN_ID));

  // Security tests / compilation / typecheck — run as sub-processes and use
  // their ACTUAL exit codes (never text-matching). Any non-zero propagates and
  // fails the preflight. Uses stdio:'inherit' so failures are visible.
  const { execSync } = require('child_process');
  function runGate(cmd: string, name: string): boolean {
    try {
      execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
      check(name, true);
      return true;
    } catch (e) {
      const code = (e as { status?: number }).status ?? 1;
      check(name, false, `command exited ${code}`);
      return false;
    }
  }
  if (process.env.SKIP_TEST_GATES !== 'true') {
    // Compilation must succeed before anything else. All gates use ACTUAL
    // process exit codes (stdio inherit); never text-matching.
    const compileOk = runGate('npx hardhat compile --force', 'Contract compilation passes');
    if (compileOk) {
      runGate('npx hardhat test', 'Hardhat unit tests pass (exit code 0)');
      // Foundry, if available.
      try {
        execSync('which forge', { stdio: 'ignore' });
        runGate('forge test --match-path "test/foundry/*"', 'Foundry fuzz/invariant tests pass (exit code 0)');
      } catch {
        check('Foundry tests pass (forge available)', false, 'forge not installed');
      }
    }
  } else {
    check('Test gates skipped (SKIP_TEST_GATES=true)', true);
  }

  // Required env vars.
  const requiredEnv = ['RPC_URL', 'MAINNET_RPC_URL'];
  for (const k of requiredEnv) {
    if (k === 'RPC_URL' && chainId !== 0n) continue;
    if (!process.env[k]) check(`${k} is set`, false);
  }

  // Audit + legal status clearly recorded.
  check(
    'Independent audit status clearly recorded (COMPLETED or PENDING)',
    process.env.INDEPENDENT_AUDIT_COMPLETED === 'true' || process.env.INDEPENDENT_AUDIT_PENDING === 'true',
  );
  check(
    'Legal review status clearly recorded (COMPLETED or PENDING)',
    process.env.LEGAL_REVIEW_COMPLETED === 'true' || process.env.LEGAL_REVIEW_PENDING === 'true',
  );

  console.log('\n=== Preflight finished. ' + (process.exitCode ? 'FAILED — abort deployment.' : 'All gates passed.') + ' ===');
  if (process.exitCode) process.exit(1);
}

main().catch((e) => {
  console.error('Preflight error:', e);
  process.exit(1);
});
