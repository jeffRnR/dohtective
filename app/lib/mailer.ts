// app/lib/mailer.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendVerificationEmail(
  to: string,
  otp: string
): Promise<void> {
  await transporter.sendMail({
    from: `"Dohtective" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Verify your Dohtective account",
    text: `Your verification code is: ${otp}\n\nThis code expires in 15 minutes. If you didn't create a Dohtective account, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fafaf8;border:1px solid #e5e5e0;border-radius:12px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
          <div style="width:36px;height:36px;background:#1a1a18;border-radius:6px;display:flex;align-items:center;justify-content:center">
            <span style="color:white;font-weight:900;font-size:16px">D</span>
          </div>
          <span style="font-size:18px;font-weight:700;color:#1a1a18">Dohtective</span>
        </div>
        <h2 style="font-size:20px;font-weight:700;color:#1a1a18;margin:0 0 8px">Verify your email</h2>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.6">
          Enter this code on the verification page to activate your account.
          It expires in 15 minutes.
        </p>
        <div style="background:white;border:1px solid #e5e5e0;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px">
          <span style="font-size:36px;font-weight:900;letter-spacing:0.15em;color:#1a1a18;font-family:monospace">${otp}</span>
        </div>
        <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6">
          If you didn't create a Dohtective account, you can safely ignore this email.
          Your code will expire automatically.
        </p>
      </div>
    `,
  });
}