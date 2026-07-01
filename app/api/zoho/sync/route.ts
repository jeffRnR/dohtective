// app/api/zoho/sync/route.ts
import { NextResponse } from "next/server";
import { requireBusinessMember, UnauthorizedError } from "../../../lib/authz";
import { syncZohoTransactions } from "../../../lib/zoho-sync";
import { prisma } from "../../../lib/prisma";

// POST /api/zoho/sync
// Body: { slug: string }
//
// Fetches all bank transactions and expenses from Zoho Books and upserts
// them into the Transaction table so /api/report has data to analyse.
// Called in two places:
//   1. callback/route.ts — immediately after OAuth tokens are saved
//   2. BusinessDashboard — on mount when zohoConnected is true, so every
//      dashboard load pulls fresh data without requiring a manual trigger.

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = body.slug as string | undefined;

  if (!slug) {
    return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  }

  // Auth — must be a member of this business
  let business;
  try {
    ({ business } = await requireBusinessMember(slug));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Confirm a Zoho connection with an organization_id actually exists
  // before spending time on API calls.
  const connection = await prisma.zohoConnection.findUnique({
    where: { businessId: business.id },
    select: { organizationId: true },
  });

  if (!connection?.organizationId) {
    return NextResponse.json(
      {
        error: "No Zoho connection found or organization not selected.",
        pendingOrgSelection: !!connection && !connection.organizationId,
      },
      { status: 422 }
    );
  }

  try {
    const result = await syncZohoTransactions(slug);

    return NextResponse.json({
      ok: true,
      upserted: result.upserted,
      // Non-fatal per-record errors surfaced for debugging but don't
      // fail the whole sync — a single bad record shouldn't block analysis.
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";

    // Token errors surface clearly so the UI can prompt reconnect
    if (message.includes("refresh") || message.includes("token")) {
      return NextResponse.json(
        { error: "Zoho token expired. Please reconnect your Zoho account.", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}