// app/api/anchor/route.ts
// Receives the report webhook from engine.py after every analysis run,
// builds a deterministic keccak256 hash of the report, writes it to
// DohTectiveReportHub on Avalanche Fuji testnet using Dohtective's own
// server wallet (founder never sees this), and stores the transaction
// hash back in ReportSnapshot.anchorTxHash.
//
// Security: engine.py must send DETECTION_ENGINE_SECRET as Bearer token.
// Without it this endpoint returns 401 — it must never be publicly callable
// without auth since it writes to the blockchain on Dohtective's dime.

import { NextRequest, NextResponse } from "next/server";
import {
  createThirdwebClient,
  getContract,
  prepareContractCall,
  sendTransaction,
} from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { avalancheFuji } from "thirdweb/chains";
import { keccak256, toHex } from "thirdweb/utils";
import { prisma } from "../../lib/prisma";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// ── Deterministic report hash ────────────────────────────────────────
// Same inputs always produce the same hash. This is the property that
// makes the anchor useful — a bank can hash the report they received
// and compare it against what's on-chain without trusting Dohtective.
//
// Inputs: businessId + monthYear + sorted flag titles+severity + cashBufferDays
// Sorting by title makes the hash independent of engine output order.
function buildReportHash(
  businessId: string,
  monthYear: string,
  flags: Array<{ title: string; severity: string }>,
  cashBufferDays: number
): `0x${string}` {
  const sortedFlags = [...flags]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((f) => `${f.title}:${f.severity}`)
    .join("|");

  const raw = `${businessId}::${monthYear}::${sortedFlags}::${cashBufferDays}`;
  return keccak256(toHex(raw));
}

function toMonthYear(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ── POST ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Auth — only engine.py can call this
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = requireEnv("DETECTION_ENGINE_SECRET");
  if (authHeader !== `Bearer ${secret}`) {
    console.warn("[anchor] Unauthorized webhook attempt");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Parse body
  let body: {
    businessId: string;
    anomalySummary?: string;
    severeRiskCount?: number;
    rawLedgerData?: {
      flags?: Array<{ title: string; severity: string }>;
      cashBufferDays?: number;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { businessId, rawLedgerData } = body;
  const flags = rawLedgerData?.flags ?? [];
  const cashBufferDays = rawLedgerData?.cashBufferDays ?? 0;

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required." }, { status: 400 });
  }

  // 3. Find the business by slug (engine.py sends the slug as businessId)
  const business = await prisma.business.findUnique({
    where: { slug: businessId },
    select: { id: true },
  });

  if (!business) {
    console.warn(`[anchor] Business not found for slug: ${businessId}`);
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  // 4. Get the most recent snapshot — engine.py calls this right after
  // saving it, so the latest row is always the one we just generated.
  const snapshot = await prisma.reportSnapshot.findFirst({
    where: { businessId: business.id },
    orderBy: { generatedAt: "desc" },
  });

  if (!snapshot) {
    return NextResponse.json({ error: "No report snapshot found." }, { status: 404 });
  }

  // 5. Build deterministic hash
  const monthYear = toMonthYear(snapshot.generatedAt);
  const reportHash = buildReportHash(businessId, monthYear, flags, cashBufferDays);

  console.log(`[anchor] Anchoring ${businessId} (${monthYear}) hash=${reportHash}`);

  // 6. Mark pending before the chain call
  await prisma.reportSnapshot.update({
    where: { id: snapshot.id },
    data: { anchorStatus: "pending" },
  });

  // 7. Send to DohTectiveReportHub on Fuji
  try {
    const client = createThirdwebClient({
      clientId: requireEnv("THIRDWEB_CLIENT_ID"),
      secretKey: requireEnv("THIRDWEB_SECRET_KEY"), // matches your .env key name
    });

    const serverWallet = privateKeyToAccount({
      client,
      privateKey: requireEnv("REPORT_HUB_ADMIN_PRIVATE_KEY"),
    });

    const contract = getContract({
      client,
      chain: avalancheFuji,
      address: "0xc6cb0AffC577Bca8F705E12df1bA46763D0c8Dcc",
    });

    const transaction = prepareContractCall({
      contract,
      method:
        "function anchorReport(string calldata businessId, string calldata monthYear, bytes32 reportHash) external",
      params: [businessId, monthYear, reportHash],
    });

    const { transactionHash } = await sendTransaction({
      transaction,
      account: serverWallet,
    });

    console.log(`[anchor] ✅ On-chain. Tx: ${transactionHash}`);

    // 8. Store tx hash back in DB
    await prisma.reportSnapshot.update({
      where: { id: snapshot.id },
      data: {
        anchorTxHash: transactionHash,
        anchorStatus: "anchored",
      },
    });

    return NextResponse.json({
      success: true,
      transactionHash,
      businessId,
      monthYear,
      reportHash,
    });
  } catch (err) {
    console.error("[anchor] On-chain call failed:", err);

    await prisma.reportSnapshot.update({
      where: { id: snapshot.id },
      data: { anchorStatus: "failed" },
    });

    return NextResponse.json(
      {
        error: "On-chain anchoring failed.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}