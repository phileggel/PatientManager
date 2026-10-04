"""Tests for scripts/review-lanes.sh — run with `just test-scripts`."""

import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "review-lanes.sh"


def lanes(*paths, as_json=False):
    args = ["bash", str(SCRIPT)] + (["--json"] if as_json else [])
    out = subprocess.run(args, input="\n".join(paths) + "\n", capture_output=True, text=True, check=True).stdout
    return json.loads(out) if as_json else out.split()


class RunFromACopy(unittest.TestCase):
    """CI runs the base branch's lane map from a temp folder (review.yml): it must hold all the script needs."""

    def test_the_lane_map_runs_from_the_files_the_review_workflow_copies(self):
        workflow = (SCRIPT.parents[1] / ".github" / "workflows" / "review.yml").read_text(encoding="utf-8")
        copied = re.search(r"for file in ([\w. -]+); do", workflow)
        self.assertIsNotNone(copied, "review.yml no longer lists the files it copies beside the lane map")
        with tempfile.TemporaryDirectory() as folder:
            for name in copied.group(1).split():
                shutil.copy(SCRIPT.parent / name, Path(folder) / name)
            result = subprocess.run(
                ["bash", str(Path(folder) / "review-lanes.sh"), "--json"],
                input="justfile\n", capture_output=True, text=True, env=os.environ | {"USAGE_LOG": "off"},
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "", "a file the lane map needs is not in the list review.yml copies")
        self.assertTrue(json.loads(result.stdout)["infra"])


class TrustedHelpers(unittest.TestCase):
    """The reviewer session runs helpers taken from the base branch (review.yml): so must be what they source."""

    def test_every_file_a_trusted_helper_sources_is_taken_from_the_base_branch_too(self):
        workflow = (SCRIPT.parents[1] / ".github" / "workflows" / "review.yml").read_text(encoding="utf-8")
        trusted = re.search(r'git checkout "origin/\$BASE" -- ([^\n]+)', workflow)
        self.assertIsNotNone(trusted, "review.yml no longer takes its helpers from the base branch")
        paths = trusted.group(1).split()
        for path in paths:
            if path.endswith(".sh") and "usage-log.sh" in (SCRIPT.parents[1] / path).read_text(encoding="utf-8"):
                self.assertIn("scripts/usage-log.sh", paths, f"{path} sources it")
                self.assertIn("scripts/usage_log.py", paths, "usage-log.sh runs it")


class ReviewLanes(unittest.TestCase):
    def test_docs_only_needs_no_reviewer(self):
        self.assertEqual(lanes("README.md", "docs/workflow.md", "screenshots/a.png"), [])

    def test_rust_gets_backend_and_arch(self):
        self.assertEqual(lanes("src-tauri/src/context/patient/domain.rs"), ["backend", "arch"])

    def test_typescript_gets_frontend_and_arch_but_e2e_tests_only_e2e(self):
        self.assertEqual(lanes("src/features/patient/gateway.ts"), ["frontend", "arch"])
        self.assertEqual(lanes("e2e/patient/patient.test.ts"), ["e2e"])

    def test_a_command_is_a_security_surface(self):
        self.assertEqual(lanes("src-tauri/src/context/patient/api.rs"), ["backend", "arch", "security"])

    def test_a_capability_is_infra_and_security(self):
        self.assertEqual(lanes("src-tauri/capabilities/default.json"), ["infra", "security"])

    def test_a_migration_is_sql_only(self):
        self.assertEqual(lanes("src-tauri/migrations/20260927_x.sql"), ["sql"])

    def test_tooling_is_infra(self):
        self.assertEqual(lanes(".github/workflows/e2e.yml", "justfile", "scripts/harness.sh"), ["infra"])

    def test_the_merge_gate_list_is_infra(self):
        self.assertEqual(lanes("required-checks.json"), ["infra"])

    def test_agent_and_skill_prompts_and_the_settings_are_infra(self):
        self.assertEqual(lanes(".claude/agents/reviewer-sql.md"), ["infra"])
        self.assertEqual(lanes(".claude/skills/next-todo/SKILL.md"), ["infra"])
        self.assertEqual(lanes(".claude/settings.json"), ["infra"])
        self.assertEqual(lanes(".claude/agents/sub/reviewer-infra.md"), [])  # flat only

    def test_the_coverage_floors_and_path_rules_are_infra(self):
        self.assertEqual(lanes("coverage-gates.json"), ["infra"])
        self.assertEqual(lanes(".claude/rules/backend.md"), ["infra"])

    def test_the_frozen_architecture_debt_is_infra(self):
        self.assertEqual(lanes("arch-allowlist.json"), ["infra"])

    def test_files_outside_the_infra_reviewers_scope_do_not_fire_it(self):
        self.assertEqual(lanes("scripts/tests/test_merge.py", "scripts/visual-proof-capture.mjs"), [])

    def test_json_lists_every_lane(self):
        self.assertEqual(
            lanes("src-tauri/src/lib.rs", as_json=True),
            {"backend": True, "frontend": False, "arch": True, "sql": False, "infra": False, "security": False, "e2e": False},
        )


if __name__ == "__main__":
    unittest.main()
