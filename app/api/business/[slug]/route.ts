import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { slug },
      include: {
        members: { where: { userId: session.user.id } },
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    // Only members of this business can delete it
    if (business.members.length === 0) {
      return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });
    }

    // Schema has onDelete: Cascade on all child relations — one delete
    // removes Members, Transactions, Invoices, BankStatements, Documents,
    // ReportSnapshots automatically. ZohoConnection cascades too, but
    // the token file entry needs manual cleanup.
    await prisma.business.delete({ where: { id: business.id } });

    // Best-effort: also remove from the Zoho token file store if present
    try {
      const { writeFile, readFile } = await import("fs/promises");
      const { join } = await import("path");
      const tokensFile = join(process.cwd(), "mock-data", "zoho-tokens.json");
      const raw = await readFile(tokensFile, "utf-8");
      const store = JSON.parse(raw);
      if (slug in store) {
        delete store[slug];
        await writeFile(tokensFile, JSON.stringify(store, null, 2), "utf-8");
      }
    } catch {
      // Token file absent or malformed — not a hard failure, DB delete already succeeded
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Delete Business]", err);
    return NextResponse.json({ error: "Failed to delete business." }, { status: 500 });
  }
}