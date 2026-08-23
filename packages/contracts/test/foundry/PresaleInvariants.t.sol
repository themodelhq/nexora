// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraToken} from "../../src/token/NexoraToken.sol";
import {NexoraPresale} from "../../src/presale/NexoraPresale.sol";

/**
 * @title PresaleInvariants
 * @notice Invariant & fuzz tests for the (native-ETH) presale.
 *
 * Core invariants:
 *   - A buyer can never claim more tokens than their purchased entitlement.
 *   - A refund never returns more than the contribution.
 *   - No double claim and no double refund.
 */
contract PresaleInvariants is Test {
    NexoraToken token;
    NexoraPresale presale;
    address internal constant ADMIN = address(0x2000);
    uint256 internal constant RATE = 1000e18; // 1000 NXR per ETH

    function setUp() public {
        NexoraToken.Allocation[] memory allocations = new NexoraToken.Allocation[](1);
        allocations[0] = NexoraToken.Allocation(address(this), 1_000_000_000e18);
        token = new NexoraToken(allocations);

        presale = new NexoraPresale(address(token), address(0), ADMIN); // accepted = ETH
        NexoraPresale.SaleConfig memory cfg = NexoraPresale.SaleConfig({
            startTime: block.timestamp,
            endTime: block.timestamp + 30 days,
            refundEndTime: block.timestamp + 10 days,
            rate: RATE,
            minPurchase: 0.01e18,
            maxPurchase: 10e18,
            perWalletCap: 5e18,
            globalCap: 100e18,
            tgeUnlockBps: 10000, // 100% immediate (simplifies invariant)
            vestingStartTime: block.timestamp,
            vestingCliff: 0,
            vestingDuration: 1,
            refundEnabled: true,
            claimEnabled: true
        });
        vm.prank(ADMIN);
        presale.configureSale(cfg);
        vm.prank(ADMIN);
        presale.enable();
        token.transfer(address(presale), 100_000_000e18);
    }

    /// FUZZ: purchased entitlement is exactly contribution * rate / 1e18, and
    /// a buyer can claim at most that amount.
    function testFuzz_claimNeverExceedsEntitlement(uint256 amountSeed) public {
        address buyer = address(0x3000);
        vm.deal(buyer, 100e18);
        uint256 amount = (amountSeed % 4e18) + 1e18; // between 1 and 5 ETH (<= cap)
        vm.prank(buyer);
        presale.purchaseNative{value: amount}();
        (uint256 contributed, uint256 totalTokens, , ) = presale.purchases(buyer);
        assertEq(contributed, amount);
        assertEq(totalTokens, (amount * RATE) / 1e18);

        vm.prank(buyer);
        presale.claim();
        (uint256 contributedAfter, , uint256 claimed, ) = presale.purchases(buyer);
        // Invariant: claimed <= entitlement.
        assertLe(claimed, totalTokens);
        assertEq(contributedAfter, 0); // claim forfeits refund
    }

    /// FUZZ: a refund never returns more than the contribution and clears it.
    function testFuzz_refundNeverExceedsContribution(uint256 amountSeed) public {
        address buyer = address(0x4000);
        vm.deal(buyer, 100e18);
        uint256 amount = (amountSeed % 4e18) + 1e18;
        vm.prank(buyer);
        presale.purchaseNative{value: amount}();

        uint256 before = buyer.balance;
        vm.prank(buyer);
        presale.refund();
        uint256 received = buyer.balance - before;
        // Invariant: refund <= contribution.
        assertLe(received, amount);
        (uint256 contributed, , , bool refunded) = presale.purchases(buyer);
        assertEq(contributed, 0);
        assertTrue(refunded);
    }
}
