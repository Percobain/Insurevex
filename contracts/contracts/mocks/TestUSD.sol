// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 6-decimal test dollar used ONLY on local tests and on chains without an official test stablecoin we can obtain.
///         Whitechain uses the official test USDT and Arc uses native USDC instead.
contract TestUSD is ERC20 {
    mapping(address => uint256) public lastDrip;

    constructor() ERC20("InsureVEX Test USD", "tUSD") {
        _mint(msg.sender, 10_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        require(block.timestamp >= lastDrip[msg.sender] + 1 hours, "1/hour");
        lastDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, 10_000e6);
    }
}
