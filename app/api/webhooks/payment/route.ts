// app/api/webhooks/payment/route.ts
// Listens for PremiumPaid events emitted by DohTectivePayments contract.
// Thirdweb Engine calls this webhook when a payment transaction confirms.
// Tops up the business's analysisCredits based on the amount paid.
//
// Credit tiers (matches pricing page):
//   $2  USDC (2_000_000 units) → 10 credits  (Starter)
//   $7  USDC (7_000_000 units) → 50 credits  (Growth)
//   $20 USDC (20_000_000 units) → 200 credits (Enterprise)
//
// Thirdweb sends a webhook secret in the x-payload-signature header.
// We verify it before touching the DB.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Credit amounts per USDC tier (in USDC base units, 6 decimals)
const CREDIT_TIERS: Array<{ minUnits: bigint; credits: number; label: string }> = [
  { minUnits: BigInt("20000000"), credits: 200, label: "Enterprise" },
  { minUnits: BigInt("7000000"),  credits: 50,  label: "Growth" },
  { minUnits: BigInt("2000000"),  credits: 10,  label: "Starter" },
];

function creditsForAmount(amountUnits: bigint): { credits: number; label: string } {
  for (const tier of CREDIT_TIERS) {
    if (amountUnits >= tier.minUnits) {
      return { credits: tier.credits, label: tier.label };
    }
  }
  // Below minimum — give 1 credit so nothing is silently lost
  return { credits: 1, label: "Custom" };
}

export async function POST(req: NextRequest) {
  // 1. Verify webhook secret — Thirdweb sends this header
  const webhookSecret = requireEnv("THIRDWEB_WEBHOOK_SECRET");
  const signature = req.headers.get("x-payload-signature") ?? "";

  if (signature !== webhookSecret) {
    console.warn("[payment webhook] Invalid signature — rejected");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Parse the event payload Thirdweb sends
  let body: {
    event?: {
      eventName?: string;
      data?: {
        businessId?: string;
        payer?: string;
        amount?: string; // comes as string from JSON
        durationDays?: string;
      };
      transactionHash?: string;
    };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const event = body.event;
  if (event?.eventName !== "PremiumPaid") {
    // Not the event we care about — acknowledge and ignore
    return NextResponse.json({ received: true, action: "ignored" });
  }

  const { businessId, payer, amount } = event.data ?? {};
  const txHash = event.transactionHash;

  if (!businessId || !amount) {
    return NextResponse.json(
      { error: "Missing businessId or amount in event data." },
      { status: 400 }
    );
  }

  const amountUnits = BigInt(amount);
  const { credits, label } = creditsForAmount(amountUnits);

  console.log(
    `[payment webhook] PremiumPaid — business=${businessId} amount=${amount} ` +
    `→ ${credits} credits (${label}) tx=${txHash}`
  );

  // 3. Find business by slug and top up credits
  const business = await prisma.business.findUnique({
    where: { slug: businessId },
    select: { id: true, analysisCredits: true },
  });

  if (!business) {
    console.error(`[payment webhook] Business not found: ${businessId}`);
    // Return 200 so Thirdweb doesn't retry endlessly for a slug that doesn't exist
    return NextResponse.json({ received: true, action: "business_not_found" });
  }

  await prisma.business.update({
    where: { id: business.id },
    data: {
      analysisCredits: { increment: credits },
    },
  });

  console.log(
    `[payment webhook] ✅ Topped up ${businessId}: +${credits} credits ` +
    `(now ${business.analysisCredits + credits})`
  );

  return NextResponse.json({
    received: true,
    businessId,
    creditsAdded: credits,
    tier: label,
    transactionHash: txHash,
  });
}