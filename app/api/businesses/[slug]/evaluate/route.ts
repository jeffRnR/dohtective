// /app/api/businesses/[slug]/evaluate/route.ts
import { NextResponse } from "next/server";

const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const targetUrl = `${DETECTION_SERVICE_URL}/analyze`;

  console.log(`[Next.js API] Preparing evaluation batch context for: ${slug}`);

  let transactions: any[] = [];

  // Step 1: Query your internal Zoho report engine for current transactions
  try {
    // Automatically parse the host origin (e.g., http://localhost:3000) from the incoming request
    const { origin } = new URL(req.url);
    
    // Call your internal report API, forwarding the current user session cookies for auth
    const reportRes = await fetch(`${origin}/api/report?org=${encodeURIComponent(slug)}`, {
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
    });

    if (reportRes.ok) {
      const reportData = await reportRes.json();
      
      // Extract the transactions array depending on your Zoho payload structure
      transactions = reportData.transactions || reportData.data || (Array.isArray(reportData) ? reportData : []);
      console.log(`[Next.js API] Extracted ${transactions.length} ledger records to send to Python.`);
    } else {
      console.warn(`[Next.js API] Zoho report helper returned status ${reportRes.status}. Defaulting to empty dataset.`);
    }
  } catch (fetchErr) {
    console.error("[Next.js API] Failed fetching data background dependencies:", fetchErr);
  }

  // Step 2: Build the fully matching payload expected by your AnalyzeRequest schema
  const payload = {
    slug: slug,
    transactions: transactions, // Satisfies the "Field required" Pydantic validation rule
  };

  // Step 3: Forward the complete structural data packet down to FastAPI
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.text();

    if (!response.ok) {
      console.error(`[Next.js API] Python cluster returned error status ${response.status}:`, body);
      return new NextResponse(body, {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Next.js API] Evaluation trigger network failure:", err);
    return NextResponse.json(
      { error: "AI processing cluster unreachable." },
      { status: 502 }
    );
  }
}