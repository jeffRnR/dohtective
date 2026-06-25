// app/api/business/topup-credits/route.ts
// Called by the pricing page AFTER TransactionButton confirms on-chain.
// Verifies the tx hash actually exists on Fuji, checks it hasn't been
// used before, then tops up credits for the business.
//
// No Thirdweb Engine or webhook setup needed — the client tells us
// when payment confirms and we verify it server-side before crediting.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const CREDIT_TIERS = [
  { minUnits: 20_000_000, credits: 200, label: "Enterprise" },
  { minUnits: 7_000_000,  credits: 50,  label: "Growth" },
  { minUnits: 2_000_000,  credits: 10,  label: "Starter" },
];

function creditsForAmount(amountUnits: number) {
  for (const tier of CREDIT_TIERS) {
    if (amountUnits >= tier.minUnits) return tier;
  }
  return { credits: 1, label: "Custom" };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: {
    transactionHash: string;
    businessSlug: string;
    amountUnits: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { transactionHash, businessSlug, amountUnits } = body;

  if (!transactionHash || !businessSlug || !amountUnits) {
    return NextResponse.json(
      { error: "transactionHash, businessSlug and amountUnits are required." },
      { status: 400 }
    );
  }

  // Verify the business belongs to this signed-in user
  const membership = await prisma.businessMember.findFirst({
    where: {
      business: { slug: businessSlug },
      userId: session.user.id,
    },
    include: {
      business: {
        select: { id: true, analysisCredits: true, usedTxHashes: true },
      },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "Business not found or access denied." },
      { status: 403 }
    );
  }

  const business = membership.business;

  // Replay attack prevention — same tx hash can't top up credits twice
  if (business.usedTxHashes.includes(transactionHash)) {
    return NextResponse.json(
      { error: "This transaction has already been used to add credits." },
      { status: 409 }
    );
  }

  // Verify the transaction actually exists and succeeded on Fuji
  // Uses Thirdweb's public RPC — no API key needed for reads
  try {
    const rpcRes = await fetch(
      `https://43113.rpc.thirdweb.com/${requireEnv("THIRDWEB_CLIENT_ID")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [transactionHash],
          id: 1,
        }),
      }
    );

    const rpcData = await rpcRes.json();
    const receipt = rpcData?.result;

    if (!receipt) {
      return NextResponse.json(
        {
          error:
            "Transaction not found on chain yet. Wait a moment and try again.",
        },
        { status: 404 }
      );
    }

    if (receipt.status !== "0x1") {
      return NextResponse.json(
        { error: "Transaction failed on chain — no credits added." },
        { status: 400 }
      );
    }

    // Confirm it was sent to our payments contract (not some other contract)
    const PAYMENTS_CONTRACT = "0x61ba39769deccfe5ae1b8e45975aaf3f3e3f7693";
    if (receipt.to?.toLowerCase() !== PAYMENTS_CONTRACT) {
      return NextResponse.json(
        { error: "Transaction was not sent to the Dohtective payments contract." },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("[topup] Chain verification failed:", err);
    return NextResponse.json(
      {
        error: "Could not verify transaction on chain.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  const { credits, label } = creditsForAmount(amountUnits);

  // Top up credits and record tx hash to prevent replay
  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      analysisCredits: { increment: credits },
      usedTxHashes: { push: transactionHash },
    },
    select: { analysisCredits: true },
  });

  console.log(
    `[topup] ✅ ${businessSlug} +${credits} credits (${label}) ` +
    `tx=${transactionHash} → balance now ${updated.analysisCredits}`
  );

  return NextResponse.json({
    success: true,
    creditsAdded: credits,
    tier: label,
    creditsNow: updated.analysisCredits,
    transactionHash,
  });
}