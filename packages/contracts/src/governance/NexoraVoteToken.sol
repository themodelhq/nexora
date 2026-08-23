// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Votes} from "@openzeppelin/contracts/governance/utils/Votes.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title NexoraVoteToken
 * @notice Optional governance voting token (ERC20Votes) for NexoraGovernor.
 *
 * @dev This is a SEPARATE token from NXR. It represents governance voting
 *      power only and does not carry economic value. It is minted by an
 *      authorized role (typically a wrapper that accepts staked NXR, or the
 *      governance setup) so that voting power can be distributed without
 *      touching the fixed NXR supply.
 *
 * NOTE: If governance is not needed at launch, this contract can be skipped.
 *      The NXR token itself remains the canonical ecosystem token.
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraVoteToken is ERC20, ERC20Permit, ERC20Votes, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @param admin_ Address granted DEFAULT_ADMIN_ROLE and MINTER_ROLE.
    constructor(address admin_) ERC20("Nexora Vote", "NXVT") ERC20Permit("Nexora Vote") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }

    // --- ERC20Votes overrides ---
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }

    function _useNonce(address owner) internal override(Nonces) returns (uint256 current) {
        return super._useNonce(owner);
    }

    function clock() public view override(Votes) returns (uint48) {
        return super.clock();
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public view override(Votes) returns (string memory) {
        return super.CLOCK_MODE();
    }
}
