// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NexoraStaking
 * @notice NXR staking with a funded, solvent reward pool.
 *
 * @dev UNITS (documented precisely):
 *   - Token decimals: 18. All token amounts are in wei (1e-18 NXR).
 *   - rewardRate: NXR wei per second (= amount_wei / rewardsDuration_seconds).
 *   - rewardsDuration, periodFinish, lastUpdateTime: seconds (Unix time).
 *   - rewardPerToken: scaled by 1e18 (precision per 1 token). The 1e18 scaling
 *     appears ONLY in rewardPerToken()/earned() — it is NOT applied to the
 *     time/rate or reserve arithmetic.
 *   - stake, totalStaked, rewards, totalRewardsPaid, totalRewardsFunded: wei.
 *
 * SOLVENCY INVARIANT (always holds):
 *     token.balanceOf(this)  >=  totalStaked + (totalRewardsFunded - totalRewardsPaid)
 *   i.e. principal + all funded-but-unpaid rewards are always reserved.
 *   `availableSurplus()` returns only what exceeds that, and `recoverSurplus`
 *   can never touch principal or committed/accrued rewards.
 *
 * RENEWAL: `notifyRewardAmount` carries the leftover of an active period
 * forward in token wei (`remainingSeconds * rewardRate`, NO extra /1e18) and
 * starts a new period over `rewardsDuration`.
 *
 * SECURITY: SafeERC20, ReentrancyGuard, Pausable, checks-effects-interactions,
 * role-based access (REWARD_GRANTOR, PAUSER).
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraStaking is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant REWARD_GRANTOR_ROLE = keccak256("REWARD_GRANTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable token;

    // --- Reward accounting (Synthetix-style, unit-isolated) ---
    uint256 public rewardRate; // NXR wei per second
    uint256 public rewardsDuration; // seconds
    uint256 public periodFinish; // unix seconds
    uint256 public lastUpdateTime; // unix seconds
    uint256 public rewardPerTokenStored; // 1e18-scaled
    uint256 public totalStaked; // wei
    uint256 public totalRewardsPaid; // wei (lifetime claimed)
    uint256 public totalRewardsFunded; // wei (lifetime funded)

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public lastStakeTime;

    bool public enabled;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardAdded(uint256 reward, uint256 rate, uint256 duration, uint256 leftover);
    event Enabled(address indexed by);
    event Disabled(address indexed by);
    event SurplusRecovered(address indexed recipient, uint256 amount);

    constructor(address token_, address admin_, uint256 rewardsDuration_) {
        require(token_ != address(0), "NexoraStaking: zero token");
        require(admin_ != address(0), "NexoraStaking: zero admin");
        require(rewardsDuration_ > 0, "NexoraStaking: zero duration");
        token = IERC20(token_);
        rewardsDuration = rewardsDuration_;
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp;
        enabled = false; // DISABLED by default
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(REWARD_GRANTOR_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    /// @notice Reward per token, 1e18-scaled. The 1e18 is precision scaling
    ///         confined to this per-token calculation.
    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return
            rewardPerTokenStored +
            ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / totalStaked;
    }

    /// @notice Earned (accrued + unclaimed) rewards for `account`, in wei.
    function earned(address account) public view returns (uint256) {
        return
            (stakedBalance[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18 +
            rewards[account];
    }

    /// @notice Outstanding reward obligations to stakers (funded but not yet paid), in wei.
    function outstandingRewardObligations() public view returns (uint256) {
        return totalRewardsFunded - totalRewardsPaid;
    }

    /// @notice Tokens genuinely available as surplus: everything beyond staker
    ///         principal + funded-but-unpaid rewards. Independent of rewardRate.
    function availableSurplus() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        uint256 reserved = totalStaked + outstandingRewardObligations();
        return bal > reserved ? bal - reserved : 0;
    }

    function _updateReward(address account) private {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    // ------------------------------------------------------------------
    // Funding / renewal
    // ------------------------------------------------------------------

    /**
     * @notice Funds the reward pool and (re)starts the emission period.
     * @param amount NXR wei to distribute over `rewardsDuration`.
     * @dev Pulls `amount` from the caller (requires approval). If an active
     *      period exists, the leftover (remainingSeconds * rewardRate, in wei,
     *      NO /1e18) is carried forward and combined with the new amount.
     *      Only REWARD_GRANTOR.
     */
    function notifyRewardAmount(uint256 amount) external onlyRole(REWARD_GRANTOR_ROLE) nonReentrant {
        require(amount > 0, "NexoraStaking: zero reward");
        _updateReward(address(0));
        token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 leftover;
        if (block.timestamp < periodFinish) {
            uint256 remaining = periodFinish - block.timestamp; // seconds
            leftover = remaining * rewardRate; // wei — no 1e18 division
        }
        rewardRate = (amount + leftover) / rewardsDuration;
        totalRewardsFunded += amount;
        periodFinish = block.timestamp + rewardsDuration;
        lastUpdateTime = block.timestamp;
        emit RewardAdded(amount, rewardRate, rewardsDuration, leftover);
    }

    // ------------------------------------------------------------------
    // Staking
    // ------------------------------------------------------------------

    function stake(uint256 amount) external whenEnabled whenNotPaused nonReentrant {
        require(amount > 0, "NexoraStaking: zero amount");
        _updateReward(msg.sender);
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
        lastStakeTime[msg.sender] = block.timestamp;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external whenEnabled whenNotPaused nonReentrant {
        require(amount > 0, "NexoraStaking: zero amount");
        require(stakedBalance[msg.sender] >= amount, "NexoraStaking: insufficient stake");
        _updateReward(msg.sender);
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Claims accrued rewards. Rewards are paid from the funded pool;
    ///         the solvency require guarantees the pool holds principal + amount.
    function claimRewards() external whenEnabled whenNotPaused nonReentrant {
        _updateReward(msg.sender);
        uint256 amount = rewards[msg.sender];
        require(amount > 0, "NexoraStaking: nothing to claim");
        require(token.balanceOf(address(this)) >= totalStaked + amount, "NexoraStaking: reward pool insufficient");
        rewards[msg.sender] = 0;
        totalRewardsPaid += amount;
        token.safeTransfer(msg.sender, amount);
        emit RewardClaimed(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Admin controls
    // ------------------------------------------------------------------

    function enable() external onlyRole(REWARD_GRANTOR_ROLE) {
        require(rewardRate > 0, "NexoraStaking: pool not funded");
        enabled = true;
        emit Enabled(msg.sender);
    }

    function disable() external onlyRole(REWARD_GRANTOR_ROLE) {
        enabled = false;
        emit Disabled(msg.sender);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    modifier whenEnabled() {
        require(enabled, "NexoraStaking: disabled");
        _;
    }

    /// @notice Recovers ONLY genuinely surplus tokens. Can never withdraw
    ///         staker principal, accrued rewards, or committed future rewards.
    function recoverSurplus(address recipient) external onlyRole(REWARD_GRANTOR_ROLE) nonReentrant {
        require(recipient != address(0), "NexoraStaking: zero recipient");
        uint256 surplus = availableSurplus();
        require(surplus > 0, "NexoraStaking: nothing to recover");
        token.safeTransfer(recipient, surplus);
        emit SurplusRecovered(recipient, surplus);
    }
}
