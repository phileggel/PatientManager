"""Tests for .claude/hooks/review-report-required.sh — run with `just test-scripts`."""

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / ".claude/hooks/review-report-required.sh"
WORKFLOW = ROOT / ".github/workflows/review.yml"


def stop(folder, stop_hook_active=False):
    return subprocess.run(
        ["bash", str(HOOK), "reviewer-arch"],
        cwd=folder,
        input=json.dumps({"stop_hook_active": stop_hook_active}),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    ).stdout


class Hook(unittest.TestCase):
    def test_519_a_session_with_no_report_is_sent_back_naming_how_to_save_it(self):
        with tempfile.TemporaryDirectory() as folder:
            answer = json.loads(stop(folder))
        self.assertEqual(answer["decision"], "block")
        self.assertIn("review-path.sh reviewer-arch", answer["reason"])

    def test_519_a_session_with_its_report_stops(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / ".review").mkdir()
            (Path(folder) / ".review/reviewer-arch-2026-11-01-01.md").write_text("report\n", encoding="utf-8")
            self.assertEqual(stop(folder), "")

    def test_519_another_lane_s_report_does_not_count(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / ".review").mkdir()
            (Path(folder) / ".review/reviewer-spec-2026-11-01-01.md").write_text("report\n", encoding="utf-8")
            self.assertEqual(json.loads(stop(folder))["decision"], "block")

    def test_519_a_session_already_sent_back_stops_so_it_cannot_loop(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(stop(folder, stop_hook_active=True), "")


class Directory(unittest.TestCase):
    def test_519_the_report_is_looked_for_in_the_project_not_the_hook_s_directory(self):
        with tempfile.TemporaryDirectory() as project, tempfile.TemporaryDirectory() as elsewhere:
            (Path(project) / ".review").mkdir()
            (Path(project) / ".review/reviewer-arch-2026-11-01-01.md").write_text("report\n", encoding="utf-8")
            answer = subprocess.run(
                ["bash", str(HOOK), "reviewer-arch"],
                cwd=elsewhere,
                env={**os.environ, "CLAUDE_PROJECT_DIR": project},
                input="{}",
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=True,
            ).stdout
        self.assertEqual(answer, "")


class Workflow(unittest.TestCase):
    def test_519_a_reviewer_can_create_its_report_and_the_hook_is_passed(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn('"Write(.review/**)"', text)
        self.assertIn("$CLAUDE_PROJECT_DIR/.claude/hooks/review-report-required.sh ${{ matrix.agent }}", text)


if __name__ == "__main__":
    unittest.main()
