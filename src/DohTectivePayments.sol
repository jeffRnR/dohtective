// src/DohTectivePayments.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract DohTectivePayments {
    address public owner;
    IERC20 public usdcToken;
    
    event PremiumPaid(string indexed businessId, address indexed payer, uint256 amount, uint256 durationDays);

    constructor(address _usdcTokenAddress) {
        owner = msg.sender;
        usdcToken = IERC20(_usdcTokenAddress);
    }

    function payForPremium(string calldata businessId, uint256 amount, uint256 durationDays) external {
        require(amount > 0, "Amount must be greater than 0");
        bool success = usdcToken.transferFrom(msg.sender, owner, amount);
        require(success, "USDC transfer failed");

        emit PremiumPaid(businessId, msg.sender, amount, durationDays);
    }

    function setUsdcAddress(address _newAddress) external {
        require(msg.sender == owner, "Not authorized");
        usdcToken = IERC20(_newAddress);
    }
}