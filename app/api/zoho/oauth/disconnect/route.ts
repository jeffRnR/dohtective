import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: Request) {
  try {
    const { slug } = await req.json();

    if (!slug) {
      return NextResponse.json(
        { error: "Business slug is required." },
        { status: 400 }
      );
    }

    const business = await prisma.business.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!business) {
      return NextResponse.json(
        { error: "Business not found." },
        { status: 404 }
      );
    }

    const existing = await prisma.zohoConnection.findUnique({
      where: { businessId: business.id },
    });

    if (!existing) {
      return NextResponse.json({
        success: true,
        message: "No active Zoho connection found.",
      });
    }

    await prisma.zohoConnection.delete({
      where: { businessId: business.id },
    });

    return NextResponse.json({
      success: true,
      message: "Zoho integration successfully disconnected.",
    });
  } catch (err) {
    console.error("[Disconnect] Error:", err);
    return NextResponse.json(
      { error: "Failed to disconnect Zoho integration." },
      { status: 500 }
    );
  }
}