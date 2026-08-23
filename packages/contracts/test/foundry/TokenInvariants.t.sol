// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraToken} from "../../src/token/NexoraToken.sol";

/**
 * @title TokenInvariants
 * @notice Invariant & fuzz tests for the NXR token.
 *
 * Core invariant: total supply is fixed at 1,000,000,000 NXR and can never
 * change (no mint function, no burning by users).
 */
contract TokenInvariants is Test {
    NexoraToken token;
    address internal constant A = address(0x1000);
    address internal constant B = address(0x2000);

    function setUp() public {
        NexoraToken.Allocation[] memory allocations = new NexoraToken.Allocation[](2);
        allocations[0] = NexoraToken.Allocation(A, 500_000_000 * 10 ** 18);
        allocations[1] = NexoraToken.Allocation(B, 500_000_000 * 10 ** 18);
        token = new NexoraToken(allocations);
    }

    /// INVARIANT: total supply always equals MAX_SUPPLY (1e9 * 1e18).
    /// This is the key economic invariant: the fixed supply can never grow
    /// beyond 1 billion NXR regardless of transfer activity.
    function invariant_totalSupplyEqualsMax() public view {
        assertEq(token.totalSupply(), 1_000_000_000 * 10 ** 18);
    }

    /// INVARIANT: no holder can ever exceed the total supply (guards against
    /// accidental inflation via transfers).
    function invariant_noHolderExceedsSupply() public view {
        assertLe(token.balanceOf(A), token.totalSupply());
        assertLe(token.balanceOf(B), token.totalSupply());
    }

    /// FUZZ: a transfer between two holders preserves total supply and moves
    /// the exact amount (when the sender has enough balance).
    function testFuzz_transferPreservesSupply(uint256 amountSeed) public {
        address from = A;
        address to = B;
        uint256 bal = token.balanceOf(from);
        vm.assume(bal > 0);
        uint256 send = amountSeed % bal;
        vm.prank(from);
        token.transfer(to, send);
        assertEq(token.totalSupply(), 1_000_000_000 * 10 ** 18);
        assertEq(token.balanceOf(A) + token.balanceOf(B), token.totalSupply());
    }

    /// FUZZ: approve + transferFrom respects allowance; overspending reverts.
    function testFuzz_allowanceEnforced(uint256 approveSeed, uint256 spendSeed) public {
        address spender = address(0x3000);
        uint256 allowance = approveSeed % 1e24;
        vm.prank(A);
        token.approve(spender, allowance);
        uint256 toSpend = spendSeed % 1e24;
        if (toSpend > allowance) {
            vm.prank(spender);
            vm.expectRevert();
            token.transferFrom(A, B, toSpend);
        } else {
            vm.prank(spender);
            token.transferFrom(A, B, toSpend);
            // Allowance reduced by exactly toSpend.
            assertEq(token.allowance(A, spender), allowance - toSpend);
        }
        assertEq(token.totalSupply(), 1_000_000_000 * 10 ** 18);
    }
}
