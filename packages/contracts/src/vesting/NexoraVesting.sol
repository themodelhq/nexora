// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NexoraVesting
 * @notice Time-based token vesting with cliff and linear release for team,
 *         advisors, partners, investors and grants.
 *
 * @dev FEATURES
 *   - Beneficiary-specific schedules (total amount, start, cliff, duration).
 *   - Cliff: no tokens unlock before `start + cliff`.
 *   - Linear vesting: after the cliff, tokens release continuously.
 *   - Revocable schedules: an authorized role can revoke a schedule, causing
 *     all unvested tokens to return to the vesting contract (from which they
 *     can be swept by the recovery role). Non-revocable schedules are immune.
 *   - Claim any time up to the currently vested, unclaimed amount.
 *
 * SECURITY
 *   - SafeERC20 + ReentrancyGuard + checks-effects-interactions.
 *   - AccessControl for schedule management and recovery.
 *   - Once-created schedules cannot be modified (only revoked if revocable),
 *     preventing privileged manipulation of a beneficiary's entitlement.
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraVesting is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant RECOVERY_ROLE = keccak256("RECOVERY_ROLE");

    struct Schedule {
        address beneficiary;
        uint256 totalAmount;
        uint256 claimed;
        uint64 startTime;
        uint64 cliffDuration;
        uint64 duration; // total vesting duration incl. cliff
        bool revocable;
        bool revoked;
        /// @notice Amount vested at the moment the schedule was revoked. A
        ///         revoked beneficiary can still claim this amount.
        uint256 vestedAtRevoke;
    }

    /// @notice The NXR token being vested.
    IERC20 public immutable token;
    /// @notice Counter of created schedules.
    uint256 public nextScheduleId;
    /// @notice scheduleId -> Schedule.
    mapping(uint256 => Schedule) public schedules;
    /// @notice Total NXR reserved for active (non-swept) schedules. Recovery
    ///         may never touch these tokens.
    uint256 public totalReserved;

    /**
     * @notice Emitted when a schedule is created.
     */
    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 duration,
        bool revocable
    );

    /**
     * @notice Emitted when a beneficiary claims vested tokens.
     */
    event Claimed(uint256 indexed scheduleId, address indexed beneficiary, uint256 amount);

    /**
     * @notice Emitted when a schedule is revoked.
     */
    event ScheduleRevoked(uint256 indexed scheduleId);

    /// @param token_ The NXR token address.
    /// @param admin_ Address granted DEFAULT_ADMIN_ROLE and MANAGER_ROLE.
    constructor(address token_, address admin_) {
        require(token_ != address(0), "NexoraVesting: zero token");
        require(admin_ != address(0), "NexoraVesting: zero admin");
        token = IERC20(token_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MANAGER_ROLE, admin_);
        _grantRole(RECOVERY_ROLE, admin_);
    }

    /**
     * @notice Creates a vesting schedule, requiring that sufficient UNRESERVED
     *         tokens are already held by this contract to back it.
     * @dev Only MANAGER_ROLE. Enforces `totalReserved + amount <= funded
     *      balance`, so a schedule cannot be created without adequate funding
     *      unless the tokens are already present. For a single atomic fund+
     *      create, use `fundAndCreateSchedule`.
     */
    function createSchedule(
        address beneficiary,
        uint256 totalAmount,
        uint64 startTime,
        uint64 cliffDuration,
        uint64 duration,
        bool revocable
    ) external onlyRole(MANAGER_ROLE) returns (uint256) {
        require(beneficiary != address(0), "NexoraVesting: zero beneficiary");
        require(totalAmount > 0, "NexoraVesting: zero amount");
        require(duration > 0, "NexoraVesting: zero duration");
        require(cliffDuration <= duration, "NexoraVesting: cliff > duration");
        require(startTime >= block.timestamp, "NexoraVesting: start in past");
        // Solvency: there must be enough unreserved tokens already funded.
        require(unreserved() >= totalAmount, "NexoraVesting: insufficient funding");

        return _create(beneficiary, totalAmount, startTime, cliffDuration, duration, revocable);
    }

    /**
     * @notice Atomically pulls `totalAmount` from the caller (prior approval
     *         required) and creates the schedule. Guarantees the schedule is
     *         fully funded at creation.
     * @dev Only MANAGER_ROLE.
     */
    function fundAndCreateSchedule(
        address beneficiary,
        uint256 totalAmount,
        uint64 startTime,
        uint64 cliffDuration,
        uint64 duration,
        bool revocable
    ) external onlyRole(MANAGER_ROLE) returns (uint256) {
        require(beneficiary != address(0), "NexoraVesting: zero beneficiary");
        require(totalAmount > 0, "NexoraVesting: zero amount");
        require(duration > 0, "NexoraVesting: zero duration");
        require(cliffDuration <= duration, "NexoraVesting: cliff > duration");
        require(startTime >= block.timestamp, "NexoraVesting: start in past");

        token.safeTransferFrom(msg.sender, address(this), totalAmount);
        return _create(beneficiary, totalAmount, startTime, cliffDuration, duration, revocable);
    }

    function _create(
        address beneficiary,
        uint256 totalAmount,
        uint64 startTime,
        uint64 cliffDuration,
        uint64 duration,
        bool revocable
    ) private returns (uint256) {
        uint256 id = nextScheduleId;
        nextScheduleId += 1;
        schedules[id] = Schedule({
            beneficiary: beneficiary,
            totalAmount: totalAmount,
            claimed: 0,
            startTime: startTime,
            cliffDuration: cliffDuration,
            duration: duration,
            revocable: revocable,
            revoked: false,
            vestedAtRevoke: 0
        });
        totalReserved += totalAmount;
        emit ScheduleCreated(id, beneficiary, totalAmount, startTime, cliffDuration, duration, revocable);
        return id;
    }

    /**
     * @notice Funds the contract so schedules can be paid out.
     * @dev Pulls `amount` NXR from the caller. Requires prior approval.
     */
    function fund(uint256 amount) external {
        require(amount > 0, "NexoraVesting: zero amount");
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Tokens held but not reserved for any active schedule.
    function unreserved() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        return bal > totalReserved ? bal - totalReserved : 0;
    }

    /**
     * @notice Returns the amount vested and claimable for a schedule.
     * @dev Linear release after the cliff. Revoked schedules release nothing
     *      further (already-vested amounts may still be claimed).
     */
    function vestedAmount(uint256 scheduleId) public view returns (uint256) {
        Schedule storage s = schedules[scheduleId];
        return _vestedAmount(s);
    }

    function _vestedAmount(Schedule storage s) private view returns (uint256) {
        if (s.revoked) {
            // Frozen at the amount vested up to the revocation time.
            return s.vestedAtRevoke;
        }
        if (s.totalAmount == 0) return 0;

        uint256 endTime = uint256(s.startTime) + uint256(s.duration);
        if (block.timestamp < uint256(s.startTime) + uint256(s.cliffDuration)) {
            return 0;
        }
        if (block.timestamp >= endTime) {
            return s.totalAmount;
        }

        // Linear fraction elapsed since start.
        uint256 elapsed = block.timestamp - s.startTime;
        uint256 releasable = (s.totalAmount * elapsed) / s.duration;
        return releasable > s.totalAmount ? s.totalAmount : releasable;
    }

    /// @notice Amount a schedule can still claim right now.
    function claimableAmount(uint256 scheduleId) public view returns (uint256) {
        Schedule storage s = schedules[scheduleId];
        uint256 vested = _vestedAmount(s);
        return vested > s.claimed ? vested - s.claimed : 0;
    }

    /**
     * @notice Claims currently claimable tokens for a schedule.
     * @param scheduleId The schedule id.
     * @dev Only the beneficiary (or a caller the beneficiary authorized is
     *      NOT supported to keep it simple and safe) may claim. The
     *      beneficiary transfers directly.
     */
    function claim(uint256 scheduleId) external nonReentrant {
        Schedule storage s = schedules[scheduleId];
        require(msg.sender == s.beneficiary, "NexoraVesting: not beneficiary");

        uint256 amount = claimableAmount(scheduleId);
        require(amount > 0, "NexoraVesting: nothing to claim");

        s.claimed += amount;
        totalReserved -= amount;
        token.safeTransfer(s.beneficiary, amount);
        emit Claimed(scheduleId, s.beneficiary, amount);
    }

    /**
     * @notice Revokes a revocable schedule.
     * @dev Only MANAGER_ROLE. Only for schedules flagged revocable. All
     *      already-vested (but not yet claimed) amounts remain claimable;
     *      unvested amounts become non-vesting (released later via
     *      `sweepRevoked`).
     */
    function revoke(uint256 scheduleId) external onlyRole(MANAGER_ROLE) {
        Schedule storage s = schedules[scheduleId];
        require(s.revocable, "NexoraVesting: not revocable");
        require(!s.revoked, "NexoraVesting: already revoked");
        // Freeze the amount already vested so the beneficiary can still claim it.
        s.vestedAtRevoke = _vestedAmount(s);
        s.revoked = true;
        emit ScheduleRevoked(scheduleId);
    }

    /**
     * @notice Sends unvested tokens of a revoked schedule back to the recovery
     *         address (the treasury/governance).
     * @dev Only RECOVERY_ROLE. Only for revoked schedules, and only the amount
     *      that never vested.
     */
    function sweepRevoked(uint256 scheduleId, address recipient) external onlyRole(RECOVERY_ROLE) {
        Schedule storage s = schedules[scheduleId];
        require(s.revoked, "NexoraVesting: not revoked");
        require(recipient != address(0), "NexoraVesting: zero recipient");

        uint256 unvested = s.totalAmount > s.vestedAtRevoke ? s.totalAmount - s.vestedAtRevoke : 0;
        // Free the previously reserved unvested portion.
        totalReserved -= unvested;
        if (unvested > 0) {
            token.safeTransfer(recipient, unvested);
        }
    }

    /// @notice Total NXR reserved for active vesting schedules.
    function reservedTokens() public view returns (uint256) {
        return totalReserved;
    }

    /// @notice Amount of tokens that can be safely recovered (nothing reserved
    ///         for active schedules).
    function availableRecovery() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        return bal > totalReserved ? bal - totalReserved : 0;
    }

    /// @notice Sends ONLY genuinely unreserved tokens to a recovery address.
    /// @dev Only RECOVERY_ROLE. Never touches tokens reserved for active
    ///      schedules.
    function sweep(address token_, address recipient) external onlyRole(RECOVERY_ROLE) {
        require(token_ != address(0) && recipient != address(0), "NexoraVesting: zero arg");
        require(token_ == address(token), "NexoraVesting: token mismatch");
        uint256 amount = availableRecovery();
        if (amount > 0) {
            IERC20(token_).safeTransfer(recipient, amount);
        }
    }
}
