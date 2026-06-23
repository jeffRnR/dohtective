// script/DeployDohTective.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {DohTectiveReportHub} from "../src/DohTectiveReportHub.sol";
import {DohTectivePayments} from "../src/DohTectivePayments.sol";

contract DeployDohTective is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("REPORT_HUB_ADMIN_PRIVATE_KEY");

        // Avalanche Fuji Testnet USDC Contract Address
        address fujiUsdcAddress = 0x5425890298aed601595a70AB815c96711a31Bc65;

        vm.startBroadcast(deployerPrivateKey);

        new DohTectiveReportHub();
        new DohTectivePayments(fujiUsdcAddress);

        vm.stopBroadcast();
    }
}
