# app/backend/seed.py
import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MOCK_DIR = ROOT / "mock-data"

ORGS = [
    {
        "slug": "kula-kitchen-group",
        "company_name": "Kula Kitchen Group",
        "branches": ["Nairobi CBD", "Westlands", "Thika Road"],
        "supplier_suffix": "Fresh Farm Suppliers",
    },
    {
        "slug": "mbali-bistro-collective",
        "company_name": "Mbali Bistro Collective",
        "branches": ["Karen", "Lavington", "Lang'ata"],
        "supplier_suffix": "Garden City Produce",
    },
]

SUPPLIERS = [
    "Fresh Farm Suppliers", "Nairobi Food Wholesalers", "Chef's Choice Logistics",
    "Kilimo Foods Ltd", "Tusk Tea Distributors", "Premier Bakery Supplies",
    "Avocado Oils Co.", "Bright Kitchen Equipment", "Crown Event Planners",
]

CUSTOMERS = [
    "Cafe Bloom", "Jua Kali Office", "Safari Suites", "Nairobi Startup Hub",
    "Westlands Co-working", "Thika Motors", "Green Gardens Estate",
]
PERSONAL_CONTACTS = ["Samuel Njoroge", "Asha Karanja", "Leah Mwangi"]

MONTH_START = date(2026, 6, 1)
MONTH_END = date(2026, 6, 30)


def format_reference(prefix: str, index: int) -> str:
    return f"{prefix}-{index:04d}"


def build_transaction(transaction_id: int, trans_date: date, branch: str, amount: int, ttype: str,
                      account_name: str, category_name: str, contact_name: str, payment_method: str,
                      description: str, status: str = "Posted", is_reconciled: bool = True,
                      notes: str = "") -> dict:
    return {
        "transaction_id": f"T{transaction_id:05d}",
        "date": trans_date.isoformat(),
        "branch": branch,
        "type": ttype,
        "account_name": account_name,
        "category_name": category_name,
        "contact_name": contact_name,
        "reference_number": format_reference("REF", transaction_id),
        "payment_method": payment_method,
        "description": description,
        "amount": amount,
        "status": status,
        "bank_account": "KCB Business Current Account",
        "is_reconciled": is_reconciled,
        "notes": notes,
    }


def build_chart_of_accounts():
    return [
        {"account_id": "A001", "name": "Sales", "type": "Income", "sub_type": "Revenue"},
        {"account_id": "A002", "name": "Cost of Goods Sold", "type": "Expense", "sub_type": "COGS"},
        {"account_id": "A003", "name": "Payroll", "type": "Expense", "sub_type": "Operating Expense"},
        {"account_id": "A004", "name": "Rent", "type": "Expense", "sub_type": "Fixed Expense"},
        {"account_id": "A005", "name": "Utilities", "type": "Expense", "sub_type": "Operating Expense"},
        {"account_id": "A006", "name": "Owner Draw", "type": "Equity", "sub_type": "Owner Distribution"},
        {"account_id": "A007", "name": "Mixed Funds", "type": "Expense", "sub_type": "Other"},
        {"account_id": "A008", "name": "Bank Charges", "type": "Expense", "sub_type": "Bank Fees"},
    ]


def build_invoices(org: dict):
    invoices = []
    for idx, customer in enumerate(CUSTOMERS, start=1):
        invoice_date = MONTH_START + timedelta(days=idx * 2)
        total = random.choice([32000, 45000, 70000, 98000, 120000])
        balance = 0 if idx % 3 != 0 else random.choice([5000, 12000, 28000])
        invoices.append({
            "invoice_id": format_reference("INV", idx),
            "customer_name": customer,
            "total": total,
            "balance": balance,
            "status": "Paid" if balance == 0 else "Partially Paid",
            "date": invoice_date.isoformat(),
            "due_date": (invoice_date + timedelta(days=14)).isoformat(),
            "reference_number": format_reference("INVREF", idx),
            "branch": random.choice(org["branches"]),
        })
    return invoices


def build_bank_statements():
    return [
        {
            "statement_id": "BS-202606",
            "date_from": MONTH_START.isoformat(),
            "date_to": MONTH_END.isoformat(),
            "opening_balance": 540000,
            "closing_balance": 450200,
            "reconciled": False,
            "notes": "Pending reconciliation on two supplier deposits and one cash withdrawal.",
        }
    ]


def build_supporting_documents(transactions: list, invoices: list):
    documents = []
    linked_tx_ids = [tx["transaction_id"] for tx in transactions if tx["type"] == "Expense"]
    for idx, tx_id in enumerate(linked_tx_ids[:12], start=1):
        documents.append({
            "document_id": f"DOC-{idx:03d}",
            "linked_transaction_id": tx_id,
            "invoice_id": None,
            "document_type": "Receipt",
            "status": "Available",
            "notes": "Scanned expense receipt available for review.",
        })

    for idx, invoice in enumerate(invoices[:4], start=13):
        documents.append({
            "document_id": f"DOC-{idx:03d}",
            "linked_transaction_id": None,
            "invoice_id": invoice["invoice_id"],
            "document_type": "Customer invoice",
            "status": "Available" if invoice["status"] == "Paid" else "Missing",
            "notes": "Invoice document exported from Zoho Books.",
        })

    # Leave some documents missing to simulate incomplete supporting files.
    return documents


def generate_transactions(org: dict):
    transactions = []
    transaction_id = 1
    branches = org["branches"]
    suppliers = [s if not s.endswith("Produce") else org["supplier_suffix"] for s in SUPPLIERS]

    for branch in branches:
        for day in range(1, 29, 2):
            trans_date = MONTH_START + timedelta(days=day - 1)
            amount = random.choice([22000, 34000, 42000, 56000, 67000])
            transactions.append(build_transaction(
                transaction_id, trans_date, branch, amount, "Income", "Mpesa Till 123456",
                "Food & Beverage Sales", random.choice(CUSTOMERS), "Paybill", f"Daily sales deposit for {branch}"))
            transaction_id += 1

    for branch in branches:
        for supplier in random.sample(suppliers, 6):
            trans_date = MONTH_START + timedelta(days=random.randint(1, 25))
            amount = random.choice([45000, 58000, 76000, 102000, 125000])
            transactions.append(build_transaction(
                transaction_id, trans_date, branch, amount, "Expense", "Business Current Account",
                "Restaurant Supplies", supplier, "Bank Transfer", f"Supplier payment to {supplier}"))
            transaction_id += 1

    for branch in branches:
        payroll_date = MONTH_START + timedelta(days=5)
        rent_date = MONTH_START + timedelta(days=2)
        transactions.append(build_transaction(
            transaction_id, payroll_date, branch, 180000, "Expense", "Payroll Account",
            "Payroll", "Star Staff Services", "Bank Transfer", f"June payroll - {branch}"))
        transaction_id += 1
        transactions.append(build_transaction(
            transaction_id, rent_date, branch, 160000, "Expense", "Business Current Account",
            "Rent", "Landlord Estate", "Bank Transfer", f"Branch rent for {branch}"))
        transaction_id += 1

    utility_days = [8, 13, 18, 24]
    for branch in branches:
        for day in utility_days:
            trans_date = MONTH_START + timedelta(days=day - 1)
            amount = random.choice([12000, 14000, 18000, 22000])
            transactions.append(build_transaction(
                transaction_id, trans_date, branch, amount, "Expense", "Business Current Account",
                "Utilities", "Nairobi Energy Co.", "Bank Transfer", f"Power bill payment"))
            transaction_id += 1

    personal_date = MONTH_START + timedelta(days=11)
    transactions.append(build_transaction(
        transaction_id, personal_date, branches[1], 45000, "Expense", "Owner Personal Wallet",
        "Owner Draw", PERSONAL_CONTACTS[0], "Mpesa", "Owner draw for household expenses", "Posted", False,
        "Personal withdrawal from business account"))
    transaction_id += 1

    duplicate_date = MONTH_START + timedelta(days=14)
    transactions.append(build_transaction(
        transaction_id, duplicate_date, branches[0], 92000, "Expense", "Business Current Account",
        "Restaurant Supplies", suppliers[0], "Bank Transfer", "Pumpkin and dairy order"))
    transaction_id += 1
    transactions.append(build_transaction(
        transaction_id, duplicate_date + timedelta(days=3), branches[0], 92000, "Expense", "Business Current Account",
        "Restaurant Supplies", suppliers[0], "Bank Transfer", "Duplicate supplier payment"))
    transaction_id += 1

    round_date = MONTH_START + timedelta(days=20)
    transactions.append(build_transaction(
        transaction_id, round_date, branches[-1], 500000, "Expense", "Business Current Account",
        "Repairs & Maintenance", "Crown Event Planners", "Bank Transfer", "Large one-off venue setup fee", "Posted", False,
        "Round-number payment to a service provider"))
    transaction_id += 1

    for branch in branches:
        for day in [3, 12, 19, 27]:
            trans_date = MONTH_START + timedelta(days=day - 1)
            amount = random.choice([5500, 7800, 9200, 13500])
            transactions.append(build_transaction(
                transaction_id, trans_date, branch, amount, "Expense", "Branch Petty Cash",
                "Miscellaneous", random.choice(["Cafe Bloom", "Green Gardens Estate"]), "Cash", "Petty cash purchase"))
            transaction_id += 1

    transactions.append(build_transaction(
        transaction_id, MONTH_START + timedelta(days=9), branches[0], 68000, "Income", "Mpesa Till 123456",
        "Food & Beverage Sales", "Safari Suites", "Paybill", "Large event order deposit", "Posted", False,
        "Payment received but still unreconciled"))
    transaction_id += 1

    return transactions


def save_json(org: dict, transactions, invoices, bank_statements, chart_of_accounts, supporting_documents):
    payload = {
        "meta": {
            "company_name": org["company_name"],
            "period_start": MONTH_START.isoformat(),
            "period_end": MONTH_END.isoformat(),
            "branches": org["branches"],
            "currency": "KES",
        },
        "transactions": transactions,
        "invoices": invoices,
        "bank_statements": bank_statements,
        "chart_of_accounts": chart_of_accounts,
        "supporting_documents": supporting_documents,
    }
    path = MOCK_DIR / f"zoho-books-{org['slug']}.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    return path.name


def save_csv(org: dict, transactions):
    path = MOCK_DIR / f"zoho-books-{org['slug']}.csv"
    path.parent.mkdir(exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=[
            "transaction_id", "date", "branch", "type", "account_name", "category_name",
            "contact_name", "reference_number", "payment_method", "description", "amount",
            "status", "bank_account", "is_reconciled", "notes"
        ])
        writer.writeheader()
        for tx in transactions:
            writer.writerow(tx)
    return path.name


def main():
    org_index = []
    MOCK_DIR.mkdir(exist_ok=True)

    for org in ORGS:
        print(f"Generating mock Zoho Books data for {org['company_name']}...")
        transactions = generate_transactions(org)
        invoices = build_invoices(org)
        bank_statements = build_bank_statements()
        chart_of_accounts = build_chart_of_accounts()
        supporting_documents = build_supporting_documents(transactions, invoices)
        data_filename = save_json(org, transactions, invoices, bank_statements, chart_of_accounts, supporting_documents)
        csv_filename = save_csv(org, transactions)
        org_index.append({
            "slug": org["slug"],
            "company_name": org["company_name"],
            "data_file": data_filename,
            "csv_file": csv_filename,
            "branch_count": len(org["branches"]),
        })
        print(f"  JSON -> {data_filename}")
        print(f"  CSV  -> {csv_filename}")
        print(f"  Transactions generated: {len(transactions)}")

    index_file = MOCK_DIR / "organizations.json"
    index_file.write_text(json.dumps(org_index, indent=2, ensure_ascii=False))
    print(f"Wrote organization index to {index_file}")


if __name__ == "__main__":
    main()
