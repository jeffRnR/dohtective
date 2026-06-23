# documents/extract_mpesa.py
from pathlib import Path
import pdfplumber
from models import ExtractedDocument, ExtractedLineItem
from documents.schema import extract_amount, extract_date

def extract_mpesa_statement(file_path: str) -> ExtractedDocument:
    path = Path(file_path)
    line_items = []
    metadata = {}
    warnings = []
    
    with pdfplumber.open(path) as pdf:
        # Pull closing balance from text summary layer if present
        first_page_text = pdf.pages[0].extract_text() or ""
        for line in first_page_text.splitlines():
            if "summary" in line.lower() or "balance" in line.lower():
                # Extract opening/closing landmarks if available
                pass

        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    row_str = " ".join(str(cell) for cell in row if cell)
                    if "Completed" not in row_str:
                        continue
                    
                    try:
                        # Standard M-Pesa table indexes:
                        # row[0]=Receipt No, row[1]=Completion Time, row[2]=Details, 
                        # row[3]=Status, row[4]=Paid In, row[5]=Withdrawn, row[6]=Balance
                        ref_number = str(row[0]).strip()
                        date_str = str(row[1]).strip()
                        details = str(row[2]).strip()
                        
                        paid_in = extract_amount(str(row[4])) if row[4] else None
                        withdrawn = extract_amount(str(row[5])) if row[5] else None
                        
                        # Determine safe amount and sign
                        if paid_in is not None and paid_in > 0:
                            amount = paid_in
                            tx_type = "Income"
                        elif withdrawn is not None and withdrawn > 0:
                            amount = withdrawn
                            tx_type = "Expense"
                        else:
                            continue

                        line_items.append(ExtractedLineItem(
                            description=details[:200],
                            amount=amount,
                            date=extract_date(date_str) or date_str,
                            raw_text=f"Ref:{ref_number} | {row_str}"[:500]
                        ))
                    except Exception:
                        continue
                        
    return ExtractedDocument(
        document_kind="mpesa",
        source_filename=path.name,
        extraction_method="text_layer",
        confidence="high" if len(line_items) > 0 else "low",
        line_items=line_items,
        metadata=metadata,
        warnings=warnings
    )