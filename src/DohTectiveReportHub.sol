// src/DohTectiveReportHub.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DohTectiveReportHub {
    address public owner;
    mapping(string => mapping(string => bytes32)) public monthlyReportHashes;

    event ReportAnchored(
        string indexed businessId,
        string monthYear,
        bytes32 reportHash,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchorReport(
        string calldata businessId,
        string calldata monthYear,
        bytes32 reportHash
    ) external onlyOwner {
        monthlyReportHashes[businessId][monthYear] = reportHash;
        emit ReportAnchored(businessId, monthYear, reportHash, block.timestamp);
    }
}
