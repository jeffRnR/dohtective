// app/api/report/route.ts
import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const ORGS_FILE = join(process.cwd(), "mock-data", "organizations.json");
const APP_PY = join(process.cwd(), "backend", "app.py");

type ZohoPayload = {
  meta: {
    company_name: string;
    period_start: string;
    period_end: string;
    branches: string[];
    currency: string;
  };
  transactions: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  bank_statements: Array<Record<string, unknown>>;
  supporting_documents?: Array<Record<string, unknown>>;
};

export async function GET(req: Request) {
  try {
    const orgParam = new URL(req.url).searchParams.get("org") ?? "kula-kitchen-group";
    
    // Run backend/app.py with the org slug as an argument
    const output = execSync(`python "${APP_PY}" ${orgParam}`, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      cwd: process.cwd(),
    });

    const report = JSON.parse(output);
    
    // Load the raw payload for metadata and transactions
    const rawOrgs = await readFile(ORGS_FILE, "utf-8");
    const orgs = JSON.parse(rawOrgs) as Array<{ slug: string; data_file: string }>;
    const org = orgs.find((item) => item.slug === orgParam) ?? orgs[0];
    const raw = await readFile(join(process.cwd(), "mock-data", org.data_file), "utf-8");
    const payload = JSON.parse(raw) as ZohoPayload;

    return NextResponse.json({
      meta: payload.meta,
      transactions: payload.transactions,
      report,
    });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate report" },
      { status: 500 }
    );
  }
}
