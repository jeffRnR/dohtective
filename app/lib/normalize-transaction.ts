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

export function classifyType(rawType: string, amount: number): string {
  // If the extractor already resolved to the canonical form, trust it.
  // This matters because extract_csv.py correctly classifies paid_in/
  // withdrawn/debit/credit columns before this function ever runs.
  if (rawType === "Income") return "Income";
  if (rawType === "Expense") return "Expense";

  const n = rawType.trim().toLowerCase().replace(/-/g, " ");

  if (INFLOW_TYPES.has(n)) return "Income";
  if (OUTFLOW_TYPES.has(n)) return "Expense";

  // Category-based inference — for User A whose file has no type column
  // but has a category like "Owner Draw", "Stock", "Rent"
  if (n.includes("draw") || n.includes("withdrawal")) return "Expense";
  if (n.includes("sale") || n.includes("revenue") || n.includes("income")) return "Income";
  if (n.includes("expense") || n.includes("cost") || n.includes("fee")) return "Expense";
  if (n.includes("purchase") || n.includes("supply") || n.includes("stock")) return "Expense";
  if (n.includes("salary") || n.includes("wage") || n.includes("payroll")) return "Expense";
  if (n.includes("rent") || n.includes("lease") || n.includes("utility")) return "Expense";
  if (n.includes("loan") || n.includes("repay") || n.includes("interest")) return "Expense";
  if (n.includes("invoice") || n.includes("receipt") || n.includes("payment received")) return "Income";

  // Sign-based last resort — only reliable when amount hasn't been Math.abs'd yet.
  // For manual uploads amount is always positive at this point, so this is
  // genuinely ambiguous. Default to Expense since most unclassified rows
  // in an SME context are costs, not revenue.
  if (amount < 0) return "Expense";

  // Truly unknown — mark as Expense conservatively so cash buffer isn't
  // artificially inflated by unclassified rows being counted as income.
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

  // Resolution order for type classification:
  // 1. tx.type === "Income" or "Expense" — extractor already resolved this
  //    (happens when extract_csv.py detected paid_in/withdrawn/debit/credit
  //    columns). Trust it completely — do not re-classify.
  // 2. tx.type is a raw category string like "Revenue", "Supplier", "Owner Draw"
  //    — pass through classifyType to map to Income/Expense.
  // 3. tx.category — for User A whose file has no type column but has a
  //    category column with meaningful values.
  // 4. Fallback to conservative Expense classification.
  const rawType =
    tx.type && tx.type !== "CSV" && tx.type !== "EXCEL" &&
    tx.type !== "MPESA" && tx.type !== "PDF"
      ? tx.type
      : tx.category ?? tx.category_name ?? "";

  return {
    transaction_id: tx.id ?? `manual-${index}`,
    date: parseDate(tx.date),
    branch: tx.branch ?? "Main",
    type: classifyType(rawType, amount),
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