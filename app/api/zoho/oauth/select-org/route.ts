// app/api/zoho/oauth/select-org/route.ts
import { NextResponse } from "next/server";
import { getStoredTokens, saveTokensForBusiness } from "../../../../lib/zoho-client";

export async function POST(req: Request) {
  const { slug, organization_id } = await req.json();
  if (!slug || !organization_id) {
    return NextResponse.json({ error: "slug and organization_id are required." }, { status: 400 });
  }

  const stored = await getStoredTokens(slug);
  if (!stored) {
    return NextResponse.json({ error: "No pending Zoho connection found for this business." }, { status: 404 });
  }

  await saveTokensForBusiness(slug, {
    refresh_token: stored.refresh_token,
    api_domain: stored.api_domain,
    organization_id,
  });

  return NextResponse.json({ status: "connected" });
}
