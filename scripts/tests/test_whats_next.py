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

<!-- 9. TODO-999 in a comment is not queued -->

1. TODO-002
2. DEBT-005
3. TODO-404

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
