#!/usr/bin/env python3
"""Run Banyan's plugin-packaged frontmatter validator."""

from pathlib import Path
import runpy


VALIDATOR_PATH = (
    Path(__file__).resolve().parents[1]
    / "plugin"
    / "skills"
    / "bn-conventions"
    / "scripts"
    / "validate-frontmatter.py"
)


if __name__ == "__main__":
    runpy.run_path(str(VALIDATOR_PATH), run_name="__main__")
