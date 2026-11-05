// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IdentityRegistry} from "../compliance/IdentityRegistry.sol";
import {TBillVault} from "../rwa/TBillVault.sol";
import {UnderwritingPool} from "./UnderwritingPool.sol";

/// @title ProtectedNote
/// @notice A principal-protected note: the Saver's side of InsureVEX. Each token = 1 unit of the settlement stablecoin
///         of face value, repaid in full at maturity.
///
///         On subscription the deposit is split in the same transaction:
///           floor  = face / (1 + r * tau)   -> tokenised T-bill vault, grows back to the full face by maturity
///           sleeve = face - floor           -> underwriting pool (the only money at risk)
///         Underwriting profit above the sleeve's high-water mark is paid out as stablecoin coupons
///         (`distributeCoupon`, at most once per `couponInterval`). At maturity everything is redeemed and holders
///         claim face + whatever the sleeve is worth.
///
///         Transfer rules (ERC-3643 style): holders must be KYC'd and not frozen, no transfers after maturity,
///         agent can freeze, pause and force-transfer (lost-key recovery / court order).
contract ProtectedNote is ERC20, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    uint256 private constant WAD = 1e18;
    uint256 private constant YEAR = 365 days;

    IERC20 public immutable stable;
    IdentityRegistry public immutable identity;
    TBillVault public immutable tbill;
    UnderwritingPool public immutable pool;
    uint8 private immutable _dec;

    uint64 public immutable issueDate;
    uint64 public immutable subscriptionEnd;
    uint64 public immutable maturity;
    uint32 public immutable floorRateBps; // locked T-bill rate used to size the floor
    uint64 public immutable couponInterval;
    uint256 public immutable minSubscription;

    uint256 public floorShares; // vxTBILL held
    uint256 public poolShares; // vxUW held
    uint256 public sleevePrincipal; // stablecoin put into the pool (high-water mark for coupons)
    uint64 public lastCoupon;
    uint256 public couponsPaidTotal;

    // coupon accounting (pull-based, survives transfers)
    uint256 public accCouponPerToken; // 1e18
    mapping(address => uint256) public couponDebt;
    mapping(address => uint256) public couponOwed;

    // maturity accounting
    bool public matured;
    uint256 public supplyAtMaturity;
    uint256 public accMaturityPerToken; // 1e18
    mapping(address => uint256) public maturityClaimed;

    event Subscribed(address indexed investor, uint256 face, uint256 floor, uint256 sleeve);
    event CouponDistributed(uint256 indexed n, uint256 amount, uint256 perToken, uint256 sleeveValue);
    event CouponClaimed(address indexed holder, uint256 amount);
    event Matured(uint256 proceeds, uint256 perToken);
    event MaturityClaimed(address indexed holder, uint256 amount);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        IERC20 stable_,
        IdentityRegistry identity_,
        TBillVault tbill_,
        UnderwritingPool pool_,
        uint64 subscriptionDays,
        uint64 termSeconds,
        uint32 floorRateBps_,
        uint64 couponInterval_,
        address admin
    ) ERC20(name_, symbol_) {
        require(floorRateBps_ <= tbill_.apyBps(), "floor rate above T-bill yield");
        stable = stable_;
        identity = identity_;
        tbill = tbill_;
        pool = pool_;
        _dec = ERC20(address(stable_)).decimals();
        issueDate = uint64(block.timestamp);
        subscriptionEnd = uint64(block.timestamp + subscriptionDays * 1 days);
        maturity = uint64(block.timestamp + termSeconds);
        require(maturity > subscriptionEnd, "term");
        floorRateBps = floorRateBps_;
        couponInterval = couponInterval_;
        lastCoupon = uint64(block.timestamp);
        minSubscription = 10 ** _dec; // 1 unit
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    // ---------------------------------------------------------------- subscribe
    /// @notice Floor needed today so that the T-bill position is worth `face` at maturity.
    function floorFor(uint256 face) public view returns (uint256) {
        uint256 tau = maturity > block.timestamp ? maturity - block.timestamp : 0;
        uint256 growth = WAD + (uint256(floorRateBps) * tau * WAD) / (10_000 * YEAR);
        uint256 f = (face * WAD + growth - 1) / growth; // round the floor UP: protection first
        return f > face ? face : f;
    }

    function subscribe(uint256 face) external nonReentrant whenNotPaused {
        require(block.timestamp <= subscriptionEnd, "subscription closed");
        require(identity.isVerified(msg.sender), "KYC");
        require(face >= minSubscription, "min");
        _accrue(msg.sender);

        stable.safeTransferFrom(msg.sender, address(this), face);
        uint256 floor = floorFor(face);
        uint256 sleeve = face - floor;

        stable.forceApprove(address(tbill), floor);
        floorShares += tbill.deposit(floor, address(this));
        if (sleeve > 0) {
            stable.forceApprove(address(pool), sleeve);
            poolShares += pool.deposit(sleeve, address(this));
            sleevePrincipal += sleeve;
        }
        _mint(msg.sender, face);
        couponDebt[msg.sender] = (balanceOf(msg.sender) * accCouponPerToken) / WAD;
        emit Subscribed(msg.sender, face, floor, sleeve);
    }

    // ---------------------------------------------------------------- coupons
    function sleeveValue() public view returns (uint256) {
        return pool.convertToAssets(poolShares);
    }

    function floorValue() public view returns (uint256) {
        return tbill.convertToAssets(floorShares);
    }

    /// @notice Underwriting profit above the sleeve's principal that can be paid out now.
    function couponAvailable() public view returns (uint256) {
        uint256 v = sleeveValue();
        if (v <= sleevePrincipal) return 0;
        uint256 excess = v - sleevePrincipal;
        uint256 maxOut = pool.maxWithdraw(address(this));
        return excess < maxOut ? excess : maxOut;
    }

    /// @notice Pays realised underwriting profit to holders as a stablecoin coupon. Callable by anyone (keeper /
    ///         Hedera scheduled transaction) once per coupon interval.
    function distributeCoupon() external nonReentrant whenNotPaused returns (uint256 amount) {
        require(!matured && block.timestamp < maturity, "matured");
        require(block.timestamp >= lastCoupon + couponInterval, "too early");
        require(totalSupply() > 0, "no holders");
        amount = couponAvailable();
        lastCoupon = uint64(block.timestamp);
        if (amount == 0) {
            emit CouponDistributed(0, 0, accCouponPerToken, sleeveValue());
            return 0;
        }
        poolShares -= pool.withdraw(amount, address(this), address(this));
        accCouponPerToken += (amount * WAD) / totalSupply();
        couponsPaidTotal += amount;
        emit CouponDistributed(couponsPaidTotal, amount, accCouponPerToken, sleeveValue());
    }

    function pendingCoupon(address a) public view returns (uint256) {
        return couponOwed[a] + (balanceOf(a) * accCouponPerToken) / WAD - couponDebt[a];
    }

    function claimCoupon() external nonReentrant {
        _accrue(msg.sender);
        uint256 amt = couponOwed[msg.sender];
        require(amt > 0, "nothing");
        require(identity.isVerified(msg.sender), "KYC");
        couponOwed[msg.sender] = 0;
        stable.safeTransfer(msg.sender, amt);
        emit CouponClaimed(msg.sender, amt);
    }

    function _accrue(address a) internal {
        if (a == address(0)) return;
        uint256 acc = (balanceOf(a) * accCouponPerToken) / WAD;
        couponOwed[a] += acc - couponDebt[a];
        couponDebt[a] = acc;
    }

    // ---------------------------------------------------------------- maturity
    /// @notice After maturity anyone can pull the T-bill floor and the sleeve back. Can be called again later if
    ///         part of the sleeve was still locked behind open cover at the first call.
    function mature() external nonReentrant {
        require(block.timestamp >= maturity, "not yet");
        if (!matured) {
            matured = true;
            supplyAtMaturity = totalSupply();
        }
        uint256 before = stable.balanceOf(address(this));
        if (floorShares > 0) {
            tbill.redeem(floorShares, address(this), address(this));
            floorShares = 0;
        }
        uint256 r = pool.maxRedeem(address(this));
        if (r > poolShares) r = poolShares;
        if (r > 0) {
            pool.redeem(r, address(this), address(this));
            poolShares -= r;
        }
        uint256 proceeds = stable.balanceOf(address(this)) - before;
        if (supplyAtMaturity > 0 && proceeds > 0) accMaturityPerToken += (proceeds * WAD) / supplyAtMaturity;
        emit Matured(proceeds, accMaturityPerToken);
    }

    function claimableAtMaturity(address a) public view returns (uint256) {
        if (!matured) return 0;
        return (balanceOf(a) * accMaturityPerToken) / WAD - maturityClaimed[a];
    }

    /// @notice Claim face + sleeve after maturity (plus any unclaimed coupons).
    function redeem() external nonReentrant {
        require(matured, "call mature()");
        require(identity.isVerified(msg.sender), "KYC");
        _accrue(msg.sender);
        uint256 amt = claimableAtMaturity(msg.sender) + couponOwed[msg.sender];
        require(amt > 0, "nothing");
        maturityClaimed[msg.sender] += claimableAtMaturity(msg.sender);
        couponOwed[msg.sender] = 0;
        stable.safeTransfer(msg.sender, amt);
        emit MaturityClaimed(msg.sender, amt);
    }

    // ---------------------------------------------------------------- compliance
    function forcedTransfer(address from, address to, uint256 amount) external onlyRole(AGENT_ROLE) {
        require(identity.isVerified(to), "KYC");
        _accrue(from);
        _accrue(to);
        super._update(from, to, amount);
        couponDebt[from] = (balanceOf(from) * accCouponPerToken) / WAD;
        couponDebt[to] = (balanceOf(to) * accCouponPerToken) / WAD;
        emit ForcedTransfer(from, to, amount);
    }

    function pause() external onlyRole(AGENT_ROLE) { _pause(); }
    function unpause() external onlyRole(AGENT_ROLE) { _unpause(); }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            require(!paused(), "paused");
            require(!matured && block.timestamp < maturity, "matured: no transfers");
            require(identity.isVerified(from) && identity.isVerified(to), "transfer restricted");
            _accrue(from);
            _accrue(to);
            super._update(from, to, value);
            couponDebt[from] = (balanceOf(from) * accCouponPerToken) / WAD;
            couponDebt[to] = (balanceOf(to) * accCouponPerToken) / WAD;
            return;
        }
        super._update(from, to, value);
    }

    /// @notice Everything a UI needs in one call.
    function snapshot() external view returns (uint256 supply, uint256 floorVal, uint256 sleeveVal, uint256 sleevePrin,
        uint256 couponsPaid, uint64 maturity_, uint64 subscriptionEnd_, uint32 rateBps, bool isMatured) {
        return (totalSupply(), floorValue(), sleeveValue(), sleevePrincipal, couponsPaidTotal, maturity, subscriptionEnd,
            floorRateBps, matured);
    }
}
