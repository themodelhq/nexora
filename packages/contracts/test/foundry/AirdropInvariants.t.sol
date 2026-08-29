// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexoraToken} from "../../src/token/NexoraToken.sol";
import {NexoraAirdrop} from "../../src/airdrop/NexoraAirdrop.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title AirdropInvariants
 * @notice Invariant & fuzz tests for the Merkle airdrop.
 *
 * Core invariants:
 *   - No address can claim more than once (hasClaimed) and no address can
 *     claim more than its leaf allocation.
 *   - Total claimed amount never exceeds the funded total.
 */
contract AirdropInvariants is Test {
    NexoraToken token;
    NexoraAirdrop airdrop;
    bytes32 root;

    address internal constant RECIPIENT = address(0x1000);
    address internal constant ADMIN = address(0x2000);
    uint256 internal constant TOTAL_ALLOC = 100_000e18; // funded

    function setUp() public {
        // Allocate to the test contract so it can fund the airdrop.
        NexoraToken.Allocation[] memory allocations = new NexoraToken.Allocation[](1);
        allocations[0] = NexoraToken.Allocation(address(this), 1_000_000_000e18);
        token = new NexoraToken(allocations);

        // Build a tiny Merkle tree of 2 leaves.
        bytes32 leaf1 = airdropLeaf(address(0x3000), 40_000e18);
        bytes32 leaf2 = airdropLeaf(address(0x4000), 60_000e18);
        root = leaf1 <= leaf2 ? keccak256(abi.encodePacked(leaf1, leaf2)) : keccak256(abi.encodePacked(leaf2, leaf1));

        airdrop = new NexoraAirdrop(address(token), root, block.timestamp + 30 days, ADMIN);
        token.transfer(address(airdrop), TOTAL_ALLOC);
    }

    function airdropLeaf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(account, amount));
    }

    /// Returns the correct sibling proof for user 0x3000 (sibling leaf is the
    /// 0x4000/60k leaf) or 0x4000 (sibling leaf is the 0x3000/40k leaf).
    function _proofFor(address account) internal pure returns (bytes32[] memory) {
        bytes32 sibling;
        if (account == address(0x3000)) {
            sibling = airdropLeaf(address(0x4000), 60_000e18);
        } else {
            sibling = airdropLeaf(address(0x3000), 40_000e18);
        }
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = sibling;
        return proof;
    }

    /// FUZZ: a valid proof lets an address claim exactly its allocation once;
    /// a second claim reverts. Total claimed never exceeds the allocation.
    function testFuzz_claimOnceAndNoDouble(uint256) public {
        address user = address(0x3000);
        uint256 alloc = 40_000e18;
        bytes32[] memory proof = _proofFor(user);

        vm.prank(user);
        airdrop.claim(alloc, proof);
        assertEq(token.balanceOf(user), alloc);
        assertTrue(airdrop.hasClaimed(user));
        // Invariant: claimed <= total funded.
        assertLe(airdrop.totalClaimedAmount(), TOTAL_ALLOC);

        // Double claim reverts.
        vm.prank(user);
        vm.expectRevert();
        airdrop.claim(alloc, proof);
    }

    /// FUZZ: a tampered amount (not matching the leaf) is rejected.
    function testFuzz_tamperedAmountRejected(uint256 amount) public {
        address user = address(0x3000);
        uint256 alloc = 40_000e18;
        uint256 wrong = amount % alloc; // could be 0 or != alloc
        bytes32[] memory proof = _proofFor(user);
        if (wrong == alloc) {
            // valid case handled elsewhere; just return
            return;
        }
        vm.prank(user);
        vm.expectRevert();
        airdrop.claim(wrong, proof);
    }
}
