
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract NexoraDeterministicTestTarget {
    uint256 public constant MARKER = 3406;

    function marker() external pure returns (uint256) {
        return MARKER;
    }
}
