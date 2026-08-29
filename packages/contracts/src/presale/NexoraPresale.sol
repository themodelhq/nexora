// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NexoraPresale
 * @notice Optionally-enabled token sale for the NXR token, DISABLED by default.
 *
 * @dev PRODUCTION DESIGN (addresses prior audit findings):
 *   - `enabled` flag defaults to FALSE. The sale cannot receive purchases until
 *     an authorized role explicitly enables it after legal/compliance review.
 *   - Explicit purchase amounts. For an ERC-20 accepted token, the buyer calls
 *     `purchase(paymentAmount)` and EXACTLY that amount is pulled via
 *     SafeERC20. For native ETH, `purchaseNative()` validates `msg.value`.
 *     The purchase amount is NEVER inferred from `balanceOf(msg.sender)`.
 *   - Per-buyer `PurchaseRecord` captures contributed asset, total token
 *     entitlement, claimed tokens and refund state. No double-claim, no
 *     double-refund, no over-allocation.
 *   - TGE + vesting accounting. `tgeUnlockBps` is claimable at TGE; the
 *     remainder vests linearly after a cliff over a configured duration. The
 *     vested (unclaimed) remainder is always accounted for — it is never
 *     "lost" when the TGE portion is claimed.
 *   - Refund solvency. `withdrawableFunds()` returns the accepted-asset balance
 *     minus outstanding refund obligations, and `withdrawFunds()` may only send
 *     that amount — admin cannot withdraw funds needed for valid refunds.
 *   - Global cap (`maxContribution`) and per-wallet cap enforced.
 *
 * SECURITY: SafeERC20, ReentrancyGuard, checks-effects-interactions, Pausable.
 * Critical configuration changes emit events.
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraPresale is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct SaleConfig {
        uint256 startTime;
        uint256 endTime;
        uint256 refundEndTime; // last moment a refund may be requested
        /// NXR base units purchased per 1e18 accepted asset units.
        uint256 rate;
        uint256 minPurchase; // min accepted asset amount per purchase
        uint256 maxPurchase; // max accepted asset amount per purchase
        uint256 perWalletCap; // max accepted asset per wallet
        uint256 globalCap; // max accepted asset across all buyers
        uint256 tgeUnlockBps; // bps (0..10000) claimable immediately at TGE
        uint256 vestingStartTime; // when vesting begins
        uint256 vestingCliff; // seconds after vestingStart before remainder vests
        uint256 vestingDuration; // seconds over which the remainder vests
        bool refundEnabled;
        bool claimEnabled;
    }

    /// @notice Per-buyer purchase record.
    struct PurchaseRecord {
        uint256 contributed; // accepted asset contributed, minus refunds
        uint256 totalTokens; // total NXR entitlement (contributed * rate)
        uint256 claimed; // NXR already claimed
        bool refunded; // whether the purchase was fully refunded
    }

    IERC20 public immutable token;
    /// @notice Accepted payment asset (address(0) = native ETH).
    address public immutable acceptedToken;
    /// @notice Whether the sale is enabled. Defaults to FALSE.
    bool public enabled;
    SaleConfig public saleConfig;

    uint256 public totalContributions; // gross accepted asset received
    uint256 public totalTokensSold;
    /// @notice Outstanding accepted asset that may still be refunded.
    uint256 public outstandingRefundObligation;

    mapping(address => PurchaseRecord) public purchases;

    event SaleEnabled(address indexed by);
    event SaleDisabled(address indexed by);
    event Purchased(address indexed buyer, uint256 assetAmount, uint256 tokenAmount);
    event Claimed(address indexed buyer, uint256 tokenAmount);
    event Refunded(address indexed buyer, uint256 assetAmount);
    event ConfigUpdated(SaleConfig config);
    event FundsWithdrawn(address indexed recipient, uint256 assetAmount);

    /// @param token_ The NXR token address.
    /// @param acceptedToken_ Payment asset (address(0) = ETH).
    /// @param admin_ Address granted DEFAULT_ADMIN_ROLE, MANAGER_ROLE, PAUSER_ROLE.
    constructor(address token_, address acceptedToken_, address admin_) {
        require(token_ != address(0) && admin_ != address(0), "NexoraPresale: zero arg");
        token = IERC20(token_);
        acceptedToken = acceptedToken_;
        enabled = false; // DISABLED by default
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MANAGER_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
    }

    // ------------------------------------------------------------------
    // Administration
    // ------------------------------------------------------------------

    /// @notice Configures/updates sale parameters. Only MANAGER_ROLE.
    function configureSale(SaleConfig calldata cfg) external onlyRole(MANAGER_ROLE) {
        require(cfg.startTime < cfg.endTime, "NexoraPresale: bad window");
        require(cfg.rate > 0, "NexoraPresale: zero rate");
        require(cfg.tgeUnlockBps <= 10000, "NexoraPresale: bad tge bps");
        require(cfg.vestingCliff <= cfg.vestingDuration, "NexoraPresale: cliff > duration");
        saleConfig = cfg;
        emit ConfigUpdated(cfg);
    }

    /// @notice Enables the sale (explicit, after legal review). MANAGER_ROLE.
    function enable() external onlyRole(MANAGER_ROLE) {
        require(!enabled, "NexoraPresale: already enabled");
        require(saleConfig.rate > 0, "NexoraPresale: not configured");
        enabled = true;
        emit SaleEnabled(msg.sender);
    }

    /// @notice Disables the sale immediately (emergency / operational). MANAGER_ROLE.
    function disable() external onlyRole(MANAGER_ROLE) {
        enabled = false;
        emit SaleDisabled(msg.sender);
    }

    // ------------------------------------------------------------------
    // Purchase
    // ------------------------------------------------------------------

    modifier whenEnabled() {
        require(enabled, "NexoraPresale: disabled");
        _;
    }

    modifier onlyDuringSale() {
        require(
            block.timestamp >= saleConfig.startTime && block.timestamp <= saleConfig.endTime,
            "NexoraPresale: not in sale window"
        );
        _;
    }

    /// @notice Purchases NXR with an ERC-20 accepted token. Exact `paymentAmount` is pulled.
    function purchase(uint256 paymentAmount)
        external
        whenEnabled
        whenNotPaused
        nonReentrant
        onlyDuringSale
    {
        require(acceptedToken != address(0), "NexoraPresale: native only");
        _executePurchase(msg.sender, paymentAmount);
        IERC20(acceptedToken).safeTransferFrom(msg.sender, address(this), paymentAmount);
    }

    /// @notice Purchases NXR with native ETH. Uses explicit `msg.value`.
    function purchaseNative()
        external
        payable
        whenEnabled
        whenNotPaused
        nonReentrant
        onlyDuringSale
    {
        require(acceptedToken == address(0), "NexoraPresale: ERC20 only");
        _executePurchase(msg.sender, msg.value);
    }

    function _executePurchase(address buyer, uint256 assetAmount) private {
        SaleConfig memory cfg = saleConfig;
        require(assetAmount >= cfg.minPurchase, "NexoraPresale: below min");
        require(assetAmount <= cfg.maxPurchase, "NexoraPresale: above max");
        PurchaseRecord storage rec = purchases[buyer];
        require(rec.contributed + assetAmount <= cfg.perWalletCap, "NexoraPresale: wallet cap exceeded");
        require(totalContributions + assetAmount <= cfg.globalCap, "NexoraPresale: global cap exceeded");

        uint256 tokenAmount = (assetAmount * cfg.rate) / 1e18;
        require(tokenAmount > 0, "NexoraPresale: zero tokens");

        rec.contributed += assetAmount;
        rec.totalTokens += tokenAmount;
        totalContributions += assetAmount;
        totalTokensSold += tokenAmount;
        // If refunds are enabled and the sale/refund window is open, the
        // contribution becomes a refund obligation until claimed or refunded.
        if (cfg.refundEnabled && block.timestamp < cfg.refundEndTime) {
            outstandingRefundObligation += assetAmount;
        }

        emit Purchased(buyer, assetAmount, tokenAmount);
    }

    // ------------------------------------------------------------------
    // Vesting / claiming
    // ------------------------------------------------------------------

    /// @notice Amount of NXR currently claimable for a buyer.
    function claimableAmount(address buyer) public view returns (uint256) {
        PurchaseRecord storage rec = purchases[buyer];
        if (rec.claimed >= rec.totalTokens) return 0;
        uint256 unlocked = _unlockedTokens(rec.totalTokens, saleConfig);
        return unlocked > rec.claimed ? unlocked - rec.claimed : 0;
    }

    function _unlockedTokens(uint256 totalTokens, SaleConfig memory cfg) private view returns (uint256) {
        if (totalTokens == 0) return 0;
        uint256 tge = (totalTokens * cfg.tgeUnlockBps) / 10000;
        uint256 vested = totalTokens - tge;
        if (vested == 0) return totalTokens;
        // Before vesting start / during cliff: only the TGE portion is unlocked.
        if (block.timestamp < cfg.vestingStartTime + cfg.vestingCliff) return tge;
        uint256 end = cfg.vestingStartTime + cfg.vestingDuration;
        if (block.timestamp >= end) return totalTokens;
        uint256 elapsed = block.timestamp - (cfg.vestingStartTime + cfg.vestingCliff);
        uint256 vestPeriod = cfg.vestingDuration - cfg.vestingCliff;
        if (vestPeriod == 0) return totalTokens;
        return tge + (vested * elapsed) / vestPeriod;
    }

    /// @notice Claims currently-claimable NXR. Safe: reentrancy-guarded,
    ///         updates record before transfer, and cannot exceed entitlement.
    function claim() external whenEnabled whenNotPaused nonReentrant {
        require(saleConfig.claimEnabled, "NexoraPresale: claim not enabled");
        PurchaseRecord storage rec = purchases[msg.sender];
        uint256 amount = claimableAmount(msg.sender);
        require(amount > 0, "NexoraPresale: nothing to claim");

        rec.claimed += amount;
        // Claiming forfeits the refund on the (unclaimed) remainder.
        if (rec.contributed > 0 && outstandingRefundObligation >= rec.contributed) {
            outstandingRefundObligation -= rec.contributed;
        }
        rec.contributed = 0;

        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Refund (with solvency enforcement)
    // ------------------------------------------------------------------

    /// @notice Refunds a buyer's contribution. Only within the refund window and
    ///         only if no tokens have been claimed. Emits Refunded.
    function refund() external whenEnabled whenNotPaused nonReentrant {
        SaleConfig memory cfg = saleConfig;
        require(cfg.refundEnabled, "NexoraPresale: refunds disabled");
        require(block.timestamp < cfg.refundEndTime, "NexoraPresale: refund window closed");

        PurchaseRecord storage rec = purchases[msg.sender];
        require(rec.contributed > 0, "NexoraPresale: nothing to refund");
        require(rec.claimed == 0, "NexoraPresale: already claimed");

        uint256 assetAmount = rec.contributed;
        // Clear entitlement.
        rec.contributed = 0;
        rec.totalTokens = 0;
        rec.refunded = true;
        if (outstandingRefundObligation >= assetAmount) {
            outstandingRefundObligation -= assetAmount;
        }

        if (acceptedToken == address(0)) {
            (bool ok, ) = payable(msg.sender).call{value: assetAmount}("");
            require(ok, "NexoraPresale: refund failed");
        } else {
            IERC20(acceptedToken).safeTransfer(msg.sender, assetAmount);
        }
        emit Refunded(msg.sender, assetAmount);
    }

    // ------------------------------------------------------------------
    // Withdrawal (solvency-aware)
    // ------------------------------------------------------------------

    /// @notice Accepted-asset balance held by the contract.
    function acceptedAssetBalance() public view returns (uint256) {
        if (acceptedToken == address(0)) return address(this).balance;
        return IERC20(acceptedToken).balanceOf(address(this));
    }

    /// @notice Amount of the accepted asset that may be withdrawn without
    ///         breaking outstanding refund obligations.
    function withdrawableFunds() public view returns (uint256) {
        uint256 bal = acceptedAssetBalance();
        return bal > outstandingRefundObligation ? bal - outstandingRefundObligation : 0;
    }

    /// @notice Withdraws only `withdrawableFunds()` to a treasury address.
    ///         Cannot touch funds reserved for outstanding refunds.
    function withdrawFunds(address recipient) external onlyRole(MANAGER_ROLE) nonReentrant {
        require(recipient != address(0), "NexoraPresale: zero recipient");
        uint256 amount = withdrawableFunds();
        require(amount > 0, "NexoraPresale: nothing to withdraw");
        if (acceptedToken == address(0)) {
            (bool ok, ) = payable(recipient).call{value: amount}("");
            require(ok, "NexoraPresale: withdraw failed");
        } else {
            IERC20(acceptedToken).safeTransfer(recipient, amount);
        }
        emit FundsWithdrawn(recipient, amount);
    }

    // ------------------------------------------------------------------
    // Pause
    // ------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice NXR held by the contract (for claiming).
    function tokenBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
