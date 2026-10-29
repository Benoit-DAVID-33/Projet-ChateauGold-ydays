#!/usr/bin/env python
"""Lanceur de tests : execute la suite pytest de backend/tests.

Executer : python backend/run_tests.py
"""

import sys
from pathlib import Path


def main() -> int:
    try:
        import pytest
    except ImportError:
        print("pytest est requis : pip install -r backend/requirements-dev.txt")
        return 1

    tests_dir = Path(__file__).resolve().parent / "tests"
    return pytest.main([str(tests_dir), "-v"])


if __name__ == "__main__":
    sys.exit(main())
