"""Tests for scripts/arch-check.py — run with `just test-scripts`."""

import importlib.util
import tempfile
import unittest
import unittest.mock
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("arch_check", Path(__file__).resolve().parents[1] / "arch-check.py")
arch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(arch)


class TypedWireErrors(unittest.TestCase):
    def test_a_string_error_is_found_and_a_typed_one_is_not(self):
        self.assertTrue(arch.returns_string_error("pub async fn f() -> Result<Vec<Fund>, String> {"))
        self.assertFalse(arch.returns_string_error("pub async fn f() -> Result<Vec<Fund>, FundError> {"))
        self.assertFalse(arch.returns_string_error("pub async fn f() -> Result<HashMap<String, u32>, FundError> {"))


class Ratchet(unittest.TestCase):
    def test_a_count_above_the_record_fails(self):
        hits = arch.ratchet_counts("A6", "id-less tags", {"a.tsx": 3}, {"a.tsx": 2})
        self.assertEqual(len(hits), 1)
        self.assertIn("allowlist records 2", hits[0])

    def test_a_count_below_the_record_asks_for_a_rewrite(self):
        hits = arch.ratchet_counts("A6", "id-less tags", {"a.tsx": 1}, {"a.tsx": 2})
        self.assertIn("run --write-allowlist", hits[0])

    def test_a_new_file_with_debt_fails_and_a_cleaned_file_asks_for_a_rewrite(self):
        self.assertEqual(len(arch.ratchet_counts("A7", "texts", {"new.tsx": 1}, {})), 1)
        self.assertIn("no texts left", arch.ratchet_counts("A7", "texts", {}, {"old.tsx": 1})[0])

    def test_the_recorded_state_passes(self):
        self.assertEqual(arch.ratchet_counts("A1", "calls", {"a.ts": 2}, {"a.ts": 2}), [])

    def test_a_new_cross_feature_import_fails(self):
        pair = {"from": "src/features/a/x.ts", "to": "@/features/b/y"}
        self.assertEqual(len(arch.ratchet_pairs([pair], [])), 1)
        self.assertEqual(arch.ratchet_pairs([pair], [pair]), [])


class Source(unittest.TestCase):
    def test_comments_and_strings_do_not_count(self):
        self.assertEqual(arch.without_comments("  // commands.getFunds()"), "")
        self.assertNotIn("commands.", arch.without_strings('log("commands.getFunds")'))

    def test_code_only_blanks_comments_and_keeps_lines_and_strings(self):
        src = 'import { a } from "@/features/x/y";\n// import { b } from "@/features/z/w";\n'
        self.assertEqual(arch.IMPORT.findall(arch.code_only(src)), ["@/features/x/y"])
        self.assertEqual(arch.code_only("a\n// b\nc").count("\n"), 2)

    def test_a_url_in_a_string_is_not_a_comment(self):
        tag = '<Button title="See https://example.org" id="fund-list-add" />'
        self.assertEqual(arch.without_comments(tag), tag)
        self.assertEqual(arch.without_comments('x = "a//b"; // note'), 'x = "a//b"; ')
        tags = list(arch.opening_tags(arch.code_only(tag), arch.INTERACTIVE_COMPONENTS))
        self.assertIn('id="fund-list-add"', tags[0][2])

    def test_a_commented_out_cross_context_import_is_not_a_violation(self):
        with tempfile.TemporaryDirectory() as root:
            contexts = Path(root) / "src-tauri" / "src" / "context"
            (contexts / "fund").mkdir(parents=True)
            (contexts / "fund" / "domain.rs").write_text(
                "// use crate::context::bank::domain;\nuse crate::context::bank::api;\n", encoding="utf-8"
            )
            with unittest.mock.patch.object(arch, "ROOT", Path(root)), unittest.mock.patch.object(arch, "CONTEXTS", contexts):
                hits = arch.a3_cross_context()
        self.assertEqual(len(hits), 1)
        self.assertIn("domain.rs:2", hits[0])

    def test_a_cfg_test_module_is_not_production(self):
        rust = "use crate::context::fund;\n#[cfg(test)]\nmod tests {\n    use crate::context::bank;\n}\n"
        self.assertEqual([n for n, _ in arch.production_lines(rust)], [1])


if __name__ == "__main__":
    unittest.main()
