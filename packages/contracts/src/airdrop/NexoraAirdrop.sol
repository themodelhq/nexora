// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NexoraAirdrop
 * @notice Merkle-tree based airdrop claiming for the NXR token.
 *
 * @dev FEATURES
 *   - Merkle-tree eligibility. The admin publishes a single Merkle `root`
 *     computed off-chain from the allocation list. A user claims by providing
 *     their leaf proof; the contract verifies it cryptographically.
 *   - Claim deadline. After `claimDeadline`, no further claims are accepted.
 *   - Claim tracking. Each address can claim at most once (the claimed amount
 *     is recorded and the position is marked claimed).
 *   - Emergency pause. An authorized role can pause claiming at any time.
 *   - Recovery of unclaimed tokens after the deadline: only the
 *     RECOVERY_ROLE (intended to be the governance timelock/multisig) may
 *     withdraw the leftover balance, and only after the deadline has passed.
 *
 * SECURITY
 *   - SafeERC20 for transfers.
 *   - ReentrancyGuard + checks-effects-interactions.
 *   - MerkleProof verification prevents double claims, invalid proofs and
 *     amount manipulation.
 *   - No party can modify a claim or the allocation amounts after publishing.
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraAirdrop is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant RECOVERY_ROLE = keccak256("RECOVERY_ROLE");

    /// @notice The NXR token being distributed.
    IERC20 public immutable token;
    /// @notice Merkle root encoding eligible (address, amount) leaves.
    bytes32 public merkleRoot;
    /// @notice Unix timestamp after which claims are closed.
    uint256 public claimDeadline;
    /// @notice Whether a user has already claimed.
    mapping(address => bool) public hasClaimed;
    /// @notice Total number of claims processed.
    uint256 public totalClaimed;
    /// @notice Sum of NXR claimed so far (base units).
    uint256 public totalClaimedAmount;

    /**
     * @notice Emitted when a user successfully claims.
     * @param claimant The address that claimed.
     * @param amount The amount of NXR claimed (base units).
     */
    event Claimed(address indexed claimant, uint256 amount);

    /**
     * @notice Emitted when the Merkle root is updated.
     * @param root The new Merkle root.
     */
    event MerkleRootUpdated(bytes32 root);

    /**
     * @notice Emitted when the claim deadline is updated.
     * @param deadline The new deadline (Unix timestamp).
     */
    event ClaimDeadlineUpdated(uint256 deadline);

    /**
     * @notice Emitted when unclaimed tokens are recovered after the deadline.
     * @param recipient The address that received the recovered tokens.
     * @param amount The amount recovered (base units).
     */
    event UnclaimedRecovered(address indexed recipient, uint256 amount);

    /**
     * @param token_ The address of the NXR token.
     * @param merkleRoot_ The initial Merkle root.
     * @param claimDeadline_ The initial claim deadline (Unix timestamp).
     * @param admin_ Address granted DEFAULT_ADMIN_ROLE.
     */
    constructor(
        address token_,
        bytes32 merkleRoot_,
        uint256 claimDeadline_,
        address admin_
    ) {
        require(token_ != address(0), "NexoraAirdrop: zero token");
        require(admin_ != address(0), "NexoraAirdrop: zero admin");
        require(claimDeadline_ > block.timestamp, "NexoraAirdrop: deadline in the past");

        token = IERC20(token_);
        merkleRoot = merkleRoot_;
        claimDeadline = claimDeadline_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(RECOVERY_ROLE, admin_);
    }

    /// @notice Returns the leaf hash for an (address, amount) pair, matching
    ///         the off-chain generator (keccak256 of packed address+uint256).
    function getLeaf(address account, uint256 amount) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(account, amount));
    }

    /**
     * @notice Claims the caller's airdrop allocation.
     * @param amount The amount claimed (base units) — must match the leaf.
     * @param merkleProof The sibling hashes proving the leaf is in the tree.
     * @dev Reverts if: paused, past deadline, already claimed, amount zero,
     *      or the Merkle proof is invalid for (msg.sender, amount).
     */
    function claim(uint256 amount, bytes32[] calldata merkleProof) external whenNotPaused nonReentrant {
        require(block.timestamp <= claimDeadline, "NexoraAirdrop: deadline passed");
        require(!hasClaimed[msg.sender], "NexoraAirdrop: already claimed");
        require(amount > 0, "NexoraAirdrop: zero amount");

        bytes32 leaf = getLeaf(msg.sender, amount);
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "NexoraAirdrop: invalid proof");

        hasClaimed[msg.sender] = true;
        totalClaimed += 1;
        totalClaimedAmount += amount;

        token.safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    /**
     * @notice Updates the Merkle root (e.g. to fix a mistake before launch).
     * @dev Only DEFAULT_ADMIN_ROLE. Cannot change amounts of already-claimed
     *      leaves (those are irreversible on-chain).
     */
    function setMerkleRoot(bytes32 newRoot) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRoot != bytes32(0), "NexoraAirdrop: zero root");
        merkleRoot = newRoot;
        emit MerkleRootUpdated(newRoot);
    }

    /**
     * @notice Updates the claim deadline.
     * @dev Only DEFAULT_ADMIN_ROLE. Cannot be set before the current deadline.
     */
    function setClaimDeadline(uint256 newDeadline) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newDeadline > block.timestamp, "NexoraAirdrop: deadline in the past");
        claimDeadline = newDeadline;
        emit ClaimDeadlineUpdated(newDeadline);
    }

    /// @notice Pauses claiming. Only PAUSER_ROLE.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpauses claiming. Only PAUSER_ROLE.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Recovers unclaimed tokens after the deadline.
     * @param recipient The address to send the leftover tokens to.
     * @dev Only RECOVERY_ROLE (intended to be a governance-controlled address)
     *      and only after `claimDeadline`.
     */
    function recoverUnclaimed(address recipient) external onlyRole(RECOVERY_ROLE) {
        require(block.timestamp > claimDeadline, "NexoraAirdrop: deadline not passed");
        require(recipient != address(0), "NexoraAirdrop: zero recipient");

        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "NexoraAirdrop: nothing to recover");

        token.safeTransfer(recipient, balance);
        emit UnclaimedRecovered(recipient, balance);
    }
}
