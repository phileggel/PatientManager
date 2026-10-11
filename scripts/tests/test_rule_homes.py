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


class RequiredLines(unittest.TestCase):
    """FLOW-048: an entry carries the lines of its kind, its size among them."""

    DEBT = "# 2026-10-11 — DEBT-056 — A\n\n**Found by:** x\n\n**Where:** `src/`\n\n**Observation:** y\n\n**Size:** S\n\n**Waits on the owner:** no\n"
    FLOW = "# FLOW-049 — A\n\n- Kind: quality\n- Size: M\n- Observed: x\n"
    TODO = "# TODO-024 — A\n\n**Size:** L — why\n\n**User value:** x\n\n**Done when:** y\n\n**Design:** none\n\n**Open questions:** none\n"

    def test_flow_048_a_complete_entry_of_each_kind_passes(self):
        texts = {"docs/work/debt/DEBT-056.md": self.DEBT, "docs/work/flow/FLOW-049.md": self.FLOW, "docs/work/todo/TODO-024.md": self.TODO}
        self.assertEqual(homes.incomplete(texts), [])

    def test_flow_048_a_missing_line_is_named(self):
        texts = {"docs/work/debt/DEBT-056.md": self.DEBT.replace("**Waits on the owner:** no\n", "")}
        self.assertEqual(homes.incomplete(texts), ["docs/work/debt/DEBT-056.md: lacks `**Waits on the owner:**`"])

    def test_flow_048_a_size_is_one_of_the_four(self):
        texts = {
            "docs/work/flow/FLOW-049.md": self.FLOW.replace("- Size: M", "- Size: big"),
            "docs/work/todo/TODO-024.md": self.TODO.replace("**Size:** L — why", "**Size:**"),
        }
        self.assertEqual(
            homes.incomplete(texts),
            [
                "docs/work/flow/FLOW-049.md: its size is not S, M, L or XL",
                "docs/work/todo/TODO-024.md: its size is not S, M, L or XL",
            ],
        )

    def test_flow_048_a_document_that_is_not_an_entry_owes_nothing(self):
        self.assertEqual(homes.incomplete({"docs/work/audits.md": "# Audits\n", "docs/workflow.md": ""}), [])

    def test_flow_048_every_entry_of_this_repository_is_complete(self):
        texts = {f: (homes.ROOT / f).read_text(encoding="utf-8") for f in homes.tracked("docs/work")}
        self.assertEqual(homes.incomplete(texts), [])


class GuideCeilings(unittest.TestCase):
    """FLOW-044: a guide may shrink, never grow past its ceiling; a new prompt stays short."""

    def test_flow_044_the_guides_are_the_documents_and_prompts_the_agent_works_from(self):
        files = [
            "CLAUDE.md", "docs/workflow.md", "docs/backend-rules.md", "docs/agentic-setup.md",
            ".claude/skills/run-entry/SKILL.md", ".claude/skills/run-entry/template.md",
            ".claude/agents/reviewer-infra.md", ".claude/rules/backend.md",
            "docs/spec/patient.md", "docs/README.md", "README.md",
        ]
        self.assertEqual(
            homes.guides(files),
            [".claude/agents/reviewer-infra.md", ".claude/rules/backend.md", ".claude/skills/run-entry/SKILL.md",
             "CLAUDE.md", "docs/agentic-setup.md", "docs/backend-rules.md", "docs/workflow.md"],
        )

    def test_flow_044_a_guide_at_or_under_its_ceiling_passes(self):
        self.assertEqual(homes.ceiling_problems({"CLAUDE.md": 90, "docs/workflow.md": 400}, {"CLAUDE.md": 90, "docs/workflow.md": 450}), [])

    def test_flow_044_a_guide_past_its_ceiling_is_reported_with_both_figures(self):
        self.assertEqual(
            homes.ceiling_problems({"CLAUDE.md": 93}, {"CLAUDE.md": 90}),
            ["CLAUDE.md: 93 lines, over its ceiling of 90 — cut it; raising a ceiling in guide-ceilings.json is the owner's decision"],
        )

    def test_flow_044_a_new_skill_or_agent_prompt_holds_at_most_120_lines(self):
        lengths = {".claude/skills/file-entry/SKILL.md": 120, ".claude/agents/reviewer-guides.md": 121}
        self.assertEqual(
            homes.ceiling_problems(lengths, {}),
            [".claude/agents/reviewer-guides.md: 121 lines, over the 120 a new skill or agent prompt may hold — cut it; a higher ceiling in guide-ceilings.json is the owner's decision"],
        )

    def test_flow_044_any_other_new_guide_must_have_its_ceiling_recorded(self):
        self.assertEqual(
            homes.ceiling_problems({"docs/sql-rules.md": 40}, {}),
            ["docs/sql-rules.md: no ceiling — record its length with `python3 scripts/rule-homes.py --lower-ceilings`"],
        )

    def test_flow_044_a_ceiling_whose_guide_is_gone_is_reported(self):
        self.assertEqual(
            homes.ceiling_problems({}, {"docs/old-rules.md": 40}),
            ["docs/old-rules.md: a ceiling in guide-ceilings.json for a guide that is gone"],
        )

    def test_flow_044_lowering_follows_a_guide_that_shrank_and_never_raises(self):
        lengths = {"CLAUDE.md": 80, "docs/workflow.md": 460, "docs/sql-rules.md": 40, ".claude/skills/file-entry/SKILL.md": 26}
        ceilings = {"CLAUDE.md": 90, "docs/workflow.md": 450, "docs/old-rules.md": 12}
        self.assertEqual(
            homes.lowered(lengths, ceilings),
            {"CLAUDE.md": 80, "docs/sql-rules.md": 40, "docs/workflow.md": 450},
        )

    def test_flow_044_this_repository_s_guides_are_within_their_ceilings(self):
        lengths = homes.guide_lengths(homes.guides(homes.tracked("*.md")))
        self.assertEqual(homes.ceiling_problems(lengths, homes.read_ceilings()), [])


class AgenticSetup(unittest.TestCase):
    """FLOW-036: every script, skill, agent prompt and hook has its line in the setup document."""

    SETUP = "\n".join([
        "## Generic",
        "- `scripts/merge.py` — merges a green branch. Never: merges a red one.",
        "- `.claude/skills/run-entry/` — runs one entry.",
        "  It names `scripts/harness.sh` in its prose: not a listed piece.",
        "- `docs/workflow.md` — how work moves.",
        "## This project",
        "- `.githooks/pre-push` — the fast checks.",
    ])

    def test_flow_036_a_piece_is_listed_where_its_path_opens_a_list_item(self):
        self.assertEqual(
            homes.listed_pieces(self.SETUP),
            ["scripts/merge.py", ".claude/skills/run-entry/", "docs/workflow.md", ".githooks/pre-push"],
        )

    def test_flow_036_the_pieces_are_the_scripts_skills_agent_prompts_and_hooks(self):
        files = [
            "scripts/merge.py", "scripts/tests/test_merge.py", "scripts/usage-log.sh",
            ".claude/skills/run-entry/SKILL.md", ".claude/skills/run-entry/template.md",
            ".claude/agents/reviewer-infra.md", ".claude/rules/backend.md", ".claude/settings.json",
            ".githooks/pre-push", ".githooks/README.md", "docs/workflow.md", "src/main.ts",
        ]
        self.assertEqual(
            homes.setup_pieces(files),
            [".claude/agents/reviewer-infra.md", ".claude/skills/run-entry/", ".githooks/pre-push",
             "scripts/merge.py", "scripts/usage-log.sh"],
        )

    def test_flow_036_a_piece_that_exists_without_a_line_is_reported(self):
        pieces = ["scripts/merge.py", "scripts/new-tool.py"]
        self.assertEqual(
            homes.setup_problems(pieces, ["scripts/merge.py"], exists=lambda path: True),
            ["scripts/new-tool.py: exists but has no line in docs/agentic-setup.md"],
        )

    def test_flow_036_a_line_whose_piece_is_gone_is_reported(self):
        listed = ["scripts/merge.py", "scripts/gone.py", "docs/workflow.md"]
        self.assertEqual(
            homes.setup_problems(["scripts/merge.py"], listed, exists=lambda path: path != "scripts/gone.py"),
            ["scripts/gone.py: listed in docs/agentic-setup.md but missing"],
        )

    def test_flow_036_a_piece_listed_twice_is_reported(self):
        listed = ["scripts/merge.py", "scripts/merge.py"]
        self.assertEqual(
            homes.setup_problems(["scripts/merge.py"], listed, exists=lambda path: True),
            ["scripts/merge.py: listed twice in docs/agentic-setup.md"],
        )

    def test_flow_036_this_repository_lists_every_piece_it_holds(self):
        text = (homes.ROOT / homes.SETUP).read_text(encoding="utf-8")
        pieces = homes.setup_pieces(homes.tracked("scripts", ".claude", ".githooks"))
        self.assertEqual(
            homes.setup_problems(pieces, homes.listed_pieces(text), exists=lambda path: (homes.ROOT / path).exists()),
            [],
        )


if __name__ == "__main__":
    unittest.main()
