// app/frontend/lib/thirdweb.ts
import { createThirdwebClient, getContract } from "thirdweb";
import { avalancheFuji } from "thirdweb/chains";

const clientId = process.env.THIRDWEB_CLIENT_ID;

if (!clientId) {
  throw new Error(
    "💥 THIRDWEB_CLIENT_ID is missing! Ensure it is defined in your .env and mapped in next.config.ts"
  );
}

export const client = createThirdwebClient({
  clientId: clientId,
});

export const activeChain = avalancheFuji;

// 🟢 Your fresh Fuji Testnet contract addresses mapped!
const PAYMENTS_CONTRACT_ADDRESS = "0x61BA39769DeCcFE5ae1B8e45975aAf3f3E3F7693"; 
const REPORT_HUB_CONTRACT_ADDRESS = "0xc6cb0AffC577Bca8F705E12df1bA46763D0c8Dcc";

export const paymentsContract = getContract({
  client,
  chain: activeChain,
  address: PAYMENTS_CONTRACT_ADDRESS,
});

export const reportHubContract = getContract({
  client,
  chain: activeChain,
  address: REPORT_HUB_CONTRACT_ADDRESS,
});