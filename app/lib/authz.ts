// app/lib/authz.ts
// Single source of truth for "can this signed-in user see this
// business's data." Every API route that touches business-scoped data
// MUST call requireBusinessMember() before reading/writing anything -
// this is the actual access-control gate for the whole multitenant
// system. A route that forgets to call this is a real data leak, not a
// theoretical one - there is no other layer enforcing isolation.

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
// BusinessMember row for it. Throws UnauthorizedError (401 if not signed
// in, 403 if signed in but not a member) rather than silently returning
// null - callers should let this throw and have a route-level try/catch
// translate it to an HTTP response, not swallow it.
export async function requireBusinessMember(slug: string) {
  const session = await requireSession();

  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) {
    throw new UnauthorizedError(`No business found with slug "${slug}".`, 404);
  }

  const membership = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId: business.id, userId: session.user.id } },
  });
  if (!membership) {
    throw new UnauthorizedError("You don't have access to this business.", 403);
  }

  return { session, business, membership };
}

// Helper for routes that need to LIST businesses the user can see -
// e.g. the landing page's "your businesses" list. This is the query that
// replaces "show every business in organizations.json" with "show only
// businesses this user is a member of."
export async function listBusinessesForUser(userId: string) {
  const memberships = await prisma.businessMember.findMany({
    where: { userId },
    include: { business: true },
    orderBy: { createdAt: "desc" },
  });
  return memberships.map((m) => ({ ...m.business, role: m.role }));
}
