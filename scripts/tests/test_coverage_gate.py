"""Tests for scripts/coverage-gate.py — run with `just test-scripts`."""

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("coverage_gate", Path(__file__).resolve().parents[1] / "coverage-gate.py")
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


def record(path, found, hit):
    return f"SF:{path}\nLF:{found}\nLH:{hit}\nend_of_record\n"


class CoverageGate(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.lcov = Path(folder.name) / "lcov.info"
        self.lcov.write_text(
            record("/home/ci/work/src-tauri/src/context/fund/domain.rs", 100, 90)
            + record("/home/ci/work/src-tauri/src/context/fund/api.rs", 50, 0)
            + record("/home/ci/work/src-tauri/src/lib.rs", 40, 0),
            encoding="utf-8",
        )

    def check(self, floor):
        spec = {
            "lcov": str(self.lcov),
            "include": ["src-tauri/src/context/*/domain*", "src-tauri/src/context/*/api.rs"],
            "exclude": ["*/api.rs"],
            "lines": floor,
        }
        with contextlib.redirect_stdout(io.StringIO()) as out:
            ok = gate.check_layer("backend", spec)
        return ok, out.getvalue()

    def test_only_included_logic_counts(self):
        ok, out = self.check(90.0)
        self.assertTrue(ok)
        self.assertIn("90.00% of 100 logic lines", out)

    def test_a_layer_under_its_floor_fails_and_names_the_worst_files(self):
        ok, out = self.check(90.5)
        self.assertFalse(ok)
        self.assertIn("src-tauri/src/context/fund/domain.rs", out)

    def test_a_missing_report_fails(self):
        self.lcov.unlink()
        ok, out = self.check(10.0)
        self.assertFalse(ok)
        self.assertIn("no report", out)

    def test_absolute_and_relative_paths_map_to_the_repo(self):
        self.assertEqual(gate.relative_path("/x/y/src-tauri/src/lib.rs"), "src-tauri/src/lib.rs")
        self.assertEqual(gate.relative_path("src/features/a.ts"), "src/features/a.ts")


if __name__ == "__main__":
    unittest.main()
