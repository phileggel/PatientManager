#!/usr/bin/env python3
"""Print the section of CHANGELOG.md for one version: the notes of its release.

Use:  python3 scripts/release-notes.py v0.24.0     (the tag, or the bare version)
Exit: 0 the section is printed · 3 the changelog has no section for that version

The release workflow puts the result in the release's notes, so the page says what
changed instead of one generic line (FLOW-018). It runs in CI only, so it takes
nothing from `scripts/` and writes no usage log.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def section(changelog: str, version: str) -> str | None:
    """The text under `## [X.Y.Z]`, up to the next version heading; None when absent."""
    version = version.removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        return None
    heading = re.search(rf"^## \[{re.escape(version)}\].*$", changelog, re.MULTILINE)
    if not heading:
        return None
    following = re.compile(r"^## \[", re.MULTILINE).search(changelog, heading.end())
    return changelog[heading.end() : following.start() if following else len(changelog)].strip()


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: release-notes.py <tag or version>", file=sys.stderr)
        return 2
    found = section((ROOT / "CHANGELOG.md").read_text(encoding="utf-8"), argv[0])
    if not found:
        print(f"CHANGELOG.md has no section for {argv[0]}", file=sys.stderr)
        return 3
    print(found)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
