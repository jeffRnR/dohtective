// /app/api/documents/route.ts
import { NextResponse } from "next/server";

const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

export async function POST(req: Request) {
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch (err) {
    console.error("Next.js Error: Failed to parse FormData", err);
    return NextResponse.json({ error: "Invalid multipart/form-data." }, { status: 400 });
  }

  const file = incoming.get("file");
  const documentKind = incoming.get("document_kind");
  const slug = incoming.get("slug");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing or invalid file." }, { status: 400 });
  }
  if (!documentKind || typeof documentKind !== "string") {
    return NextResponse.json({ error: "Missing or invalid document_kind." }, { status: 400 });
  }

  const forwardForm = new FormData();
  forwardForm.append("document_kind", documentKind);
  forwardForm.append("file", file, (file as File).name ?? "upload");
  if (slug && typeof slug === "string") {
    forwardForm.append("slug", slug);
  }

  try {
    const response = await fetch(`${DETECTION_SERVICE_URL}/documents/extract`, {
      method: "POST",
      body: forwardForm,
      signal: AbortSignal.timeout(30_000),
    });

    const body = await response.text();
    
    if (!response.ok) {
      console.error(`Python service returned ${response.status}: ${body}`);
      return new NextResponse(body, { 
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Fetch Error: Could not connect to Python service", err);
    return NextResponse.json(
      { error: "Detection service unreachable." },
      { status: 502 }
    );
  }
}