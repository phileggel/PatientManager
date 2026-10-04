"""Tests for scripts/whats-next.py — run with `just test-scripts`."""

import importlib.util
import subprocess
import sys
import unittest
from unittest import mock
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("whats_next", Path(__file__).resolve().parents[1] / "whats-next.py")
plan = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = plan  # dataclasses resolve their module by name
SPEC.loader.exec_module(plan)

TODO = """# TODO

## Next

<!-- - TODO-999 in a comment is not queued -->

- TODO-002
- DEBT-005
- TODO-404

---

## TODO-001 — (ci) — Ready, not queued

Body mentioning **Done when:** nowhere near a line start.

**User value:** faster releases

**Done when:** the job is green

**Design:** none

**Open questions:** none

---

## TODO-002 — (frontend) — Queued, waits on a design

**User value:** a clearer list

**Done when:** the list sorts

**Design:** proposed (screenshots/design/todo-002-light.png)

**Open questions:** none

---

## TODO-003 — Nothing written

**User value:**

**Done when:**

**Design:** none

**Open questions:** Done when not written yet.

---

## TODO-004 — Two questions

**User value:** x

**Done when:** y

**Design:** validated

**Open questions:**

- [ ] Which format?
- [ ] Which screen?
"""

DEBT = """# Tech Debt

## 2026-10-03 — DEBT-006 — A newer observation

**Found by:** manual

**Where:** `src/gone.ts:12`, `docs/` and `context/fund/api.rs`

**Observation:** something.

---

## 2026-09-01 — DEBT-005 — An older observation

**Found by:** reviewer-arch

**Where:** across the IPC layer

**Observation:** something else.
"""


class Queue(unittest.TestCase):
    def test_the_queue_is_read_in_order_and_ignores_comments(self):
        self.assertEqual(plan.queue(TODO), ["TODO-002", "DEBT-005", "TODO-404"])

    def test_a_numbered_queue_is_still_read(self):
        self.assertEqual(plan.queue("## Next\n\n1. TODO-002\n2. DEBT-005\n\n---\n"), ["TODO-002", "DEBT-005"])

    def test_no_next_section_is_an_empty_queue(self):
        self.assertEqual(plan.queue("# TODO\n\n## TODO-001 — x\n"), [])


class TodoEntries(unittest.TestCase):
    def setUp(self):
        self.entries = {e.id: e for e in plan.todo_entries(TODO)}

    def test_every_entry_is_found_with_its_title(self):
        self.assertEqual(list(self.entries), ["TODO-001", "TODO-002", "TODO-003", "TODO-004"])
        self.assertEqual(self.entries["TODO-001"].title, "(ci) — Ready, not queued")

    def test_a_complete_entry_waits_on_nothing(self):
        self.assertEqual(plan.waits_on(self.entries["TODO-001"]), [])

    def test_an_unvalidated_design_blocks(self):
        self.assertEqual(plan.waits_on(self.entries["TODO-002"]), ["design approval"])

    def test_empty_fields_block_and_are_named(self):
        self.assertEqual(
            plan.waits_on(self.entries["TODO-003"]),
            ["User value", "Done when", "open question: Done when not written yet."],
        )

    def test_each_open_question_is_listed(self):
        self.assertEqual(
            plan.waits_on(self.entries["TODO-004"]),
            ["open question: Which format?", "open question: Which screen?"],
        )


class DebtEntries(unittest.TestCase):
    def test_entries_carry_id_date_title_and_where(self):
        newer, older = plan.debt_entries(DEBT)
        self.assertEqual((newer.id, newer.date, newer.title), ("DEBT-006", "2026-10-03", "A newer observation"))
        self.assertEqual(older.where, "across the IPC layer")

    def test_only_rooted_paths_are_checked_and_missing_ones_reported(self):
        newer, older = plan.debt_entries(DEBT)
        exists = lambda path: path == "docs/"
        self.assertEqual(plan.missing_paths(newer.where, exists), ["src/gone.ts"])
        self.assertEqual(plan.missing_paths(older.where, exists), [])

    def test_patterns_are_not_paths(self):
        where = "`src/i18n/locales/{en,fr}/x.json` and `src/features/*/gateway.ts`"
        self.assertEqual(plan.missing_paths(where, lambda path: False), [])


class Classification(unittest.TestCase):
    def setUp(self):
        self.plan = plan.classify(plan.queue(TODO), plan.todo_entries(TODO), plan.debt_entries(DEBT))

    def test_queued_keeps_the_order_and_says_what_each_waits_on(self):
        self.assertEqual(
            [(ref, waits) for ref, _, waits in self.plan["queued"]],
            [("TODO-002", ["design approval"]), ("DEBT-005", []), ("TODO-404", ["no such entry"])],
        )

    def test_ready_blocked_and_debt_exclude_what_is_queued(self):
        self.assertEqual([e.id for e in self.plan["ready"]], ["TODO-001"])
        self.assertEqual([e.id for e, _ in self.plan["blocked"]], ["TODO-003", "TODO-004"])
        self.assertEqual([e.id for e in self.plan["debt"]], ["DEBT-006"])


FLOW = """# Flow

## FLOW-001 — Decided

- Kind: speed
- Decision (owner, 2026-10-04): do it.

## FLOW-002 — Not decided

- Kind: quality
- Proposal: something.

## FLOW-003 — Decided, not queued

- Decision (owner, 2026-10-04): do it.
"""


class FlowEntries(unittest.TestCase):
    def test_an_entry_is_workable_once_its_decision_is_written(self):
        self.assertEqual(
            [(f.id, f.title, f.decided) for f in plan.flow_entries(FLOW)],
            [("FLOW-001", "Decided", True), ("FLOW-002", "Not decided", False), ("FLOW-003", "Decided, not queued", True)],
        )

    def test_a_flow_id_is_read_from_the_queue(self):
        self.assertEqual(plan.queue("## Next\n\n- FLOW-001\n- TODO-002\n\n---\n"), ["FLOW-001", "TODO-002"])

    def test_a_queued_flow_entry_waits_on_the_owner_until_decided(self):
        buckets = plan.classify(["FLOW-001", "FLOW-002"], [], [], plan.flow_entries(FLOW))
        self.assertEqual(
            [(ref, waits) for ref, _, waits in buckets["queued"]],
            [("FLOW-001", []), ("FLOW-002", ["the owner's decision"])],
        )
        self.assertEqual([f.id for f in buckets["flow"]], ["FLOW-003"])

    def test_a_watch_entry_is_listed_as_such_and_never_ready_when_queued(self):
        flows = plan.flow_entries("## FLOW-009 — Watched\n\n- Watch (owner, 2026-10-04): wait for upstream.\n")
        self.assertTrue(flows[0].watch)
        queued = plan.classify(["FLOW-009"], [], [], flows)["queued"]
        self.assertEqual(queued[0][2], ["nothing to do: a watch entry"])
        text = plan.render(plan.classify([], [], [], flows), [], lambda path: True)
        self.assertIn("- FLOW-009 — Watched — watch", text)

    def test_flow_entries_not_queued_are_listed(self):
        buckets = plan.classify([], [], [], plan.flow_entries(FLOW))
        text = plan.render(buckets, [], lambda path: True)
        self.assertIn("- FLOW-001 — Decided", text)
        self.assertIn("- FLOW-002 — Not decided — waits on: the owner's decision", text)


class PullRequests(unittest.TestCase):
    def test_checks_are_summarised_worst_first(self):
        rollup = [
            {"name": "Backend", "status": "COMPLETED", "conclusion": "SUCCESS"},
            {"name": "E2E", "status": "IN_PROGRESS", "conclusion": ""},
            {"name": "Frontend", "status": "COMPLETED", "conclusion": "FAILURE"},
        ]
        self.assertEqual(plan.checks_state(rollup), "failing (Frontend)")
        self.assertEqual(plan.checks_state(rollup[:2]), "running")
        self.assertEqual(plan.checks_state(rollup[:1]), "green")
        self.assertEqual(plan.checks_state([]), "no checks")

    def test_a_finished_check_that_did_not_pass_is_never_green(self):
        for conclusion in ("ACTION_REQUIRED", "STARTUP_FAILURE", "STALE", "CANCELLED", "TIMED_OUT"):
            rollup = [{"name": "Backend", "status": "COMPLETED", "conclusion": conclusion}]
            self.assertEqual(plan.checks_state(rollup), "failing (Backend)", conclusion)
        skipped = [{"name": "E2E", "status": "COMPLETED", "conclusion": "SKIPPED"}]
        self.assertEqual(plan.checks_state(skipped), "green")

    def test_github_that_cannot_be_asked_returns_none(self):
        failures = {
            "gh missing": FileNotFoundError(),
            "non-zero exit": subprocess.CalledProcessError(1, "gh"),
            "timeout": subprocess.TimeoutExpired("gh", 20),
        }
        for name, error in failures.items():
            with mock.patch.object(plan.subprocess, "run", side_effect=error):
                self.assertIsNone(plan.open_pull_requests(), name)
        bad_json = subprocess.CompletedProcess("gh", 0, stdout="not json", stderr="")
        with mock.patch.object(plan.subprocess, "run", return_value=bad_json):
            self.assertIsNone(plan.open_pull_requests())

    def test_open_pull_requests_are_returned_as_github_gives_them(self):
        answer = subprocess.CompletedProcess("gh", 0, stdout='[{"number": 7}]', stderr="")
        with mock.patch.object(plan.subprocess, "run", return_value=answer):
            self.assertEqual(plan.open_pull_requests(), [{"number": 7}])

    def test_an_unreachable_github_is_unknown_never_empty(self):
        text = plan.render({"queued": [], "ready": [], "blocked": [], "debt": []}, None, lambda path: True)
        self.assertIn("Open pull requests: unknown", text)

    def test_no_open_pull_request_is_said_so(self):
        text = plan.render({"queued": [], "ready": [], "blocked": [], "debt": []}, [], lambda path: True)
        self.assertIn("Open pull requests: none", text)


class Close(unittest.TestCase):
    """`whats-next.py close <id>`: the entry and its queue line leave together."""

    def close(self, *refs, files=None):
        self.files = dict(files or {"docs/todo.md": TODO, "docs/techdebt.md": DEBT, "docs/flow.md": FLOW})
        return plan.close(list(refs), self.files.__getitem__, self.files.__setitem__)

    def test_flow_014_a_todo_entry_leaves_with_its_queue_line(self):
        said = self.close("TODO-002")
        todo = self.files["docs/todo.md"]
        self.assertEqual(plan.queue(todo), ["DEBT-005", "TODO-404"])
        self.assertEqual([e.id for e in plan.todo_entries(todo)], ["TODO-001", "TODO-003", "TODO-004"])
        self.assertIn("**Open questions:** none\n\n---\n\n## TODO-003 — Nothing written", todo)
        self.assertIn("<!-- - TODO-999 in a comment is not queued -->", todo)
        self.assertEqual(said, ["TODO-002: removed from docs/todo.md and from the queue"])

    def test_flow_014_a_debt_entry_leaves_its_file_and_the_queue(self):
        said = self.close("DEBT-005")
        self.assertEqual(plan.queue(self.files["docs/todo.md"]), ["TODO-002", "TODO-404"])
        debt = self.files["docs/techdebt.md"]
        self.assertEqual([d.id for d in plan.debt_entries(debt)], ["DEBT-006"])
        self.assertTrue(debt.endswith("**Observation:** something.\n"), "the separator before the last entry goes with it")
        self.assertEqual(said, ["DEBT-005: removed from docs/techdebt.md and from the queue"])

    def test_flow_014_a_flow_entry_not_queued_is_removed_and_said_so(self):
        said = self.close("FLOW-002")
        flow = self.files["docs/flow.md"]
        self.assertEqual([f.id for f in plan.flow_entries(flow)], ["FLOW-001", "FLOW-003"])
        self.assertIn("- Decision (owner, 2026-10-04): do it.\n\n## FLOW-003 — Decided, not queued", flow)
        self.assertEqual(self.files["docs/todo.md"], TODO)
        self.assertEqual(said, ["FLOW-002: removed from docs/flow.md (it was not queued)"])

    def test_flow_014_the_last_todo_entry_keeps_the_file_ending_on_its_separator(self):
        todo = "## Next\n\n- TODO-001\n- TODO-002\n\n---\n\n## TODO-001 — a\n\nbody\n\n---\n\n## TODO-002 — b\n\nbody\n\n---\n"
        self.close("TODO-002", files={"docs/todo.md": todo})
        self.assertEqual(self.files["docs/todo.md"], "## Next\n\n- TODO-001\n\n---\n\n## TODO-001 — a\n\nbody\n\n---\n")

    def test_flow_014_several_entries_close_in_one_run(self):
        self.close("FLOW-001", "FLOW-003", "TODO-001")
        self.assertEqual([f.id for f in plan.flow_entries(self.files["docs/flow.md"])], ["FLOW-002"])
        self.assertEqual([e.id for e in plan.todo_entries(self.files["docs/todo.md"])], ["TODO-002", "TODO-003", "TODO-004"])

    def test_flow_014_an_unknown_entry_changes_nothing(self):
        with self.assertRaises(plan.NoSuchEntry) as raised:
            self.close("FLOW-001", "TODO-404")
        self.assertEqual(str(raised.exception), "TODO-404: no such entry in docs/todo.md")
        self.assertEqual(self.files, {"docs/todo.md": TODO, "docs/techdebt.md": DEBT, "docs/flow.md": FLOW})

    def test_a_reference_that_is_not_an_entry_id_is_refused(self):
        with self.assertRaises(plan.NoSuchEntry):
            self.close("PR-12")

    def test_flow_024_a_pull_request_reference_leaves_the_queue_and_touches_no_entry_file(self):
        todo = "## Next\n\n- gh#171\n- TODO-001\n\n---\n\n## TODO-001 — a\n\nbody\n\n---\n"
        said = self.close("gh#171", files={"docs/todo.md": todo})
        self.assertEqual(plan.queue(self.files["docs/todo.md"]), ["TODO-001"])
        self.assertEqual(said, ["gh#171: removed from the queue"])
        with self.assertRaises(plan.NoSuchEntry) as raised:
            self.close("gh#999", files={"docs/todo.md": todo})
        self.assertEqual(str(raised.exception), "gh#999: not in the queue")


DEPENDABOT = {"number": 171, "title": "chore(deps): bump the all-actions group", "headRefName": "dependabot/x", "author": {"login": "app/dependabot"}, "statusCheckRollup": []}
OWNERS = {"number": 180, "title": "ci: something", "headRefName": "ci/x", "author": {"login": "phileggel"}, "statusCheckRollup": []}


class DependabotPullRequests(unittest.TestCase):
    """FLOW-024: a Dependabot pull request is queued and worked like an entry, as `gh#NN`."""

    def test_flow_024_a_pull_request_reference_is_read_from_the_queue(self):
        self.assertEqual(plan.queue("## Next\n\n- gh#171\n- TODO-002\n- gh#7\n\n---\n"), ["gh#171", "TODO-002", "gh#7"])

    def test_flow_024_a_queued_pull_request_is_ready_while_it_is_open(self):
        queued = plan.classify(["gh#171", "gh#5"], [], [], [], [DEPENDABOT, OWNERS])["queued"]
        self.assertEqual([(ref, waits) for ref, _, waits in queued], [("gh#171", []), ("gh#5", ["no such open pull request"])])

    def test_flow_024_a_queued_pull_request_is_unknown_when_github_cannot_be_asked(self):
        queued = plan.classify(["gh#171"], [], [], [], None)["queued"]
        self.assertEqual(queued[0][2], ["unknown: GitHub could not be asked"])

    def test_flow_024_open_dependabot_pull_requests_not_queued_are_proposed(self):
        buckets = plan.classify([], [], [], [], [DEPENDABOT, OWNERS])
        text = plan.render(buckets, [DEPENDABOT, OWNERS], lambda path: True)
        self.assertIn("Dependabot pull requests, not queued:\n- gh#171 — chore(deps): bump the all-actions group", text)
        self.assertNotIn("- gh#180 — ci: something\n\n", text.split("Dependabot pull requests, not queued:")[1].split("Open pull requests:")[0])

    def test_flow_024_only_the_bot_itself_counts_as_dependabot(self):
        human = dict(DEPENDABOT, number=9, author={"login": "dependabot-fan"})
        api_form = dict(DEPENDABOT, number=10, author={"login": "dependabot[bot]"})
        buckets = plan.classify([], [], [], [], [human, api_form])
        self.assertEqual([pull.id for pull in buckets["dependabot"]], ["gh#10"])

    def test_flow_024_a_queued_dependabot_pull_request_is_not_proposed_again(self):
        buckets = plan.classify(["gh#171"], [], [], [], [DEPENDABOT])
        text = plan.render(buckets, [DEPENDABOT], lambda path: True)
        self.assertIn("1. gh#171 — chore(deps): bump the all-actions group — ready", text)
        self.assertIn("Dependabot pull requests, not queued:\n(none)", text)

    def test_flow_024_unknown_is_never_none(self):
        text = plan.render(plan.classify([], [], [], [], None), None, lambda path: True)
        self.assertIn("Dependabot pull requests, not queued: unknown (GitHub could not be asked)", text)


class Render(unittest.TestCase):
    def test_the_report_names_every_bucket_and_stale_paths(self):
        buckets = plan.classify(plan.queue(TODO), plan.todo_entries(TODO), plan.debt_entries(DEBT))
        text = plan.render(buckets, [], lambda path: path == "docs/")
        self.assertIn("1. TODO-002 — (frontend) — Queued, waits on a design — waits on: design approval", text)
        self.assertIn("2. DEBT-005 — An older observation — ready", text)
        self.assertIn("3. TODO-404 — waits on: no such entry", text)
        self.assertIn("- TODO-001 — (ci) — Ready, not queued", text)
        self.assertIn("- TODO-004 — Two questions — waits on: open question: Which format?; open question: Which screen?", text)
        self.assertIn("- DEBT-006 (2026-10-03) — A newer observation — path gone: src/gone.ts", text)


if __name__ == "__main__":
    unittest.main()
