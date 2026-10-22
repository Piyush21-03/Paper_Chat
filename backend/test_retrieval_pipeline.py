"""
Backward-compatibility wrapper for test_retrieval_pipeline.py.
The test suite is located in backend/tests/test_retrieval_pipeline.py.
"""
import runpy
from pathlib import Path

if __name__ == "__main__":
    target = Path(__file__).resolve().parent / "tests" / "test_retrieval_pipeline.py"
    runpy.run_path(str(target), run_name="__main__")
