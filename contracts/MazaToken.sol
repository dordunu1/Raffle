// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MAZA Token
/// @notice Simple ERC20 token for the Raffle app
contract MazaToken is ERC20 {
    constructor() ERC20("MAZA Token", "MAZA") {
        // Mint 1,000,000 tokens to deployer
        _mint(msg.sender, 1_000_000 * 10**18);
    }
}

