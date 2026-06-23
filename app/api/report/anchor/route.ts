// app/api/anchor/route.ts
import { NextResponse } from "next/server";
import { createThirdwebClient, getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { privateKeyToAccount } from "thirdweb/wallets";
import crypto from "crypto";

// Initialize the Thirdweb engine backend client using environment secrets
const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY as string,
});

// Bind to your deployed contract on Avalanche Testnet/Mainnet
const contract = getContract({
  client,
  chain: defineChain(43113), // Avalanche Fuji Testnet id (Change to 43114 for Mainnet)
  address: process.env.NEXT_PUBLIC_PAYMENTS_CONTRACT_ADDRESS as string,
});

export async function POST(request: Request) {
  try {
    // 1. Authenticate incoming request from your internal detection engine backend
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.DETECTION_ENGINE_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const body = await request.json();
    const { businessId, anomalySummary, severeRiskCount, rawLedgerData } = body;

    if (!businessId || !rawLedgerData) {
      return NextResponse.json({ error: "Missing required payload variables" }, { status: 400 });
    }

    // 2. Generate the deterministic cryptographic SHA-256 fingerprint of the audit data
    const reportPayloadString = JSON.stringify({
      businessId,
      anomalySummary,
      severeRiskCount,
      ledgerSnapshot: rawLedgerData,
      timestamp: Date.now(),
    });
    
    const reportHash = `0x${crypto
      .createHash("sha256")
      .update(reportPayloadString)
      .digest("hex")}`;

    // 3. Initialize your administrative gas-payer anchoring wallet
    const adminAccount = privateKeyToAccount({
      client,
      privateKey: process.env.ANCHORING_WALLETS_PRIVATE_KEY as string,
    });

    // 4. Prepare and broadcast the transaction to the Avalanche network
    // Assuming your contract has an internal 'anchorReport(string,string,uint256)' method
    const transaction = prepareContractCall({
      contract,
      method: "function anchorReport(string businessId, string reportHash, uint256 risksCount)",
      params: [businessId, reportHash, BigInt(severeRiskCount || 0)],
    });

    const txResult = await sendTransaction({
      transaction,
      account: adminAccount,
    });

    // 5. Respond with verification status so your detection engine can log the proof trail
    return NextResponse.json({
      success: true,
      message: "Report securely anchored to Avalanche",
      reportHash,
      transactionHash: txResult.transactionHash,
    }, { status: 200 });

  } catch (error: any) {
    console.error("Critical error inside anchoring pipeline:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Failed execution loop processing transaction",
    }, { status: 500 });
  }
}