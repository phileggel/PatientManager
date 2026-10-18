"""Tests on the GitHub workflows' text — run with `just test-scripts`."""

import re
import unittest
from pathlib import Path

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"

# `closed` in a `types:` list, inline (`[opened, closed]`) or as block items (`- closed`).
LISTENS_TO_CLOSED = re.compile(r"types:\s*(\[[^\]]*\bclosed\b|\n(\s*-\s*\w+\s*\n)*\s*-\s*closed\b)")
# The group's key starts with the pull request number, the ref only as its fallback.
KEYED_ON_THE_PULL_REQUEST = re.compile(r"^\s*group:\s*[\w-]*\$\{\{\s*github\.event\.pull_request\.number\s*\|\|", re.MULTILINE)


class ClosedRuns(unittest.TestCase):
    def test_flow_086_a_closed_run_joins_only_its_pull_request_s_group(self):
        """A merged pull request's `closed` run carries the base branch as `github.ref`;
        a group keyed on the ref would cancel `main`'s push runs (FLOW-086)."""
        listening = []
        for workflow in sorted(WORKFLOWS.glob("*.yml")):
            text = workflow.read_text(encoding="utf-8")
            if not LISTENS_TO_CLOSED.search(text):
                continue
            listening.append(workflow.name)
            self.assertRegex(text, KEYED_ON_THE_PULL_REQUEST, workflow.name)
        self.assertTrue(listening, "no workflow listens to closed")

    def test_flow_086_the_patterns_catch_both_list_forms_and_a_wrong_key(self):
        self.assertTrue(LISTENS_TO_CLOSED.search("types: [opened, closed]"))
        self.assertTrue(LISTENS_TO_CLOSED.search("types:\n      - opened\n      - closed\n"))
        self.assertFalse(LISTENS_TO_CLOSED.search("types: [opened, synchronize]"))
        self.assertTrue(KEYED_ON_THE_PULL_REQUEST.search("  group: q-${{ github.event.pull_request.number || github.ref }}"))
        self.assertFalse(KEYED_ON_THE_PULL_REQUEST.search("  group: q-${{ github.ref }}-${{ github.event.pull_request.number }}"))


if __name__ == "__main__":
    unittest.main()
