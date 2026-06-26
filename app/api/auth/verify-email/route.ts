import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { sendVerificationEmail } from "../../../lib/mailer";
import { verifyRateLimit, resendRateLimit } from "../../../lib/rate-limit";

function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

// POST — verify the OTP
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rateCheck = verifyRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rateCheck.retryAfterSeconds} seconds.` },
      { status: 429 }
    );
  }

  let body: { email?: unknown; otp?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const otp = typeof body.otp === "string" ? body.otp.trim() : "";

  if (!email || !otp) {
    return NextResponse.json(
      { error: "Email and verification code are required." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { emailVerification: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "No account found with that email." },
      { status: 404 }
    );
  }

  if (user.emailVerified) {
    return NextResponse.json(
      { message: "Email already verified. You can sign in." },
      { status: 200 }
    );
  }

  const verification = user.emailVerification;
  if (!verification) {
    return NextResponse.json(
      { error: "No verification code found. Request a new one." },
      { status: 400 }
    );
  }

  if (verification.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This code has expired. Request a new one below." },
      { status: 400 }
    );
  }

  // Max 5 OTP attempts before invalidating the token
  if (verification.attempts >= 5) {
    await prisma.emailVerification.delete({ where: { userId: user.id } });
    return NextResponse.json(
      {
        error:
          "Too many incorrect attempts. Request a new verification code.",
      },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(otp, verification.tokenHash);

  if (!valid) {
    await prisma.emailVerification.update({
      where: { userId: user.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = 4 - verification.attempts;
    return NextResponse.json(
      {
        error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      },
      { status: 400 }
    );
  }

  // Mark email as verified and clean up the verification record
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerification.delete({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({ message: "Email verified. You can now sign in." });
}

// PUT — resend OTP
export async function PUT(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rateCheck = resendRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Too many resend requests. Try again in ${rateCheck.retryAfterSeconds} seconds.` },
      { status: 429 }
    );
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  // Always return 200 here — don't confirm whether the email exists
  if (!user || user.emailVerified) {
    return NextResponse.json({
      message: "If that email is registered and unverified, a new code has been sent.",
    });
  }

  const otp = generateOtp();
  const tokenHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.emailVerification.upsert({
    where: { userId: user.id },
    create: { userId: user.id, tokenHash, expiresAt, attempts: 0 },
    update: { tokenHash, expiresAt, attempts: 0 },
  });

  try {
    await sendVerificationEmail(email, otp);
  } catch (err) {
    console.error("[resend] Failed to send verification email:", err);
    return NextResponse.json(
      { error: "Failed to send verification email. Try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "A new verification code has been sent to your email.",
  });
}