#!/usr/bin/env python3
"""Print how many critical findings a reviewer's report holds.

Use: python3 scripts/review-criticals.py <report.md>

`review.yml` fails the lane's check on anything but 0. A report may cover several
documents, each closing with its own "Review complete: N critical" or opening with a
"🔴 N critical" headline, so the count is the sum of every such line; a report holding
both forms may count a finding twice, which is still red. A report saying neither nor
"No issues found" counts as 1: a silent green would be worse than a re-run.

It runs in CI only, beside a token, so it imports nothing from `scripts/`, and the
workflow takes it from the base branch.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


def criticals(report: str) -> int:
    counts = re.findall(r"(?:Review complete: |🔴 )(\d+) critical", report)
    if counts:
        return sum(int(count) for count in counts)
    return 0 if "No issues found" in report else 1


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: review-criticals.py <report.md>", file=sys.stderr)
        return 2
    print(criticals(Path(argv[1]).read_text(encoding="utf-8")))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
