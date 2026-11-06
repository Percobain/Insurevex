// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice TEST-ONLY 6-dp dollar for the testnet stress run (billions of test dollars, no real value). The owner
///         mints, and can put an address on hold the way USDC/USDT issuers can, to exercise the pool's owed-payout
///         path. Never used on the main InsureVEX deployments, which settle in official test USDT / USDC.
contract StressUSD is ERC20, Ownable {
    mapping(address => bool) public blocked;

    event Blocked(address indexed account, bool blocked);

    constructor() ERC20("InsureVEX Stress Test USD", "sUSD") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function setBlocked(address a, bool b) external onlyOwner {
        blocked[a] = b;
        emit Blocked(a, b);
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from] && !blocked[to], "blocked");
        super._update(from, to, value);
    }
}
