// app/lib/scheduled-email.ts
// Builds HTML emails sent after every scheduled analysis run.
// Deliberately shows LESS than the full report — enough to know
// something needs attention, not enough to avoid opening the app.
//
// Included:
//   - Business name + period
//   - Cash runway + risk level
//   - Flag count by severity
//   - Top 2 flag TITLES only (no detail, no action plan)
//   - Credits remaining (with low-credit warning)
//   - "View full report" CTA → /business/[slug]
//   - "Change or cancel schedule" link
//
// No-credits variant: different email telling founder to top up
// and that the schedule has been paused.

export type ScheduledRunSummary = {
  businessName: string;
  businessSlug: string;
  period: string;
  cashBufferDays: number;
  cashBufferRiskLevel: "high" | "medium" | "low" | "unknown";
  flagCount: number;
  highFlags: number;
  mediumFlags: number;
  lowFlags: number;
  topFlagTitles: string[];
  creditsRemaining: number;
  frequency: string;
  nextRunAt: Date;
};

const RISK_COLOR: Record<string, string> = {
  high:    "#b85c3a",
  medium:  "#c4973a",
  low:     "#5a7a5a",
  unknown: "#7a9a8a",
};

const RISK_LABEL: Record<string, string> = {
  high:    "High risk — act now",
  medium:  "Worth watching",
  low:     "Looking healthy",
  unknown: "Could not estimate",
};

const FREQUENCY_LABEL: Record<string, string> = {
  daily:    "daily",
  weekly:   "weekly",
  biweekly: "every 2 weeks",
  monthly:  "monthly",
};

function appUrl(): string {
  const base = process.env.NEXTAUTH_URL;
  if (!base) {
    throw new Error(
      "NEXTAUTH_URL is not set — cannot build email links. " +
      "Set NEXTAUTH_URL in your environment variables."
    );
  }
  return base.replace(/\/$/, "");
}

export function buildScheduledRunEmail(
  summary: ScheduledRunSummary,
  recipientName: string
): string {
  const {
    businessName, businessSlug, period,
    cashBufferDays, cashBufferRiskLevel,
    flagCount, highFlags, mediumFlags, lowFlags,
    topFlagTitles, creditsRemaining, frequency, nextRunAt,
  } = summary;

  const base          = appUrl();
  const dashboardUrl  = `${base}/business/${businessSlug}`;
  const scheduleUrl   = `${base}/business/${businessSlug}#schedule`;
  const pricingUrl    = `${base}/pricing`;
  const riskColor     = RISK_COLOR[cashBufferRiskLevel] ?? "#7a9a8a";
  const riskLabel     = RISK_LABEL[cashBufferRiskLevel] ?? "Unknown";
  const freqLabel     = FREQUENCY_LABEL[frequency] ?? frequency;

  const nextRunLabel = nextRunAt.toLocaleDateString("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const flagSummaryParts: string[] = [];
  if (highFlags > 0)
    flagSummaryParts.push(
      `<span style="color:#b85c3a;font-weight:700;">${highFlags} high</span>`
    );
  if (mediumFlags > 0)
    flagSummaryParts.push(
      `<span style="color:#c4973a;font-weight:700;">${mediumFlags} medium</span>`
    );
  if (lowFlags > 0)
    flagSummaryParts.push(
      `<span style="color:#5a7a5a;">${lowFlags} low</span>`
    );
  const flagSummaryHtml =
    flagSummaryParts.length > 0
      ? flagSummaryParts.join(", ")
      : '<span style="color:#5a7a5a;font-weight:700;">none</span>';

  const topFlagsHtml =
    topFlagTitles.length > 0
      ? topFlagTitles
          .map(
            (title) => `
          <tr>
            <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#1a1a1a;">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#c4973a;margin-right:8px;vertical-align:middle;"></span>
              ${title}
            </td>
          </tr>`
          )
          .join("")
      : `<tr><td style="padding:12px 16px;font-size:13px;color:#999;font-style:italic;">No flags this period — clean run.</td></tr>`;

  const creditWarning =
    creditsRemaining <= 2
      ? `
      <tr>
        <td style="padding:0 36px 24px;">
          <div style="background:${creditsRemaining === 0 ? "#fdf0ed" : "#fdf8ed"};border:1px solid ${creditsRemaining === 0 ? "#b85c3a" : "#c4973a"};border-radius:6px;padding:14px 16px;">
            <p style="margin:0;font-size:13px;font-weight:700;color:${creditsRemaining === 0 ? "#b85c3a" : "#c4973a"};">
              ${creditsRemaining === 0 ? "No credits remaining" : `Only ${creditsRemaining} credit${creditsRemaining === 1 ? "" : "s"} left`}
            </p>
            <p style="margin:6px 0 0;font-size:12px;color:#666;">
              ${
                creditsRemaining === 0
                  ? "Your schedule has been paused. Top up to resume."
                  : "Your next run will use your last credit. Top up to keep things running."
              }
              <a href="${pricingUrl}" style="color:#5a7a5a;font-weight:700;"> Buy credits →</a>
            </p>
          </div>
        </td>
      </tr>`
      : "";

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
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#5a7a5a;text-transform:uppercase;">
              Scheduled Analysis · ${freqLabel}
            </p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">${businessName}</h1>
            <p style="margin:4px 0 0;font-size:13px;color:#888;">${period}</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:28px 36px 20px;">
            <p style="margin:0;font-size:15px;color:#1a1a1a;">Hi ${recipientName},</p>
            <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#555;">
              Your ${freqLabel} financial analysis just ran automatically. Here's what came up.
              Open the full report to see the detail and your action plan.
            </p>
          </td>
        </tr>

        <!-- Key metrics -->
        <tr>
          <td style="padding:0 36px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
              <tr style="background:#f8f8f6;">
                <td style="padding:16px 20px;border-right:1px solid #eee;width:50%;vertical-align:top;">
                  <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;">Cash runway</p>
                  <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:${riskColor};">${cashBufferDays}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:${riskColor};">days · ${riskLabel}</p>
                </td>
                <td style="padding:16px 20px;width:50%;vertical-align:top;">
                  <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;">Flags raised</p>
                  <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#1a1a1a;">${flagCount}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#666;">${flagSummaryHtml}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Top flags preview -->
        ${
          flagCount > 0
            ? `
        <tr>
          <td style="padding:0 36px 24px;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;">
              ${
                topFlagTitles.length < flagCount
                  ? `Top ${topFlagTitles.length} of ${flagCount} flags — open the app to see all`
                  : `${flagCount} flag${flagCount === 1 ? "" : "s"} this period`
              }
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden;">
              <tbody>${topFlagsHtml}</tbody>
            </table>
            ${
              flagCount > 2
                ? `<p style="margin:8px 0 0;font-size:12px;color:#999;font-style:italic;">+${flagCount - 2} more flag${flagCount - 2 === 1 ? "" : "s"} in the full report.</p>`
                : ""
            }
          </td>
        </tr>`
            : ""
        }

        <!-- Credit warning -->
        ${creditWarning}

        <!-- CTA -->
        <tr>
          <td style="padding:0 36px 28px;">
            <a href="${dashboardUrl}"
               style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.05em;">
              View full report →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;background:#f8f8f6;border-top:1px solid #eee;">
            <p style="margin:0;font-size:11px;color:#aaa;line-height:1.8;">
              This analysis ran on your ${freqLabel} schedule.
              Next run: <strong style="color:#888;">${nextRunLabel}</strong><br>
              <a href="${scheduleUrl}" style="color:#7a9a8a;">Change or cancel schedule</a>
              ${creditsRemaining > 0 ? ` · ${creditsRemaining} credit${creditsRemaining === 1 ? "" : "s"} remaining` : ""}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildNoCreditsEmail(
  businessName: string,
  recipientName: string,
  businessSlug: string,
  frequency: string
): string {
  const base         = appUrl();
  const pricingUrl   = `${base}/pricing`;
  const scheduleUrl  = `${base}/business/${businessSlug}#schedule`;
  const freqLabel    = FREQUENCY_LABEL[frequency] ?? frequency;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f3;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <tr>
          <td style="background:#1a1a1a;padding:28px 36px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#b85c3a;text-transform:uppercase;">
              Schedule paused — no credits
            </p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">${businessName}</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 36px 24px;">
            <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;">Hi ${recipientName},</p>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555;">
              Your ${freqLabel} scheduled analysis for <strong>${businessName}</strong> didn't run
              because your account has no analysis credits left.
            </p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">
              Your schedule has been <strong>paused</strong> to avoid repeated failures.
              Top up your credits and your schedule will resume automatically from the next due date.
            </p>
            <a href="${pricingUrl}"
               style="display:inline-block;background:#b85c3a;color:#fff;text-decoration:none;padding:13px 28px;border-radius:6px;font-size:13px;font-weight:700;margin-right:12px;">
              Buy credits →
            </a>
            <a href="${scheduleUrl}"
               style="display:inline-block;color:#555;text-decoration:none;padding:13px 0;font-size:13px;">
              View schedule settings
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 36px;background:#f8f8f6;border-top:1px solid #eee;">
            <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;">
              Your ${freqLabel} schedule is paused until you top up credits. ·
              <a href="${scheduleUrl}" style="color:#7a9a8a;">Manage schedule</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}