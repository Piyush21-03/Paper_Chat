"""
Central test runner for PaperChat test suites.
Usage:
    python scripts/run_tests.py
"""
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
TESTS_DIR = BACKEND_DIR / "tests"


def run_suite(name: str, test_file: Path) -> bool:
    print(f"\n{'='*20} Running: {name} {'='*20}")
    result = subprocess.run([sys.executable, str(test_file)], cwd=str(ROOT_DIR))
    if result.returncode == 0:
        print(f"--> [SUCCESS] {name} passed.")
        return True
    else:
        print(f"--> [FAILED] {name} exited with status {result.returncode}.")
        return False


def main():
    suites = [
        ("Retrieval Pipeline Tests", TESTS_DIR / "test_retrieval_pipeline.py"),
        ("E2E API & Router Tests", TESTS_DIR / "test_api_e2e.py"),
    ]

    all_passed = True
    for name, path in suites:
        if not run_suite(name, path):
            all_passed = False

    print("\n" + "=" * 60)
    if all_passed:
        print("[SUCCESS] ALL TEST SUITES PASSED SUCCESSFULLY!")
        sys.exit(0)
    else:
        print("[FAILURE] SOME TEST SUITES FAILED.")
        sys.exit(1)


if __name__ == "__main__":
    main()
