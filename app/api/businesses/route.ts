// app/api/businesses/route.ts
// CHANGELOG: business creation/listing moved here from app/api/zoho/route.ts.
// That route conflated "manage businesses" with "Zoho integration" because
// the old flat-file world made that easy to blur together. Now that
// Business is a real, access-controlled Prisma model, creation needs a
// signed-in user and a BusinessMember row - concerns /api/zoho shouldn't
// own. /api/zoho is back to being purely about the Zoho OAuth/data flow.

import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { requireSession, listBusinessesForUser, UnauthorizedError } from "../../lib/authz";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Lists ONLY businesses the signed-in user is a member of - this is the
// actual fix for "every business shows up for everyone." Replaces the
// old GET /api/zoho behavior of reading the entire flat organizations.json.
export async function GET() {
  try {
    const session = await requireSession();
    const businesses = await listBusinessesForUser(session.user!.id!);
    return NextResponse.json({ businesses });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = await req.json();
  const companyName = (body.company_name as string | undefined)?.trim();
  if (!companyName) {
    return NextResponse.json({ error: "company_name is required." }, { status: 400 });
  }
  const branchCount = body.branch_count && body.branch_count > 0 ? Math.floor(body.branch_count) : 1;

  const baseSlug = slugify(companyName) || "business";
  let slug = baseSlug;
  let suffix = 1;
  // Loop guards against slug collisions across ALL businesses globally -
  // slugs are global (used in URLs), even though visibility is scoped
  // per-user via BusinessMember.
  while (await prisma.business.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  // Business creation + first membership row written atomically - using
  // Prisma's interactive transaction since the membership insert depends
  // on the business's generated id. (CHANGELOG: an earlier version of
  // this wrapped ONLY the business.create() in $transaction([...]) and
  // ran businessMember.create() as a separate, unprotected call after -
  // that was not actually atomic and could have produced exactly the
  // orphaned-business state this comment claims to prevent. Fixed to use
  // a real interactive transaction.)
  const business = await prisma.$transaction(async (tx) => {
    const created = await tx.business.create({ data: { slug, companyName, branchCount } });
    await tx.businessMember.create({
      data: { businessId: created.id, userId: session.user!.id!, role: "founder" },
    });
    return created;
  });

  return NextResponse.json({ organization: { slug: business.slug, company_name: business.companyName, branch_count: business.branchCount } }, { status: 201 });
}
