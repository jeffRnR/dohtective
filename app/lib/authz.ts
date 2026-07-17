// app/lib/authz.ts
// Single source of truth for "can this signed-in user see this
// business's data." Every API route that touches business-scoped data
// MUST call requireBusinessMember() before reading/writing anything.

import { auth } from "./auth";
import { prisma } from "./prisma";

export class UnauthorizedError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError("Not signed in.", 401);
  }
  return session;
}

// Looks up a Business by slug AND confirms the signed-in user has a
// BusinessMember row for it in a single query instead of two sequential
// round-trips. Previously: findUnique(business) then findUnique(membership).
// Now: findUnique(business) with include that filters members to this user.
// One round-trip instead of two on every authenticated API call.
export async function requireBusinessMember(slug: string) {
  const session = await requireSession();

  const business = await prisma.business.findUnique({
    where: { slug },
    include: {
      members: {
        where: { userId: session.user.id },
        take: 1,
      },
    },
  });

  if (!business) {
    throw new UnauthorizedError(`No business found with slug "${slug}".`, 404);
  }

  const membership = business.members[0];
  if (!membership) {
    throw new UnauthorizedError("You don't have access to this business.", 403);
  }

  // Strip the members array from the returned business object so callers
  // get the same shape as before — no breaking changes to existing routes.
  const { members: _, ...businessWithoutMembers } = business;

  return { session, business: businessWithoutMembers, membership };
}

export async function listBusinessesForUser(userId: string) {
  const memberships = await prisma.businessMember.findMany({
    where: { userId },
    include: { business: true },
    orderBy: { createdAt: "desc" },
  });
  return memberships.map((m) => ({ ...m.business, role: m.role }));
}