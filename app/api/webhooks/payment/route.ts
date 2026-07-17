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
// Security:
//   - HMAC-SHA256 signature verified against raw request body
//   - Idempotency: transactionHash checked against usedTxHashes before
//     crediting — duplicate webhook delivery cannot double top-up

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../../../lib/prisma";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// ── HMAC-SHA256 signature verification ───────────────────────────────────
// Thirdweb signs the raw request body with your webhook secret using
// HMAC-SHA256 and sends the hex digest in x-payload-signature.
// We must read the raw body bytes (before JSON parsing) to verify.
async function verifyThirdwebSignature(
  req: NextRequest,
  rawBody: string
): Promise<boolean> {
  const secret = requireEnv("THIRDWEB_WEBHOOK_SECRET");
  const signature = req.headers.get("x-payload-signature") ?? "";

  if (!signature) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // timingSafeEqual prevents timing attacks that could leak the secret
  // by measuring how long a comparison takes character by character.
  try {
    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    // Buffer lengths differ if signature is malformed — treat as invalid
    return false;
  }
}

// ── Credit tiers ──────────────────────────────────────────────────────────
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
  return { credits: 1, label: "Custom" };
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Read raw body BEFORE parsing — signature verification needs the exact bytes
  const rawBody = await req.text();

  // 1. Verify HMAC-SHA256 signature
  const valid = await verifyThirdwebSignature(req, rawBody);
  if (!valid) {
    console.warn("[payment webhook] Invalid HMAC signature — rejected");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Parse the verified payload
  let body: {
    event?: {
      eventName?: string;
      data?: {
        businessId?: string;
        payer?: string;
        amount?: string;
        durationDays?: string;
      };
      transactionHash?: string;
    };
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const event = body.event;
  if (event?.eventName !== "PremiumPaid") {
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

  if (!txHash) {
    return NextResponse.json(
      { error: "Missing transactionHash — cannot verify idempotency." },
      { status: 400 }
    );
  }

  const amountUnits = BigInt(amount);
  const { credits, label } = creditsForAmount(amountUnits);

  // 3. Find business and check idempotency before any DB write
  const business = await prisma.business.findUnique({
    where: { slug: businessId },
    select: { id: true, analysisCredits: true, usedTxHashes: true },
  });

  if (!business) {
    console.error(`[payment webhook] Business not found: ${businessId}`);
    // Return 200 — Thirdweb retries on non-2xx, and this slug won't appear later
    return NextResponse.json({ received: true, action: "business_not_found" });
  }

  // 4. Idempotency — reject duplicate webhook delivery for the same tx
  if (business.usedTxHashes.includes(txHash)) {
    console.warn(
      `[payment webhook] Duplicate txHash ${txHash} for ${businessId} — skipping`
    );
    return NextResponse.json({ received: true, action: "duplicate_ignored" });
  }

  // 5. Atomically top up credits and record the tx hash
  await prisma.business.update({
    where: { id: business.id },
    data: {
      analysisCredits: { increment: credits },
      usedTxHashes: { push: txHash },
    },
  });

  console.log(
    `[payment webhook] ✅ Topped up ${businessId}: +${credits} credits ` +
    `(${label}) payer=${payer ?? "unknown"} tx=${txHash}`
  );

  return NextResponse.json({
    received: true,
    businessId,
    creditsAdded: credits,
    tier: label,
    transactionHash: txHash,
  });
}