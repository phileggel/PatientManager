"""Tests for scripts/changed-scope.sh — run with `just test-scripts`."""

import subprocess
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "changed-scope.sh"


def scope(*paths, trailing_newline=True):
    stdin = "\n".join(paths) + ("\n" if trailing_newline and paths else "")
    return subprocess.run(["bash", str(SCRIPT)], input=stdin, capture_output=True, text=True, check=True).stdout.strip()


class ChangedScope(unittest.TestCase):
    def test_markdown_docs_and_screenshots_are_docs(self):
        self.assertEqual(scope("README.md", "docs/wireframes/a.html", "screenshots/a.png"), "docs")

    def test_markdown_under_src_is_docs(self):
        self.assertEqual(scope("src/features/README.md"), "docs")

    def test_frontend(self):
        self.assertEqual(scope("src/App.tsx", "e2e/a.test.ts", "package.json"), "frontend")

    def test_backend(self):
        self.assertEqual(scope("src-tauri/src/lib.rs"), "backend")

    def test_both(self):
        self.assertEqual(scope("src/App.tsx", "src-tauri/src/lib.rs"), "both")

    def test_tooling_beside_docs_is_none_not_docs(self):
        self.assertEqual(scope("README.md", ".github/workflows/e2e.yml"), "none")

    def test_nothing_is_none(self):
        self.assertEqual(scope(), "none")

    def test_the_last_line_counts_without_a_trailing_newline(self):
        self.assertEqual(scope("src-tauri/src/lib.rs", trailing_newline=False), "backend")


if __name__ == "__main__":
    unittest.main()
