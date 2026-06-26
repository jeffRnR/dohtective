// app/api/anchor/status/route.ts
// Returns the anchor status of the most recent report snapshot for a business.
// Called by the dashboard on load to show the AnchorBadge.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { auth } from "../../../lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required." }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  const snapshot = await prisma.reportSnapshot.findFirst({
    where: { businessId: business.id },
    orderBy: { generatedAt: "desc" },
    select: {
      anchorStatus: true,
      anchorTxHash: true,
      generatedAt: true,
    },
  });

  if (!snapshot) {
    return NextResponse.json({
      anchorStatus: null,
      anchorTxHash: null,
      monthYear: null,
    });
  }

  const d = snapshot.generatedAt;
  const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  return NextResponse.json({
    anchorStatus: snapshot.anchorStatus,
    anchorTxHash: snapshot.anchorTxHash,
    monthYear,
  });
}