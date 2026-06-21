// app/api/businesses/[slug]/members/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireBusinessMember, UnauthorizedError } from "../../../../lib/authz";
import { sendInviteEmail } from "../../../../lib/invites";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { business, membership } = await requireBusinessMember(slug);

    const [members, pendingInvites] = await Promise.all([
      prisma.businessMember.findMany({
        where: { businessId: business.id },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.businessInvite.findMany({
        where: { businessId: business.id, acceptedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ members, pendingInvites, myRole: membership.role });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { business, session, membership } = await requireBusinessMember(slug);

    // Only founders can add members — an accountant shouldn't be able to
    // grant themselves or others broader access than the founder intended.
    if (membership.role !== "founder") {
      return NextResponse.json(
        { error: "Only a founder can add members to this business." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const role = (body.role as string | undefined) ?? "accountant";
    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }
    if (!["founder", "accountant", "reviewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    // If a user with this email already exists, add them directly —
    // no need for an invite-then-accept dance if the account is already
    // there. Otherwise, create a pending BusinessInvite that gets
    // resolved the next time someone signs up/in with that email (that
    // resolution logic lives in the sign-up flow, not here).
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const alreadyMember = await prisma.businessMember.findUnique({
        where: { businessId_userId: { businessId: business.id, userId: existingUser.id } },
      });
      if (alreadyMember) {
        return NextResponse.json({ error: "This person is already a member." }, { status: 400 });
      }
      const newMember = await prisma.businessMember.create({
        data: { businessId: business.id, userId: existingUser.id, role: role as never },
      });
      return NextResponse.json({ status: "added", member: newMember }, { status: 201 });
    }

    const invite = await prisma.businessInvite.upsert({
      where: { businessId_email: { businessId: business.id, email } },
      update: { role: role as never, invitedById: session.user!.id! },
      create: { businessId: business.id, email, role: role as never, invitedById: session.user!.id! },
    });

    // Structure only — see lib/invites.ts. The invite row is real and
    // will resolve into real access once that person signs up/in with
    // this email; the email notification itself is a stub for now.
    const emailResult = await sendInviteEmail({
      toEmail: email,
      businessName: business.companyName,
      inviterName: session.user!.name ?? null,
      role,
    });

    return NextResponse.json({ status: "invited", invite, emailSent: emailResult.sent, note: emailResult.reason }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}