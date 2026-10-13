#!/usr/bin/env python3
"""migrate_sqlite_to_postgres.py -- One-shot data migration from SQLite to PostgreSQL.

Usage:
    python scripts/migrate_sqlite_to_postgres.py \
        --sqlite  path/to/paperchat.db \
        --pg      "postgresql+psycopg2://paperchat:secret@localhost:5432/paperchat"

The target PostgreSQL database must already have the schema applied:
    cd backend && python -m alembic upgrade head

This script copies every row from every table. It is idempotent when re-run
on an empty target, but may produce duplicate-key errors if run a second time
against a partially-populated target -- wipe the target first in that case.
"""

import argparse
import sys
from datetime import datetime

from sqlalchemy import create_engine, text, inspect, MetaData, Table


TABLES_IN_DEPENDENCY_ORDER = [
    "app_settings",
    "eval_cases",
    "users",
    "conversations",
    "documents",
    "eval_runs",
    "research_collections",
    "collection_documents",
    "eval_results",
    "extracted_tables",
    "messages",
    "research_bookmarks",
    "research_metadata",
    "research_sessions",
    "research_session_entries",
]


def migrate(sqlite_url: str, pg_url: str) -> None:
    src = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    dst = create_engine(pg_url, pool_pre_ping=True)

    src_insp = inspect(src)
    dst_insp = inspect(dst)

    src_tables = set(src_insp.get_table_names())
    dst_tables = set(dst_insp.get_table_names())

    missing = [t for t in TABLES_IN_DEPENDENCY_ORDER if t not in dst_tables]
    if missing:
        print(f"ERROR: Target PostgreSQL database is missing tables: {missing}")
        print("Run:  cd backend && python -m alembic upgrade head")
        sys.exit(1)

    src_meta = MetaData()
    src_meta.reflect(bind=src)

    total_rows = 0

    with dst.begin() as dst_conn:
        for table_name in TABLES_IN_DEPENDENCY_ORDER:
            if table_name not in src_tables:
                print(f"  SKIP {table_name} (not in source)")
                continue

            src_table = Table(table_name, src_meta, autoload_with=src)

            with src.connect() as src_conn:
                rows = src_conn.execute(src_table.select()).fetchall()

            if not rows:
                print(f"  SKIP {table_name} (empty)")
                continue

            columns = [c.name for c in src_table.columns]

            # Disable FK checks during bulk insert, re-enable after.
            dst_conn.execute(text("SET session_replication_role = replica;"))

            dst_table = Table(table_name, MetaData(), autoload_with=dst)
            data = [dict(zip(columns, row)) for row in rows]
            dst_conn.execute(dst_table.insert(), data)

            dst_conn.execute(text("SET session_replication_role = DEFAULT;"))

            total_rows += len(rows)
            print(f"  COPY {table_name}: {len(rows)} rows")

    print(f"\nMigration complete. {total_rows} total rows copied.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate PaperChat data from SQLite to PostgreSQL")
    parser.add_argument("--sqlite", required=True, help="SQLite file URL, e.g. sqlite:///./paperchat.db")
    parser.add_argument("--pg", required=True, help="PostgreSQL connection URL")
    args = parser.parse_args()

    if not args.sqlite.startswith("sqlite"):
        args.sqlite = f"sqlite:///{args.sqlite}"

    print(f"Source:      {args.sqlite}")
    print(f"Target:      {args.pg[:40]}...")
    print(f"Started at:  {datetime.now().isoformat()}")
    print()
    migrate(args.sqlite, args.pg)
