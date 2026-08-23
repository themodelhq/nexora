// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title NexoraToken (NXR)
 * @notice The fixed-supply ERC-20 utility token of the Nexora ecosystem.
 *
 * @dev DESIGN PRINCIPLES
 *   - Fixed maximum supply. The total supply is set once at construction and
 *     can never change. There is NO minting function and NO owner-controlled
 *     minting. The maximum supply is mathematically enforced by construction.
 *   - Transparent initial allocation. The full 1,000,000,000 NXR is minted at
 *     construction to a caller-provided list of recipients. The sum of all
 *     allocations must exactly equal the maximum supply, which is enforced
 *     on-chain. The recipients (multisigs, vesting contracts, community
 *     wallets, etc.) are public on-chain state.
 *   - No honeypot. No transfer restrictions, no hidden taxes, no blacklist,
 *     no stealth mint, and no ability for any party to confiscate or modify
 *     user balances.
 *   - Immutable / non-upgradeable. The token is deployed once and never
 *     upgraded, minimizing trust and attack surface.
 *   - ERC-20Permit is included for gas-efficient approvals where appropriate.
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraToken is ERC20, ERC20Permit {
    /// @notice Maximum (and fixed) total supply: 1,000,000,000 * 10**18.
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Number of initial allocation recipients.
    uint256 public immutable allocationCount;

    /**
     * @notice One allocation entry: a recipient and the amount of NXR base
     *         units (wei) they receive at genesis.
     */
    struct Allocation {
        address recipient;
        uint256 amount;
    }

    /**
     * @notice Emitted at construction for every recipient funded with tokens.
     * @param recipient The address that received an initial allocation.
     * @param amount The amount of NXR (base units) allocated.
     */
    event InitialAllocation(address indexed recipient, uint256 amount);

    /**
     * @notice Deploys the fixed-supply token and mints the entire maximum
     *         supply to `allocations`.
     * @param allocations Ordered list of {recipient, amount}. The sum of all
     *        `amount` values MUST equal MAX_SUPPLY; otherwise deployment
     *        reverts. No address may appear twice, and no amount may be zero.
     */
    constructor(Allocation[] memory allocations) ERC20("Nexora", "NXR") ERC20Permit("Nexora") {
        require(allocations.length > 0, "NexoraToken: no allocations");

        uint256 total;
        for (uint256 i = 0; i < allocations.length; i++) {
            Allocation memory alloc = allocations[i];
            require(alloc.recipient != address(0), "NexoraToken: zero recipient");
            require(alloc.amount > 0, "NexoraToken: zero amount");
            // Enforce unique recipients so a single address cannot be given
            // multiple distinct allocations (avoids ambiguity and matches the
            // on-chain transparency guarantee).
            for (uint256 j = 0; j < i; j++) {
                require(
                    allocations[j].recipient != alloc.recipient,
                    "NexoraToken: duplicate recipient"
                );
            }
            total += alloc.amount;
            // Mint to the recipient rather than the deployer so the
            // allocation is credited directly to its intended destination.
            _mint(alloc.recipient, alloc.amount);
            emit InitialAllocation(alloc.recipient, alloc.amount);
        }

        // Mathematically enforce the maximum supply. Because ERC-20 has no
        // mint after construction, totalSupply == MAX_SUPPLY forever.
        require(total == MAX_SUPPLY, "NexoraToken: allocation total mismatch");

        allocationCount = allocations.length;
    }
}
