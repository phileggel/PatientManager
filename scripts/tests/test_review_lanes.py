"""Tests for scripts/review-lanes.sh — run with `just test-scripts`."""

import json
import re
import subprocess
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "review-lanes.sh"


def lanes(*paths, as_json=False):
    args = ["bash", str(SCRIPT)] + (["--json"] if as_json else [])
    out = subprocess.run(args, input="\n".join(paths) + "\n", capture_output=True, text=True, check=True).stdout
    return json.loads(out) if as_json else out.split()


class ReviewWorkflow(unittest.TestCase):
    """review.yml: what grades a pull request comes from the pinned release and the base branch, never from it."""

    def test_the_reviewers_and_their_helpers_come_from_the_pinned_daneel_release(self):
        workflow = (SCRIPT.parents[1] / ".github" / "workflows" / "review.yml").read_text(encoding="utf-8")
        self.assertRegex(workflow, r"DANEEL_REF: app--v\d+\.\d+\.\d+\n")
        self.assertEqual(workflow.count("ref: ${{ env.DANEEL_REF }}"), 2, "the lanes job and the review job")
        self.assertIn("Read `.daneel/plugins/app/agents/${{ matrix.agent }}.md`", workflow)
        self.assertNotRegex(workflow, r"\bbash scripts/(branch|review-path|review-lanes)\.sh", "a helper the pull request can edit")
        self.assertIn('git show "origin/$BASE:.claude/daneel.json" > .claude/daneel.json', workflow, "a pull request could switch its lanes off")
        self.assertIn('.claude/daneel.json .claude/agents; do', workflow, "a pull request could change the rules its lanes read")
        self.assertIn('echo ".daneel/" >> .git/info/exclude', workflow, "branch.sh would list the release as changed files")

    def test_every_lane_of_the_plugin_has_its_job_and_its_required_check(self):
        root = SCRIPT.parents[1]
        workflow = (root / ".github" / "workflows" / "review.yml").read_text(encoding="utf-8")
        jobs = re.findall(r"- \{ reviewer: (\w+), agent: ([\w-]+) \}", workflow)
        self.assertEqual(
            {reviewer for reviewer, _ in jobs},
            {"backend", "frontend", "arch", "sql", "infra", "security", "e2e", "spec", "contract", "adr", "guides"},
        )
        required = json.loads((root / "required-checks.json").read_text(encoding="utf-8"))["checks"]
        for reviewer, agent in jobs:
            self.assertIn(f"reviewer-{reviewer}", required)
            self.assertIn(agent, (f"reviewer-{reviewer}", f"{reviewer}-reviewer"))

    def test_a_critical_fails_the_check_in_either_report_shape(self):
        """The lanes open on `🔴 N critical`; the spec, contract and ADR reviewers close on
        `Review complete: N critical`. A report the count misses would pass with its criticals."""
        workflow = (SCRIPT.parents[1] / ".github" / "workflows" / "review.yml").read_text(encoding="utf-8")
        pattern = re.search(r"grep -Eo '([^']+critical)' \"\$report\"", workflow)
        self.assertIsNotNone(pattern, "review.yml no longer counts the criticals of a report")
        for line in ("🔴 2 critical, 🟡 0 warning(s)", "Review complete: 2 critical, 1 warning(s), 0 suggestion(s)."):
            self.assertRegex(line, pattern.group(1))
        self.assertNotRegex("Ready for its contract: no — blocked by 2 critical finding(s).", pattern.group(1))

    def test_flow_052_the_session_settings_and_hooks_are_the_base_branch_s(self):
        """The pinned action loads the checked-out project's settings and runs its hooks (v1.0.251,
        base-action/src/parse-sdk-options.ts: setting sources user, project, local)."""
        workflow = (SCRIPT.parents[1] / ".github" / "workflows" / "review.yml").read_text(encoding="utf-8")
        restored = re.search(r'for path in ([^;\n]+); do\s*\n\s*rm -rf "\$path"', workflow)
        self.assertIsNotNone(restored, "review.yml no longer empties and restores the session's settings and hooks")
        paths = restored.group(1).split()
        self.assertIn(".claude/settings.json", paths)
        self.assertIn(".claude/hooks", paths)
        self.assertIn('git status --short .claude', workflow, "the job log does not say what differs from the base")

    def test_ticket_490_the_session_reads_the_branch_s_files_from_their_own_checkout(self):
        """The workspace holds the base branch's prompts (and the action restores `.claude/` and
        `CLAUDE.md` there, v1.0.251 restore-config.ts): the reviewed files are a clean checkout
        of the pull request beside it, the one the session is given and told to read."""
        workflow = (SCRIPT.parents[1] / ".github" / "workflows" / "review.yml").read_text(encoding="utf-8")
        checkout = re.search(r'git worktree add --detach (\S+) HEAD', workflow)
        self.assertIsNotNone(checkout, "review.yml no longer checks the branch's tree out on its own")
        tree = checkout.group(1)
        self.assertRegex(workflow, rf'--add-dir {re.escape(tree)}\n', "the session is not given the branch's tree")
        prompt = re.search(r'REVIEW_PROMPT: \|\n(.*?)\n      [A-Z_]+:', workflow, re.DOTALL)
        self.assertIsNotNone(prompt, "review.yml no longer sets REVIEW_PROMPT")
        self.assertIn(f"`{tree}/`", prompt.group(1), "the prompt does not say where the branch's files are")
        self.assertRegex(workflow, r'--disallowedTools [^\n]*"Skill"', "a skill the branch adds could run in the session")


class ReviewLanes(unittest.TestCase):
    def test_docs_only_needs_no_reviewer(self):
        self.assertEqual(lanes("README.md", "docs/spec/patient.md", "screenshots/a.png"), [])

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
        self.assertEqual(lanes(".claude/agents/reviewer-sql.md"), ["infra", "guides"])
        self.assertEqual(lanes(".claude/skills/run-entry/SKILL.md"), ["infra", "guides"])
        self.assertEqual(lanes(".claude/settings.json"), ["infra"])
        self.assertEqual(lanes(".claude/agents/sub/reviewer-infra.md"), [])  # flat only

    def test_the_coverage_floors_and_path_rules_are_infra(self):
        self.assertEqual(lanes("coverage-gates.json"), ["infra"])
        self.assertEqual(lanes(".claude/rules/backend.md"), ["infra", "guides"])

    def test_the_frozen_architecture_debt_is_infra(self):
        self.assertEqual(lanes("arch-allowlist.json"), ["infra"])

    def test_files_outside_the_infra_reviewers_scope_do_not_fire_it(self):
        self.assertEqual(lanes("scripts/tests/test_merge.py", "scripts/visual-proof-capture.mjs"), [])

    def test_json_lists_every_lane(self):
        self.assertEqual(
            lanes("src-tauri/src/lib.rs", as_json=True),
            {"backend": True, "frontend": False, "arch": True, "sql": False, "infra": False, "security": False, "e2e": False, "guides": False},
        )

    def test_flow_044_a_guide_fires_the_guides_lane(self):
        for path in ("CLAUDE.md", "docs/workflow.md", "docs/backend-rules.md", "docs/agentic-setup.md"):
            self.assertEqual(lanes(path), ["guides"], path)

    def test_flow_044_a_document_that_is_not_a_guide_fires_nothing(self):
        self.assertEqual(lanes("docs/spec/patient.md", "docs/README.md", "docs/adr/003-unit-of-work.md", "README.md"), [])

    def test_flow_044_the_ceilings_record_is_infra(self):
        self.assertEqual(lanes("guide-ceilings.json"), ["infra"])


if __name__ == "__main__":
    unittest.main()
