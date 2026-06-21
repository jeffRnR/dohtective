// app/api/notify/sheets/route.ts
import { NextResponse } from "next/server";

const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

export async function POST(req: Request) {
  const payload = await req.json();

  let response: Response;
  try {
    response = await fetch(`${DETECTION_SERVICE_URL}/notify/sheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Detection service unreachable. Is the Python FastAPI service running?",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  // Status check — lets the dashboard show "Connected" / "Not configured"
  // without attempting a real push.
  let response: Response;
  try {
    response = await fetch(`${DETECTION_SERVICE_URL}/notify/sheets/status`, {
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    return NextResponse.json({ configured: false, serviceReachable: false }, { status: 200 });
  }
  const body = await response.json();
  return NextResponse.json({ ...body, serviceReachable: true });
}