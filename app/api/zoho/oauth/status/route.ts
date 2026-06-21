// app/api/zoho/oauth/status/route.ts
import { NextResponse } from "next/server";
import { getStoredTokens } from "../../../../lib/zoho-client";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  }
  const stored = await getStoredTokens(slug);
  return NextResponse.json({
    connected: !!stored?.organization_id,
    pendingOrgSelection: !!stored && !stored.organization_id,
  });
}