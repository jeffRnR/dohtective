// app/api/business/[slug]/credits/route.ts
import { NextResponse } from "next/server";
import { requireBusinessMember, UnauthorizedError } from "../../../../lib/authz";
import { getCreditBalance } from "../../../../lib/credits";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let business: { id: string };
  try {
    ({ business } = await requireBusinessMember(slug));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const credits = await getCreditBalance(business.id);

  return NextResponse.json({
    credits,
    low: credits <= 1,
    empty: credits === 0,
    purchaseUrl: "/pricing",
  });
}