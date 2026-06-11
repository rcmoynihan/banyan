#!/usr/bin/env python3
"""Validate docs/solutions frontmatter for parser-safety issues.

Usage:
    python3 validate-frontmatter.py <doc-path-or-dir>

Exit codes:
    0: frontmatter passes all checks.
    1: validation failure, with diagnostics on stderr.
    2: usage error, such as a missing argument or missing path.
"""

from pathlib import Path
import re
import sys
from typing import NoReturn


EXIT_VALIDATION_FAILURE = 1
EXIT_USAGE_ERROR = 2
FRONTMATTER_DELIMITER = "---"
SPACE_HASH_PATTERN = re.compile(r"\s#")
COLON_SPACE_PATTERN = re.compile(r":\s")
INDENT_PREFIXES = (" ", "\t")
QUOTED_OR_STRUCTURED_PREFIXES = ('"', "'", "[", "{", "|", ">")


def usage_fail(message: str) -> NoReturn:
    """Exit with a usage diagnostic.

    Args:
        message: Diagnostic text to print after the command name.
    """
    sys.stderr.write(f"validate-frontmatter: {message}\n")
    sys.exit(EXIT_USAGE_ERROR)


def validate_file(doc_path: Path) -> int:
    """Validate one markdown file's YAML frontmatter parser safety.

    Args:
        doc_path: Markdown file to validate.

    Returns:
        Process-style status code: 0 for pass, 1 for validation failure.
    """
    text = doc_path.read_text(encoding="utf-8")
    issues: list[str] = []

    lines = text.split("\n")
    if not lines or lines[0].rstrip() != FRONTMATTER_DELIMITER:
        sys.stderr.write(
            f"FAIL: {doc_path}\n"
            "  file does not start with '---' frontmatter delimiter line\n"
        )
        return EXIT_VALIDATION_FAILURE

    end_idx: int | None = None
    for index in range(1, len(lines)):
        if lines[index].rstrip() == FRONTMATTER_DELIMITER:
            end_idx = index
            break

    if end_idx is None:
        sys.stderr.write(
            f"FAIL: {doc_path}\n"
            "  frontmatter not closed (no '---' line after the opening delimiter)\n"
        )
        return EXIT_VALIDATION_FAILURE

    frontmatter_text = "\n".join(lines[1:end_idx])
    for lineno, line in enumerate(frontmatter_text.split("\n"), start=2):
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#") or ":" not in line:
            continue
        if line.startswith(INDENT_PREFIXES) or stripped.startswith("- "):
            continue

        key, _separator, value = line.partition(":")
        stripped_value = value.strip()
        if not stripped_value:
            continue
        if stripped_value[0] in QUOTED_OR_STRUCTURED_PREFIXES:
            continue

        if SPACE_HASH_PATTERN.search(stripped_value):
            issues.append(
                f"line {lineno}: '{key.strip()}' value contains ' #' -- quote it. "
                "YAML treats space-then-# as a comment delimiter and silently "
                "drops the rest of the value."
            )
        if COLON_SPACE_PATTERN.search(stripped_value):
            issues.append(
                f"line {lineno}: '{key.strip()}' value contains ': ' -- quote it. "
                "Strict YAML parsers may treat this as a nested mapping."
            )

    if issues:
        sys.stderr.write(f"FAIL: {doc_path}\n")
        for issue in issues:
            sys.stderr.write(f"  {issue}\n")
        return EXIT_VALIDATION_FAILURE

    sys.stdout.write(f"OK: {doc_path}\n")
    return 0


def iter_markdown_files(target: Path) -> list[Path]:
    """Return markdown files under a target directory in deterministic order.

    Args:
        target: Directory to scan recursively.

    Returns:
        Sorted markdown file paths.
    """
    return sorted(path for path in target.rglob("*.md") if path.is_file())


def main(argv: list[str]) -> int:
    """Run the frontmatter validator CLI.

    Args:
        argv: Command-line argument vector.

    Returns:
        Process exit code.
    """
    if len(argv) != 2:
        usage_fail(f"usage: {Path(argv[0]).name} <doc-path-or-dir>")

    target = Path(argv[1])
    if target.is_file():
        return validate_file(target)

    if target.is_dir():
        markdown_files = iter_markdown_files(target)
        if not markdown_files:
            usage_fail(f"no .md files found under directory: {target}")

        worst_status = 0
        for path in markdown_files:
            status = validate_file(path)
            if status != 0:
                worst_status = EXIT_VALIDATION_FAILURE
        return worst_status

    usage_fail(f"file not found: {target}")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
