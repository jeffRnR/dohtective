// app/api/notify/sheets/route.ts
// Rewrites the previous service-account approach. Now uses the
// authenticated user's own Google OAuth refresh token (stored in
// GoogleSheetsConnection) to create a Google Sheet in THEIR Drive and
// write the action list into it.
//
// Why this is better than a service account for this product:
//   - The sheet lives in the founder's Drive, not ours — they own it,
//     can share it, can modify it, and it doesn't disappear if we
//     rotate our service account credentials.
//   - We never need GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID env
//     vars — each user's connection is self-contained.
//
// POST /api/notify/sheets  — runs the push, returns sheet URL + counts
// GET  /api/notify/sheets  — status check (connected / not connected)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import type { ReportData } from "../../../frontend/lib/types";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// ── Token refresh ────────────────────────────────────────────────────
async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Token refresh failed: ${detail}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Sheets API helpers ───────────────────────────────────────────────
async function sheetsRequest(
  method: string,
  path: string,
  accessToken: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${detail}`);
  }
  return res.json();
}

// ── Row builders (mirrors sheets_dashboard.py logic, in TS) ─────────
const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_EMOJI: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "⚪",
};

const ROLE_BY_FLAG_KEYWORD: Array<[string, string, string]> = [
  [
    "mixed personal",
    "Founder",
    "Check whether this was a genuine personal expense paid from the business account. If so, record it as an owner draw.",
  ],
  [
    "duplicate payment",
    "Accountant",
    "Confirm with the supplier whether this was a deliberate re-order or an accidental double payment. Request a refund if duplicate.",
  ],
  [
    "round-number payment",
    "Accountant",
    "Verify this payment against a supporting invoice. New, round-number payments to unfamiliar recipients are worth a second look.",
  ],
  [
    "unusually precise",
    "Accountant",
    "Confirm this recipient and payment are legitimate — no prior history with this exact amount makes it worth a second look.",
  ],
  [
    "unusual transaction",
    "Accountant",
    "Review the transaction description and confirm it matches a real, expected business expense.",
  ],
  [
    "unreconciled",
    "Accountant",
    "Match this transaction against the bank statement and mark it reconciled.",
  ],
  [
    "reference number sequence",
    "Accountant",
    "Check whether the missing reference numbers were voided entries or genuinely missing records.",
  ],
  [
    "supporting documents",
    "Accountant",
    "Request the missing receipt or invoice from whoever made this purchase.",
  ],
  [
    "bank statement",
    "Accountant",
    "Complete the bank reconciliation for this statement period.",
  ],
  [
    "cash buffer",
    "Founder",
    "Review upcoming payments due and confirm there's enough cash to cover them — line up financing or collections if not.",
  ],
];

function assignAction(flagTitle: string): [string, string] {
  const lower = flagTitle.toLowerCase();
  for (const [keyword, role, action] of ROLE_BY_FLAG_KEYWORD) {
    if (lower.includes(keyword)) return [role, action];
  }
  return [
    "Accountant",
    "Review this flag and determine the appropriate next step.",
  ];
}

function buildActionRows(report: ReportData): string[][] {
  const today = new Date().toISOString().split("T")[0];
  return [...report.flags]
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
    )
    .map((flag) => {
      const [role, action] = assignAction(flag.title);
      const emoji = SEVERITY_EMOJI[flag.severity] ?? "⚪";
      return [
        `${emoji} ${flag.severity.toUpperCase()}`,
        "Open",
        flag.title,
        flag.detail,
        role,
        "",
        today,
        action,
      ];
    });
}

function buildAnomalyRows(report: ReportData): string[][] {
  return (report.anomaly_transactions ?? []).map((tx) => [
    tx.transaction_id,
    tx.date,
    tx.branch,
    tx.contact_name,
    tx.amount.toLocaleString(),
    tx.anomaly_type,
    tx.reason,
    tx.reference_number,
  ]);
}

// ── Create spreadsheet in user's Drive ──────────────────────────────
async function createSpreadsheet(
  accessToken: string,
  businessName: string,
  report: ReportData,
): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  actionCount: number;
  anomalyCount: number;
}> {
  const now = new Date();
  const title = `${businessName} — Financial Review ${now.toISOString().split("T")[0]}`;

  const actionRows = buildActionRows(report);
  const anomalyRows = buildAnomalyRows(report);

  const HEADER_ROW = [
    "Priority",
    "Status",
    "Flag",
    "What it means",
    "Assigned to",
    "Amount (KES)",
    "Date flagged",
    "Action needed",
  ];
  const DETAIL_HEADER = [
    "Transaction ID",
    "Date",
    "Branch",
    "Contact",
    "Amount (KES)",
    "Anomaly type",
    "Reason",
    "Reference",
  ];

  // Snippet to add to app/api/notify/sheets/route.ts
  // In createSpreadsheet(), update summaryRows to include the anchor hash.
  // Replace the existing summaryRows definition with this:

  const anchorHash = (report as any).anchorTxHash ?? null;
  const anchorStatus = (report as any).anchorStatus ?? null;

  const summaryRows = [
    [`${businessName} — Monthly Financial Review`],
    [
      `Generated: ${now.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}`,
    ],
    [
      `Cash buffer: ${report.cash_buffer_days} days (${report.cash_buffer_risk_level} risk)`,
    ],
    [`Items needing attention: ${report.flags.length}`],
    // Anchor row — shows blockchain proof directly in the sheet
    anchorStatus === "anchored" && anchorHash
      ? [
          `Blockchain anchor: ${anchorHash} — verify at https://testnet.snowtrace.io/tx/${anchorHash}`,
        ]
      : [`Blockchain anchor: not yet anchored`],
    [],
    HEADER_ROW,
    ...actionRows,
  ];
  
  
  // Also pass anchorTxHash and anchorStatus from the report snapshot
  // when calling pushToSheets. Update the POST handler in sheets/route.ts:
  // Change:
  //   let body: { report: ReportData; business_name: string };
  // To:
  //   let body: { report: ReportData & { anchorTxHash?: string; anchorStatus?: string }; business_name: string };

  // Create the spreadsheet with two sheets in one API call.
  const created = (await sheetsRequest("POST", "", accessToken, {
    properties: { title },
    sheets: [
      { properties: { title: "Action List", index: 0 } },
      { properties: { title: "Transaction Detail", index: 1 } },
    ],
  })) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets: Array<{ properties: { sheetId: number } }>;
  };

  const spreadsheetId = created.spreadsheetId;
  const actionSheetId = created.sheets[0].properties.sheetId;
  const detailSheetId = created.sheets[1].properties.sheetId;

  // Write data in a single batchUpdate.
  await sheetsRequest(
    "POST",
    `/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    {
      valueInputOption: "RAW",
      data: [
        { range: "Action List!A1", values: summaryRows },
        {
          range: "Transaction Detail!A1",
          values: [[...DETAIL_HEADER], ...anomalyRows],
        },
      ],
    },
  );

  // Format: bold header rows, freeze them.
  await sheetsRequest("POST", `/${spreadsheetId}:batchUpdate`, accessToken, {
    requests: [
      // Bold Action List header (row 6, 0-indexed row 5)
      {
        repeatCell: {
          range: { sheetId: actionSheetId, startRowIndex: 5, endRowIndex: 6 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat.bold",
        },
      },
      // Freeze first 6 rows on Action List
      {
        updateSheetProperties: {
          properties: {
            sheetId: actionSheetId,
            gridProperties: { frozenRowCount: 6 },
          },
          fields: "gridProperties.frozenRowCount",
        },
      },
      // Bold Transaction Detail header (row 1, 0-indexed row 0)
      {
        repeatCell: {
          range: { sheetId: detailSheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat.bold",
        },
      },
      // Freeze first row on Transaction Detail
      {
        updateSheetProperties: {
          properties: {
            sheetId: detailSheetId,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: "gridProperties.frozenRowCount",
        },
      },
    ],
  });

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    actionCount: actionRows.length,
    anomalyCount: anomalyRows.length,
  };
}

// ── GET — connection status ──────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({
      configured: false,
      serviceReachable: true,
      reason: "not_signed_in",
    });
  }

  const connection = await prisma.googleSheetsConnection.findUnique({
    where: { userId: session.user.id },
    select: { email: true, connectedAt: true },
  });

  return NextResponse.json({
    configured: !!connection,
    serviceReachable: true,
    connectedEmail: connection?.email ?? null,
    connectedAt: connection?.connectedAt ?? null,
  });
}

// ── POST — push report to sheet ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const connection = await prisma.googleSheetsConnection.findUnique({
    where: { userId: session.user.id },
  });

  if (!connection) {
    return NextResponse.json(
      {
        error:
          "Google Sheets not connected. Connect it first from the notify page.",
      },
      { status: 400 },
    );
  }

  let body: { report: ReportData; business_name: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(connection.refreshToken);
  } catch (err) {
    // Refresh token may have been revoked — clear the stale connection so
    // the UI correctly shows "not connected" rather than spinning forever.
    await prisma.googleSheetsConnection.delete({
      where: { userId: session.user.id },
    });
    return NextResponse.json(
      {
        error:
          "Google Sheets authorization has expired or been revoked. Please reconnect.",
        code: "TOKEN_EXPIRED",
      },
      { status: 401 },
    );
  }

  try {
    const result = await createSpreadsheet(
      accessToken,
      body.business_name,
      body.report,
    );
    return NextResponse.json({
      status: "sent",
      sheet_url: result.spreadsheetUrl,
      action_items_written: result.actionCount,
      anomaly_rows_written: result.anomalyCount,
      pushed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[sheets] Push failed:", err);
    return NextResponse.json(
      {
        error: "Failed to write to Google Sheets.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
