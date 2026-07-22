// app/api/kotani/status/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kotani/status?orderId=xxx
//
// Client polls this every 3 seconds after initiating the onramp.
// If the callback hasn't arrived after 2 minutes, queries Kotani directly
// and updates the order based on what Kotani returns.
//
// Two-status model:
//   depositStatus  — M-Pesa leg (customer pays on their phone)
//   onchainStatus  — Avalanche leg (USDC arrives in your wallet)
//   Credits only granted when onchainStatus = SUCCESSFUL
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { Prisma } from "@prisma/client";
import {
  getOnrampStatus,
  getStatusMessage,
  TERMINAL_SUCCESS,
  TERMINAL_FAILURE,
  type KotaniStatus,
} from "../../../lib/kotani";
import { checkRateLimit } from "../../../lib/rate-limit";

function pollRateLimit(userId: string) {
  return checkRateLimit(`kotani-poll:${userId}`, 30, 5 * 60 * 1000);
}

// After 2 minutes with no callback, start querying Kotani directly
const POLL_FALLBACK_MS = 2 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const rl = pollRateLimit(session.user.id);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many status checks." }, { status: 429 });
  }

  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const order = await prisma.kotaniPaymentOrder.findFirst({
    where: { id: orderId, userId: session.user.id },
    select: {
      id: true,
      status: true,
      packageId: true,
      creditsToGrant: true,
      amountKes: true,
      kotaniReferenceId: true,
      transactionHash: true,
      depositStatus: true,
      onchainStatus: true,
      initiatedAt: true,
      expiresAt: true,
      cryptoAmountUsdc: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Already terminal — return immediately
  if (["completed", "failed", "expired"].includes(order.status)) {
    return NextResponse.json(formatResponse(order));
  }

  // Expired
  if (new Date() > order.expiresAt) {
    await prisma.kotaniPaymentOrder.update({
      where: { id: order.id },
      data: { status: "expired" },
    });
    await prisma.kotaniAuditLog.create({
      data: { orderId: order.id, event: "expired", payload: Prisma.JsonNull,},
    });
    return NextResponse.json({ ...formatResponse(order), status: "expired" });
  }

  // Polling fallback — query Kotani if callback hasn't arrived after 2 minutes
  const ageMs = Date.now() - order.initiatedAt.getTime();
  if (ageMs > POLL_FALLBACK_MS && order.kotaniReferenceId) {
    try {
      const kotaniStatus = await getOnrampStatus(order.kotaniReferenceId);

      const depositStatus = kotaniStatus.depositStatus as KotaniStatus;
      const onchainStatus = kotaniStatus.onchainStatus as KotaniStatus;
      const txHash = kotaniStatus.transactionHash ?? null;

      await prisma.kotaniAuditLog.create({
        data: {
          orderId: order.id,
          event: "poll_result",
          payload: { depositStatus, onchainStatus, txHash, ageMs },
        },
      });

      // Update order with latest statuses from Kotani
      const isComplete =
        TERMINAL_SUCCESS.includes(depositStatus) &&
        TERMINAL_SUCCESS.includes(onchainStatus);

      const isFailed =
        TERMINAL_FAILURE.includes(depositStatus) ||
        TERMINAL_FAILURE.includes(onchainStatus);

      if (isComplete && txHash) {
        // Grant credits — same logic as the callback handler
        try {
          await prisma.$transaction([
            prisma.kotaniPaymentOrder.update({
              where: { id: order.id },
              data: {
                status: "completed",
                depositStatus,
                onchainStatus,
                transactionHash: txHash,
                cryptoAmountUsdc: kotaniStatus.cryptoAmount,
                completedAt: new Date(),
              },
            }),
            prisma.business.update({
              where: { id: (await getBusinessId(order.id)) },
              data: { analysisCredits: { increment: order.creditsToGrant } },
            }),
            prisma.kotaniAuditLog.create({
              data: {
                orderId: order.id,
                event: "credits_granted_via_poll",
                payload: { credits: order.creditsToGrant, txHash },
              },
            }),
          ]);
        } catch (err) {
          // Likely duplicate — already credited via callback. Safe to ignore.
          console.warn("[kotani/status] Poll credit grant skipped (likely duplicate):", err);
        }
      } else if (isFailed) {
        await prisma.kotaniPaymentOrder.update({
          where: { id: order.id },
          data: { status: "failed", depositStatus, onchainStatus },
        });
      } else {
        await prisma.kotaniPaymentOrder.update({
          where: { id: order.id },
          data: { depositStatus, onchainStatus },
        });
      }

      return NextResponse.json(
        formatResponse({ ...order, status: isComplete ? "completed" : isFailed ? "failed" : order.status, depositStatus, onchainStatus, transactionHash: txHash })
      );
    } catch (err) {
      // Don't break the polling loop on a Kotani API error
      console.error("[kotani/status] Poll query failed:", err);
    }
  }

  return NextResponse.json(formatResponse(order));
}

function formatResponse(order: {
  id: string;
  status: string;
  packageId: string;
  creditsToGrant: number;
  amountKes: number;
  depositStatus?: string | null;
  onchainStatus?: string | null;
  transactionHash?: string | null;
  expiresAt: Date;
  cryptoAmountUsdc?: number | null;
}) {
  const depositStatus = (order.depositStatus ?? "PENDING") as KotaniStatus;
  const onchainStatus = (order.onchainStatus ?? "PENDING") as KotaniStatus;
  const { message, isComplete, isFailed } = getStatusMessage(depositStatus, onchainStatus);

  return {
    orderId: order.id,
    status: order.status,
    packageId: order.packageId,
    creditsToGrant: order.creditsToGrant,
    amountKes: order.amountKes,
    depositStatus,
    onchainStatus,
    transactionHash: order.transactionHash ?? null,
    cryptoAmountUsdc: order.cryptoAmountUsdc ?? null,
    expiresAt: order.expiresAt.toISOString(),
    message,
    isComplete,
    isFailed,
  };
}

async function getBusinessId(orderId: string): Promise<string> {
  const order = await prisma.kotaniPaymentOrder.findUnique({
    where: { id: orderId },
    select: { businessId: true },
  });
  if (!order) throw new Error(`Order not found: ${orderId}`);
  return order.businessId;
}