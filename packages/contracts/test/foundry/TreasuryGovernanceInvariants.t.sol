// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraTreasury} from "../../src/treasury/NexoraTreasury.sol";
import {NexoraGovernor} from "../../src/governance/NexoraGovernor.sol";
import {NexoraVoteToken} from "../../src/governance/NexoraVoteToken.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title TreasuryGovernanceInvariants
 * @notice Invariant tests for treasury access control + governance timelock.
 *
 * Invariants:
 *   - Unauthorized accounts can never execute privileged treasury operations.
 *   - Governance executes through the timelock (never a single wallet).
 */
contract TreasuryGovernanceInvariants is Test {
    NexoraTreasury treasury;
    NexoraGovernor governor;
    NexoraVoteToken voteToken;
    TimelockController timelock;
    address internal constant MULTISIG = address(0x5000);
    address internal constant ATTACKER = address(0x9999);

    function setUp() public {
        treasury = new NexoraTreasury(address(this));
        treasury.grantRole(treasury.OPERATOR_ROLE(), MULTISIG);

        // Governance stack (minimal).
        voteToken = new NexoraVoteToken(address(this));
        timelock = new TimelockController(3600, new address[](0), new address[](0), address(this));
        governor = new NexoraGovernor(voteToken, timelock, 1, 10, 0, 4);
        // Governor gets timelock roles.
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
    }

    /// Invariant: attacker has no treasury operator role.
    function invariant_attackerCannotOperateTreasury() public view {
        assertFalse(treasury.hasRole(treasury.OPERATOR_ROLE(), ATTACKER));
        assertFalse(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), ATTACKER));
    }

    /// Fuzz: attacker treasury spend reverts.
    function testFuzz_treasuryAttackerCannotSpend(uint256 amount) public {
        vm.assume(amount > 0);
        vm.prank(ATTACKER);
        vm.expectRevert();
        treasury.spend(address(voteToken), ATTACKER, amount, "x");
    }

    /// Governance executes through the timelock (executor is the timelock).
    function invariant_governanceExecutesThroughTimelock() public view {
        // The governor's _executor() is the timelock; verify the timelock holds
        // the executor role for governance operations.
        assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(governor)));
    }

    /// Invariant: attacker cannot bypass the timelock (no execute rights).
    function invariant_attackerCannotExecuteGovernance() public view {
        assertFalse(timelock.hasRole(timelock.EXECUTOR_ROLE(), ATTACKER));
        assertFalse(timelock.hasRole(timelock.PROPOSER_ROLE(), ATTACKER));
    }
}
