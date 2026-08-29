// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraTreasury} from "../../src/treasury/NexoraTreasury.sol";
import {NexoraStaking} from "../../src/staking/NexoraStaking.sol";

/**
 * @title AccessControlInvariants
 * @notice Verifies that unauthorized accounts cannot execute privileged ops.
 *
 * Covers the treasury OPERATOR role and staking REWARD_GRANTOR role: only the
 * designated role holder (a multisig in production) can spend/configure.
 */
contract AccessControlInvariants is Test {
    NexoraTreasury treasury;
    NexoraStaking staking;
    address internal constant OPERATOR = address(0x5000);
    address internal constant REWARD_GRANTOR = address(0x6000);
    address internal constant ATTACKER = address(0x9999);

    NexoraTokenStub stub;

    function setUp() public {
        treasury = new NexoraTreasury(address(this));
        treasury.grantRole(treasury.OPERATOR_ROLE(), OPERATOR);

        // Simulate a NXR token for staking setup. REWARD_GRANTOR is the admin,
        // so it already holds REWARD_GRANTOR_ROLE.
        stub = new NexoraTokenStub();
        staking = new NexoraStaking(address(stub), REWARD_GRANTOR, 100);
    }

    /// FUZZ: an attacker can never spend treasury funds (only OPERATOR).
    function testFuzz_treasuryOnlyOperatorCanSpend(uint256 amount) public {
        vm.assume(amount > 0); // spend(0) correctly reverts "zero amount"
        address attacker = ATTACKER;
        vm.prank(attacker);
        vm.expectRevert();
        treasury.spend(address(stub), attacker, amount, "test");

        // Operator can spend (stub.transfer returns true, so it succeeds).
        vm.prank(OPERATOR);
        treasury.spend(address(stub), OPERATOR, amount, "test");
    }

    /// FUZZ: only the reward-grantor can change the reward rate path (fund).
    function testFuzz_stakingOnlyGrantorCanFund(uint256 amount) public {
        address attacker = ATTACKER;
        vm.prank(attacker);
        // notifyRewardAmount pulls tokens; attacker has none, but the role check
        // happens first — so it reverts with AccessControl, not balance.
        vm.expectRevert();
        staking.notifyRewardAmount(amount);
    }

    /// Invariant: attacker holds no privileged roles.
    function invariant_attackerHasNoPrivilege() public view {
        assertFalse(treasury.hasRole(treasury.OPERATOR_ROLE(), ATTACKER));
        assertFalse(staking.hasRole(staking.REWARD_GRANTOR_ROLE(), ATTACKER));
    }
}

/// Minimal ERC20 for staking setup (1:1 to a mintable stub).
contract NexoraTokenStub {
    string public constant name = "Nexora";
    string public constant symbol = "NXR";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function transfer(address, uint256) external pure returns (bool) {
        return true;
    }
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }
    function approve(address, uint256) external pure returns (bool) {
        return true;
    }
}
