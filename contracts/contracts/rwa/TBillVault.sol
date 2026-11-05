// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IdentityRegistry} from "../compliance/IdentityRegistry.sol";

/// @title TBillVault (vxTBILL)
/// @notice Tokenised short-dated US Treasury bill fund. Shares are restricted (KYC'd holders and InsureVEX system
///         contracts only). The NAV per share accrues at the fund yield, which the NAV agent updates from the
///         custodian's statement; every NAV update also records an attested reserve (off-chain T-bill holdings).
///         This is the asset that backs every Saver's principal floor.
contract TBillVault is ERC20, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant NAV_ROLE = keccak256("NAV_ROLE");
    uint256 private constant WAD = 1e18;
    uint256 private constant YEAR = 365 days;

    IERC20 public immutable asset;
    IdentityRegistry public immutable identity;
    uint8 private immutable _dec;

    uint256 public navAnchor = WAD; // NAV per share at lastNavUpdate (1e18 = 1 asset unit per share unit)
    uint64 public lastNavUpdate;
    uint32 public apyBps; // current fund yield, simple accrual between updates
    uint256 public attestedReserve; // custodian-reported T-bill holdings (asset units)

    event NavUpdated(uint256 navPerShare, uint32 apyBps, uint256 attestedReserve);
    event Subscribed(address indexed investor, uint256 assets, uint256 shares);
    event Redeemed(address indexed investor, uint256 shares, uint256 assets);
    event YieldFunded(address indexed from, uint256 assets);

    constructor(IERC20 asset_, IdentityRegistry identity_, uint32 apyBps_, address admin)
        ERC20("InsureVEX Tokenised T-Bill", "vxTBILL")
    {
        asset = asset_;
        identity = identity_;
        _dec = ERC20(address(asset_)).decimals();
        apyBps = apyBps_;
        lastNavUpdate = uint64(block.timestamp);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(NAV_ROLE, admin);
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    /// @notice Current NAV per share (1e18 scale), accruing at apyBps since the last NAV update.
    function navPerShare() public view returns (uint256) {
        uint256 dt = block.timestamp - lastNavUpdate;
        return navAnchor + (navAnchor * apyBps * dt) / (10_000 * YEAR);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * navPerShare()) / WAD;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * WAD) / navPerShare();
    }

    function totalAssets() external view returns (uint256) {
        return convertToAssets(totalSupply());
    }

    function deposit(uint256 assets, address receiver) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(identity.isVerified(msg.sender) && identity.isVerified(receiver), "KYC");
        shares = convertToShares(assets);
        require(shares > 0, "zero");
        asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
        emit Subscribed(receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external nonReentrant whenNotPaused returns (uint256 assets) {
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);
        require(identity.isVerified(receiver), "KYC");
        assets = convertToAssets(shares);
        require(asset.balanceOf(address(this)) >= assets, "liquidity: T-bills settling");
        _burn(owner, shares);
        asset.safeTransfer(receiver, assets);
        emit Redeemed(owner, shares, assets);
    }

    /// @notice NAV agent update: roll the accrued NAV into the anchor, set the new yield and attest the reserve.
    function updateNav(uint32 newApyBps, uint256 reserve) external onlyRole(NAV_ROLE) {
        navAnchor = navPerShare();
        lastNavUpdate = uint64(block.timestamp);
        apyBps = newApyBps;
        attestedReserve = reserve;
        emit NavUpdated(navAnchor, newApyBps, reserve);
    }

    /// @notice T-bill coupon/maturity proceeds arriving from the custodian (keeps on-chain liquidity >= liabilities).
    function fundYield(uint256 assets) external {
        asset.safeTransferFrom(msg.sender, address(this), assets);
        emit YieldFunded(msg.sender, assets);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // Transfer restriction: both sides must be KYC'd (or system contracts) and not frozen.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            require(!paused(), "paused");
            require(identity.isVerified(from) && identity.isVerified(to), "transfer restricted");
        }
        super._update(from, to, value);
    }
}
