// app/api/kotani/initiate/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kotani/initiate
//
// Initiates a Kotani Pay onramp:
//   1. Validates session, package, phone number
//   2. Gets or creates Kotani customer_key for this phone number
//   3. Fetches live KES → USDC rate
//   4. Creates KotaniPaymentOrder in DB (status: pending)
//   5. Calls Kotani POST /api/v3/onramp → triggers M-Pesa STK push
//   6. Stores kotaniReferenceId on the order
//   7. Returns { orderId, referenceId, expiresAt } to client
//
// Security:
//   - Amount always comes from server-side PACKAGE_MAP — never trusted from client
//   - Rate limited: 3 attempts per 5 minutes per user
//   - USDC receiver address comes from env, never client input
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { PACKAGE_MAP, type PackageId } from "../../../lib/packages";
import {
  getOrCreateKotaniCustomer,
  getOnrampRate,
  createOnramp,
  normalizeKenyanPhone,
} from "../../../lib/kotani";
import { checkRateLimit } from "../../../lib/rate-limit";

function initiateRateLimit(userId: string) {
  return checkRateLimit(`kotani-initiate:${userId}`, 3, 5 * 60 * 1000);
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to purchase credits." },
      { status: 401 }
    );
  }

  const rl = initiateRateLimit(session.user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many payment attempts. Wait a few minutes and try again." },
      { status: 429 }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { packageId?: unknown; phoneNumber?: unknown; businessSlug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // ── Validate package ──────────────────────────────────────────────────────
  const pkg = PACKAGE_MAP[body.packageId as PackageId];
  if (!pkg) {
    return NextResponse.json({ error: "Invalid package selection." }, { status: 400 });
  }

  // ── Validate phone ────────────────────────────────────────────────────────
  const rawPhone = String(body.phoneNumber ?? "").trim();
  const phone = normalizeKenyanPhone(rawPhone);
  if (!phone) {
    return NextResponse.json(
      { error: "Enter a valid Safaricom M-Pesa number (e.g. 0712 345678)." },
      { status: 400 }
    );
  }

  // ── Validate business membership ──────────────────────────────────────────
  const businessSlug = String(body.businessSlug ?? "").trim();
  const business = await prisma.business.findFirst({
    where: {
      slug: businessSlug,
      members: { some: { userId: session.user.id } },
    },
    select: { id: true },
  });

  if (!business) {
    return NextResponse.json(
      { error: "Business not found or access denied." },
      { status: 403 }
    );
  }

  // ── Get or create Kotani customer ─────────────────────────────────────────
  // Cache the customer_key on the User row to avoid redundant API calls
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kotaniCustomerKey: true, name: true, email: true },
  });

  let customerKey = user?.kotaniCustomerKey ?? null;

  if (!customerKey) {
    try {
      const accountName = user?.name ?? user?.email?.split("@")[0] ?? "Dohtective User";
      const customer = await getOrCreateKotaniCustomer(phone, accountName);
      customerKey = customer.customer_key;

      // Persist the customer_key so we reuse it on subsequent payments
      await prisma.user.update({
        where: { id: session.user.id },
        data: { kotaniCustomerKey: customerKey },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[kotani/initiate] Customer creation failed:", message);
      return NextResponse.json(
        { error: "Could not register your phone number. Try again." },
        { status: 502 }
      );
    }
  }

  // ── Fetch live rate ───────────────────────────────────────────────────────
  let rate;
  try {
    rate = await getOnrampRate(pkg.priceKes);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kotani/initiate] Rate fetch failed:", message);
    return NextResponse.json(
      { error: "Could not fetch the current exchange rate. Try again in a moment." },
      { status: 502 }
    );
  }

  // ── Create order (pending) ────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10-minute TTL

  const order = await prisma.kotaniPaymentOrder.create({
    data: {
      businessId: business.id,
      userId: session.user.id,
      packageId: pkg.id,
      creditsToGrant: pkg.credits,
      amountKes: pkg.priceKes,
      phoneNumber: phone,
      customerKey,
      rateId: rate.id,
      rateValue: rate.value,
      status: "pending",
      expiresAt,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });

  // Audit
  await prisma.kotaniAuditLog.create({
    data: {
      orderId: order.id,
      event: "onramp_initiated",
      payload: {
        packageId: pkg.id,
        amountKes: pkg.priceKes,
        credits: pkg.credits,
        phone: phone.replace(/(\d{6})\d{4}(\d{2})/, "$1****$2"),
        rateId: rate.id,
        cryptoAmount: rate.cryptoAmount,
      },
    },
  });

  // ── Call Kotani — trigger STK push ────────────────────────────────────────
  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  const callbackUrl = `${baseUrl}/api/kotani/callback`;

  try {
    const onramp = await createOnramp({
      customerKey,
      phoneNumber: phone,
      fiatAmountKes: pkg.priceKes,
      referenceId: order.id, // use our order ID as the reference
      callbackUrl,
      rateId: rate.id,
    });

    // Store Kotani's reference IDs
    await prisma.kotaniPaymentOrder.update({
      where: { id: order.id },
      data: { kotaniReferenceId: onramp.referenceId },
    });

    await prisma.kotaniAuditLog.create({
      data: {
        orderId: order.id,
        event: "kotani_onramp_created",
        payload: {
          kotaniReferenceId: onramp.referenceId,
          message: onramp.message,
        },
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      kotaniReferenceId: onramp.referenceId,
      cryptoAmountUsdc: rate.cryptoAmount,
      expiresAt: expiresAt.toISOString(),
      message: "Check your phone and enter your M-Pesa PIN to complete payment.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kotani/initiate] Onramp creation failed:", message);

    await prisma.kotaniPaymentOrder.update({
      where: { id: order.id },
      data: { status: "failed" },
    });

    await prisma.kotaniAuditLog.create({
      data: {
        orderId: order.id,
        event: "onramp_creation_error",
        payload: { error: message },
      },
    });

    return NextResponse.json(
      { error: "Could not send the M-Pesa prompt. Check your number and try again." },
      { status: 502 }
    );
  }
}