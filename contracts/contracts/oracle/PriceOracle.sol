// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PriceOracle
/// @notice Official closing prices for any listed stock or index, posted by InsureVEX reporters (the server reads
///         exchange closes from several sources and posts the median). Prices are 8-decimal, in the stock's own
///         currency, keyed by a symbol id such as keccak256("NSE:RELIANCE") and a settlement timestamp.
///         Also carries the T-bill NAV feed used by the TBillVault.
contract PriceOracle is AccessControl {
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    struct Point {
        uint128 price; // 1e8
        uint64 postedAt;
    }

    mapping(bytes32 => mapping(uint64 => Point)) public prices; // symbol => settlement ts => price
    mapping(bytes32 => Point) public latest;
    mapping(bytes32 => uint64) public latestTs;
    uint64 public maxStaleness = 7 days;

    event PricePosted(bytes32 indexed symbol, uint64 indexed ts, uint256 price, address reporter);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REPORTER_ROLE, admin);
    }

    function post(bytes32 symbol, uint64 ts, uint256 price) public onlyRole(REPORTER_ROLE) {
        require(price > 0 && price < type(uint128).max, "price");
        require(ts <= block.timestamp + 1 hours, "future");
        prices[symbol][ts] = Point(uint128(price), uint64(block.timestamp));
        if (ts >= latestTs[symbol]) {
            latest[symbol] = Point(uint128(price), uint64(block.timestamp));
            latestTs[symbol] = ts;
        }
        emit PricePosted(symbol, ts, price, msg.sender);
    }

    function postMany(bytes32[] calldata symbols, uint64[] calldata ts, uint256[] calldata px) external onlyRole(REPORTER_ROLE) {
        require(symbols.length == ts.length && ts.length == px.length, "len");
        for (uint256 i; i < symbols.length; ++i) post(symbols[i], ts[i], px[i]);
    }

    function setMaxStaleness(uint64 s) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxStaleness = s;
    }

    /// @notice Price for a symbol at an exact settlement timestamp (0 if not posted yet).
    function priceAt(bytes32 symbol, uint64 ts) external view returns (uint256) {
        return prices[symbol][ts].price;
    }

    function latestPrice(bytes32 symbol) external view returns (uint256 price, uint64 ts) {
        Point memory p = latest[symbol];
        require(p.price > 0 && block.timestamp - p.postedAt <= maxStaleness, "stale");
        return (p.price, latestTs[symbol]);
    }
}
