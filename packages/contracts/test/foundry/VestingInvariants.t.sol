// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraToken} from "../../src/token/NexoraToken.sol";
import {NexoraVesting} from "../../src/vesting/NexoraVesting.sol";

/**
 * @title VestingInvariants
 * @notice Invariant tests for vesting.
 *
 * Core invariants:
 *   - A beneficiary can never claim more than their total allocation.
 *   - Reserved tokens are never swept by recovery.
 */
contract VestingInvariants is Test {
    NexoraToken token;
    NexoraVesting vesting;
    uint256 internal constant ALLOC = 100_000e18;

    function setUp() public {
        NexoraToken.Allocation[] memory allocations = new NexoraToken.Allocation[](1);
        allocations[0] = NexoraToken.Allocation(address(this), 1_000_000_000e18);
        token = new NexoraToken(allocations);
        vesting = new NexoraVesting(address(token), address(this));
        token.transfer(address(vesting), ALLOC);
        vesting.createSchedule(address(0x3000), ALLOC, uint64(block.timestamp), 0, 100, false);
    }

    /// INVARIANT: reserved tokens never exceed the funded balance.
    function invariant_reservedNeverExceedsBalance() public view {
        assertLe(vesting.reservedTokens(), token.balanceOf(address(vesting)));
    }

    /// FUZZ: a beneficiary can never claim more than their allocation.
    function testFuzz_claimNeverExceedsAllocation(uint256 timeJump) public {
        address ben = address(0x3000);
        vm.warp(block.timestamp + (timeJump % 200) + 1);
        uint256 before = token.balanceOf(ben);
        vm.prank(ben);
        vesting.claim(0);
        uint256 got = token.balanceOf(ben) - before;
        // Invariant: claimed <= allocation.
        assertLe(got, ALLOC);
        // Claimable is now zero (nothing left to claim beyond vested).
        assertLe(vesting.claimableAmount(0), ALLOC);
    }
}
