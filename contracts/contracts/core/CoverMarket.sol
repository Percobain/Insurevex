// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IdentityRegistry} from "../compliance/IdentityRegistry.sol";
import {PriceOracle} from "../oracle/PriceOracle.sol";
import {UnderwritingPool} from "./UnderwritingPool.sol";

/// @title CoverMarket
/// @notice Holders buy a crash floor on a stock they own: if the stock closes more than `deductible` below the start
///         price at expiry, the pool pays the extra fall, capped at `cap` of the protected notional (a put spread).
///         Premium is paid upfront in the settlement stablecoin; the pool locks the maximum payout until settlement.
///
///         Rules enforced on-chain:
///          - the buyer is KYC'd and not frozen (IdentityRegistry);
///          - the price, terms and the buyer's holdings attestation are signed by the InsureVEX quoter (EIP-712);
///          - insurable interest: for tokenised stocks (e.g. an ATS equity on Hedera) the contract reads the buyer's
///            token balance and never lets open cover exceed the shares held; for shares held at a broker the quote
///            carries a signed holdings attestation (broker statement / demat API) that is capped the same way;
///          - pool reserve, per-symbol cap and full collateralisation (UnderwritingPool.lock);
///          - settlement only from the oracle's official close at expiry.
contract CoverMarket is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant QUOTER_ROLE = keccak256("QUOTER_ROLE");
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(address buyer,bytes32 symbol,uint256 notional,uint256 shares,uint256 heldShares,uint32 deductibleBps,uint32 capBps,uint256 premium,uint256 startPrice,uint64 expiry,uint64 validUntil,uint256 nonce)"
    );

    struct Quote {
        address buyer;
        bytes32 symbol; // keccak256("NSE:RELIANCE"), keccak256("NASDAQ:NVDA") ...
        uint256 notional; // protected value in settlement-token units (6 dp)
        uint256 shares; // shares covered (1e18). Used for the insurable-interest check
        uint256 heldShares; // shares the buyer holds per the attestation (1e18); ignored for on-chain tokens
        uint32 deductibleBps; // b
        uint32 capBps; // c
        uint256 premium; // settlement-token units
        uint256 startPrice; // 1e8, official close at quote time
        uint64 expiry; // settlement timestamp (official close used for settlement)
        uint64 validUntil; // quote deadline
        uint256 nonce;
    }

    enum Status { None, Open, Settled }

    struct Policy {
        address holder;
        bytes32 symbol;
        uint256 notional;
        uint256 shares;
        uint32 deductibleBps;
        uint32 capBps;
        uint256 premium;
        uint256 startPrice;
        uint64 start;
        uint64 expiry;
        Status status;
        uint256 payout;
        uint256 settlePrice;
    }

    IERC20 public immutable stable;
    IdentityRegistry public immutable identity;
    PriceOracle public immutable oracle;
    UnderwritingPool public immutable pool;

    uint64 public settleGrace = 3 days; // after this, a settler may settle with an attested price if the oracle has none
    uint64 public maxTenor = 35 days;

    Policy[] public policies;
    mapping(uint256 => bool) public nonceUsed;
    mapping(bytes32 => address) public symbolToken; // tokenised stock (e.g. ATS equity) for on-chain holdings checks
    mapping(address => mapping(bytes32 => uint256)) public coveredShares; // open shares covered per holder/symbol
    mapping(address => uint256[]) private _byHolder;

    event SymbolToken(bytes32 indexed symbol, address token);
    event CoverBought(uint256 indexed id, address indexed holder, bytes32 indexed symbol, uint256 notional,
        uint32 deductibleBps, uint32 capBps, uint256 premium, uint256 startPrice, uint64 expiry);
    event CoverSettled(uint256 indexed id, address indexed holder, bytes32 indexed symbol, uint256 settlePrice,
        int256 returnBps, uint256 payout);

    constructor(IERC20 stable_, IdentityRegistry identity_, PriceOracle oracle_, UnderwritingPool pool_, address admin, address quoter)
        EIP712("InsureVEX CoverMarket", "1")
    {
        stable = stable_;
        identity = identity_;
        oracle = oracle_;
        pool = pool_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SETTLER_ROLE, admin);
        _grantRole(QUOTER_ROLE, quoter);
    }

    // ---------------------------------------------------------------- buy
    function hashQuote(Quote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(QUOTE_TYPEHASH, q.buyer, q.symbol, q.notional, q.shares, q.heldShares,
            q.deductibleBps, q.capBps, q.premium, q.startPrice, q.expiry, q.validUntil, q.nonce)));
    }

    function buyCover(Quote calldata q, bytes calldata signature) external nonReentrant whenNotPaused returns (uint256 id) {
        require(q.buyer == msg.sender, "not your quote");
        require(identity.isVerified(msg.sender), "KYC");
        require(block.timestamp <= q.validUntil, "quote expired");
        require(q.expiry > block.timestamp && q.expiry <= block.timestamp + maxTenor, "tenor");
        require(!nonceUsed[q.nonce], "nonce used");
        require(q.notional > 0 && q.capBps > 0 && q.capBps <= 10_000 && q.deductibleBps < 10_000, "terms");
        require(hasRole(QUOTER_ROLE, ECDSA.recover(hashQuote(q), signature)), "bad quote signature");
        nonceUsed[q.nonce] = true;

        // insurable interest: open cover can never exceed what the holder owns
        uint256 held = symbolToken[q.symbol] != address(0) ? IERC20(symbolToken[q.symbol]).balanceOf(msg.sender) : q.heldShares;
        uint256 newCovered = coveredShares[msg.sender][q.symbol] + q.shares;
        require(q.shares > 0 && newCovered <= held, "cover exceeds holdings");
        coveredShares[msg.sender][q.symbol] = newCovered;

        uint256 maxPayout = (q.notional * q.capBps) / 10_000;
        pool.lock(q.symbol, maxPayout); // reverts if reserve / per-symbol cap would be breached
        stable.safeTransferFrom(msg.sender, address(pool), q.premium);
        pool.bookPremium(q.symbol, q.premium);

        id = policies.length;
        policies.push(Policy(msg.sender, q.symbol, q.notional, q.shares, q.deductibleBps, q.capBps, q.premium, q.startPrice,
            uint64(block.timestamp), q.expiry, Status.Open, 0, 0));
        _byHolder[msg.sender].push(id);
        emit CoverBought(id, msg.sender, q.symbol, q.notional, q.deductibleBps, q.capBps, q.premium, q.startPrice, q.expiry);
    }

    // ---------------------------------------------------------------- settle
    /// @notice Anyone can settle once the official close at expiry is on the oracle.
    function settle(uint256 id) public nonReentrant {
        Policy storage p = policies[id];
        uint256 px = oracle.priceAt(p.symbol, p.expiry);
        require(px > 0, "no official close yet");
        _settle(id, px);
    }

    function settleMany(uint256[] calldata ids) external {
        for (uint256 i; i < ids.length; ++i) {
            Policy storage p = policies[ids[i]];
            if (p.status == Status.Open && oracle.priceAt(p.symbol, p.expiry) > 0) settle(ids[i]);
        }
    }

    /// @notice Fallback if no oracle close exists `settleGrace` after expiry (e.g. a trading halt): a settler
    ///         posts the attested close. Emitted on-chain and visible to everyone.
    function settleWithAttestedPrice(uint256 id, uint256 px) external onlyRole(SETTLER_ROLE) nonReentrant {
        Policy storage p = policies[id];
        require(block.timestamp >= p.expiry + settleGrace, "grace");
        require(oracle.priceAt(p.symbol, p.expiry) == 0, "oracle has a price");
        _settle(id, px);
    }

    function _settle(uint256 id, uint256 px) internal {
        Policy storage p = policies[id];
        require(p.status == Status.Open, "not open");
        require(block.timestamp >= p.expiry, "not expired");
        p.status = Status.Settled;
        p.settlePrice = px;

        // return in bps (negative = fall). payout = notional * min(max(-ret - b, 0), c)
        int256 retBps = (int256(px) - int256(p.startPrice)) * 10_000 / int256(p.startPrice);
        uint256 payout;
        int256 excess = -retBps - int256(uint256(p.deductibleBps));
        if (excess > 0) {
            uint256 e = uint256(excess) > p.capBps ? p.capBps : uint256(excess);
            payout = (p.notional * e) / 10_000;
        }
        p.payout = payout;
        coveredShares[p.holder][p.symbol] -= p.shares;
        pool.release(p.symbol, (p.notional * p.capBps) / 10_000, p.holder, payout);
        emit CoverSettled(id, p.holder, p.symbol, px, retBps, payout);
    }

    // ---------------------------------------------------------------- views / admin
    function policyCount() external view returns (uint256) {
        return policies.length;
    }

    function getPolicy(uint256 id) external view returns (Policy memory) {
        return policies[id];
    }

    function policiesOf(address holder) external view returns (uint256[] memory) {
        return _byHolder[holder];
    }

    /// @notice Payout the policy would get if it settled at `px` (1e8). For UIs and keepers.
    function previewPayout(uint256 id, uint256 px) external view returns (uint256) {
        Policy memory p = policies[id];
        int256 retBps = (int256(px) - int256(p.startPrice)) * 10_000 / int256(p.startPrice);
        int256 excess = -retBps - int256(uint256(p.deductibleBps));
        if (excess <= 0) return 0;
        uint256 e = uint256(excess) > p.capBps ? p.capBps : uint256(excess);
        return (p.notional * e) / 10_000;
    }

    function setSymbolToken(bytes32 symbol, address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        symbolToken[symbol] = token;
        emit SymbolToken(symbol, token);
    }

    function setParams(uint64 grace, uint64 tenor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        settleGrace = grace;
        maxTenor = tenor;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
