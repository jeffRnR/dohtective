// app/lib/mailer.ts
// Shared nodemailer transporter used by:
//   - app/api/notify/email/route.ts   (Google Sheets push notification)
//   - app/lib/scheduled-email.ts      (scheduled analysis summary)
//   - app/api/cron/analysis/route.ts  (no-credits warning)
//
// Extracted here so every email path uses the same transport and we
// never accidentally create two transporter instances or have the
// requireEnv call fail in different places.

import nodemailer from "nodemailer";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Lazily created — avoids crashing at import time if env vars are
// missing in environments where email isn't configured (e.g. test runs).
let _transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: requireEnv("GMAIL_USER"),
        pass: requireEnv("GMAIL_APP_PASSWORD"),
      },
    });
  }
  return _transporter;
}

export type MailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(opts: MailOptions): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Dohtective" <${requireEnv("GMAIL_USER")}>`,
    to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

export async function sendVerificationEmail(
  email: string,
  otp: string
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Verify your Dohtective account",
    text: `Your verification code is: ${otp}

This code expires in 15 minutes.

If you didn't create a Dohtective account, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2>Verify your Dohtective account</h2>

        <p>Use the verification code below:</p>

        <div style="
          font-size:32px;
          font-weight:bold;
          letter-spacing:8px;
          text-align:center;
          margin:30px 0;
        ">
          ${otp}
        </div>

        <p>This code expires in <strong>15 minutes</strong>.</p>

        <p>If you didn't create this account, you can safely ignore this email.</p>
      </div>
    `,
  });
}