"""
Backward-compatibility wrapper for test_api_e2e.py.
The test suite is located in backend/tests/test_api_e2e.py.
"""
import runpy
from pathlib import Path

if __name__ == "__main__":
    target = Path(__file__).resolve().parent / "tests" / "test_api_e2e.py"
    runpy.run_path(str(target), run_name="__main__")
