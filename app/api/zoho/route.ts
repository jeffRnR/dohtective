// app/api/zoho/route.ts
import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const ORGS_FILE = join(process.cwd(), "mock-data", "organizations.json");

type OrgIndexEntry = {
  slug: string;
  company_name: string;
  data_file: string;
  csv_file: string;
  branch_count: number;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function GET() {
  const raw = await readFile(ORGS_FILE, "utf-8");
  const organizations = JSON.parse(raw);
  return NextResponse.json({
    connected: true,
    provider: "Zoho Books (mock)",
    schema: ["transactions", "invoices", "bank_statements", "chart_of_accounts"],
    organizations,
    message: "Mock Zoho Books connection established.",
  });
}

// CHANGELOG: previously GET-only. POST added so /business/new can actually
// create a business — this route had no creation path before, which is
// why "+ Add a business" linked to a route (/business/new) that existed
// in the UI but had nothing real behind it.
//
// Honesty note: this does NOT perform a real Zoho OAuth handshake — Zoho
// integration is still mocked throughout this project (see Build Plan
// Section 2). What this DOES do honestly: creates a real org entry with a
// REAL but EMPTY transaction set — zero fabricated activity. A brand new
// business starts at zero transactions, zero flags, until either (a) real
// Zoho data is wired in later, or (b) supporting documents are uploaded
// via the existing DocumentUploadStep flow. The dashboard's "0 days of
// buffer, no data yet" state is the honest one, not a happy fake number.
export async function POST(req: Request) {
  let body: { company_name?: string; branch_count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body with company_name." }, { status: 400 });
  }

  const companyName = body.company_name?.trim();
  if (!companyName) {
    return NextResponse.json({ error: "company_name is required." }, { status: 400 });
  }
  const branchCount = body.branch_count && body.branch_count > 0 ? Math.floor(body.branch_count) : 1;

  const rawOrgs = await readFile(ORGS_FILE, "utf-8");
  const orgs: OrgIndexEntry[] = JSON.parse(rawOrgs);

  const baseSlug = slugify(companyName) || "business";
  let slug = baseSlug;
  let suffix = 1;
  while (orgs.some((o) => o.slug === slug)) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const dataFile = `zoho-books-${slug}.json`;
  const branches = Array.from({ length: branchCount }, (_, i) =>
    branchCount === 1 ? "Main" : `Branch ${i + 1}`
  );

  // Real, honest starter payload — empty arrays, not fabricated data.
  const starterPayload = {
    meta: {
      company_name: companyName,
      period_start: new Date().toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
      branches,
      currency: "KES",
    },
    transactions: [],
    invoices: [],
    bank_statements: [],
    supporting_documents: [],
    business_billers: [],
  };

  await writeFile(join(process.cwd(), "mock-data", dataFile), JSON.stringify(starterPayload, null, 2), "utf-8");

  const newOrg: OrgIndexEntry = {
    slug,
    company_name: companyName,
    data_file: dataFile,
    csv_file: dataFile.replace(".json", ".csv"),
    branch_count: branchCount,
  };
  orgs.push(newOrg);
  await writeFile(ORGS_FILE, JSON.stringify(orgs, null, 2), "utf-8");

  return NextResponse.json({ organization: newOrg }, { status: 201 });
}