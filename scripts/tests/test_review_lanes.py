"""Tests for scripts/review-lanes.sh — run with `just test-scripts`."""

import json
import subprocess
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "review-lanes.sh"


def lanes(*paths, as_json=False):
    args = ["bash", str(SCRIPT)] + (["--json"] if as_json else [])
    out = subprocess.run(args, input="\n".join(paths) + "\n", capture_output=True, text=True, check=True).stdout
    return json.loads(out) if as_json else out.split()


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

    def test_files_outside_the_infra_reviewers_scope_do_not_fire_it(self):
        self.assertEqual(lanes("required-checks.json", "scripts/tests/test_merge.py", "scripts/visual-proof-capture.mjs"), [])

    def test_json_lists_every_lane(self):
        self.assertEqual(
            lanes("src-tauri/src/lib.rs", as_json=True),
            {"backend": True, "frontend": False, "arch": True, "sql": False, "infra": False, "security": False, "e2e": False},
        )


if __name__ == "__main__":
    unittest.main()
