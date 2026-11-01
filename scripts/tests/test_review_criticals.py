"""Tests for scripts/review-criticals.py — run with `just test-scripts`."""

import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "review_criticals", Path(__file__).resolve().parents[1] / "review-criticals.py"
)
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)

WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/review.yml"


class Criticals(unittest.TestCase):
    def test_574_a_later_document_critical_counts(self):
        # PR #609: a report of three contracts, read as 0 by the first count alone.
        report = (
            "## contract — a\nReview complete: 0 critical, 0 warning(s).\n"
            "## contract — b\nReview complete: 1 critical, 0 warning(s).\n"
            "## contract — c\nReview complete: 0 critical, 0 warning(s).\n"
        )
        self.assertEqual(review.criticals(report), 1)

    def test_574_the_counts_add_up(self):
        report = "Review complete: 2 critical.\nReview complete: 1 critical.\n"
        self.assertEqual(review.criticals(report), 3)

    def test_574_a_document_with_only_a_headline_counts_beside_closing_lines(self):
        report = "Review complete: 0 critical.\n🔴 1 critical, 0 warning(s)\n"
        self.assertEqual(review.criticals(report), 1)

    def test_574_a_lane_headline_counts(self):
        self.assertEqual(review.criticals("🔴 2 critical, 1 warning(s) across 3 file(s).\n"), 2)

    def test_574_a_clean_report_is_zero(self):
        self.assertEqual(review.criticals("## reviewer-backend\n\n✅ No issues found.\n"), 0)
        self.assertEqual(review.criticals("Review complete: 0 critical, 1 warning(s).\n"), 0)

    def test_574_a_headline_of_warnings_or_suggestions_only_is_zero(self):
        # The protocol's headline leaves out a severity it has none of (PR #615).
        self.assertEqual(review.criticals("🟡 1 warning across 1 file.\n"), 0)
        self.assertEqual(review.criticals("🔵 1 suggestion across 1 file(s).\n"), 0)
        self.assertEqual(review.criticals("🟡 2 warning(s), 🔵 1 suggestion across 1 file.\n"), 0)

    def test_574_a_lane_s_free_wording_of_nothing_found_is_zero(self):
        # Wordings of real reports: PR #613, PR #603.
        self.assertEqual(review.criticals("# reviewer-infra\n\nNo findings. A release.\n"), 0)
        self.assertEqual(review.criticals("## Findings\n\nNone.\n"), 0)

    def test_574_a_listed_critical_with_no_count_fails_beside_a_clean_wording(self):
        section = "### 🔴 Critical\n- a finding\n\n🟡 2 warning(s) across 1 file.\n"
        self.assertEqual(review.criticals(section), 1)
        self.assertEqual(review.criticals("No findings in a.\n- 🔴 b: a finding\n"), 1)

    def test_574_an_empty_critical_section_is_zero(self):
        self.assertEqual(review.criticals("### 🔴 Critical\n✅ None.\n🟡 1 warning\n"), 0)

    def test_574_a_report_with_no_count_fails(self):
        self.assertEqual(review.criticals("## reviewer-x\n\n### 🔴 Critical\n- a finding\n"), 1)
        self.assertEqual(review.criticals(""), 1)


class Workflow(unittest.TestCase):
    def test_574_the_workflow_takes_the_script_from_the_base_branch(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn('git checkout "origin/$BASE" -- "$helper"', text)
        self.assertIn("scripts/review-criticals.py", text)

    def test_574_the_helpers_run_isolated_from_the_pull_request_s_scripts(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("python3 -I scripts/review-stop-reason.py", text)
        self.assertIn('criticals=$(python3 -I scripts/review-criticals.py "$report")', text)


if __name__ == "__main__":
    unittest.main()
