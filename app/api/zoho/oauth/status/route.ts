import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!business) {
    return NextResponse.json({ connected: false, pendingOrgSelection: false });
  }

  const connection = await prisma.zohoConnection.findUnique({
    where: { businessId: business.id },
    select: { organizationId: true },
  });

  return NextResponse.json({
    connected: !!connection?.organizationId,
    pendingOrgSelection: !!connection && !connection.organizationId,
  });
}