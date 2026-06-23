// app/api/notify/email/route.ts
// Sends a post-push email to the founder and accountant with the action
// checklist. Uses Resend — free tier (100 emails/day) is more than enough
// for this use case. No heavy SDK needed; Resend's API is a single POST.
//
// Called by the notify page AFTER a successful sheet push — it receives
// the sheet URL, business name, and action items so the email is specific
// and actionable rather than a generic "your report is ready" message.
//
// Recipient logic:
//   - Founder: the signed-in user's email (always).
//   - Accountant: pulled from BusinessMember where role = accountant for
//     this business, then joined to User.email. If there's no accountant
//     member yet, we skip them (not an error — just don't send a ghost email).

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: requireEnv("GMAIL_USER"),
    pass: requireEnv("GMAIL_APP_PASSWORD"),
  },
});

transporter.verify((error) => {
  if (error) {
    console.error("Mail transporter error:", error);
  } else {
    console.log("Gmail transporter is ready.");
  }
});

type ActionItem = {
  priority: string;
  flag: string;
  assignedTo: string;
  action: string;
};

type EmailPayload = {
  slug: string;
  businessName: string;
  sheetUrl: string;
  actionItems: ActionItem[];
  period?: string;
};

function buildEmailHtml(payload: EmailPayload, founderName: string): string {
  const { businessName, sheetUrl, actionItems, period } = payload;

  const highItems = actionItems.filter((i) => i.priority.includes("HIGH"));
  const otherItems = actionItems.filter((i) => !i.priority.includes("HIGH"));

  const itemRow = (item: ActionItem) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#1a1a1a;vertical-align:top;">
        ${item.priority}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#1a1a1a;vertical-align:top;">
        <strong>${item.flag}</strong>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;vertical-align:top;">
        ${item.assignedTo}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#444;vertical-align:top;">
        ${item.action}
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f3;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1a1a1a;padding:28px 36px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#d4a843;text-transform:uppercase;">
              Financial Review
            </p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">
              ${businessName}${period ? ` — ${period}` : ""}
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px 0;">
            <p style="margin:0 0 8px;font-size:15px;color:#1a1a1a;">Hi ${founderName},</p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#444;">
              Your monthly financial review is ready. There ${actionItems.length === 1 ? "is" : "are"}
              <strong>${actionItems.length} item${actionItems.length === 1 ? "" : "s"}</strong>
              that need${actionItems.length === 1 ? "s" : ""} attention — sorted below by priority.
              ${
                highItems.length > 0
                  ? `<strong style="color:#c0392b;">${highItems.length} high-priority item${highItems.length === 1 ? "" : "s"} should be addressed this week.</strong>`
                  : "No high-priority issues this period."
              }
            </p>
          </td>
        </tr>

        ${
          actionItems.length > 0
            ? `
        <tr>
          <td style="padding:0 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden;">
              <thead>
                <tr style="background:#f8f8f6;">
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#888;text-align:left;border-bottom:2px solid #eee;">Priority</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#888;text-align:left;border-bottom:2px solid #eee;">Flag</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#888;text-align:left;border-bottom:2px solid #eee;">Assigned to</th>
                  <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#888;text-align:left;border-bottom:2px solid #eee;">Action needed</th>
                </tr>
              </thead>
              <tbody>
                ${[...highItems, ...otherItems].map(itemRow).join("")}
              </tbody>
            </table>
          </td>
        </tr>`
            : ""
        }

        <!-- CTA -->
        <tr>
          <td style="padding:28px 36px;">
            <a href="${sheetUrl}"
               style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.05em;">
              Open Google Sheet →
            </a>
            <p style="margin:16px 0 0;font-size:12px;color:#999;line-height:1.5;">
              The sheet contains a full action list tab and a transaction-detail tab
              for your accountant. Items marked "Open" need to be resolved and
              marked "Done" in the sheet once addressed.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;background:#f8f8f6;border-top:1px solid #eee;">
            <p style="margin:0;font-size:11px;color:#aaa;">
              Sent by your financial review system. This is an automated notification —
              reply to this email if you have questions about a specific flag.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // const resendKey = requireEnv("RESEND_API_KEY");

  // Fetch the accountant's email from the business members table.
  const accountantMember = await prisma.businessMember.findFirst({
    where: {
      business: { slug: payload.slug },
      role: "accountant",
    },
    include: { user: { select: { email: true, name: true } } },
  });

  const founderName = session.user.name ?? session.user.email.split("@")[0];
  const recipients: Array<{ email: string; label: string }> = [
    { email: session.user.email, label: "founder" },
  ];

  if (accountantMember?.user?.email) {
    recipients.push({
      email: accountantMember.user.email,
      label: "accountant",
    });
  }

  const subject = `[Action Required] ${payload.businessName} — ${payload.actionItems.length} items need attention`;
  const html = buildEmailHtml(payload, founderName);

  const results: Array<{ email: string; ok: boolean; error?: string }> = [];

  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: `"Financial Reviews" <${requireEnv("GMAIL_USER")}>`,
        to: recipient.email,
        subject,
        html,
      });

      results.push({
        email: recipient.email,
        ok: true,
      });
    } catch (error) {
      console.error(
        `[notify/email] Failed to send to ${recipient.label} (${recipient.email})`,
        error,
      );

      results.push({
        email: recipient.email,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const allFailed = results.every((r) => !r.ok);
  if (allFailed) {
    return NextResponse.json(
      { error: "All email sends failed.", results },
      { status: 500 },
    );
  }

  return NextResponse.json({ sent: true, results });
}
