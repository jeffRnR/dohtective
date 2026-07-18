// app/api/business/[slug]/schedule/route.ts
// Manages the analysis schedule for a Zoho-connected business.
// Only available when Zoho is connected — scheduled runs require
// auto-sync to pull fresh data before analysis.
//
// GET    — fetch current schedule (or null if none set)
// POST   — create or update schedule
// DELETE — cancel schedule entirely

import { NextRequest, NextResponse } from "next/server";
import { requireBusinessMember, UnauthorizedError } from "../../../../lib/authz";
import { prisma } from "../../../../lib/prisma";

type Frequency = "daily" | "weekly" | "biweekly" | "monthly";

const FREQUENCY_DAYS: Record<Frequency, number> = {
  daily:    1,
  weekly:   7,
  biweekly: 14,
  monthly:  30,
};

function computeNextRunAt(frequency: Frequency): Date {
  const days = FREQUENCY_DAYS[frequency];
  const next = new Date();
  next.setDate(next.getDate() + days);
  // 06:00 EAT (03:00 UTC) — sensible time for Kenyan businesses
  next.setUTCHours(3, 0, 0, 0);
  return next;
}

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let business: { id: string };
  try {
    ({ business } = await requireBusinessMember(slug));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const schedule = await prisma.analysisSchedule.findUnique({
    where: { businessId: business.id },
  });

  return NextResponse.json({ schedule: schedule ?? null });
}

// ── POST — create or update ───────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let business: { id: string };
  try {
    ({ business } = await requireBusinessMember(slug));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: {
    frequency?: Frequency;
    additionalEmails?: string[];
    status?: "active" | "paused";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { frequency, additionalEmails = [], status = "active" } = body;

  if (!frequency || !FREQUENCY_DAYS[frequency]) {
    return NextResponse.json(
      { error: "frequency must be daily, weekly, biweekly, or monthly." },
      { status: 400 }
    );
  }

  // Validate additional emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = additionalEmails.filter((e) => !emailRegex.test(e));
  if (invalidEmails.length > 0) {
    return NextResponse.json(
      { error: `Invalid email addresses: ${invalidEmails.join(", ")}` },
      { status: 400 }
    );
  }

  // Scheduled analysis requires Zoho — manual upload businesses
  // trigger analysis themselves via the Run Analysis button.
  const zohoConnection = await prisma.zohoConnection.findUnique({
    where: { businessId: business.id },
    select: { organizationId: true },
  });

  if (!zohoConnection?.organizationId) {
    return NextResponse.json(
      {
        error:
          "Scheduled analysis requires a Zoho Books connection. " +
          "Connect Zoho Books from your dashboard first.",
      },
      { status: 422 }
    );
  }

  const nextRunAt = computeNextRunAt(frequency);

  const schedule = await prisma.analysisSchedule.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      frequency,
      status,
      nextRunAt,
      additionalEmails,
    },
    update: {
      frequency,
      status,
      additionalEmails,
      // Reset nextRunAt when frequency changes or schedule is reactivated
      // so the next run happens at frequency-from-now, not frequency-from-
      // whenever the old nextRunAt was.
      ...(status === "active" ? { nextRunAt } : {}),
    },
  });

  return NextResponse.json({ schedule });
}

// ── DELETE — cancel schedule ──────────────────────────────────────────────
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let business: { id: string };
  try {
    ({ business } = await requireBusinessMember(slug));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  await prisma.analysisSchedule.deleteMany({
    where: { businessId: business.id },
  });

  return NextResponse.json({ cancelled: true });
}