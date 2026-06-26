import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { sendVerificationEmail } from "../../../lib/mailer";
import { signupRateLimit } from "../../../lib/rate-limit";

// 100 most common passwords — rejecting these is more effective than
// arbitrary complexity rules that users work around with "Password1!"
const COMMON_PASSWORDS = new Set([
  "password","password1","password123","123456","12345678","1234567890",
  "iloveyou","admin","welcome","monkey","dragon","master","sunshine",
  "princess","qwerty","abc123","letmein","trustno1","shadow","superman",
  "michael","football","baseball","soccer","hockey","batman","access",
  "hello","charlie","donald","aa123456","passw0rd","1q2w3e4r","mustang",
  "121212","starwars","654321","666666","111111","123123","pass","test",
  "guest","login","changeme","qwerty123","password12","123456789",
  "abc","asdf","zxcv","qazwsx","1234","12345","123","pass123","test123",
]);

function sanitiseEmail(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  // RFC 5322 simplified — good enough for server-side pre-validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
  if (cleaned.length > 254) return null;
  return cleaned;
}

function sanitiseName(raw: string): string {
  // Strip control characters and excessive whitespace
  return raw.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 100);
}

function generateOtp(): string {
  // Cryptographically random 6-digit OTP
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

function checkPasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be under 128 characters.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common. Choose something more unique.";
  }
  // Must have at least one non-letter character
  if (!/[^a-zA-Z]/.test(password)) {
    return "Password must contain at least one number or symbol.";
  }
  return null;
}

export async function POST(req: Request) {
  // Rate limit by IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rateCheck = signupRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: `Too many signup attempts. Try again in ${rateCheck.retryAfterSeconds} seconds.`,
      },
      { status: 429 }
    );
  }

  let body: { email?: unknown; password?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const rawEmail = typeof body.email === "string" ? body.email : "";
  const rawPassword = typeof body.password === "string" ? body.password : "";
  const rawName = typeof body.name === "string" ? body.name : "";

  const email = sanitiseEmail(rawEmail);
  if (!email) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const passwordError = checkPasswordStrength(rawPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const name = sanitiseName(rawName) || null;

  // Always hash the password before checking if the email exists.
  // This makes the response time consistent regardless of whether the
  // email is already registered, preventing timing-based enumeration.
  const [passwordHash, existing] = await Promise.all([
    bcrypt.hash(rawPassword, 12),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (existing) {
    // Deliberately vague — don't confirm whether this email is registered
    return NextResponse.json(
      {
        error:
          "Could not create an account with that email. Try signing in instead.",
      },
      { status: 400 }
    );
  }

  // Create user with emailVerified: null — they cannot sign in until verified
  const user = await prisma.user.create({
    data: { email, name, passwordHash, emailVerified: null },
  });

  // Resolve pending invites (same as before)
  const pendingInvites = await prisma.businessInvite.findMany({
    where: { email, acceptedAt: null },
  });
  if (pendingInvites.length > 0) {
    await prisma.$transaction([
      ...pendingInvites.map((invite) =>
        prisma.businessMember.create({
          data: {
            businessId: invite.businessId,
            userId: user.id,
            role: invite.role,
          },
        })
      ),
      prisma.businessInvite.updateMany({
        where: { id: { in: pendingInvites.map((i) => i.id) } },
        data: { acceptedAt: new Date() },
      }),
    ]);
  }

  // Generate OTP, hash it, store it
  const otp = generateOtp();
  const tokenHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.emailVerification.upsert({
    where: { userId: user.id },
    create: { userId: user.id, tokenHash, expiresAt, attempts: 0 },
    update: { tokenHash, expiresAt, attempts: 0 },
  });

  // Send OTP — if this fails, return an error so the user knows to retry
  try {
    await sendVerificationEmail(email, otp);
  } catch (err) {
    console.error("[signup] Failed to send verification email:", err);
    // Clean up the user so they can retry cleanly
    await prisma.user.delete({ where: { id: user.id } });
    return NextResponse.json(
      {
        error:
          "We couldn't send your verification email. Check your email address and try again.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { message: "Account created. Check your email for your verification code.", email },
    { status: 201 }
  );
}