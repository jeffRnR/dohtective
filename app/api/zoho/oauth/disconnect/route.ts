import { NextResponse } from "next/server";
import { getStoredTokens } from "../../../../lib/zoho-client";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";

const TOKENS_FILE = join(process.cwd(), "mock-data", "zoho-tokens.json");

async function removeTokensForBusiness(slug: string): Promise<void> {
  let store: Record<string, unknown> = {};
  try {
    const raw = await readFile(TOKENS_FILE, "utf-8");
    store = JSON.parse(raw);
  } catch {
    // File doesn't exist or is malformed — nothing to delete, that's fine
    return;
  }
  if (!(slug in store)) return;
  delete store[slug];
  await writeFile(TOKENS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function POST(req: Request) {
  try {
    const { slug } = await req.json();

    if (!slug) {
      return NextResponse.json({ error: "Business slug is required." }, { status: 400 });
    }

    // Confirm there is actually a connection to remove before touching the file
    const existing = await getStoredTokens(slug);
    if (!existing) {
      // Already disconnected — treat as success, not an error
      return NextResponse.json({ success: true, message: "No active Zoho connection found." });
    }

    // FIX #2: Actually remove the slug entry from the token store
    await removeTokensForBusiness(slug);

    return NextResponse.json({ success: true, message: "Zoho integration successfully disconnected." });
  } catch (err) {
    console.error("[Disconnect] Error:", err);
    return NextResponse.json({ error: "Failed to disconnect Zoho integration." }, { status: 500 });
  }
}