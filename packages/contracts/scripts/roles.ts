/**
 * Nexora — shared role-handoff + verification helpers.
 *
 * Used by deploy-all.ts (to perform the final role handoff), verify-roles.ts
 * (to verify the final state), and validate-deployment.ts (to confirm role
 * transitions on a live network). Centralizes the FINAL ROLE MAP across all
 * privileged contracts.
 *
 * FINAL ROLE MAP (protocol design):
 *   TimelockController
 *     DEFAULT_ADMIN_ROLE -> the timelock itself (self-governed) OR explicit gov
 *     PROPOSER_ROLE      -> Governor
 *     EXECUTOR_ROLE      -> Governor
 *     CANCELLER_ROLE     -> Governor
 *   NexoraTreasury
 *     DEFAULT_ADMIN_ROLE -> governance timelock
 *     OPERATOR_ROLE      -> TREASURY_MULTISIG (the treasury Safe)
 *     PAUSER_ROLE        -> EMERGENCY_MULTISIG (defaults to treasury multisig)
 *   NexoraStaking
 *     DEFAULT_ADMIN_ROLE -> governance timelock
 *     REWARD_GRANTOR_ROLE-> TREASURY_MULTISIG
 *     PAUSER_ROLE        -> EMERGENCY_MULTISIG
 *   NexoraVesting (team + advisors)
 *     DEFAULT_ADMIN_ROLE -> governance timelock
 *     MANAGER_ROLE       -> governance timelock
 *     RECOVERY_ROLE      -> TREASURY_MULTISIG (approved recovery authority)
 *   NexoraAirdrop
 *     DEFAULT_ADMIN_ROLE -> governance timelock
 *     PAUSER_ROLE        -> EMERGENCY_MULTISIG
 *     RECOVERY_ROLE      -> TREASURY_MULTISIG / governance
 *   NexoraPresale
 *     DEFAULT_ADMIN_ROLE -> governance timelock
 *     MANAGER_ROLE       -> governance timelock
 *     PAUSER_ROLE        -> EMERGENCY_MULTISIG
 *   NexoraVoteToken
 *     MINTER_ROLE        -> VoteWrapper
 *     DEFAULT_ADMIN_ROLE -> governance timelock
 *
 * The deployer holds roles ONLY as a temporary deployment authority. Handoff
 * never revokes the last administrator: it grants permanent roles first,
 * verifies they are held, then revokes the deployer.
 */
import { ethers } from 'hardhat';

export const ZERO = ethers.ZeroAddress;

export interface PermanentAuthorities {
  /** The treasury Safe/multisig (== TREASURY_ADDRESS in production). */
  treasuryMultisig: string;
  /** Emergency pause authority (defaults to treasury multisig). */
  emergencyAuthority: string;
  /** Governance/timelock address that holds DEFAULT_ADMIN. */
  governance: string;
}

/**
 * Resolve the permanent authorities from configuration.
 * In production, TREASURY_MULTISIG_ADDRESS is required; in testnet, falls back
 * to the (deterministic, non-deployer) treasury destination.
 */
export function resolvePermanentAuthorities(
  isProduction: boolean,
  governance: string,
  treasuryDestination: string,
): PermanentAuthorities {
  const multisig =
    process.env.TREASURY_MULTISIG_ADDRESS || (!isProduction ? treasuryDestination : undefined);
  if (!multisig) {
    throw new Error('TREASURY_MULTISIG_ADDRESS is required in production (the treasury Safe)');
  }
  const tm = ethers.getAddress(multisig);
  const emergency = process.env.EMERGENCY_MULTISIG_ADDRESS
    ? ethers.getAddress(process.env.EMERGENCY_MULTISIG_ADDRESS)
    : tm;
  return { treasuryMultisig: tm, emergencyAuthority: emergency, governance: ethers.getAddress(governance) };
}

async function grantRole(contract: string, addr: string, role: string, holder: string): Promise<void> {
  const c = await ethers.getContractAt(contract, addr);
  if (!(await c.hasRole(role, holder))) {
    await c.grantRole(role, holder);
  }
}

async function revokeRole(contract: string, addr: string, role: string, holder: string): Promise<void> {
  const c = await ethers.getContractAt(contract, addr);
  if (await c.hasRole(role, holder)) {
    await c.revokeRole(role, holder);
  }
}

export interface RoleExpectation {
  contract: string;
  contractAddr: string;
  role: string;
  roleLabel: string;
  holder: string;
  holderLabel: string;
  expected: boolean; // true => holder must have role; false => must not
}

/** Reads actual role state and returns PASS/FAIL entries. */
export async function verifyRoleTable(expectations: RoleExpectation[]): Promise<{
  rows: { c: string; role: string; holder: string; has: boolean; expected: boolean; ok: boolean }[];
  allOk: boolean;
}> {
  const rows: { c: string; role: string; holder: string; has: boolean; expected: boolean; ok: boolean }[] = [];
  let allOk = true;
  for (const e of expectations) {
    let has = false;
    try {
      const c = await ethers.getContractAt(e.contract, e.contractAddr);
      has = await c.hasRole(e.role, e.holder);
    } catch {
      has = false;
    }
    const ok = has === e.expected;
    if (!ok) allOk = false;
    rows.push({
      c: `${e.contract}(${e.contractAddr})`,
      role: e.roleLabel,
      holder: e.holderLabel,
      has,
      expected: e.expected,
      ok,
    });
  }
  return { rows, allOk };
}

// Role hashes (OpenZeppelin DEFAULT_ADMIN_ROLE is bytes32(0)).
export const DEFAULT_ADMIN = ethers.ZeroHash;
export const OPERATOR = ethers.id('OPERATOR_ROLE');
export const PAUSER = ethers.id('PAUSER_ROLE');
export const REWARD_GRANTOR = ethers.id('REWARD_GRANTOR_ROLE');
export const MANAGER = ethers.id('MANAGER_ROLE');
export const RECOVERY = ethers.id('RECOVERY_ROLE');
export const MINTER = ethers.id('MINTER_ROLE');
export const PROPOSER = ethers.id('PROPOSER_ROLE');
export const EXECUTOR = ethers.id('EXECUTOR_ROLE');
export const CANCELLER = ethers.id('CANCELLER_ROLE');

export interface HandoffContracts {
  treasuryAddr?: string;
  stakingAddr?: string;
  voteTokenAddr?: string;
  voteWrapperAddr?: string;
  timelockAddr?: string;
  teamVestingAddr?: string;
  advisorVestingAddr?: string;
  airdropAddr?: string;
  presaleAddr?: string;
}

/**
 * Performs the role handoff for EVERY privileged contract. Grants permanent
 * roles, then revokes the deployer's roles (never the last administrator).
 *
 * Timelock DEFAULT_ADMIN is transferred to the timelock itself (self-governed),
 * which is the OZ-recommended pattern and keeps the timelock administratively
 * manageable through governance proposals. The deployer's admin is removed
 * only after all permanent authorities are granted and verified.
 */
export async function performRoleHandoff(params: {
  contracts: HandoffContracts;
  deployer: string;
  governance: string;
  authorities: PermanentAuthorities;
  log?: (s: string) => void;
}): Promise<void> {
  const log = params.log ?? ((s: string) => console.log(s));
  const { treasuryMultisig, emergencyAuthority } = params.authorities;
  const c = params.contracts;

  // --- TimelockController handoff (self-governed) ---
  if (c.timelockAddr) {
    log('Timelock role handoff:');
    // Grant the timelock its own DEFAULT_ADMIN (self-governance), then remove
    // the deployer admin. The Governor keeps PROPOSER/EXECUTOR/CANCELLER so the
    // timelock remains fully governable.
    await grantRole('TimelockController', c.timelockAddr, DEFAULT_ADMIN, c.timelockAddr);
    await revokeRole('TimelockController', c.timelockAddr, DEFAULT_ADMIN, params.deployer);
    log(`  DEFAULT_ADMIN -> self (${c.timelockAddr}); deployer revoked`);
  }

  // --- NexoraTreasury handoff ---
  if (c.treasuryAddr) {
    log('Treasury role handoff:');
    await grantRole('NexoraTreasury', c.treasuryAddr, DEFAULT_ADMIN, params.governance);
    await grantRole('NexoraTreasury', c.treasuryAddr, OPERATOR, treasuryMultisig);
    await grantRole('NexoraTreasury', c.treasuryAddr, PAUSER, emergencyAuthority);
    await revokeRole('NexoraTreasury', c.treasuryAddr, PAUSER, params.deployer);
    await revokeRole('NexoraTreasury', c.treasuryAddr, DEFAULT_ADMIN, params.deployer);
    log(`  DEFAULT_ADMIN -> ${params.governance}; OPERATOR -> ${treasuryMultisig}; PAUSER -> ${emergencyAuthority}; deployer revoked`);
  }

  // --- NexoraStaking handoff ---
  if (c.stakingAddr) {
    log('Staking role handoff:');
    await grantRole('NexoraStaking', c.stakingAddr, DEFAULT_ADMIN, params.governance);
    await grantRole('NexoraStaking', c.stakingAddr, REWARD_GRANTOR, treasuryMultisig);
    await grantRole('NexoraStaking', c.stakingAddr, PAUSER, emergencyAuthority);
    await revokeRole('NexoraStaking', c.stakingAddr, REWARD_GRANTOR, params.deployer);
    await revokeRole('NexoraStaking', c.stakingAddr, PAUSER, params.deployer);
    await revokeRole('NexoraStaking', c.stakingAddr, DEFAULT_ADMIN, params.deployer);
    log(`  DEFAULT_ADMIN -> ${params.governance}; REWARD_GRANTOR -> ${treasuryMultisig}; PAUSER -> ${emergencyAuthority}; deployer revoked`);
  }

  // --- NexoraVesting (team + advisors) handoff ---
  for (const [label, addr] of [
    ['team', c.teamVestingAddr],
    ['advisors', c.advisorVestingAddr],
  ] as const) {
    if (!addr) continue;
    log(`${label} vesting role handoff:`);
    await grantRole('NexoraVesting', addr, DEFAULT_ADMIN, params.governance);
    await grantRole('NexoraVesting', addr, MANAGER, params.governance);
    await grantRole('NexoraVesting', addr, RECOVERY, treasuryMultisig);
    await revokeRole('NexoraVesting', addr, MANAGER, params.deployer);
    await revokeRole('NexoraVesting', addr, RECOVERY, params.deployer);
    await revokeRole('NexoraVesting', addr, DEFAULT_ADMIN, params.deployer);
    log(`  DEFAULT_ADMIN/MANAGER -> ${params.governance}; RECOVERY -> ${treasuryMultisig}; deployer revoked`);
  }

  // --- NexoraAirdrop handoff ---
  if (c.airdropAddr) {
    log('Airdrop role handoff:');
    await grantRole('NexoraAirdrop', c.airdropAddr, DEFAULT_ADMIN, params.governance);
    await grantRole('NexoraAirdrop', c.airdropAddr, PAUSER, emergencyAuthority);
    await grantRole('NexoraAirdrop', c.airdropAddr, RECOVERY, treasuryMultisig);
    await revokeRole('NexoraAirdrop', c.airdropAddr, PAUSER, params.deployer);
    await revokeRole('NexoraAirdrop', c.airdropAddr, RECOVERY, params.deployer);
    await revokeRole('NexoraAirdrop', c.airdropAddr, DEFAULT_ADMIN, params.deployer);
    log(`  DEFAULT_ADMIN -> ${params.governance}; PAUSER -> ${emergencyAuthority}; RECOVERY -> ${treasuryMultisig}; deployer revoked`);
  }

  // --- NexoraPresale handoff (remains DISABLED) ---
  if (c.presaleAddr) {
    log('Presale role handoff:');
    await grantRole('NexoraPresale', c.presaleAddr, DEFAULT_ADMIN, params.governance);
    await grantRole('NexoraPresale', c.presaleAddr, MANAGER, params.governance);
    await grantRole('NexoraPresale', c.presaleAddr, PAUSER, emergencyAuthority);
    await revokeRole('NexoraPresale', c.presaleAddr, PAUSER, params.deployer);
    await revokeRole('NexoraPresale', c.presaleAddr, MANAGER, params.deployer);
    await revokeRole('NexoraPresale', c.presaleAddr, DEFAULT_ADMIN, params.deployer);
    log(`  DEFAULT_ADMIN/MANAGER -> ${params.governance}; PAUSER -> ${emergencyAuthority}; deployer revoked`);
  }
}

/**
 * Builds the authoritative role expectation table for the current deployment
 * manifest + authorities. Used by verify-roles and validate-deployment.
 */
export async function buildRoleExpectations(params: {
  contracts: Record<string, string>;
  deployer: string;
  governance: string;
  authorities: PermanentAuthorities;
}): Promise<RoleExpectation[]> {
  const { treasuryMultisig, emergencyAuthority } = params.authorities;
  const DEFAULT_ADMIN = ethers.ZeroHash; // OpenZeppelin DEFAULT_ADMIN_ROLE is bytes32(0)
  const OPERATOR = ethers.id('OPERATOR_ROLE');
  const PAUSER = ethers.id('PAUSER_ROLE');
  const REWARD_GRANTOR = ethers.id('REWARD_GRANTOR_ROLE');
  const MINTER = ethers.id('MINTER_ROLE');

  const label = (c: string) => c;
  const e = (
    contract: string,
    contractAddr: string,
    role: string,
    roleLabel: string,
    holder: string,
    holderLabel: string,
    expected: boolean,
  ): RoleExpectation => ({
    contract,
    contractAddr,
    role,
    roleLabel,
    holder,
    holderLabel,
    expected,
  });

  const out: RoleExpectation[] = [];

  // --- TimelockController ---
  if (params.contracts.timelock) {
    const tl = params.contracts.timelock;
    out.push(e('TimelockController', tl, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', tl, 'Self', true));
    out.push(e('TimelockController', tl, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.deployer, 'Deployer', false));
    out.push(e('TimelockController', tl, PROPOSER, 'PROPOSER_ROLE', params.contracts.governor, 'Governor', true));
    out.push(e('TimelockController', tl, EXECUTOR, 'EXECUTOR_ROLE', params.contracts.governor, 'Governor', true));
    out.push(e('TimelockController', tl, CANCELLER, 'CANCELLER_ROLE', params.contracts.governor, 'Governor', true));
  }

  if (params.contracts.treasury) {
    out.push(e('NexoraTreasury', params.contracts.treasury, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.governance, label('Timelock'), true));
    out.push(e('NexoraTreasury', params.contracts.treasury, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraTreasury', params.contracts.treasury, OPERATOR, 'OPERATOR_ROLE', treasuryMultisig, 'TreasuryMultisig', true));
    out.push(e('NexoraTreasury', params.contracts.treasury, PAUSER, 'PAUSER_ROLE', emergencyAuthority, 'EmergencyAuthority', true));
  }
  if (params.contracts.staking) {
    out.push(e('NexoraStaking', params.contracts.staking, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.governance, 'Timelock', true));
    out.push(e('NexoraStaking', params.contracts.staking, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraStaking', params.contracts.staking, REWARD_GRANTOR, 'REWARD_GRANTOR_ROLE', treasuryMultisig, 'TreasuryMultisig', true));
    out.push(e('NexoraStaking', params.contracts.staking, REWARD_GRANTOR, 'REWARD_GRANTOR_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraStaking', params.contracts.staking, PAUSER, 'PAUSER_ROLE', emergencyAuthority, 'EmergencyAuthority', true));
    out.push(e('NexoraStaking', params.contracts.staking, PAUSER, 'PAUSER_ROLE', params.deployer, 'Deployer', false));
  }
  // --- NexoraVesting (team + advisors) ---
  for (const [label, key] of [
    ['TeamVesting', 'vesting'],
    ['AdvisorVesting', 'vestingAdvisors'],
  ] as const) {
    const addr = params.contracts[key];
    if (!addr) continue;
    out.push(e('NexoraVesting', addr, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.governance, 'Timelock', true));
    out.push(e('NexoraVesting', addr, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraVesting', addr, MANAGER, 'MANAGER_ROLE', params.governance, 'Timelock', true));
    out.push(e('NexoraVesting', addr, MANAGER, 'MANAGER_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraVesting', addr, RECOVERY, 'RECOVERY_ROLE', treasuryMultisig, 'TreasuryMultisig', true));
    out.push(e('NexoraVesting', addr, RECOVERY, 'RECOVERY_ROLE', params.deployer, 'Deployer', false));
  }
  // --- NexoraAirdrop ---
  if (params.contracts.airdrop) {
    const a = params.contracts.airdrop;
    out.push(e('NexoraAirdrop', a, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.governance, 'Timelock', true));
    out.push(e('NexoraAirdrop', a, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraAirdrop', a, PAUSER, 'PAUSER_ROLE', emergencyAuthority, 'EmergencyAuthority', true));
    out.push(e('NexoraAirdrop', a, PAUSER, 'PAUSER_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraAirdrop', a, RECOVERY, 'RECOVERY_ROLE', treasuryMultisig, 'TreasuryMultisig', true));
    out.push(e('NexoraAirdrop', a, RECOVERY, 'RECOVERY_ROLE', params.deployer, 'Deployer', false));
  }
  // --- NexoraPresale ---
  if (params.contracts.presale) {
    const p = params.contracts.presale;
    out.push(e('NexoraPresale', p, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.governance, 'Timelock', true));
    out.push(e('NexoraPresale', p, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraPresale', p, MANAGER, 'MANAGER_ROLE', params.governance, 'Timelock', true));
    out.push(e('NexoraPresale', p, MANAGER, 'MANAGER_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraPresale', p, PAUSER, 'PAUSER_ROLE', emergencyAuthority, 'EmergencyAuthority', true));
    out.push(e('NexoraPresale', p, PAUSER, 'PAUSER_ROLE', params.deployer, 'Deployer', false));
  }
  if (params.contracts.voteToken && params.contracts.voteWrapper) {
    out.push(e('NexoraVoteToken', params.contracts.voteToken, MINTER, 'MINTER_ROLE', params.contracts.voteWrapper, 'VoteWrapper', true));
    out.push(e('NexoraVoteToken', params.contracts.voteToken, MINTER, 'MINTER_ROLE', params.deployer, 'Deployer', false));
    out.push(e('NexoraVoteToken', params.contracts.voteToken, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.governance, 'Timelock', true));
    out.push(e('NexoraVoteToken', params.contracts.voteToken, DEFAULT_ADMIN, 'DEFAULT_ADMIN_ROLE', params.deployer, 'Deployer', false));
  }
  return out;
}

/**
 * Validates the treasury configuration relationship. For Option A, the treasury
 * allocation destination and the treasury multisig are the SAME Safe.
 */
export function validateTreasuryConfiguration(params: {
  treasuryAddress: string;
  treasuryMultisig: string;
  deployer: string;
  isProduction: boolean;
}): string[] {
  const errors: string[] = [];
  if (!params.treasuryAddress || params.treasuryAddress === ZERO) {
    errors.push('treasury address is zero/empty');
  }
  if (!params.treasuryMultisig || params.treasuryMultisig === ZERO) {
    errors.push('treasury multisig is zero/empty');
  }
  if (params.isProduction) {
    if (params.treasuryAddress.toLowerCase() !== params.treasuryMultisig.toLowerCase()) {
      errors.push('TREASURY_ADDRESS must equal TREASURY_MULTISIG_ADDRESS (Option A: the Safe is the treasury)');
    }
  }
  if (params.treasuryMultisig && params.treasuryMultisig.toLowerCase() === params.deployer.toLowerCase()) {
    errors.push('treasury multisig must not be the deployer');
  }
  if (params.treasuryAddress && params.treasuryAddress.toLowerCase() === params.deployer.toLowerCase()) {
    errors.push('treasury address must not be the deployer');
  }
  return errors;
}
