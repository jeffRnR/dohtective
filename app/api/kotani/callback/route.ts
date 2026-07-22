// app/api/kotani/callback/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kotani/callback
//
// Kotani posts here when both legs complete:
//   - depositStatus (M-Pesa) updates
//   - onchainStatus (Avalanche USDC) updates
//
// Idempotency enforced at two levels:
//   1. Order status check — if not 'pending' or 'deposit_received', skip
//   2. transactionHash UNIQUE constraint — DB rejects duplicate inserts
//
// Credits are granted ONLY when onchainStatus is SUCCESSFUL/SUCCESS.
// M-Pesa confirmation alone is NOT enough — we wait for on-chain confirmation.
//
// Always returns 200 — Kotani retries on any other status code.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  TERMINAL_SUCCESS,
  TERMINAL_FAILURE,
  type KotaniStatus,
} from "../../../lib/kotani";

// Always 200 — Kotani retries on non-200
const ACK = NextResponse.json({ success: true, message: "Received" });

export async function POST(req: NextRequest) {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    console.error("[kotani/callback] Malformed JSON");
    return ACK; // ack even on parse error — don't trigger retries
  }

  // Kotani sends referenceId as the order identifier we passed in
  const referenceId = String(body.referenceId ?? body.reference_id ?? "");
  const depositStatus = String(body.depositStatus ?? body.deposit_status ?? "") as KotaniStatus;
  const onchainStatus = String(body.onchainStatus ?? body.onchain_status ?? "") as KotaniStatus;
  const transactionHash = String(body.transactionHash ?? body.transaction_hash ?? "");
  const cryptoAmount = Number(body.cryptoAmount ?? body.crypto_amount ?? 0);

  if (!referenceId) {
    console.error("[kotani/callback] Missing referenceId:", body);
    return ACK;
  }

  // ── Find order ────────────────────────────────────────────────────────────
  // referenceId is our order.id (we set it as referenceId when creating the onramp)
  const order = await prisma.kotaniPaymentOrder.findUnique({
    where: { id: referenceId },
    select: {
      id: true,
      status: true,
      businessId: true,
      creditsToGrant: true,
      transactionHash: true,
    },
  });

  if (!order) {
    // Try by kotaniReferenceId as fallback
    const byKotani = await prisma.kotaniPaymentOrder.findUnique({
      where: { kotaniReferenceId: referenceId },
      select: {
        id: true,
        status: true,
        businessId: true,
        creditsToGrant: true,
        transactionHash: true,
      },
    });

    if (!byKotani) {
      console.error(`[kotani/callback] No order found for referenceId: ${referenceId}`);
      return ACK;
    }

    return processCallback({
      order: byKotani,
      depositStatus,
      onchainStatus,
      transactionHash,
      cryptoAmount,
      rawBody: body,
    });
  }

  return processCallback({
    order,
    depositStatus,
    onchainStatus,
    transactionHash,
    cryptoAmount,
    rawBody: body,
  });
}

async function processCallback({
  order,
  depositStatus,
  onchainStatus,
  transactionHash,
  cryptoAmount,
  rawBody,
}: {
  order: {
    id: string;
    status: string;
    businessId: string;
    creditsToGrant: number;
    transactionHash: string | null;
  };
  depositStatus: KotaniStatus;
  onchainStatus: KotaniStatus;
  transactionHash: string;
  cryptoAmount: number;
  rawBody: Record<string, unknown>;
}) {
  // ── Idempotency: already terminal ────────────────────────────────────────
  if (order.status === "completed" || order.status === "failed" || order.status === "expired") {
    await prisma.kotaniAuditLog.create({
      data: {
        orderId: order.id,
        event: "duplicate_callback_ignored",
        payload: { existingStatus: order.status, depositStatus, onchainStatus },
      },
    });
    return NextResponse.json({ success: true, message: "Already processed" });
  }

  // ── Log every callback unconditionally ───────────────────────────────────
  await prisma.kotaniAuditLog.create({
    data: {
      orderId: order.id,
      event: "callback_received",
      payload: {
        depositStatus,
        onchainStatus,
        transactionHash: transactionHash || null,
        cryptoAmount,
      },
    },
  });

  // ── M-Pesa confirmed, waiting for on-chain ────────────────────────────────
  const depositConfirmed = TERMINAL_SUCCESS.includes(depositStatus);
  const onchainConfirmed = TERMINAL_SUCCESS.includes(onchainStatus);
  const depositFailed = TERMINAL_FAILURE.includes(depositStatus);
  const onchainFailed = TERMINAL_FAILURE.includes(onchainStatus);

  if (depositConfirmed && !onchainConfirmed && !onchainFailed) {
    // M-Pesa done, USDC on its way to Avalanche — update intermediate status
    await prisma.kotaniPaymentOrder.update({
      where: { id: order.id },
      data: {
        status: "deposit_received",
        depositStatus,
        onchainStatus,
      },
    });
    return NextResponse.json({ success: true, message: "Deposit received, awaiting on-chain" });
  }

  // ── M-Pesa failed ─────────────────────────────────────────────────────────
  if (depositFailed) {
    await prisma.kotaniPaymentOrder.update({
      where: { id: order.id },
      data: {
        status: "failed",
        depositStatus,
        onchainStatus,
      },
    });
    await prisma.kotaniAuditLog.create({
      data: {
        orderId: order.id,
        event: "deposit_failed",
        payload: { depositStatus, onchainStatus },
      },
    });
    return NextResponse.json({ success: true });
  }

  // ── On-chain failed (M-Pesa succeeded but USDC transfer failed) ───────────
  if (depositConfirmed && onchainFailed) {
    await prisma.kotaniPaymentOrder.update({
      where: { id: order.id },
      data: {
        status: "failed",
        depositStatus,
        onchainStatus,
      },
    });
    await prisma.kotaniAuditLog.create({
      data: {
        orderId: order.id,
        event: "onchain_failed",
        payload: { depositStatus, onchainStatus },
      },
    });
    // Note: Kotani auto-refunds M-Pesa in this case after 5 min
    console.error(`[kotani/callback] On-chain failed for order ${order.id}. Kotani will auto-refund.`);
    return NextResponse.json({ success: true });
  }

  // ── Both legs complete — grant credits atomically ─────────────────────────
  if (depositConfirmed && onchainConfirmed) {
    try {
      await prisma.$transaction([
        // Update order to completed
        // transactionHash UNIQUE constraint is the second idempotency gate
        prisma.kotaniPaymentOrder.update({
          where: { id: order.id },
          data: {
            status: "completed",
            depositStatus,
            onchainStatus,
            transactionHash: transactionHash || null,
            cryptoAmountUsdc: cryptoAmount,
            completedAt: new Date(),
          },
        }),

        // Grant credits to the business
        prisma.business.update({
          where: { id: order.businessId },
          data: {
            analysisCredits: { increment: order.creditsToGrant },
          },
        }),

        // Immutable record of credit grant
        prisma.kotaniAuditLog.create({
          data: {
            orderId: order.id,
            event: "credits_granted",
            payload: {
              credits: order.creditsToGrant,
              transactionHash: transactionHash || null,
              cryptoAmountUsdc: cryptoAmount,
              depositStatus,
              onchainStatus,
            },
          },
        }),
      ]);

      console.log(
        `[kotani/callback] ✅ Order ${order.id} completed. ` +
        `+${order.creditsToGrant} credits → business ${order.businessId}. ` +
        `Tx: ${transactionHash}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Most likely cause: transactionHash UNIQUE constraint on duplicate callback
      if (message.includes("Unique constraint") || message.includes("unique")) {
        await prisma.kotaniAuditLog.create({
          data: {
            orderId: order.id,
            event: "duplicate_hash_ignored",
            payload: { transactionHash, error: message },
          },
        }).catch(() => {});
        return NextResponse.json({ success: true, message: "Duplicate" });
      }

      console.error(`[kotani/callback] Credit grant failed for order ${order.id}:`, message);
      await prisma.kotaniAuditLog.create({
        data: {
          orderId: order.id,
          event: "credit_grant_error",
          payload: { error: message, transactionHash },
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}