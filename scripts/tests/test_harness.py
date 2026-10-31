"""What scripts/harness.sh runs with and without --coverage — run with `just test-scripts`.

The harness runs in a scratch repository, with every check it calls replaced by a
stub that logs its arguments.
"""

import json
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REAL = ("harness.sh", "usage-log.sh", "usage_log.py", "changed-scope.sh")
STUBS = ("privacy-check.py", "arch-check.py", "rule-homes.py", "check.py", "coverage-gate.py")
LOG_STUB = 'import os, sys; open(os.environ["CALLS"], "a").write(" ".join([sys.argv[0].split("/")[-1], *sys.argv[1:]]) + "\\n")\n'


class HarnessCoverage(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        base = Path(tmp.name)
        self.repo = base / "repo"
        self.calls = base / "calls.log"
        scripts = self.repo / "scripts"
        (scripts / "tests").mkdir(parents=True)
        for name in REAL:
            shutil.copy(ROOT / "scripts" / name, scripts / name)
        for name in STUBS:
            (scripts / name).write_text(LOG_STUB, encoding="utf-8")
        (scripts / "core-without-tauri.sh").write_text('echo core-without-tauri >> "$CALLS"\n', encoding="utf-8")
        (scripts / "tests" / "test_stub.py").write_text(
            "import unittest\n\nclass T(unittest.TestCase):\n    def test_stub(self):\n        pass\n",
            encoding="utf-8",
        )
        bin_dir = base / "bin"
        bin_dir.mkdir()
        just = bin_dir / "just"
        just.write_text('#!/bin/sh\necho "just $*" >> "$CALLS"\n', encoding="utf-8")
        just.chmod(just.stat().st_mode | stat.S_IEXEC)
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        self.env.update(
            CALLS=str(self.calls),
            PATH=f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
            USAGE_LOG="off",
            NO_COLOR="1",
        )
        self.git("init", "-q", "-b", "main")
        self.git("add", "-A")
        self.git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "base")

    def git(self, *args):
        subprocess.run(["git", *args], cwd=self.repo, env=self.env, check=True, capture_output=True)

    def harness(self, changed, *args):
        path = self.repo / changed
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("changed\n", encoding="utf-8")
        result = subprocess.run(
            ["bash", "scripts/harness.sh", *args], cwd=self.repo, env=self.env, capture_output=True, text=True
        )
        calls = self.calls.read_text(encoding="utf-8").splitlines() if self.calls.exists() else []
        return result, calls

    def test_without_coverage_the_tests_run_plain(self):
        result, calls = self.harness("src/a.ts")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("check.py --frontend", calls)
        self.assertFalse([c for c in calls if "coverage" in c], calls)

    def test_with_coverage_the_measured_tests_replace_them_and_the_floor_holds(self):
        result, calls = self.harness("src/a.ts", "--coverage")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            calls[-3:], ["check.py --frontend --skip-tests", "just coverage-fe", "coverage-gate.py --frontend"]
        )

    def test_backend_keeps_the_core_check_either_way(self):
        _, plain = self.harness("src-tauri/a.rs")
        self.assertIn("core-without-tauri", plain)
        self.assertIn("check.py --backend", plain)
        self.calls.unlink()
        _, measured = self.harness("src-tauri/a.rs", "--coverage")
        self.assertEqual(
            measured[-4:],
            ["check.py --backend --skip-tests", "core-without-tauri", "just coverage-be", "coverage-gate.py --backend"],
        )

    def test_tooling_runs_both_layers(self):
        result, calls = self.harness("justfile", "--coverage")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            calls[-5:],
            ["check.py --skip-tests", "core-without-tauri", "just coverage-fe", "just coverage-be", "coverage-gate.py"],
        )

    def test_docs_measure_nothing(self):
        result, calls = self.harness("docs/a.md", "--coverage")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, ["privacy-check.py", "arch-check.py", "rule-homes.py"])

    def test_an_unknown_argument_is_refused(self):
        result, calls = self.harness("src/a.ts", "--covrage")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(calls, [])


# reviewer-infra FP: the CI lanes run with .claude/daneel.json restored from the base
# branch (review.yml), so the key below looks dropped there; it is committed — see PR #566.
class PushHarness(unittest.TestCase):
    def test_run_entry_measures_coverage_before_the_first_push(self):
        settings = json.loads((ROOT / ".claude" / "daneel.json").read_text(encoding="utf-8"))
        self.assertEqual(settings["run-entry"]["recipes"]["push_harness"], "harness --coverage")


if __name__ == "__main__":
    unittest.main()
