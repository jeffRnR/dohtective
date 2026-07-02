// app/lib/zoho-sync.ts
import { prisma } from "./prisma";
import { zohoApiGet } from "./zoho-client";

// ── Zoho Books v3 response shapes (only the fields we actually use) ───
// Field names confirmed from live API response — do not guess these.
//
// /banktransactions returns:
//   amount          — always positive regardless of direction
//   debit_or_credit — "debit" (money out) or "credit" (money in)
//   payee           — contact name (NOT contact_name)
//   transaction_type — "vendor_payment", "customer_payment", "expense", etc.
//
// /expenses returns:
//   total                    — always positive
//   vendor_name              — contact
//   paid_through_account_name — the bank account used

type ZohoBankTransaction = {
  transaction_id: string;
  date: string;               // "YYYY-MM-DD"
  transaction_type: string;   // "vendor_payment", "customer_payment", etc.
  transaction_type_formatted: string;
  account_name: string;
  payee?: string;             // contact name — Zoho uses "payee" not "contact_name"
  reference_number?: string;
  description?: string;
  amount: number;             // always positive — direction from debit_or_credit
  debit_or_credit: string;    // "debit" = money out, "credit" = money in
  status?: string;
  reconcile_status?: string;
};

type ZohoExpense = {
  expense_id: string;
  date: string;
  account_name: string;             // expense category account (e.g. "Employee Benefits")
  paid_through_account_name: string; // the actual bank account debited
  vendor_name?: string;
  reference_number?: string;
  description?: string;
  total: number;                    // always positive
  bcy_total?: number;               // base currency total (same as total for KES orgs)
  status?: string;
  is_billable?: boolean;
};

// Zoho paginates at 200 rows. This fetches every page until exhausted.
async function fetchAllPages<T>(
  slug: string,
  path: string,
  listKey: string,
  extraParams: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const data = await zohoApiGet(slug, path, {
      ...extraParams,
      page: String(page),
      per_page: "200",
    });

    const rows: T[] = data[listKey] ?? [];
    results.push(...rows);

    // Zoho returns page_context.has_more_page = true when there are more
    if (!data.page_context?.has_more_page) break;
    page++;
  }

  return results;
}

// ── Main export ───────────────────────────────────────────────────────

export type ZohoSyncResult = {
  upserted: number;
  errors: string[];
};

export async function syncZohoTransactions(slug: string): Promise<ZohoSyncResult> {
  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!business) throw new Error(`No business found with slug "${slug}".`);

  const errors: string[] = [];
  let upserted = 0;

  // ── 1. Bank transactions ─────────────────────────────────────────
  let bankTxns: ZohoBankTransaction[] = [];
  try {
    bankTxns = await fetchAllPages<ZohoBankTransaction>(
      slug,
      "/banktransactions",
      "banktransactions"
    );
  } catch (err) {
    errors.push(`banktransactions fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const txn of bankTxns) {
    try {
      // Zoho returns `amount` as always-positive and uses `debit_or_credit`
      // to signal direction. "credit" = money in (positive), "debit" = money
      // out (negative). This matches the sign convention the detection engine
      // expects from CSV uploads.
      const isOutflow = txn.debit_or_credit === "debit";
      const amount = isOutflow ? -Math.abs(txn.amount) : Math.abs(txn.amount);

      // Map transaction_type to the canonical "Income" / "Expense" strings
      // the detection engine classifiers expect. Fall back to the raw type
      // for unknown transaction types so cash_buffer.py can still attempt
      // substring inference.
      const INFLOW_TYPES = new Set([
        "customer_payment", "sales_return_refund", "deposit",
        "interest_income", "other_income", "refund",
      ]);
      const OUTFLOW_TYPES = new Set([
        "vendor_payment", "expense", "transfer_fund", "owner_draw",
        "bill_payment", "purchase_order", "advance_payment",
      ]);
      const canonicalType = INFLOW_TYPES.has(txn.transaction_type)
        ? "Income"
        : OUTFLOW_TYPES.has(txn.transaction_type)
        ? "Expense"
        : isOutflow ? "Expense" : "Income"; // sign-based fallback

      await prisma.transaction.upsert({
        where: {
          businessId_transactionId: {
            businessId: business.id,
            transactionId: txn.transaction_id,
          },
        },
        create: {
          businessId:      business.id,
          transactionId:   txn.transaction_id,
          date:            new Date(txn.date),
          branch:          "",
          type:            canonicalType,
          accountName:     txn.account_name ?? "",
          categoryName:    txn.transaction_type_formatted ?? "",
          contactName:     txn.payee ?? "",
          referenceNumber: txn.reference_number ?? "",
          paymentMethod:   "",
          description:     txn.description ?? txn.transaction_type_formatted ?? "",
          amount,
          status:          txn.status ?? "",
          bankAccount:     txn.account_name ?? "",
          isReconciled:    txn.reconcile_status === "reconciled",
          notes:           "",
        },
        update: {
          date:            new Date(txn.date),
          type:            canonicalType,
          accountName:     txn.account_name ?? "",
          categoryName:    txn.transaction_type_formatted ?? "",
          contactName:     txn.payee ?? "",
          referenceNumber: txn.reference_number ?? "",
          description:     txn.description ?? txn.transaction_type_formatted ?? "",
          amount,
          status:          txn.status ?? "",
          bankAccount:     txn.account_name ?? "",
          isReconciled:    txn.reconcile_status === "reconciled",
        },
      });
      upserted++;
    } catch (err) {
      errors.push(`bank txn ${txn.transaction_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 2. Expenses ──────────────────────────────────────────────────
  let expenses: ZohoExpense[] = [];
  try {
    expenses = await fetchAllPages<ZohoExpense>(slug, "/expenses", "expenses");
  } catch (err) {
    errors.push(`expenses fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const exp of expenses) {
    try {
      // Expenses are always outflows — store as negative amount
      await prisma.transaction.upsert({
        where: {
          businessId_transactionId: {
            businessId: business.id,
            transactionId: `exp_${exp.expense_id}`,
          },
        },
        create: {
          businessId:      business.id,
          transactionId:   `exp_${exp.expense_id}`,
          date:            new Date(exp.date),
          branch:          "",
          type:            "Expense",
          // account_name on expenses is the expense category (e.g. "Employee
          // Benefits") — use it as categoryName. paid_through_account_name is
          // the actual bank account debited — use it as bankAccount/accountName.
          accountName:     exp.paid_through_account_name ?? exp.account_name ?? "",
          categoryName:    exp.account_name ?? "",
          contactName:     exp.vendor_name ?? "",
          referenceNumber: exp.reference_number ?? "",
          paymentMethod:   "",
          description:     exp.description ?? "",
          amount:          -(Math.abs(exp.total)),
          status:          exp.status ?? "",
          bankAccount:     exp.paid_through_account_name ?? exp.account_name ?? "",
          isReconciled:    false,
          notes:           "",
        },
        update: {
          date:            new Date(exp.date),
          accountName:     exp.paid_through_account_name ?? exp.account_name ?? "",
          categoryName:    exp.account_name ?? "",
          contactName:     exp.vendor_name ?? "",
          referenceNumber: exp.reference_number ?? "",
          description:     exp.description ?? "",
          amount:          -(Math.abs(exp.total)),
          status:          exp.status ?? "",
          bankAccount:     exp.paid_through_account_name ?? exp.account_name ?? "",
        },
      });
      upserted++;
    } catch (err) {
      errors.push(`expense ${exp.expense_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { upserted, errors };
}