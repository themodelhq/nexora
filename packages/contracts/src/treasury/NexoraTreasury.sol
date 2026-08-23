// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NexoraTreasury
 * @notice Multi-role treasury controller for the Nexora ecosystem.
 *
 * @dev PURPOSE
 *   The treasury must NOT be controlled by a single private key. This contract
 *   enforces role-based spending where:
 *     - `OPERATOR_ROLE` can submit spend proposals and execute them.
 *     - The deployer/admin setup is expected to set the SPENDER/operator
 *       permissions such that spending flows through a multisig (Safe) and a
 *       Timelock. See docs/TREASURY.md.
 *   Tokens held here (NXR, stablecoins, native ETH) are monitored by the
 *   dashboard. All spending emits `Spend` events for full transparency.
 *
 * SECURITY
 *   - SafeERC20 + ReentrancyGuard.
 *   - Role-based; no single-key control assumed.
 *   - Emergency pause via PAUSER_ROLE.
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraTreasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bool public paused;

    event Spend(address indexed token, address indexed to, uint256 amount, string category);
    event Received(address indexed token, address indexed from, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    /// @param admin_ Address granted DEFAULT_ADMIN_ROLE and PAUSER_ROLE.
    constructor(address admin_) {
        require(admin_ != address(0), "NexoraTreasury: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        // OPERATOR_ROLE must be granted by the admin (typically the multisig)
        // after deployment; it is intentionally NOT granted to the deployer.
    }

    modifier whenNotPaused() {
        require(!paused, "NexoraTreasury: paused");
        _;
    }

    /**
     * @notice Spend ERC-20 tokens from the treasury.
     * @dev Only OPERATOR_ROLE and when not paused. In production the operator
     *      is expected to be a multisig/timelock, so a single EOA cannot spend.
     *      The `category` is emitted for accounting/transparency.
     */
    function spend(
        address token_,
        address to,
        uint256 amount,
        string calldata category
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant {
        require(token_ != address(0) && to != address(0), "NexoraTreasury: zero arg");
        require(amount > 0, "NexoraTreasury: zero amount");
        IERC20(token_).safeTransfer(to, amount);
        emit Spend(token_, to, amount, category);
    }

    /**
     * @notice Spend native ETH from the treasury.
     * @dev Only OPERATOR_ROLE and when not paused.
     */
    function spendNative(address payable to, uint256 amount, string calldata category)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(to != address(0), "NexoraTreasury: zero to");
        require(amount > 0 && address(this).balance >= amount, "NexoraTreasury: insufficient ETH");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "NexoraTreasury: ETH transfer failed");
        emit Spend(address(0), to, amount, category);
    }

    /// @notice Receive native ETH; emits a Received event for transparency.
    receive() external payable {
        emit Received(address(0), msg.sender, msg.value);
    }

    /// @notice View NXR/ERC-20 balance held by the treasury.
    function balanceOf(address token_) external view returns (uint256) {
        return IERC20(token_).balanceOf(address(this));
    }

    /// @notice View native ETH balance held by the treasury.
    function nativeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Pauses spending. Only PAUSER_ROLE.
    function pause() external onlyRole(PAUSER_ROLE) {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Unpauses spending. Only PAUSER_ROLE.
    function unpause() external onlyRole(PAUSER_ROLE) {
        paused = false;
        emit Unpaused(msg.sender);
    }
}
