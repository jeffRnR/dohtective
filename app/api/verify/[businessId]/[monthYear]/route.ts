// app/api/verify/[businessId]/[monthYear]/route.ts
// Public endpoint — no auth required. Banks and third parties call this
// to verify a Dohtective report without trusting Dohtective's database.
//
// The verification reads from the Avalanche blockchain directly, not our DB.
// That's the entire point: the answer doesn't come from us.
//
// GET /api/verify/gearnova/2025-03
//   → { verified: true, reportHash, anchoredAt, txHash }
//
// GET /api/verify/gearnova/2025-03?reportHash=0x...
//   → { verified: true/false, onChainHash, providedHash, match: true/false }
//   → Banks use this to confirm the report they received hasn't been altered.

import { NextRequest, NextResponse } from "next/server";
import { createThirdwebClient, getContract, readContract } from "thirdweb";
import { avalancheFuji } from "thirdweb/chains";
import { prisma } from "../../../../lib/prisma";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ businessId: string; monthYear: string }> }
) {
  const { businessId, monthYear } = await params;
  const providedHash = req.nextUrl.searchParams.get("reportHash") ?? null;

  // Validate monthYear format (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(monthYear)) {
    return NextResponse.json(
      { error: "monthYear must be in YYYY-MM format (e.g. 2025-03)." },
      { status: 400 }
    );
  }

  // Read the hash from the blockchain — not from our DB.
  // This is what makes the verification trustless.
  let onChainHash: string;
  try {
    const client = createThirdwebClient({
      clientId: requireEnv("THIRDWEB_CLIENT_ID"),
      secretKey: requireEnv("THIRDWEB_SECRET_KEY"),
    });

    const contract = getContract({
      client,
      chain: avalancheFuji,
      address: "0xc6cb0AffC577Bca8F705E12df1bA46763D0c8Dcc",
    });

    const result = await readContract({
      contract,
      method:
        "function monthlyReportHashes(string, string) external view returns (bytes32)",
      params: [businessId, monthYear],
    });

    onChainHash = result as string;
  } catch (err) {
    console.error("[verify] Chain read failed:", err);
    return NextResponse.json(
      {
        error: "Could not read from the blockchain.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  // A zero hash means no report has been anchored for this period.
  const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (onChainHash === zeroHash) {
    return NextResponse.json({
      verified: false,
      reason: "No report has been anchored for this business and period.",
      businessId,
      monthYear,
      onChainHash: null,
    });
  }

  // Also pull the tx hash from our DB for the explorer link — this is
  // supplementary info, not the source of truth. The on-chain hash is.
  const business = await prisma.business.findUnique({
    where: { slug: businessId },
    select: { id: true, companyName: true },
  });

  let txHash: string | null = null;
  let anchoredAt: string | null = null;

  if (business) {
    const snapshot = await prisma.reportSnapshot.findFirst({
      where: {
        businessId: business.id,
        anchorStatus: "anchored",
        anchorTxHash: { not: null },
      },
      orderBy: { generatedAt: "desc" },
      select: { anchorTxHash: true, generatedAt: true },
    });
    txHash = snapshot?.anchorTxHash ?? null;
    anchoredAt = snapshot?.generatedAt?.toISOString() ?? null;
  }

  const explorerUrl = txHash
    ? `https://testnet.snowtrace.io/tx/${txHash}`
    : null;

  // If caller provided a hash to compare — run the match check.
  if (providedHash) {
    const match =
      providedHash.toLowerCase() === onChainHash.toLowerCase();
    return NextResponse.json({
      verified: match,
      match,
      businessId,
      monthYear,
      onChainHash,
      providedHash,
      anchoredAt,
      txHash,
      explorerUrl,
      message: match
        ? "The report hash matches what was anchored on Avalanche. This report has not been altered."
        : "Hash mismatch — the report you received does not match what was anchored on Avalanche.",
    });
  }

  // No hash provided — just return what's on-chain.
  return NextResponse.json({
    verified: true,
    businessId,
    monthYear,
    onChainHash,
    anchoredAt,
    txHash,
    explorerUrl,
    message:
      "A report for this business and period is anchored on Avalanche Fuji testnet.",
  });
}