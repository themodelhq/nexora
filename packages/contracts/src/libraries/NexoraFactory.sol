// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/**
 * @title NexoraFactory
 * @notice Minimal CREATE2 factory for deterministic contract deployment.
 *
 * @dev Enables pre-computable deployment addresses (address = keccak256(
 *      0xff, factory, salt, keccak256(initcode))[12:]). Used to deploy the
 *      token-agnostic allocation vaults and (in production) other ecosystem
 *      contracts at addresses known BEFORE the NXR token is deployed, so the
 *      fixed-supply token can mint directly to legitimate destinations.
 *
 *      The factory itself holds no privileges and cannot transfer tokens.
 */
contract NexoraFactory {
    event Deployed(address indexed addr, bytes32 indexed salt);

    /// @notice Returns the deterministic address that `deploy` will create for
    ///         a given salt + initcode, without deploying.
    function predictAddress(bytes32 salt, bytes memory initcode) public view returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(initcode)))))
        );
    }

    /// @notice Deploys `initcode` at a deterministic address derived from `salt`.
    function deploy(bytes32 salt, bytes memory initcode) public returns (address deployed) {
        address predicted = predictAddress(salt, initcode);
        require(predicted.code.length == 0, "NexoraFactory: already deployed");
        assembly {
            deployed := create2(0, add(initcode, 0x20), mload(initcode), salt)
        }
        require(deployed != address(0), "NexoraFactory: create2 failed");
        require(deployed == predicted, "NexoraFactory: address mismatch");
        emit Deployed(deployed, salt);
    }
}
