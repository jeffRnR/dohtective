// app/api/zoho/oauth/pending-orgs/route.ts
import { NextResponse } from "next/server";
import { listOrganizationsForPendingConnection } from "../../../../lib/zoho-client";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  }
  try {
    const organizations = await listOrganizationsForPendingConnection(slug);
    return NextResponse.json({ organizations });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load Zoho organizations." },
      { status: 502 }
    );
  }
}
