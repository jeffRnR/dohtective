// app/api/documents/route.ts
import { NextResponse } from "next/server";

const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

// CHANGELOG: DocumentUploadStep previously called python-service directly
// from the browser via NEXT_PUBLIC_DETECTION_SERVICE_URL - inconsistent
// with /api/report's pattern (browser -> Next.js -> Python) and it meant
// the Python service URL had to be public. This route restores that
// consistency: browser uploads here, this route forwards to Python
// server-side, same as every other call in the app.
export async function POST(req: Request) {
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch (err) {
    return NextResponse.json({ error: "Expected multipart/form-data with a file and document_kind." }, { status: 400 });
  }

  const file = incoming.get("file");
  const documentKind = incoming.get("document_kind");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (!documentKind || typeof documentKind !== "string") {
    return NextResponse.json({ error: "Missing document_kind." }, { status: 400 });
  }

  const forwardForm = new FormData();
  forwardForm.append("document_kind", documentKind);
  forwardForm.append("file", file, (file as File).name ?? "upload");

  let response: Response;
  try {
    response = await fetch(`${DETECTION_SERVICE_URL}/documents/extract`, {
      method: "POST",
      body: forwardForm,
      signal: AbortSignal.timeout(30_000), // OCR can be slow; longer timeout than /analyze
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Detection service unreachable. Is the Python FastAPI service running? " +
          `Tried: ${DETECTION_SERVICE_URL}/documents/extract`,
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
