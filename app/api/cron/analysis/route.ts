// app/api/cron/analysis/route.ts
// Vercel Cron runs this route every hour (configured in vercel.json).
// Finds all AnalysisSchedule rows where status=active AND nextRunAt<=now,
// then for each one:
//   1. Checks Zoho connection exists
//   2. Checks credits > 0 (if not: pause + email founder)
//   3. Syncs Zoho data directly via syncZohoTransactions()
//   4. Calls detection service via HTTP (not child_process — no Python on Vercel)
//   5. Writes full report to ReportSnapshot.flagsJson
//   6. Sends the scheduled summary email
//   7. Updates nextRunAt for the next cycle
//
// Security: Vercel sets Authorization: Bearer <CRON_SECRET> on every
// cron invocation. We reject any request without it.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { syncZohoTransactions } from "../../../lib/zoho-sync";
import { sendEmail } from "../../../lib/mailer";
import {
  buildScheduledRunEmail,
  buildNoCreditsEmail,
  type ScheduledRunSummary,
} from "../../../lib/scheduled-email";

const DETECTION_SERVICE_URL =
  process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

function computeNextRunAt(frequency: string): Date {
  const days = FREQUENCY_DAYS[frequency] ?? 30;
  const next = new Date();
  next.setDate(next.getDate() + days);
  next.setUTCHours(3, 0, 0, 0); // 06:00 EAT
  return next;
}

function periodLabel(date: Date): string {
  return date.toLocaleDateString("en-KE", {
    timeZone: "Africa/Nairobi",
    month: "long",
    year: "numeric",
  });
}

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel Cron invocation
  const cronSecret = requireEnv("CRON_SECRET");
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();

  const dueSchedules = await prisma.analysisSchedule.findMany({
    where: {
      status: "active",
      nextRunAt: { lte: now },
    },
    include: {
      business: {
        include: {
          members: {
            where: { role: "founder" },
            include: { user: { select: { email: true, name: true } } },
          },
          zohoConnection: { select: { organizationId: true } },
        },
      },
    },
  });

  console.log(
    `[cron/analysis] ${dueSchedules.length} schedules due at ${now.toISOString()}`
  );

  const results: Array<{
    businessSlug: string;
    status: string;
    error?: string;
  }> = [];

  for (const schedule of dueSchedules) {
    const business = schedule.business;
    const businessSlug = business.slug;
    const businessId = business.id;

    const founderMember = business.members[0];
    const founderEmail = founderMember?.user?.email ?? null;
    const founderName =
      founderMember?.user?.name ??
      founderEmail?.split("@")[0] ??
      "there";

    const allRecipients = [
      ...(founderEmail ? [founderEmail] : []),
      ...schedule.additionalEmails,
    ].filter(Boolean);

    // ── 1. Check Zoho connection ──────────────────────────────────────
    if (!business.zohoConnection?.organizationId) {
      await prisma.analysisSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          lastRunStatus: "skipped_no_zoho",
          nextRunAt: computeNextRunAt(schedule.frequency),
        },
      });
      results.push({ businessSlug, status: "skipped_no_zoho" });
      continue;
    }

    // ── 2. Check credits ──────────────────────────────────────────────
    const freshBusiness = await prisma.business.findUnique({
      where: { id: businessId },
      select: { analysisCredits: true },
    });

    if (!freshBusiness || freshBusiness.analysisCredits <= 0) {
      await prisma.analysisSchedule.update({
        where: { id: schedule.id },
        data: {
          status: "paused",
          lastRunAt: now,
          lastRunStatus: "skipped_no_credits",
        },
      });

      if (founderEmail) {
        try {
          await sendEmail({
            to: founderEmail,
            subject: `[Dohtective] Scheduled analysis paused — ${business.companyName} is out of credits`,
            html: buildNoCreditsEmail(
              business.companyName,
              founderName,
              businessSlug,
              schedule.frequency
            ),
          });
        } catch (emailErr) {
          console.error(
            `[cron] No-credits email failed for ${founderEmail}:`,
            emailErr
          );
        }
      }

      results.push({ businessSlug, status: "paused_no_credits" });
      continue;
    }

    // ── 3. Sync + analyse ─────────────────────────────────────────────
    let report: Record<string, unknown>;
    try {
      // Consume credit atomically before any work
      await prisma.business.update({
        where: { id: businessId },
        data: {
          analysisCredits: { decrement: 1 },
          lifetimeCreditsUsed: { increment: 1 },
        },
      });

      // Sync Zoho transactions directly — no HTTP roundtrip to /api/zoho/sync
      // because that route requires a NextAuth session which cron doesn't have.
      await syncZohoTransactions(businessSlug);

      // Load all transactions for this business
      const transactions = await prisma.transaction.findMany({
        where: { businessId },
      });

      if (transactions.length === 0) {
        throw new Error("No transactions found after Zoho sync.");
      }

      const engineTransactions = transactions.map((t) => ({
        transaction_id: t.transactionId,
        date: t.date.toISOString().slice(0, 10),
        branch: t.branch,
        type: t.type,
        account_name: t.accountName,
        category_name: t.categoryName,
        contact_name: t.contactName,
        reference_number: t.referenceNumber,
        payment_method: t.paymentMethod,
        description: t.description,
        amount: t.amount,
        status: t.status,
        bank_account: t.bankAccount,
        is_reconciled: t.isReconciled,
        notes: t.notes,
      }));

      // Call detection service via HTTP — same as analyse/route.ts
      // (no child_process, no Python runtime needed on Vercel)
      const analyzeRes = await fetch(`${DETECTION_SERVICE_URL}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DETECTION_ENGINE_SECRET}`,
        },
        body: JSON.stringify({
          businessId: businessSlug,
          transactions: engineTransactions,
          invoices: [],
          bank_statements: [],
          supporting_documents: [],
          business_billers: [],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!analyzeRes.ok) {
        const detail = await analyzeRes.json().catch(() => ({}));
        throw new Error(detail.detail ?? `Analysis service returned ${analyzeRes.status}`);
      }

      ({ report } = await analyzeRes.json());

      // Persist full report to snapshot so /api/report serves it instantly
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const existing = await prisma.reportSnapshot.findFirst({
        where: { businessId, generatedAt: { gte: monthStart } },
        orderBy: { generatedAt: "desc" },
      });

      const snapshotData = {
        cashBufferDays: (report.cash_buffer_days as number) ?? 0,
        cashBufferRiskLevel: (report.cash_buffer_risk_level as string) ?? "unknown",
        totalCashInflows: (report.total_cash_inflows as number) ?? 0,
        totalCashOutflows: (report.total_cash_outflows as number) ?? 0,
        mixedFundsCount: (report.mixed_funds_count as number) ?? 0,
        mixedFundsTotal: (report.mixed_funds_total as number) ?? 0,
        // Store full report object so /api/report needs no re-analysis
        flagsJson: report as object,
        plainLanguageJson: (report.plain_language as object) ?? [],
      };

      if (existing) {
        await prisma.reportSnapshot.update({
          where: { id: existing.id },
          data: { ...snapshotData, generatedAt: now },
        });
      } else {
        await prisma.reportSnapshot.create({
          data: { businessId, ...snapshotData },
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] Analysis failed for ${businessSlug}:`, errorMsg);

      // Refund the credit — business shouldn't pay for a failed run
      await prisma.business.update({
        where: { id: businessId },
        data: {
          analysisCredits: { increment: 1 },
          lifetimeCreditsUsed: { decrement: 1 },
        },
      });

      await prisma.analysisSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          lastRunStatus: "failed",
          lastRunError: errorMsg.slice(0, 500), // cap at 500 chars
          nextRunAt: computeNextRunAt(schedule.frequency),
        },
      });

      results.push({ businessSlug, status: "failed", error: errorMsg });
      continue;
    }

    // ── 4. Send summary email ─────────────────────────────────────────
    const flags = (report.flags ?? []) as Array<{
      severity: string;
      title: string;
    }>;
    const sorted = [...flags].sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
    });

    const nextRunAt = computeNextRunAt(schedule.frequency);

    const updatedBusiness = await prisma.business.findUnique({
      where: { id: businessId },
      select: { analysisCredits: true },
    });

    const summary: ScheduledRunSummary = {
      businessName: business.companyName,
      businessSlug,
      period: periodLabel(now),
      cashBufferDays: (report.cash_buffer_days as number) ?? 0,
      cashBufferRiskLevel:
        (report.cash_buffer_risk_level as ScheduledRunSummary["cashBufferRiskLevel"]) ??
        "unknown",
      flagCount: flags.length,
      highFlags: flags.filter((f) => f.severity === "high").length,
      mediumFlags: flags.filter((f) => f.severity === "medium").length,
      lowFlags: flags.filter((f) => f.severity === "low").length,
      topFlagTitles: sorted.slice(0, 2).map((f) => f.title),
      creditsRemaining: updatedBusiness?.analysisCredits ?? 0,
      frequency: schedule.frequency,
      nextRunAt,
    };

    for (const recipientEmail of allRecipients) {
      const name =
        recipientEmail === founderEmail
          ? founderName
          : recipientEmail.split("@")[0];
      try {
        await sendEmail({
          to: recipientEmail,
          subject: `${business.companyName} — ${flags.length} flag${flags.length === 1 ? "" : "s"} found in your ${schedule.frequency} analysis`,
          html: buildScheduledRunEmail(summary, name),
        });
      } catch (emailErr) {
        console.error(
          `[cron] Summary email failed for ${recipientEmail}:`,
          emailErr
        );
      }
    }

    // ── 5. Advance schedule ───────────────────────────────────────────
    await prisma.analysisSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        lastRunStatus: "success",
        lastRunError: null,
        nextRunAt,
      },
    });

    results.push({ businessSlug, status: "success" });
    console.log(
      `[cron] ✅ ${businessSlug} — ${flags.length} flags, next run ${nextRunAt.toISOString()}`
    );
  }

  return NextResponse.json({
    ran: now.toISOString(),
    processed: dueSchedules.length,
    results,
  });
}