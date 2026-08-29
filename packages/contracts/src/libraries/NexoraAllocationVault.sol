// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NexoraAllocationVault
 * @notice Token-agnostic allocation escrow used ONLY at genesis to hold a
 *         fixed-supply allocation until the intended destination contract
 *         (vesting / presale) is deployed.
 *
 * @dev WHY THIS EXISTS:
 *   The NXR token has a fixed 1,000,000,000 supply minted at construction, so
 *   every allocation recipient must exist at that moment. Some destinations
 *   (team/advisor vesting, public-sale presale) require the token address in
 *   their constructor. This vault is token-agnostic, so it can be deployed via
 *   CREATE2 BEFORE the token and receive the allocation. The deployment flow
 *   then AUTOMATICALLY forwards the vault's tokens to the actual destination
 *   contract (no manual post-deployment movement).
 *
 * @dev Security: two-step ownership; only the owner can release tokens; it
 *   cannot mint, and it has no other authority. After forwarding, the vault is
 *   empty and can be left in place.
 */
contract NexoraAllocationVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @param initialOwner_ The deployment controller (temporary) with release authority.
    constructor(address initialOwner_) Ownable(initialOwner_) {}

    event Released(address indexed token, address indexed to, uint256 amount);

    /// @notice Releases a token balance held by the vault to `to`.
    /// @dev Only owner (the deployment controller / treasury). The intended
    ///      use is a single automated release to the destination contract.
    function release(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        _release(token, to, amount);
    }

    /// @notice Releases the full balance of `token` to `to` (used after wiring).
    function releaseAll(address token, address to) external onlyOwner nonReentrant {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) _release(token, to, bal);
    }

    function _release(address token, address to, uint256 amount) private {
        require(token != address(0) && to != address(0), "NexoraAllocationVault: zero arg");
        IERC20(token).safeTransfer(to, amount);
        emit Released(token, to, amount);
    }

    /// @notice The NXR balance held by the vault.
    function balanceOf(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
