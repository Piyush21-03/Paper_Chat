"""Deterministic data-analysis / calculator mode.

No eval(), no LLM-generated code execution. Numeric values are extracted
from already-extracted tables (preferred) or, as a fallback, from
retrieved chunk text via regex -- then a fixed set of Python operations
compute the answer. Gemini is never asked to do the arithmetic.
"""

import csv
import re
from typing import Any, Dict, List, Optional

CALC_KEYWORDS = re.compile(
    r"\b(average|mean|sum|total|highest|lowest|best|worst|maximum|minimum|"
    r"max|min|percentage difference|percent difference|% difference|"
    r"difference between|how many|count of|compare|comparison)\b",
    re.IGNORECASE,
)

NUMBER_RE = re.compile(r"[-+]?\d[\d,]*\.?\d*")


def detect_calculation_intent(question: str) -> bool:
    return bool(CALC_KEYWORDS.search(question))


def _parse_number(raw: str) -> Optional[float]:
    raw = raw.replace(",", "").replace("%", "").strip()
    try:
        return float(raw)
    except ValueError:
        return None


# ---------------------------------------------------------------
# Data gathering
# ---------------------------------------------------------------

def gather_from_tables(table_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """table_rows: list of {"csv_path": Path, "page_number": int}.

    Returns a flat list of {"label", "value", "page_number"} numeric
    data points, labeled as "<row label> — <column header>".
    """

    points = []

    for table in table_rows:

        csv_path = table["csv_path"]

        try:
            with open(csv_path, newline="", encoding="utf-8") as f:
                rows = list(csv.reader(f))
        except Exception:
            continue

        if len(rows) < 2:
            continue

        header = rows[0]

        for row in rows[1:]:

            row_label = row[0].strip() if row else ""

            for col_index in range(1, len(row)):

                value = _parse_number(row[col_index])
                if value is None:
                    continue

                col_name = header[col_index].strip() if col_index < len(header) else f"col{col_index}"
                label = f"{row_label} — {col_name}" if row_label else col_name

                points.append({
                    "label": label,
                    "row_label": row_label,
                    "column": col_name,
                    "value": value,
                    "page_number": table.get("page_number"),
                })

    return points


def gather_from_text(chunk_texts: List[str]) -> List[Dict[str, Any]]:
    """Fallback when no extracted tables exist: pull "Label: number"
    style patterns out of retrieved chunk text."""

    points = []
    line_pattern = re.compile(r"([A-Za-z][\w \-/]{1,40}?)[:\s]+([-+]?\d[\d,]*\.?\d*)\s*%?")

    for text in chunk_texts:
        for line in text.splitlines():
            for match in line_pattern.finditer(line):
                value = _parse_number(match.group(2))
                if value is None:
                    continue
                points.append({
                    "label": match.group(1).strip(),
                    "row_label": match.group(1).strip(),
                    "column": None,
                    "value": value,
                    "page_number": None,
                })

    return points


# ---------------------------------------------------------------
# Operation resolution
# ---------------------------------------------------------------

def _filter_by_column_keyword(points: List[Dict[str, Any]], question: str) -> List[Dict[str, Any]]:
    """If the question names a metric that matches a column header,
    narrow to that column only (e.g. "average accuracy" -> Accuracy col)."""

    columns = {p["column"] for p in points if p.get("column")}
    q_lower = question.lower()

    for column in columns:
        if column and column.lower() in q_lower:
            return [p for p in points if p.get("column") == column]

    return points


def _find_between_targets(question: str, points: List[Dict[str, Any]]):
    match = re.search(r"between (.+?) and (.+?)(?:\?|$)", question, re.IGNORECASE)
    if not match:
        return None

    name_a, name_b = match.group(1).strip(), match.group(2).strip()

    def best_match(name):
        name_l = name.lower()
        for p in points:
            if p.get("row_label") and name_l in p["row_label"].lower():
                return p
        return None

    point_a, point_b = best_match(name_a), best_match(name_b)

    if point_a and point_b:
        return point_a, point_b

    return None


def calculate(question: str, points: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Returns {operation, inputs, result, explanation} or None if there
    isn't enough numeric data to answer deterministically."""

    if not points:
        return None

    q = question.lower()
    scoped = _filter_by_column_keyword(points, question)
    values = [p["value"] for p in scoped]

    # ---- percentage / difference between two named items ----

    if re.search(r"(percentage difference|percent difference|% difference|difference between)", q):

        pair = _find_between_targets(question, scoped) or _find_between_targets(question, points)

        if pair:
            a, b = pair
            diff = abs(a["value"] - b["value"])
            avg = (a["value"] + b["value"]) / 2 or 1
            pct = (diff / avg) * 100

            return {
                "operation": "percentage_difference",
                "inputs": [a, b],
                "result": round(pct, 2),
                "explanation": (
                    f"{a['label']} = {a['value']}, {b['label']} = {b['value']}. "
                    f"Percentage difference = {round(pct, 2)}%."
                ),
            }

    # ---- average / mean ----

    if re.search(r"\b(average|mean)\b", q) and values:
        result = sum(values) / len(values)
        return {
            "operation": "average",
            "inputs": scoped,
            "result": round(result, 4),
            "explanation": f"Average of {len(values)} value(s) = {round(result, 4)}.",
        }

    # ---- sum / total ----

    if re.search(r"\b(sum|total)\b", q) and values:
        result = sum(values)
        return {
            "operation": "sum",
            "inputs": scoped,
            "result": round(result, 4),
            "explanation": f"Sum of {len(values)} value(s) = {round(result, 4)}.",
        }

    # ---- max / best / highest ----

    if re.search(r"\b(highest|best|max(imum)?)\b", q) and scoped:
        top = max(scoped, key=lambda p: p["value"])
        return {
            "operation": "max",
            "inputs": scoped,
            "result": top,
            "explanation": f"Highest: {top['label']} = {top['value']}.",
        }

    # ---- min / worst / lowest ----

    if re.search(r"\b(lowest|worst|min(imum)?)\b", q) and scoped:
        bottom = min(scoped, key=lambda p: p["value"])
        return {
            "operation": "min",
            "inputs": scoped,
            "result": bottom,
            "explanation": f"Lowest: {bottom['label']} = {bottom['value']}.",
        }

    # ---- count ----

    if re.search(r"\b(how many|count)\b", q):
        return {
            "operation": "count",
            "inputs": scoped,
            "result": len(scoped),
            "explanation": f"Found {len(scoped)} matching value(s).",
        }

    # ---- fallback: comparison listing ----

    if scoped:
        ranked = sorted(scoped, key=lambda p: p["value"], reverse=True)
        return {
            "operation": "compare",
            "inputs": ranked,
            "result": ranked,
            "explanation": (
                f"Highest: {ranked[0]['label']} = {ranked[0]['value']}. "
                f"Lowest: {ranked[-1]['label']} = {ranked[-1]['value']}."
            ),
        }

    return None
