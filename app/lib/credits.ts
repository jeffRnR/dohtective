// app/lib/credits.ts
// Credit gate for analysis runs. Called by ingest/route.ts and
// files/route.ts before running the Python engine.
//
// Rules:
//   - Check business has credits > 0
//   - Decrement atomically using a Prisma transaction
//   - Return the new balance so the caller can surface it
//
// Using a DB transaction for the decrement prevents race conditions
// where two simultaneous uploads could both pass the > 0 check and
// both run, consuming two credits when only one existed.

import { prisma } from "./prisma";

export class InsufficientCreditsError extends Error {
  constructor(businessId: string, current: number) {
    super(
      `No analysis credits remaining for business ${businessId}. ` +
      `Current balance: ${current}. Purchase more credits to continue.`
    );
    this.name = "InsufficientCreditsError";
  }
}

export type CreditCheckResult = {
  creditsRemaining: number;
  creditsUsed: number;
};

/**
 * Atomically checks and decrements one analysis credit.
 * Throws InsufficientCreditsError if balance is zero.
 */
export async function consumeOneCredit(businessId: string): Promise<CreditCheckResult> {
  // Use a transaction to make check + decrement atomic
  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: { analysisCredits: true, lifetimeCreditsUsed: true },
    });

    if (!business) {
      throw new Error(`Business not found: ${businessId}`);
    }

    if (business.analysisCredits <= 0) {
      throw new InsufficientCreditsError(businessId, business.analysisCredits);
    }

    const updated = await tx.business.update({
      where: { id: businessId },
      data: {
        analysisCredits: { decrement: 1 },
        lifetimeCreditsUsed: { increment: 1 },
      },
      select: { analysisCredits: true, lifetimeCreditsUsed: true },
    });

    return updated;
  });

  return {
    creditsRemaining: result.analysisCredits,
    creditsUsed: result.lifetimeCreditsUsed,
  };
}

/**
 * Returns current credit balance without consuming any.
 * Used by the dashboard to show remaining credits.
 */
export async function getCreditBalance(businessId: string): Promise<number> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { analysisCredits: true },
  });
  return business?.analysisCredits ?? 0;
}