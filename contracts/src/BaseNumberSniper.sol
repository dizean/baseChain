// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract BaseBidGame is ERC20 {
    address public owner;

    uint256 public constant PACK_3_COST = 15 * 1e18;
    uint256 public constant PACK_5_COST = 10 * 1e18;
    uint256 public constant PACK_8_COST = 3  * 1e18;

    uint256 public constant WIN_MULTIPLIER = 2;

    event Played(address indexed player, uint256 cost, uint8 pack);
    event Rewarded(address indexed player, uint256 reward);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(string memory name, string memory symbol, uint256 totalSupply) ERC20(name, symbol) {
        owner = msg.sender;
        // Mint the entire fixed supply to the contract itself for distribution
        _mint(address(this), totalSupply);
    }

    // Player spends tokens to play
    function play(uint8 packChoice) external {
        uint256 cost;
        if (packChoice == 3) cost = PACK_3_COST;
        else if (packChoice == 5) cost = PACK_5_COST;
        else if (packChoice == 8) cost = PACK_8_COST;
        else revert("invalid pack");

        _transfer(msg.sender, address(this), cost);
        emit Played(msg.sender, cost, packChoice);
    }

    // Reward winner directly from contract balance
    function rewardWinnerDirect(address player, uint256 cost) external {
        uint256 reward = cost * WIN_MULTIPLIER;
        require(balanceOf(address(this)) >= reward, "Contract has insufficient balance");
        _transfer(address(this), player, reward);
        emit Rewarded(player, reward);
    }

    // Owner can withdraw remaining tokens if needed
    function adminWithdraw(uint256 amount, address to) external onlyOwner {
        _transfer(address(this), to, amount);
    }

    // Disable buyBase and remove minting function
}
