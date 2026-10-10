"""Tests for scripts/rule-homes.py — run with `just test-scripts`."""

import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("rule_homes", Path(__file__).resolve().parents[1] / "rule-homes.py")
homes = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(homes)


class Definitions(unittest.TestCase):
    def test_every_definition_format_is_found(self):
        text = "\n".join([
            "**B7** — factories",
            "## E1 — selectors",
            "**BAS-010 (R1) — Title**: text",
            "**BAS-113A — Sub-rule**",
            "# TODO-003 — An entry",
            "# 2026-07-29 — DEBT-008 — An observation",
            "### TL-001 — A lesson",
            "# FLOW-004 — A flow entry",
        ])
        self.assertEqual(
            homes.defined_ids(text),
            ["B7", "E1", "BAS-010", "BAS-113A", "TODO-003", "DEBT-008", "TL-001", "FLOW-004"],
        )

    def test_a_mention_is_not_a_definition(self):
        self.assertEqual(homes.defined_ids("See **B7** — and BAS-010 in the spec.\n- **F29** — restated"), [])

    def test_an_id_defined_in_two_documents_is_reported_with_both(self):
        found = {"docs/backend-rules.md": ["B44"], "CLAUDE.md": ["B44"], "docs/e2e-rules.md": ["E1"]}
        self.assertEqual(homes.duplicates(found), {"B44": ["CLAUDE.md", "docs/backend-rules.md"]})


class EntryFiles(unittest.TestCase):
    """A todo, debt or flow entry is one file, named by the one ID it defines."""

    def test_an_entry_named_after_its_id_in_its_folder_passes(self):
        found = {"docs/work/debt/DEBT-008.md": ["DEBT-008"], "docs/work/audits.md": [], "docs/lessons.md": ["TL-001", "TL-002"]}
        self.assertEqual(homes.misnamed(found), [])

    def test_a_name_that_disagrees_with_the_heading_is_reported(self):
        found = {"docs/work/debt/DEBT-008.md": ["DEBT-009"], "docs/work/flow/FLOW-001.md": [], "docs/work/todo/TODO-002.md": ["TODO-002", "TODO-003"]}
        self.assertEqual(
            homes.misnamed(found),
            [
                "docs/work/debt/DEBT-008.md: defines DEBT-009, not the one ID DEBT-008 it is named after",
                "docs/work/flow/FLOW-001.md: defines no ID, not the one ID FLOW-001 it is named after",
                "docs/work/todo/TODO-002.md: defines TODO-002, TODO-003, not the one ID TODO-002 it is named after",
            ],
        )

    def test_a_file_of_another_kind_or_another_name_is_reported(self):
        found = {"docs/work/todo/DEBT-008.md": ["DEBT-008"], "docs/work/flow/notes.md": [], "docs/work/debt/DEBT-8.md": []}
        self.assertEqual(
            homes.misnamed(found),
            [
                "docs/work/debt/DEBT-8.md: an entry of debt/ is named DEBT-NNN.md",
                "docs/work/flow/notes.md: an entry of flow/ is named FLOW-NNN.md",
                "docs/work/todo/DEBT-008.md: an entry of todo/ is named TODO-NNN.md",
            ],
        )


class DocMap(unittest.TestCase):
    MAP = "\n".join([
        "- **Domain** — `spec/`, `ubiquitous-language.md`:",
        "  business rules.",
        "- **Rules** — `backend-rules.md` (B), `commit-rules.md`: how code is written.",
        "- **Index** — `../CLAUDE.md`: pointers.",
        "",
        "Prose mentioning `lessons.md` is not a location.",
    ])

    def test_locations_are_read_as_repository_paths(self):
        self.assertEqual(
            homes.kinds(self.MAP),
            {
                "Domain": ["docs/spec/", "docs/ubiquitous-language.md"],
                "Rules": ["docs/backend-rules.md", "docs/commit-rules.md"],
                "Index": ["CLAUDE.md"],
            },
        )

    def test_a_file_outside_every_location_is_unmapped(self):
        locations = ["docs/spec/", "CLAUDE.md"]
        files = ["docs/spec/theme.md", "CLAUDE.md", "docs/stray.md", "docs/README.md"]
        self.assertEqual(homes.unmapped(files, locations), ["docs/stray.md"])

    def test_a_rules_doc_outside_the_rules_kind_is_misfiled(self):
        found = {"Rules": ["docs/backend-rules.md", "docs/lessons.md"]}
        files = ["docs/backend-rules.md", "docs/lessons.md", "docs/i18n-rules.md"]
        self.assertEqual(
            homes.misfiled(found, files),
            [
                "docs/i18n-rules.md: a *-rules.md not listed under Rules",
                "docs/lessons.md: listed under Rules but not a *-rules.md",
            ],
        )


if __name__ == "__main__":
    unittest.main()
