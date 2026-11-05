// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title IdentityRegistry
/// @notice ERC-3643-style identity registry. One source of truth for who may hold InsureVEX notes and buy cover:
///         KYC status with an expiry, ISO-3166 numeric country code, a freeze flag, and blocked jurisdictions.
///         Contracts (vaults, notes, the cover market) are registered as "system" accounts so they can always transact.
contract IdentityRegistry is AccessControl {
    bytes32 public constant KYC_ROLE = keccak256("KYC_ROLE");

    struct Identity {
        bool verified;
        bool frozen;
        uint16 country; // ISO 3166-1 numeric
        uint64 expiry; // KYC valid until (unix seconds)
    }

    mapping(address => Identity) public identities;
    mapping(address => bool) public isSystem;
    mapping(uint16 => bool) public blockedCountry;

    event IdentitySet(address indexed account, bool verified, uint16 country, uint64 expiry);
    event Frozen(address indexed account, bool frozen);
    event SystemAccount(address indexed account, bool allowed);
    event CountryBlocked(uint16 indexed country, bool blocked);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KYC_ROLE, admin);
    }

    function setIdentity(address account, bool verified, uint16 country, uint64 expiry) public onlyRole(KYC_ROLE) {
        Identity storage id = identities[account];
        id.verified = verified;
        id.country = country;
        id.expiry = expiry;
        emit IdentitySet(account, verified, country, expiry);
    }

    function setIdentities(address[] calldata accounts, uint16 country, uint64 expiry) external onlyRole(KYC_ROLE) {
        for (uint256 i; i < accounts.length; ++i) setIdentity(accounts[i], true, country, expiry);
    }

    function setFrozen(address account, bool frozen) external onlyRole(KYC_ROLE) {
        identities[account].frozen = frozen;
        emit Frozen(account, frozen);
    }

    function setSystem(address account, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isSystem[account] = allowed;
        emit SystemAccount(account, allowed);
    }

    function setCountryBlocked(uint16 country, bool blocked) external onlyRole(DEFAULT_ADMIN_ROLE) {
        blockedCountry[country] = blocked;
        emit CountryBlocked(country, blocked);
    }

    /// @notice True when the account may hold or receive restricted InsureVEX assets right now.
    function isVerified(address account) public view returns (bool) {
        if (isSystem[account]) return true;
        Identity memory id = identities[account];
        return id.verified && !id.frozen && id.expiry >= block.timestamp && !blockedCountry[id.country];
    }

    function isFrozen(address account) external view returns (bool) {
        return identities[account].frozen;
    }
}
