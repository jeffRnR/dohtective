// app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";

export async function POST(req: Request) {
  const { email, password, name } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Deliberately vague - don't confirm/deny whether an email is
    // registered to avoid leaking account existence to an attacker
    // probing emails.
    return NextResponse.json(
      { error: "Could not create an account with that email. Try signing in instead." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name: name ?? null, passwordHash },
  });

  // Resolve any pending invites for this email - this is what makes
  // BusinessInvite actually functional: someone gets added to a
  // business's member list by email BEFORE they have an account, and the
  // membership activates the moment they sign up with that exact email.
  const pendingInvites = await prisma.businessInvite.findMany({
    where: { email, acceptedAt: null },
  });
  if (pendingInvites.length > 0) {
    await prisma.$transaction([
      ...pendingInvites.map((invite) =>
        prisma.businessMember.create({
          data: { businessId: invite.businessId, userId: user.id, role: invite.role },
        })
      ),
      prisma.businessInvite.updateMany({
        where: { id: { in: pendingInvites.map((i) => i.id) } },
        data: { acceptedAt: new Date() },
      }),
    ]);
  }

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
