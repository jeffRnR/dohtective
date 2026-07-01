//api/business/[slug]/flag-response/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireBusinessMember, UnauthorizedError } from '../../../../lib/authz';

const VALID_RESPONSES = ['already_handled', 'intentional', 'need_help'] as const;
type ResponseType = typeof VALID_RESPONSES[number];

export async function POST(
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

  const body = await req.json();
  const { flagTitle, response } = body;

  if (!flagTitle || typeof flagTitle !== 'string') {
    return NextResponse.json({ error: 'flagTitle is required.' }, { status: 400 });
  }

  if (!VALID_RESPONSES.includes(response as ResponseType)) {
    return NextResponse.json(
      { error: `response must be one of: ${VALID_RESPONSES.join(', ')}` },
      { status: 400 }
    );
  }

  // Upsert — one row per (business, flagTitle). Re-responding updates
  // the existing row rather than creating duplicates.
  const saved = await prisma.flagResponse.upsert({
    where: {
      businessId_flagTitle: {
        businessId: business.id,
        flagTitle,
      },
    },
    create: {
      businessId: business.id,
      flagTitle,
      response,
    },
    update: {
      response,
      respondedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, flagResponse: saved });
}

// DELETE — lets a founder undo a response (e.g. they marked something
// "intentional" but now want to re-examine it)
export async function DELETE(
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

  const { flagTitle } = await req.json();
  if (!flagTitle) {
    return NextResponse.json({ error: 'flagTitle is required.' }, { status: 400 });
  }

  await prisma.flagResponse.deleteMany({
    where: { businessId: business.id, flagTitle },
  });

  return NextResponse.json({ success: true });
}