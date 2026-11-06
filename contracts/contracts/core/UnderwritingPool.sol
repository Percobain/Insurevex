// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IdentityRegistry} from "../compliance/IdentityRegistry.sol";
import {TBillVault} from "../rwa/TBillVault.sol";

/// @title UnderwritingPool (senior vxUW + junior "Pro" tranche)
/// @notice The pool that sells crash floors. Two tranches share one book:
///           - SENIOR (ERC-4626 shares, vxUW): the Savers' sleeves. Keeps a reserve R that never backs policies.
///           - JUNIOR / Pro (vxPRO, tracked here): fully working, FIRST-LOSS capital. It earns its share of premiums
///             by the capacity it adds, plus `proFeeBps` of the senior premium for taking first loss.
///         Loss order on a payout: premiums already earned -> Pro tranche -> senior sleeves. The Savers' T-bill floor
///         lives outside this pool and is never touched.
///         Backtest (2005-2026): with Pro capital >= 0.5x the sleeves, the senior tranche never had a losing period.
///
///         Risk rules enforced on-chain:
///           - capacity = (1 - R) x senior + junior; every open policy's max payout is locked (full collateral);
///           - per-symbol cap m of capacity;
///           - withdrawals can never touch locked collateral; Pro cannot leave while it backs open policies.
///         Idle cash can sit in the tokenised T-bill vault; that yield accrues to the senior tranche.
contract UnderwritingPool is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MARKET_ROLE = keccak256("MARKET_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    IdentityRegistry public immutable identity;
    TBillVault public tbill; // optional idle-cash sleeve

    uint16 public reserveBps = 5_000; // R (senior only)
    uint16 public symbolCapBps = 500; // m, share of capacity per symbol (backtest: 5%)
    uint16 public marketCapBps = 2_500; // share of capacity per market (backtest: 25%)
    uint16 public proFeeBps = 4_000; // share of the senior tranche's premium paid to Pro for first loss
    uint256 public locked; // sum of max payouts of open policies
    mapping(bytes32 => uint256) public lockedBySymbol;
    mapping(bytes32 => uint256) public lockedByMarket;

    uint256 public totalPremiums;
    uint256 public totalPayouts;
    uint256 public totalProLosses;

    // junior (Pro) tranche. Shares are per epoch: if a crash wipes the tranche out (juniorAssets == 0), a new epoch
    // starts on the next deposit and the old, worthless shares can never claim the new money.
    uint256 public juniorAssets;
    uint256 public proSupply;
    uint64 public proEpoch;
    mapping(address => uint256) internal _proShares;
    mapping(address => uint64) internal _proEpochOf;

    // payouts whose transfer failed (e.g. the holder is blocklisted by the stablecoin). Kept out of pool capital and
    // claimable later, so a settlement can never be blocked and collateral can never be trapped.
    uint256 public totalOwed;
    mapping(address => uint256) public owed;

    event Locked(bytes32 indexed symbol, uint256 amount, uint256 totalLocked);
    event Unlocked(bytes32 indexed symbol, uint256 amount, uint256 totalLocked);
    event PremiumBooked(bytes32 indexed symbol, uint256 amount, uint256 toPro, uint256 toSenior);
    event ClaimPaid(bytes32 indexed symbol, address indexed to, uint256 amount, uint256 fromPro, uint256 fromSenior);
    event ProDeposit(address indexed lp, uint256 assets, uint256 shares);
    event ProWithdraw(address indexed lp, uint256 assets, uint256 shares);
    event ProEpochReset(uint64 epoch);
    event PayoutOwed(bytes32 indexed symbol, address indexed to, uint256 amount);
    event OwedClaimed(address indexed holder, address indexed receiver, uint256 amount);
    event RiskParams(uint16 reserveBps, uint16 symbolCapBps, uint16 marketCapBps, uint16 proFeeBps);
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

    /// @notice Everything the pool holds (both tranches).
    function physicalAssets() public view returns (uint256) {
        return cash() + tbillAssets();
    }

    /// @notice Senior (Saver sleeve) assets: the ERC-4626 NAV.
    function totalAssets() public view override returns (uint256) {
        uint256 p = physicalAssets();
        uint256 claims = juniorAssets + totalOwed;
        return p > claims ? p - claims : 0;
    }

    /// @notice Pro shares an LP holds in the current epoch (shares from a wiped-out epoch are worth nothing).
    function proBalanceOf(address lp) public view returns (uint256) {
        return _proEpochOf[lp] == proEpoch ? _proShares[lp] : 0;
    }

    function capacityTotal() public view returns (uint256) {
        return (totalAssets() * (10_000 - reserveBps)) / 10_000 + juniorAssets;
    }

    /// @notice Max payout the pool may still commit.
    function capacity() public view returns (uint256) {
        uint256 c = capacityTotal();
        return c > locked ? c - locked : 0;
    }

    function symbolCapacity(bytes32 symbol) public view returns (uint256) {
        uint256 cap = (capacityTotal() * symbolCapBps) / 10_000;
        uint256 used = lockedBySymbol[symbol];
        uint256 left = cap > used ? cap - used : 0;
        uint256 c = capacity();
        return left < c ? left : c;
    }

    function marketCapacity(bytes32 market) public view returns (uint256) {
        uint256 cap = (capacityTotal() * marketCapBps) / 10_000;
        uint256 used = lockedByMarket[market];
        return cap > used ? cap - used : 0;
    }

    function utilisationBps() external view returns (uint256) {
        uint256 c = capacityTotal();
        return c == 0 ? 0 : (locked * 10_000) / c;
    }

    function proSharePrice() public view returns (uint256) {
        return proSupply == 0 ? 1e18 : (juniorAssets * 1e18) / proSupply;
    }

    // ---------------------------------------------------------------- senior (ERC-4626) gates
    function maxDeposit(address receiver) public view override returns (uint256) {
        return paused() || !identity.isVerified(receiver) ? 0 : type(uint256).max;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return maxDeposit(receiver);
    }

    /// @dev Senior can take only what is not needed as collateral after the Pro tranche has been counted.
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 needFromSenior = locked > juniorAssets ? ((locked - juniorAssets) * 10_000) / (10_000 - reserveBps) : 0;
        uint256 s = totalAssets();
        uint256 free = s > needFromSenior ? s - needFromSenior : 0;
        uint256 c = cash() + tbillAssets();
        if (free > c) free = c;
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

    // ---------------------------------------------------------------- junior (Pro) tranche
    function depositPro(uint256 assets) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(identity.isVerified(msg.sender), "KYC");
        require(assets > 0, "zero");
        if (proSupply > 0 && juniorAssets == 0) {
            // previous Pro capital was wiped out: retire its shares
            proEpoch += 1;
            proSupply = 0;
            emit ProEpochReset(proEpoch);
        }
        if (_proEpochOf[msg.sender] != proEpoch) {
            _proEpochOf[msg.sender] = proEpoch;
            _proShares[msg.sender] = 0;
        }
        shares = proSupply == 0 ? assets : (assets * proSupply) / juniorAssets;
        require(shares > 0, "shares");
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        juniorAssets += assets;
        proSupply += shares;
        _proShares[msg.sender] += shares;
        emit ProDeposit(msg.sender, assets, shares);
    }

    function maxProWithdraw(address lp) public view returns (uint256) {
        uint256 own = proSupply == 0 ? 0 : (proBalanceOf(lp) * juniorAssets) / proSupply;
        uint256 free = capacity(); // Pro can only leave with what is not backing open policies
        if (free > juniorAssets) free = juniorAssets;
        return own < free ? own : free;
    }

    function withdrawPro(uint256 assets) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(assets > 0 && assets <= maxProWithdraw(msg.sender), "Pro capital backing open policies");
        shares = (assets * proSupply + juniorAssets - 1) / juniorAssets; // round shares up
        require(shares <= proBalanceOf(msg.sender), "shares");
        _proShares[msg.sender] -= shares;
        proSupply -= shares;
        juniorAssets -= assets;
        _ensureCash(assets);
        IERC20(asset()).safeTransfer(msg.sender, assets);
        emit ProWithdraw(msg.sender, assets, shares);
    }

    // ---------------------------------------------------------------- market hooks
    function lock(bytes32 symbol, bytes32 market, uint256 maxPayout) external onlyRole(MARKET_ROLE) whenNotPaused {
        require(maxPayout <= symbolCapacity(symbol), "pool capacity");
        require(maxPayout <= marketCapacity(market), "market cap");
        locked += maxPayout;
        lockedBySymbol[symbol] += maxPayout;
        lockedByMarket[market] += maxPayout;
        emit Locked(symbol, maxPayout, locked);
    }

    /// @dev Called after the premium has arrived. Split by capacity contributed, plus the first-loss fee to Pro.
    function bookPremium(bytes32 symbol, uint256 amount) external onlyRole(MARKET_ROLE) {
        totalPremiums += amount;
        uint256 seniorCap = ((totalAssets() - Math.min(totalAssets(), amount)) * (10_000 - reserveBps)) / 10_000;
        uint256 capTotal = seniorCap + juniorAssets;
        uint256 toPro = capTotal == 0 ? 0 : (amount * juniorAssets) / capTotal;
        if (juniorAssets > 0) toPro += ((amount - toPro) * proFeeBps) / 10_000;
        juniorAssets += toPro;
        emit PremiumBooked(symbol, amount, toPro, amount - toPro);
    }

    function release(bytes32 symbol, bytes32 market, uint256 maxPayout, address to, uint256 payout) external onlyRole(MARKET_ROLE) {
        locked -= maxPayout;
        lockedBySymbol[symbol] -= maxPayout;
        lockedByMarket[market] -= maxPayout;
        emit Unlocked(symbol, maxPayout, locked);
        if (payout > 0) {
            uint256 fromPro = payout < juniorAssets ? payout : juniorAssets; // first loss
            juniorAssets -= fromPro;
            totalProLosses += fromPro;
            _ensureCash(payout);
            totalPayouts += payout;
            emit ClaimPaid(symbol, to, payout, fromPro, payout - fromPro);
            if (!_tryTransfer(to, payout)) {
                owed[to] += payout;
                totalOwed += payout;
                emit PayoutOwed(symbol, to, payout);
            }
        }
    }

    /// @notice Claim a payout that could not be delivered at settlement, to any receiver the holder chooses.
    function claimOwed(address receiver) external nonReentrant {
        require(identity.isVerified(msg.sender), "KYC");
        uint256 amt = owed[msg.sender];
        require(amt > 0, "nothing owed");
        owed[msg.sender] = 0;
        totalOwed -= amt;
        _ensureCash(amt);
        IERC20(asset()).safeTransfer(receiver, amt);
        emit OwedClaimed(msg.sender, receiver, amt);
    }

    function _tryTransfer(address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory ret) = asset().call(abi.encodeCall(IERC20.transfer, (to, amount)));
        return ok && (ret.length == 0 || abi.decode(ret, (bool)));
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

    function setRiskParams(uint16 reserve_, uint16 symbolCap_, uint16 marketCap_, uint16 proFee_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(reserve_ >= 2_000 && reserve_ <= 9_000, "reserve 20-90%");
        require(symbolCap_ > 0 && symbolCap_ <= 2_500, "symbol cap <= 25%");
        require(marketCap_ >= symbolCap_ && marketCap_ <= 10_000, "market cap");
        require(proFee_ <= 6_000, "pro fee <= 60%");
        reserveBps = reserve_;
        symbolCapBps = symbolCap_;
        marketCapBps = marketCap_;
        proFeeBps = proFee_;
        emit RiskParams(reserve_, symbolCap_, marketCap_, proFee_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
