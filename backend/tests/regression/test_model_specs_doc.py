"""La documentation des modeles est generee depuis le catalogue et doit rester a jour."""

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]


def test_specs_markdown_matches_catalog():
    result = subprocess.run(
        [sys.executable, str(BACKEND / "scripts" / "generate_model_specs.py"), "--check"],
        capture_output=True,
        text=True,
        cwd=BACKEND,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
