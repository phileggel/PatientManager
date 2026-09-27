"""Tests for scripts/coverage-strip-tests.py — run with `just test-scripts`."""

import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "coverage_strip_tests", Path(__file__).resolve().parents[1] / "coverage-strip-tests.py"
)
strip_tests = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(strip_tests)

SOURCE = """\
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds() {
        assert_eq!(add(1, 2), 3);
    }
}

pub fn after() -> &'static str {
    "}"
}
"""


class StripInlineTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.source = self.root / "lib.rs"
        self.source.write_text(SOURCE, encoding="utf-8")

    def report(self, lines):
        body = [f"SF:{self.source}"]
        body += [f"DA:{n},1" for n in lines]
        body += [f"LF:{len(lines)}", f"LH:{len(lines)}", "end_of_record"]
        path = self.root / "lcov.info"
        path.write_text("\n".join(body) + "\n", encoding="utf-8")
        return path

    def test_lines_inside_a_cfg_test_module_are_dropped_and_totals_recomputed(self):
        report = self.report([1, 2, 10, 11, 15, 16])
        trimmed, dropped = strip_tests.strip(report)
        text = report.read_text(encoding="utf-8")
        self.assertEqual((trimmed, dropped), (1, 2))
        self.assertNotIn("DA:10,", text)
        self.assertNotIn("DA:11,", text)
        self.assertIn("DA:15,1", text)  # code after the test module stays, despite the "}" literal
        self.assertIn("LF:4", text)

    def test_char_literals_with_braces_or_escaped_quotes_do_not_shift_the_range(self):
        self.source.write_text(
            "#[cfg(test)]\nmod tests {\n    const Q: char = '\\'';\n    const B: char = '}';\n}\n\npub fn kept() {}\n",
            encoding="utf-8",
        )
        self.assertEqual(strip_tests.test_module_ranges(self.source), [(1, 5)])

    def test_recomputed_totals_stay_where_they_were(self):
        path = self.root / "lcov.info"
        path.write_text(
            f"SF:{self.source}\nFN:1,add\nFNDA:1,add\nFNF:1\nFNH:1\nDA:1,1\nDA:10,1\nLF:2\nLH:2\nend_of_record\n",
            encoding="utf-8",
        )
        strip_tests.strip(path)
        self.assertEqual(
            path.read_text(encoding="utf-8").splitlines()[1:],
            ["FN:1,add", "FNDA:1,add", "FNF:1", "FNH:1", "DA:1,1", "LF:1", "LH:1", "end_of_record"],
        )

    def test_a_file_without_tests_is_left_as_it_was(self):
        self.source.write_text("pub fn one() -> i32 {\n    1\n}\n", encoding="utf-8")
        report = self.report([1, 2])
        before = report.read_text(encoding="utf-8")
        strip_tests.strip(report)
        self.assertEqual(report.read_text(encoding="utf-8"), before)


if __name__ == "__main__":
    unittest.main()
