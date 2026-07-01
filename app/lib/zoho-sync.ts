// app/lib/zoho-sync.ts
import { prisma } from "./prisma";
import { zohoApiGet } from "./zoho-client";

// ── Zoho Books v3 response shapes (only the fields we actually use) ───

type ZohoBankTransaction = {
  transaction_id: string;
  date: string;               // "YYYY-MM-DD"
  transaction_type: string;   // "transfer_fund", "refund", "deposit", etc.
  account_name: string;
  category_name?: string;
  contact_name?: string;
  reference_number?: string;
  payment_mode?: string;
  description?: string;
  debit_amount?: number;
  credit_amount?: number;
  status?: string;
  is_reconciled?: boolean;
};

type ZohoExpense = {
  expense_id: string;
  date: string;
  account_name: string;
  category_name?: string;
  vendor_name?: string;
  reference_number?: string;
  payment_mode?: string;
  description?: string;
  total: number;
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
      // Zoho uses separate debit/credit fields. We store debits as negative
      // to match the convention the detection engine expects (negative =
      // outflow, positive = inflow), mirroring what the CSV normaliser does.
      const amount =
        txn.credit_amount && txn.credit_amount > 0
          ? txn.credit_amount
          : txn.debit_amount && txn.debit_amount > 0
          ? -txn.debit_amount
          : 0;

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
          type:            txn.transaction_type ?? "bank_transaction",
          accountName:     txn.account_name ?? "",
          categoryName:    txn.category_name ?? "",
          contactName:     txn.contact_name ?? "",
          referenceNumber: txn.reference_number ?? "",
          paymentMethod:   txn.payment_mode ?? "",
          description:     txn.description ?? "",
          amount,
          status:          txn.status ?? "",
          bankAccount:     txn.account_name ?? "",
          isReconciled:    txn.is_reconciled ?? false,
          notes:           "",
        },
        update: {
          date:            new Date(txn.date),
          type:            txn.transaction_type ?? "bank_transaction",
          accountName:     txn.account_name ?? "",
          categoryName:    txn.category_name ?? "",
          contactName:     txn.contact_name ?? "",
          referenceNumber: txn.reference_number ?? "",
          paymentMethod:   txn.payment_mode ?? "",
          description:     txn.description ?? "",
          amount,
          status:          txn.status ?? "",
          bankAccount:     txn.account_name ?? "",
          isReconciled:    txn.is_reconciled ?? false,
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
          accountName:     exp.account_name ?? "",
          categoryName:    exp.category_name ?? "",
          contactName:     exp.vendor_name ?? "",
          referenceNumber: exp.reference_number ?? "",
          paymentMethod:   exp.payment_mode ?? "",
          description:     exp.description ?? "",
          amount:          -(Math.abs(exp.total)),
          status:          exp.status ?? "",
          bankAccount:     exp.account_name ?? "",
          isReconciled:    false,
          notes:           "",
        },
        update: {
          date:            new Date(exp.date),
          accountName:     exp.account_name ?? "",
          categoryName:    exp.category_name ?? "",
          contactName:     exp.vendor_name ?? "",
          referenceNumber: exp.reference_number ?? "",
          paymentMethod:   exp.payment_mode ?? "",
          description:     exp.description ?? "",
          amount:          -(Math.abs(exp.total)),
          status:          exp.status ?? "",
        },
      });
      upserted++;
    } catch (err) {
      errors.push(`expense ${exp.expense_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { upserted, errors };
}