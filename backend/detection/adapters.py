# detection/adapters.py
import uuid
from typing import Any, Dict, List

def normalize_document_to_transactions(extracted_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Transforms ExtractedDocument line items into the canonical Transaction shape 
    accepted by report_builder.py checks.
    """
    transactions = []
    line_items = extracted_doc.get("line_items", [])
    doc_kind = extracted_doc.get("document_kind", "unknown")

    for idx, item in enumerate(line_items):
        raw_text = item.get("raw_text", "")
        amount = item.get("amount", 0.0)
        
        # Determine transaction type if not already isolated
        tx_type = "Expense"
        if doc_kind == "mpesa":
            tx_type = "Income" if "Income" in raw_text or "Paid In" in raw_text else "Expense"
        else:
            # Bank statement heuristics: negative balances/amounts are expenses
            tx_type = "Income" if amount > 0 else "Expense"
            amount = abs(amount)

        # Attempt to clean up contact names out of description layers
        description = item.get("description", "")
        contact_name = description
        if "to" in description.lower():
            contact_name = description.lower().split("to")[-1].strip().title()
        elif "from" in description.lower():
            contact_name = description.lower().split("from")[-1].strip().title()

        # Parse out a reference number if embedded in the raw text
        ref_num = ""
        if "Ref:" in raw_text:
            ref_num = raw_text.split("Ref:")[-1].split("|")[0].strip()

        transactions.append({
            "transaction_id": f"doc_{doc_kind}_{idx}_{uuid.uuid4().hex[:6]}",
            "date": item.get("date"),
            "amount": amount,
            "type": tx_type,
            "description": description,
            "contact_name": contact_name or "Unknown Recipient",
            "reference_number": ref_num,
            "branch": "Main Branch",
            "category_name": "Uncategorized Document Transaction",
            "account_name": "Document Extract Ledger",
            "is_reconciled": False  # Standalone docs start unreconciled
        })
        
    return transactions