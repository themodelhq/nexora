// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraToken} from "../../src/token/NexoraToken.sol";
import {NexoraStaking} from "../../src/staking/NexoraStaking.sol";

/**
 * @title StakingInvariants
 * @notice Fuzz + invariant tests for staking solvency (unit-isolated accounting).
 *
 * Core invariants:
 *   - Rewards paid never exceed the funded reward pool.
 *   - Principal is always returnable (balance >= totalStaked + obligations).
 *   - Staking never changes the NXR total supply.
 *   - Recovery can never touch committed/accrued rewards (availableSurplus is
 *     independent of obligations).
 */
contract StakingInvariants is Test {
    NexoraToken token;
    NexoraStaking staking;
    address internal constant ADMIN = address(0x2000);
    address internal constant ALICE = address(0x3000);
    address internal constant BOB = address(0x4000);
    uint256 internal constant DURATION = 100;

    function setUp() public {
        NexoraToken.Allocation[] memory allocations = new NexoraToken.Allocation[](1);
        allocations[0] = NexoraToken.Allocation(address(this), 1_000_000_000e18);
        token = new NexoraToken(allocations);
        staking = new NexoraStaking(address(token), ADMIN, DURATION);
        // Fund + enable.
        token.transfer(ADMIN, 1_000_000e18);
        vm.startPrank(ADMIN);
        token.approve(address(staking), 1_000_000e18);
        staking.notifyRewardAmount(1_000_000e18);
        staking.enable();
        vm.stopPrank();
        // Give users stake tokens.
        token.transfer(ALICE, 100_000e18);
        token.transfer(BOB, 100_000e18);
    }

    // --- Invariants ---

    function invariant_totalSupplyUnchangedByStaking() public view {
        assertEq(token.totalSupply(), 1_000_000_000e18);
    }

    function invariant_rewardsPaidNeverExceedFunded() public view {
        assertLe(staking.totalRewardsPaid(), staking.totalRewardsFunded());
    }

    function invariant_principalAlwaysReturnable() public view {
        assertGe(token.balanceOf(address(staking)), staking.totalStaked());
    }

    function invariant_solvencyReserveHolds() public view {
        // balance >= principal + outstanding obligations
        uint256 reserved = staking.totalStaked() + staking.outstandingRewardObligations();
        assertGe(token.balanceOf(address(staking)), reserved);
    }

    function invariant_surplusIsSeparateFromObligations() public view {
        // availableSurplus + reserved == balance (surplus is only ever the excess)
        uint256 bal = token.balanceOf(address(staking));
        uint256 reserved = staking.totalStaked() + staking.outstandingRewardObligations();
        if (bal > reserved) {
            assertEq(staking.availableSurplus(), bal - reserved);
        } else {
            assertEq(staking.availableSurplus(), 0);
        }
    }

    // --- Fuzz tests ---

    function _stakeAs(address who, uint256 amount) internal {
        vm.startPrank(who);
        token.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function testFuzz_stakingAndRewardsBounded(uint256 amtA, uint256 amtB, uint256 timeSeed, uint256 extraFunding) public {
        // Don't stake more than users hold.
        uint256 a = (amtA % 50_000e18) + 1e18;
        uint256 b = (amtB % 50_000e18) + 1e18;
        _stakeAs(ALICE, a);
        _stakeAs(BOB, b);

        uint256 advance = (timeSeed % DURATION) + 1; // at least 1s
        vm.warp(block.timestamp + advance);

        // Reward claims never exceed what's funded.
        uint256 beforeTotal = staking.totalRewardsPaid();
        vm.startPrank(ALICE);
        staking.claimRewards();
        vm.stopPrank();
        assertLe(staking.totalRewardsPaid(), staking.totalRewardsFunded());
        assertGe(staking.totalRewardsPaid(), beforeTotal);

        // Solvency holds.
        assertGe(token.balanceOf(address(staking)), staking.totalStaked() + staking.outstandingRewardObligations());
    }

    function testFuzz_recoveryNeverTakesCommittedRewards(uint256 amt) public {
        uint256 x = (amt % 10_000e18) + 1e18;
        _stakeAs(ALICE, x);
        vm.warp(block.timestamp + 50);

        // availableSurplus must be 0 (all funds are reserved) — recovery would revert.
        // Any extra tokens sent are the only recoverable surplus.
        assertEq(staking.availableSurplus(), 0);
        vm.prank(ADMIN);
        vm.expectRevert();
        staking.recoverSurplus(ALICE);
    }

    function testFuzz_unauthorizedCannotConfigure(uint256 amount) public {
        vm.prank(ALICE);
        vm.expectRevert();
        staking.notifyRewardAmount(amount);
        vm.prank(ALICE);
        vm.expectRevert();
        staking.enable();
        vm.prank(ALICE);
        vm.expectRevert();
        staking.recoverSurplus(ALICE);
    }
}
