// app/lib/normalize-transaction.ts

const INFLOW_TYPES = new Set([
  "income", "revenue", "sales", "receipt", "inflow", "credit", "initial",
]);

const OUTFLOW_TYPES = new Set([
  "expense", "supplier", "operating", "owner", "owner draw", "pettycash",
  "petty cash", "logistics", "services", "misc", "utility", "utilities",
  "bill", "cost", "payment", "stock", "rent", "salary", "salaries",
  "payroll", "tax", "transfer", "withdrawal", "draw",
  "non-reimbursable", "reimbursable", "fuel", "purchase", "inventory",
  "equipment", "maintenance", "repairs", "insurance", "subscription",
  "software", "hardware", "shipping", "freight", "customs", "duty",
]);

// Category values that are definitively outflows regardless of what the
// type column says. This is the fix for CSVs where every row has
// type="Income" in a source column but the category tells the real story.
const OUTFLOW_CATEGORIES = new Set([
  "owner draw", "owner", "draw", "withdrawal",
  "pettycash", "petty cash",
  "non-reimbursable", "reimbursable",
  "stock", "inventory", "purchase",
  "utility", "utilities",
  "fuel", "logistics",
  "supplier", "services",
  "salary", "salaries", "payroll",
  "rent", "lease",
  "insurance",
  "subscription", "software", "hardware",
  "equipment", "maintenance", "repairs",
  "shipping", "freight", "customs", "duty",
  "tax", "misc",
  "operating", "cost", "bill", "expense",
]);

export function classifyType(rawType: string, amount: number): string {
  // Canonical form — extractor already resolved this via paid_in/withdrawn
  // columns. Trust it completely.
  if (rawType === "Income") return "Income";
  if (rawType === "Expense") return "Expense";

  const n = rawType.trim().toLowerCase().replace(/-/g, " ");

  if (INFLOW_TYPES.has(n)) return "Income";
  if (OUTFLOW_TYPES.has(n)) return "Expense";

  // Substring inference
  if (n.includes("draw") || n.includes("withdrawal")) return "Expense";
  if (n.includes("sale") || n.includes("revenue") || n.includes("income")) return "Income";
  if (n.includes("expense") || n.includes("cost") || n.includes("fee")) return "Expense";
  if (n.includes("purchase") || n.includes("supply") || n.includes("stock")) return "Expense";
  if (n.includes("salary") || n.includes("wage") || n.includes("payroll")) return "Expense";
  if (n.includes("rent") || n.includes("lease") || n.includes("utility")) return "Expense";
  if (n.includes("loan") || n.includes("repay") || n.includes("interest")) return "Expense";
  if (n.includes("invoice") || n.includes("receipt") || n.includes("payment received")) return "Income";

  if (amount < 0) return "Expense";

  // Conservative default — unclassified rows are more likely costs than
  // revenue in an SME context. Avoids inflating the cash buffer calculation.
  return "Expense";
}

export function parseDate(raw: unknown): string {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    console.warn(`[normalize] Missing date value "${raw}" — using today.`);
    return new Date().toISOString().slice(0, 10);
  }

  const cleaned = raw.trim();

  const dmy = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!isNaN(new Date(iso).getTime())) return iso;
  }

  const ymd = cleaned.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!isNaN(new Date(iso).getTime())) return iso;
  }

  const fallback = new Date(cleaned);
  if (!isNaN(fallback.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }

  console.warn(`[normalize] Could not parse date "${raw}" — using today as fallback.`);
  return new Date().toISOString().slice(0, 10);
}

export function normalizeForEngine(tx: any, index: number): Record<string, any> {
  const amount =
    typeof tx.amount === "number"
      ? tx.amount
      : parseFloat(tx.amount ?? "0") || 0;

  // ── Type resolution order ─────────────────────────────────────────────
  // 1. Category override — if the category is definitively an outflow
  //    (e.g. "Owner Draw", "Stock", "Reimbursable"), trust it over the
  //    type column. This fixes CSVs where the source file has type="Income"
  //    on every row but the category tells the real story.
  // 2. tx.type === "Income" or "Expense" — extractor resolved this from
  //    paid_in/withdrawn/debit/credit columns. Trust it.
  // 3. tx.type is a raw string — pass through classifyType.
  // 4. tx.category / tx.category_name — fallback when no type column.
  // 5. Conservative Expense default for truly unknown rows.

  const rawCategory = (
    tx.category ?? tx.category_name ?? ""
  ).trim().toLowerCase().replace(/-/g, " ");

  const categoryIsDefinitiveOutflow = OUTFLOW_CATEGORIES.has(rawCategory);

  const rawType =
    tx.type &&
    tx.type !== "CSV" &&
    tx.type !== "EXCEL" &&
    tx.type !== "MPESA" &&
    tx.type !== "PDF"
      ? tx.type
      : rawCategory;

  // Category overrides a generic "Income" type from the source column —
  // but not an "Expense" type (no need to downgrade a correct classification).
  const resolvedType =
    categoryIsDefinitiveOutflow && rawType === "Income"
      ? "Expense"
      : classifyType(rawType, amount);

  return {
    transaction_id: tx.id ?? `manual-${index}`,
    date: parseDate(tx.date),
    branch: tx.branch ?? "Main",
    type: resolvedType,
    account_name: tx.account_name ?? "Manual Upload",
    category_name: tx.category ?? tx.category_name ?? "Uncategorized",
    contact_name: tx.vendor ?? tx.contact_name ?? "Unknown",
    reference_number: tx.id ?? `manual-${index}`,
    payment_method: tx.payment_method ?? "Manual",
    description: tx.description ?? "",
    amount: Math.abs(amount),
    status: "Manual",
    bank_account: tx.bank_account ?? "Manual Upload",
    is_reconciled: false,
    notes: tx.notes ?? "",
  };
}