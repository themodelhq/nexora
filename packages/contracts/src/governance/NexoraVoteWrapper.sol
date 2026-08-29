// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {NexoraVoteToken} from "./NexoraVoteToken.sol";

/**
 * @title NexoraVoteWrapper
 * @notice Transparent 1:1 NXR → governance vote-token (NXVT) wrapper.
 *
 * @dev WHY THIS EXISTS (addresses audit finding H1):
 *   Voting power must be derived transparently from NXR, not minted
 *   arbitrarily by an administrator. Users deposit NXR here and receive NXVT
 *   1:1; NXVT is the ERC20Votes token the Governor reads. To withdraw, a user
 *   burns NXVT and gets NXR back 1:1. Consequently:
 *       total NXVT supply  ==  NXR deposited in the wrapper
 *   and NO single administrator can inflate voting power — minting happens only
 *   on a real NXR deposit, and burning only on a real withdrawal.
 *
 * The wrapper holds the vote token's MINTER_ROLE but only mints inside
 * `deposit` (permissionless, backed by NXR). It is not an admin-controlled
 * faucet.
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraVoteWrapper is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable nxr; // NXR token
    NexoraVoteToken public immutable voteToken; // NXVT

    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);

    constructor(address nxr_, address voteToken_) {
        require(nxr_ != address(0) && voteToken_ != address(0), "NexoraVoteWrapper: zero arg");
        nxr = IERC20(nxr_);
        voteToken = NexoraVoteToken(voteToken_);
    }

    /// @notice Deposit NXR to mint NXVT 1:1. Requires prior NXR approval.
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "NexoraVoteWrapper: zero amount");
        nxr.safeTransferFrom(msg.sender, address(this), amount);
        voteToken.mint(msg.sender, amount);
        emit Deposit(msg.sender, amount);
    }

    /// @notice Withdraw NXR by burning NXVT 1:1.
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "NexoraVoteWrapper: zero amount");
        voteToken.burn(msg.sender, amount);
        nxr.safeTransfer(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
    }

    /// @notice NXVT supply is always equal to the NXR held here.
    function backedSupply() external view returns (uint256) {
        return nxr.balanceOf(address(this));
    }
}
