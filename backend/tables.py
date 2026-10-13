"""Table extraction from PDFs.

Uses pdfplumber (pure-Python, no system deps) to detect and extract
tables page by page. Runs as part of the existing background-processing
job; failures here never affect document usability (see jobs.py).
"""

import csv
from pathlib import Path
from typing import Any, Dict, List

import pdfplumber
from openpyxl import Workbook

from logging_config import get_logger

logger = get_logger("tables")

BACKEND_DIR = Path(__file__).resolve().parent
TABLES_DIR = BACKEND_DIR / "storage" / "tables"
TABLES_DIR.mkdir(parents=True, exist_ok=True)

PREVIEW_ROWS = 5
PREVIEW_COLS = 8
MAX_TABLES_PER_DOCUMENT = 30  # guard against pathological/scanned PDFs


def _clean_row(row: List[Any]) -> List[str]:
    return [("" if cell is None else str(cell).strip()) for cell in row]


def extract_tables(pdf_path: Path, document_id: str) -> List[Dict[str, Any]]:
    """Extracts tables from a PDF.

    Returns a list of dicts: {page_number, row_count, col_count, preview,
    csv_path, xlsx_path} -- paths are absolute Path objects on disk.
    Raises on hard failure (e.g. an unreadable/corrupt PDF); a PDF that
    simply contains no tables returns an empty list, which is not an
    error.
    """

    doc_dir = TABLES_DIR / document_id
    doc_dir.mkdir(parents=True, exist_ok=True)

    results = []
    table_index = 0

    with pdfplumber.open(str(pdf_path)) as pdf:

        for page_number, page in enumerate(pdf.pages, start=1):

            if table_index >= MAX_TABLES_PER_DOCUMENT:
                break

            try:
                page_tables = page.extract_tables()
            except Exception as error:
                logger.warning("table extract page=%d error=%s", page_number, error)
                continue

            for raw_table in page_tables:

                if table_index >= MAX_TABLES_PER_DOCUMENT:
                    break

                rows = [_clean_row(r) for r in raw_table if any(c not in (None, "") for c in r)]

                # Skip trivial/empty detections (noise, not real tables).
                if len(rows) < 2 or len(rows[0]) < 2:
                    continue

                row_count = len(rows)
                col_count = max(len(r) for r in rows)

                csv_path = doc_dir / f"table_{table_index}.csv"
                with open(csv_path, "w", newline="", encoding="utf-8") as f:
                    csv.writer(f).writerows(rows)

                xlsx_path = doc_dir / f"table_{table_index}.xlsx"
                try:
                    wb = Workbook()
                    ws = wb.active
                    for row in rows:
                        ws.append(row)
                    wb.save(xlsx_path)
                except Exception as error:
                    logger.warning("xlsx write failed table_index=%d error=%s", table_index, error)
                    xlsx_path = None

                preview = [r[:PREVIEW_COLS] for r in rows[:PREVIEW_ROWS]]

                results.append({
                    "page_number": page_number,
                    "row_count": row_count,
                    "col_count": col_count,
                    "preview": preview,
                    "csv_path": csv_path,
                    "xlsx_path": xlsx_path,
                })

                table_index += 1

    return results
