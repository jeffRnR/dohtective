// /app/api/zoho/route.ts
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  const raw = await readFile(join(process.cwd(), "mock-data", "organizations.json"), "utf-8");
  const organizations = JSON.parse(raw);
  return NextResponse.json({
    connected: true,
    provider: "Zoho Books (mock)",
    schema: ["transactions", "invoices", "bank_statements", "chart_of_accounts", "supporting_documents"],
    organizations,
    message: "Mock Zoho Books connection established.",
  });
}
