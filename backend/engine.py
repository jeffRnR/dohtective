import json
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

Transaction = Dict[str, Any]
Invoice = Dict[str, Any]
BankStatement = Dict[str, Any]
SupportingDocument = Dict[str, Any]
Payload = Dict[str, Any]


def parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value)


def detect_mixed_funds(transactions: List[Transaction]) -> List[Transaction]:
    personal_patterns = ["personal", "owner draw", "owner", "personal wallet"]
    items = []

    for tx in transactions:
        lower = " ".join(
            [str(tx.get(key, "")).lower() for key in ["description", "account_name", "category_name", "contact_name"]]
        )
        if any(pattern in lower for pattern in personal_patterns):
            items.append(tx)

    return items


def detect_duplicate_transactions(transactions: List[Transaction]) -> List[Transaction]:
    groups: Dict[str, List[Transaction]] = {}
    for tx in transactions:
        key = f"{tx.get('contact_name')}|{tx.get('amount')}|{tx.get('branch')}|{tx.get('type')}"
        groups.setdefault(key, []).append(tx)

    duplicates: List[Transaction] = []
    for bucket in groups.values():
        if len(bucket) < 2:
            continue
        sorted_bucket = sorted(bucket, key=lambda tx: parse_date(tx["date"]))
        gaps = [
            (parse_date(sorted_bucket[i]["date"]) - parse_date(sorted_bucket[i - 1]["date"])).days
            for i in range(1, len(sorted_bucket))
        ]
        if len(sorted_bucket) >= 3 and all(g >= 6 for g in gaps):
            continue
        for i, gap in enumerate(gaps, start=1):
            if gap <= 5:
                duplicates.append(sorted_bucket[i - 1])
                duplicates.append(sorted_bucket[i])

    unique_duplicates = {tx["transaction_id"]: tx for tx in duplicates}
    return list(unique_duplicates.values())


def detect_round_number_payments(transactions: List[Transaction]) -> List[Transaction]:
    recurring_round_categories = {"Rent", "Payroll"}
    seen_count: Dict[str, int] = {}
    flagged: List[Transaction] = []
    ordered = sorted(transactions, key=lambda tx: parse_date(tx["date"]))

    for tx in ordered:
        contact = tx.get("contact_name", "")
        prior = seen_count.get(contact, 0)
        seen_count[contact] = prior + 1
        if tx.get("type") != "Expense":
            continue
        amount = tx.get("amount", 0)
        if amount < 50000 or amount % 10000 != 0:
            continue
        if tx.get("category_name") in recurring_round_categories:
            continue
        if prior < 2:
            flagged.append(tx)

    return flagged


def detect_unusual_transactions(transactions: List[Transaction]) -> List[Transaction]:
    results = []
    for tx in transactions:
        large_expense = tx.get("type") == "Expense" and tx.get("amount", 0) >= 200000
        odd_description = bool(re.search(r"(one-off|setup fee|large|transfer|miscellaneous)", str(tx.get("description", "")), re.IGNORECASE))
        if large_expense or odd_description:
            results.append(tx)
    return results


def detect_unreconciled(transactions: List[Transaction]) -> List[Transaction]:
    return [tx for tx in transactions if not tx.get("is_reconciled", False)]


def detect_missing_documentation(
    transactions: List[Transaction],
    invoices: List[Invoice],
    documents: List[SupportingDocument],
) -> Dict[str, Any]:
    docs_by_tx = {doc.get("linked_transaction_id"): doc for doc in documents if doc.get("linked_transaction_id")}
    missing = []
    expected_count = 0
    for tx in transactions:
        if tx.get("type") != "Expense":
            continue
        if tx.get("amount", 0) < 30000:
            continue
        expected_count += 1
        linked = docs_by_tx.get(tx["transaction_id"])
        if not linked or linked.get("status") != "Available":
            missing.append({
                "transaction_id": tx["transaction_id"],
                "description": tx.get("description"),
                "branch": tx.get("branch"),
                "amount": tx.get("amount"),
                "expected_document_type": "Receipt or invoice",
                "status": linked.get("status") if linked else "Missing",
            })

    unpaid_invoices = [inv for inv in invoices if inv.get("balance", 0) > 0 and inv.get("status") != "Paid"]
    missing_invoice_docs = [inv for inv in unpaid_invoices if not any(doc.get("invoice_id") == inv.get("invoice_id") for doc in documents)]

    return {
        "expected_documents": expected_count,
        "missing_documents": len(missing),
        "invoice_documents_missing": len(missing_invoice_docs),
        "details": missing[:5],
    }


def detect_bank_statement_issues(statements: List[BankStatement]) -> List[BankStatement]:
    return [stmt for stmt in statements if not stmt.get("reconciled", False)]


def calculate_cash_buffer(transactions: List[Transaction]) -> Dict[str, int]:
    inflows = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "Income")
    outflows = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "Expense")
    average_daily_outflow = outflows / 30 if outflows else 0
    starting_balance = 250000
    running_balance = starting_balance
    for tx in sorted(transactions, key=lambda tx: parse_date(tx["date"])):
        running_balance += tx.get("amount", 0) if tx.get("type") == "Income" else -tx.get("amount", 0)
    buffer_days = round(running_balance / average_daily_outflow) if average_daily_outflow else 0
    return {
        "total_in": inflows,
        "total_out": outflows,
        "buffer_days": max(0, buffer_days),
    }


def build_report(payload: Payload) -> Dict[str, Any]:
    transactions = payload.get("transactions", [])
    invoices = payload.get("invoices", [])
    bank_statements = payload.get("bank_statements", [])
    supporting_documents = payload.get("supporting_documents", [])

    mixed = detect_mixed_funds(transactions)
    duplicates = detect_duplicate_transactions(transactions)
    rounds = detect_round_number_payments(transactions)
    unusual = detect_unusual_transactions(transactions)
    unreconciled = detect_unreconciled(transactions)
    docs_review = detect_missing_documentation(transactions, invoices, supporting_documents)
    bank_issues = detect_bank_statement_issues(bank_statements)
    cash = calculate_cash_buffer(transactions)

    flags = []
    if mixed:
        flags.append({
            "title": "Mixed personal and business funds detected",
            "detail": f"{len(mixed)} transaction(s) totalling KES {sum(tx.get('amount', 0) for tx in mixed):,} were flagged.",
            "severity": "high",
        })
    if duplicates:
        flags.append({
            "title": "Duplicate transaction pattern",
            "detail": f"{len(duplicates)} suspicious repeated transactions were found within 5 days.",
            "severity": "high",
        })
    if rounds:
        flags.append({
            "title": "Round-number payment flagged",
            "detail": f"{len(rounds)} large round-number expenses were flagged for review.",
            "severity": "medium",
        })
    if unusual:
        flags.append({
            "title": "Unusual transactions detected",
            "detail": f"{len(unusual)} one-off or unusually large transactions were found.",
            "severity": "medium",
        })
    if unreconciled:
        flags.append({
            "title": "Unreconciled entries present",
            "detail": f"{len(unreconciled)} transactions are not reconciled.",
            "severity": "medium",
        })
    if docs_review["missing_documents"] > 0 or docs_review["invoice_documents_missing"] > 0:
        flags.append({
            "title": "Supporting documents incomplete",
            "detail": f"{docs_review['missing_documents']} expense documents and {docs_review['invoice_documents_missing']} invoice documents are missing or unavailable.",
            "severity": "high" if docs_review["missing_documents"] + docs_review["invoice_documents_missing"] > 1 else "medium",
        })
    if bank_issues:
        flags.append({
            "title": "Bank statement not fully reconciled",
            "detail": f"{len(bank_issues)} bank statement(s) still show unreconciled items.",
            "severity": "medium",
        })
    if cash["buffer_days"] < 15:
        flags.append({
            "title": "Cash buffer is tight",
            "detail": f"Estimated cash buffer is {cash['buffer_days']} days, below the early-warning threshold.",
            "severity": "high",
        })

    anomaly_transactions = []
    anomaly_map: Dict[str, Dict[str, Any]] = {}
    for tx in mixed + duplicates + rounds + unusual + unreconciled:
        if tx["transaction_id"] not in anomaly_map:
            anomaly_map[tx["transaction_id"]] = {
                "transaction_id": tx["transaction_id"],
                "anomaly_type": [],
                "reason": [],
                "date": tx["date"],
                "branch": tx["branch"],
                "amount": tx["amount"],
                "description": tx["description"],
                "contact_name": tx["contact_name"],
                "category_name": tx["category_name"],
                "account_name": tx["account_name"],
                "status": tx["status"],
                "is_reconciled": tx["is_reconciled"],
                "payment_method": tx["payment_method"],
                "reference_number": tx["reference_number"],
            }
        if tx in mixed:
            anomaly_map[tx["transaction_id"]]["anomaly_type"].append("Mixed funds")
            anomaly_map[tx["transaction_id"]]["reason"].append("Possible personal or owner spending mixed with business expenses.")
        if tx in duplicates:
            anomaly_map[tx["transaction_id"]]["anomaly_type"].append("Duplicate transaction")
            anomaly_map[tx["transaction_id"]]["reason"].append("Potential duplicate supplier payment within 5 days.")
        if tx in rounds:
            anomaly_map[tx["transaction_id"]]["anomaly_type"].append("Round-number payment")
            anomaly_map[tx["transaction_id"]]["reason"].append("Large round-number expense to an unfamiliar recipient.")
        if tx in unusual:
            anomaly_map[tx["transaction_id"]]["anomaly_type"].append("Unusual transaction")
            anomaly_map[tx["transaction_id"]]["reason"].append("One-off or unusually large expense description detected.")
        if tx in unreconciled:
            anomaly_map[tx["transaction_id"]]["anomaly_type"].append("Unreconciled entry")
            anomaly_map[tx["transaction_id"]]["reason"].append("Transaction not marked as reconciled in the books.")

    for entry in anomaly_map.values():
        entry["anomaly_type"] = ", ".join(dict.fromkeys(entry["anomaly_type"]))
        entry["reason"] = " / ".join(dict.fromkeys(entry["reason"]))
        anomaly_transactions.append(entry)

    branches = {tx.get("branch") for tx in transactions}
    return {
        "cash_buffer_days": cash["buffer_days"],
        "total_cash_outflows": cash["total_out"],
        "total_cash_inflows": cash["total_in"],
        "flags": flags,
        "mixed_funds_count": len(mixed),
        "mixed_funds_total": sum(tx.get("amount", 0) for tx in mixed),
        "plain_language": [
            f"This report reviews {len(branches)} branch(es) for the month and highlights risk areas before the next investor update.",
            f"{len(mixed)} transactions resembling personal spending were detected." if mixed else "No personal/business mixed spend was detected.",
            f"{len(duplicates)} duplicate payment patterns were found." if duplicates else "No duplicate supplier transactions were flagged.",
            f"Supporting documents are incomplete: {docs_review['missing_documents']} expense docs and {docs_review['invoice_documents_missing']} invoice docs missing." if docs_review["missing_documents"] or docs_review["invoice_documents_missing"] else "Supporting documents are complete for the reviewed period.",
            f"Cash buffer is {cash['buffer_days']} days." if cash["buffer_days"] >= 0 else "Cash buffer could not be calculated.",
        ],
        "followup_workflow": [
            {"title": "Review unreconciled transactions", "action": "Match all unreconciled transactions against bank statements and supporting documents.", "role": "accountant"},
            {"title": "Validate mixed spend", "action": "Investigate flagged mixed personal/business transactions and reclassify them correctly.", "role": "founder"},
            {"title": "Confirm supporting documents", "action": "Collect missing receipts, supplier invoices and contracts for large expenses.", "role": "accountant"},
            {"title": "Follow up overdue invoices", "action": "Contact customers for unpaid invoices and reconcile receipts with recorded sales.", "role": "founder"},
        ],
        "missing_information_checklist": [
            "Review unreconciled transactions and match them to bank statements.",
            "Investigate mixed personal/business payments and reclassify them.",
            "Collect missing supporting documents for large expenses and invoices.",
            "Reconcile bank statements that still show unreconciled items.",
        ],
        "anomaly_transactions": anomaly_transactions,
        "supporting_document_review": {
            "expected_documents": docs_review["expected_documents"],
            "missing_documents": docs_review["missing_documents"],
            "invoice_documents_missing": docs_review["invoice_documents_missing"],
            "summary": f"{docs_review['missing_documents']} expense docs and {docs_review['invoice_documents_missing']} invoice docs are missing or unavailable.",
        },
    }


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r", encoding="utf-8") as fd:
            payload = json.load(fd)
    else:
        payload = json.load(sys.stdin)

    report = build_report(payload)
    json.dump(report, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
