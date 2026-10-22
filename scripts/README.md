# 🛠️ PaperChat — Operational Scripts

Utility scripts for database management, migration, and test execution.

---

## 📜 Available Scripts

### 1. `run_tests.py`
Runs all backend test suites (`test_retrieval_pipeline.py` and `test_api_e2e.py`) and outputs a clean aggregated result summary:
```bash
python scripts/run_tests.py
```

### 2. `migrate_sqlite_to_postgres.py`
Migrates data from a local SQLite database (`paperchat.db`) to a target PostgreSQL database:
```bash
python scripts/migrate_sqlite_to_postgres.py
```
