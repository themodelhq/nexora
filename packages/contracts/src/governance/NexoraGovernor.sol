// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC5805} from "@openzeppelin/contracts/interfaces/IERC5805.sol";

/**
 * @title NexoraGovernor
 * @notice On-chain governance for the Nexora ecosystem, built on OpenZeppelin's
 *         audited Governor framework.
 *
 * @dev FEATURES
 *   - Proposal creation by any address holding enough voting power (the
 *     proposer threshold is set at construction).
 *   - Voting (for/against/abstain) with weight from the NXR vote token.
 *   - Quorum as a fraction of total supply.
 *   - Timelock-gated execution: proposals become executable only after a delay
 *     and can be cancelled, ensuring no single wallet can force an action.
 *
 * The contract is designed to be deployed with a `NexoraVoteToken` (an
 * ERC20Votes/ERC20VotesUpgradeable token) or any IVotes token. For a launch
 * that does not yet have a separate vote token, the treasury/team may use a
 * governance token wrapper; see docs/GOVERNANCE.md.
 *
 * @custom:security-contact See docs/SECURITY.md — NOT independently audited yet.
 */
contract NexoraGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    constructor(
        IVotes voteToken_,
        TimelockController timelock_,
        uint48 votingDelay,
        uint32 votingPeriod,
        uint256 proposalThreshold,
        uint256 quorumNumeratorValue
    )
        Governor("NexoraGovernor")
        GovernorSettings(votingDelay, votingPeriod, proposalThreshold)
        GovernorVotes(voteToken_)
        GovernorVotesQuorumFraction(quorumNumeratorValue)
        GovernorTimelockControl(timelock_)
    {}

    // --- Overrides required by the multi-inheritance Governor ---

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorumNumerator() public view override(GovernorVotesQuorumFraction) returns (uint256) {
        return super.quorumNumerator();
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function supportsInterface(bytes4 interfaceId) public view override(Governor) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Proposal must be queued through the timelock before execution.
    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }
}
