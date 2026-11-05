// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IdentityRegistry} from "../compliance/IdentityRegistry.sol";
import {TBillVault} from "../rwa/TBillVault.sol";

/// @title UnderwritingPool (vxUW)
/// @notice The pool of Savers' sleeves that sells crash floors. Every open policy is FULLY collateralised:
///         its maximum payout is locked here until it settles. Risk rules enforced on-chain (from the backtest):
///           - reserve R: only (1 - R) of pool assets may ever back policies;
///           - per-symbol cap m: one stock may use at most m of that capacity;
///           - withdrawals can never touch locked collateral.
///         Idle cash is parked in the tokenised T-bill vault so the pool earns the T-bill yield on top of premiums.
contract UnderwritingPool is ERC4626, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant MARKET_ROLE = keccak256("MARKET_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    IdentityRegistry public immutable identity;
    TBillVault public tbill; // optional idle-cash sleeve

    uint16 public reserveBps = 5_000; // R
    uint16 public symbolCapBps = 1_000; // m, share of working capacity per symbol
    uint256 public locked; // sum of max payouts of open policies
    mapping(bytes32 => uint256) public lockedBySymbol;

    uint256 public totalPremiums;
    uint256 public totalPayouts;

    event Locked(bytes32 indexed symbol, uint256 amount, uint256 totalLocked);
    event Unlocked(bytes32 indexed symbol, uint256 amount, uint256 totalLocked);
    event PremiumBooked(bytes32 indexed symbol, uint256 amount);
    event ClaimPaid(bytes32 indexed symbol, address indexed to, uint256 amount);
    event RiskParams(uint16 reserveBps, uint16 symbolCapBps);
    event IdleInvested(uint256 assets);
    event IdleDivested(uint256 assets);

    constructor(IERC20 asset_, IdentityRegistry identity_, address admin)
        ERC4626(asset_)
        ERC20("InsureVEX Underwriting Pool", "vxUW")
    {
        identity = identity_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
    }

    // ---------------------------------------------------------------- accounting
    function cash() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function tbillAssets() public view returns (uint256) {
        return address(tbill) == address(0) ? 0 : tbill.convertToAssets(tbill.balanceOf(address(this)));
    }

    function totalAssets() public view override returns (uint256) {
        return cash() + tbillAssets();
    }

    /// @notice Max payout the pool may still commit (working capital minus what is already locked).
    function capacity() public view returns (uint256) {
        uint256 working = (totalAssets() * (10_000 - reserveBps)) / 10_000;
        return working > locked ? working - locked : 0;
    }

    function symbolCapacity(bytes32 symbol) public view returns (uint256) {
        uint256 cap = (totalAssets() * (10_000 - reserveBps) / 10_000) * symbolCapBps / 10_000;
        uint256 used = lockedBySymbol[symbol];
        uint256 left = cap > used ? cap - used : 0;
        uint256 c = capacity();
        return left < c ? left : c;
    }

    function utilisationBps() external view returns (uint256) {
        uint256 working = (totalAssets() * (10_000 - reserveBps)) / 10_000;
        return working == 0 ? 0 : (locked * 10_000) / working;
    }

    // ---------------------------------------------------------------- ERC-4626 gates
    function maxDeposit(address receiver) public view override returns (uint256) {
        return paused() || !identity.isVerified(receiver) ? 0 : type(uint256).max;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return maxDeposit(receiver);
    }

    /// @dev Only unlocked cash can leave. Locked collateral always stays for open policies.
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 free = totalAssets() > locked ? totalAssets() - locked : 0;
        uint256 own = _convertToAssets(balanceOf(owner), Math.Rounding.Floor);
        return own < free ? own : free;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return _convertToShares(maxWithdraw(owner), Math.Rounding.Floor);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares) internal override {
        _ensureCash(assets);
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            require(identity.isVerified(from) && identity.isVerified(to), "transfer restricted");
        }
        super._update(from, to, value);
    }

    // ---------------------------------------------------------------- market hooks
    function lock(bytes32 symbol, uint256 maxPayout) external onlyRole(MARKET_ROLE) whenNotPaused {
        require(maxPayout <= symbolCapacity(symbol), "pool capacity");
        locked += maxPayout;
        lockedBySymbol[symbol] += maxPayout;
        emit Locked(symbol, maxPayout, locked);
    }

    function bookPremium(bytes32 symbol, uint256 amount) external onlyRole(MARKET_ROLE) {
        totalPremiums += amount;
        emit PremiumBooked(symbol, amount);
    }

    function release(bytes32 symbol, uint256 maxPayout, address to, uint256 payout) external onlyRole(MARKET_ROLE) {
        locked -= maxPayout;
        lockedBySymbol[symbol] -= maxPayout;
        emit Unlocked(symbol, maxPayout, locked);
        if (payout > 0) {
            _ensureCash(payout);
            totalPayouts += payout;
            IERC20(asset()).safeTransfer(to, payout);
            emit ClaimPaid(symbol, to, payout);
        }
    }

    // ---------------------------------------------------------------- idle cash in T-bills
    function setTBill(TBillVault t) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(tbill) == address(0) || tbill.balanceOf(address(this)) == 0, "divest first");
        tbill = t;
    }

    function investIdle(uint256 assets) external onlyRole(MANAGER_ROLE) {
        IERC20(asset()).forceApprove(address(tbill), assets);
        tbill.deposit(assets, address(this));
        emit IdleInvested(assets);
    }

    function divestIdle(uint256 shares) external onlyRole(MANAGER_ROLE) {
        uint256 a = tbill.redeem(shares, address(this), address(this));
        emit IdleDivested(a);
    }

    function _ensureCash(uint256 need) internal {
        uint256 c = cash();
        if (c >= need || address(tbill) == address(0)) return;
        uint256 shares = tbill.convertToShares(need - c) + 1;
        uint256 bal = tbill.balanceOf(address(this));
        if (shares > bal) shares = bal;
        if (shares > 0) tbill.redeem(shares, address(this), address(this));
    }

    function setRiskParams(uint16 reserve_, uint16 symbolCap_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(reserve_ >= 2_000 && reserve_ <= 9_000, "reserve 20-90%");
        require(symbolCap_ > 0 && symbolCap_ <= 2_500, "symbol cap <= 25%");
        reserveBps = reserve_;
        symbolCapBps = symbolCap_;
        emit RiskParams(reserve_, symbolCap_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
