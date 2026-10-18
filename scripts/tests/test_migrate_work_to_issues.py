"""Tests for scripts/migrate-work-to-issues.py — run with `just test-scripts`.

Planted values are assembled at run time: a valid IBAN written out in this file
would be caught by the tree check itself.
"""

import importlib.util
import json
import sys
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("migrate_work", Path(__file__).resolve().parents[1] / "migrate-work-to-issues.py")
mig = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mig  # dataclasses resolve their module by name
SPEC.loader.exec_module(mig)

TODO = """# TODO-030 — (frontend) — The list keeps its filter

Seen on the procedure list.

**Size:** S

**User value:** the filter survives a reload

**Done when:** a reload keeps it

**Design:** none

**Open questions:** none
"""

BUG = TODO.replace("TODO-030", "TODO-031").replace("**Size:** S", "**Kind:** bug\n\n**Size:** S")

SLICE = """# TODO-032 — The second slice

Second slice of TODO-030. Comes after TODO-031 and TODO-099.

**Size:** M

**User value:** more

**Done when:** done

**Design:** needed

**Open questions:**

- [ ] The size, for the owner to confirm.
"""

DEBT = """# 2026-10-01 — DEBT-080 — Two helpers do the same thing

**Found by:** reviewer-arch

**Where:** `src/lib/a.ts`

**Observation:** duplicated

**Size:** S

**Waits on the owner:** no
"""

FLOW_UNDECIDED = """# FLOW-100 — The merge waits too long

- Kind: speed
- Size: S
- Observed: twenty minutes
- Proposal: wait less
- Costs: a flag
"""

FLOW_DECIDED = """# FLOW-101 — Decided in the decision line

- Kind: quality
- Size: M
- Observed: a gap
- Decision (owner, 2026-10-06): close the gap
- Costs: a test
"""

QUEUE = """# Queue

<!-- - TODO-031 in a comment is not queued -->
<!-- Batch of 2026-10-18, user-facing (owner). -->

- gh#320
- TODO-032
- TODO-025
- DEBT-080
"""


def files(**overrides):
    base = {
        "todo": {"TODO-030.md": TODO, "TODO-031.md": BUG, "TODO-032.md": SLICE},
        "debt": {"DEBT-080.md": DEBT},
        "flow": {"FLOW-100.md": FLOW_UNDECIDED, "FLOW-101.md": FLOW_DECIDED},
    }
    for kind, entries in overrides.items():
        base[kind] = {**base[kind], **entries}
    return base


def planted_iban():
    bban = "3000600001" + "1234567890189"
    check = 98 - int("".join(str(int(c, 36)) for c in bban + "FR00")) % 97
    return f"FR{check:02d}{bban}"


def by_id(plan):
    return {issue.id: issue for issue in plan.issues}


class Parse(unittest.TestCase):
    def test_every_kind_becomes_an_issue_named_by_its_title_alone(self):
        issues = by_id(mig.plan(files(), QUEUE))
        self.assertEqual(issues["TODO-030"].title, "The list keeps its filter")
        self.assertEqual(issues["DEBT-080"].title, "Two helpers do the same thing")
        self.assertEqual(issues["FLOW-100"].title, "The merge waits too long")
        self.assertEqual(len(issues), 6)

    def test_the_body_starts_with_the_old_id(self):
        issues = by_id(mig.plan(files(), QUEUE))
        self.assertTrue(issues["TODO-030"].body.startswith("Migrated from TODO-030.\n\nSeen on"))
        self.assertTrue(issues["DEBT-080"].body.startswith("Migrated from DEBT-080 (filed 2026-10-01).\n\n**Found by:**"))
        self.assertTrue(mig.MIGRATED.search(issues["FLOW-100"].body))

    def test_a_todo_splits_into_feature_and_bug_by_its_kind_line(self):
        result = mig.plan(files(), QUEUE)
        issues = by_id(result)
        self.assertEqual(issues["TODO-031"].labels, ["kind:bug"])
        self.assertEqual(issues["TODO-030"].labels, ["kind:feature"])
        self.assertIn("TODO-030: no kind line — kind:feature assumed", result.warnings)
        self.assertNotIn("TODO-031: no kind line — kind:feature assumed", result.warnings)

    def test_bug_names_a_todo_without_a_kind_line(self):
        result = mig.plan(files(), QUEUE, bugs=["TODO-030", "TODO-404"])
        self.assertEqual(by_id(result)["TODO-030"].kind, "bug")
        self.assertIn("TODO-404: --bug names no todo entry", result.warnings)

    def test_debt_and_flow_take_their_kind_label(self):
        issues = by_id(mig.plan(files(), QUEUE))
        self.assertEqual(issues["DEBT-080"].labels, ["kind:debt"])
        self.assertEqual(issues["FLOW-101"].labels, ["kind:flow"])

    def test_a_missing_line_fails_the_entry(self):
        broken = DEBT.replace("**Observation:** duplicated\n", "")
        result = mig.plan(files(debt={"DEBT-080.md": broken}), QUEUE)
        self.assertIn("DEBT-080: no `Observation` line", result.failures)
        self.assertNotIn("DEBT-080", by_id(result))

    def test_a_flow_entry_needs_a_proposal_or_a_decision(self):
        bare = FLOW_UNDECIDED.replace("- Proposal: wait less\n", "")
        result = mig.plan(files(flow={"FLOW-100.md": bare}), QUEUE)
        self.assertIn("FLOW-100: no `Proposal` nor `Decision` line", result.failures)
        self.assertIn("FLOW-101", by_id(result))

    def test_a_size_outside_the_four_fails(self):
        result = mig.plan(files(todo={"TODO-030.md": TODO.replace("**Size:** S", "**Size:** huge")}), QUEUE)
        self.assertIn("TODO-030: the size is not one of S, M, L, XL", result.failures)

    def test_a_heading_that_disagrees_with_its_file_fails(self):
        result = mig.plan(files(todo={"TODO-033.md": TODO}), QUEUE)
        self.assertIn("TODO-033.md: the heading says TODO-030", result.failures)
        self.assertEqual(result.files, 7)

    def test_a_valid_iban_refuses_the_entry_without_printing_it(self):
        leaked = DEBT.replace("duplicated", f"seen on {planted_iban()}")
        result = mig.plan(files(debt={"DEBT-080.md": leaked}), QUEUE)
        self.assertNotIn("DEBT-080", by_id(result))
        self.assertTrue(any(f.startswith("DEBT-080:") and "IBAN" in f for f in result.failures))
        self.assertFalse(any(planted_iban()[4:-4] in f for f in result.failures))


class Owner(unittest.TestCase):
    def test_an_open_question_is_needs_owner_and_inbox(self):
        issue = by_id(mig.plan(files(), ""))["TODO-032"]
        self.assertIn("needs-owner", issue.labels)
        self.assertEqual(issue.status, "Inbox")

    def test_an_undecided_flow_entry_waits_on_the_owner_a_decided_one_is_ready(self):
        issues = by_id(mig.plan(files(), QUEUE))
        self.assertTrue(issues["FLOW-100"].needs_owner)
        self.assertEqual(issues["FLOW-101"].status, "Ready")

    def test_a_debt_that_waits_on_the_owner_says_so(self):
        waiting = DEBT.replace("**Waits on the owner:** no", "**Waits on the owner:** which helper stays")
        self.assertTrue(by_id(mig.plan(files(debt={"DEBT-080.md": waiting}), QUEUE))["DEBT-080"].needs_owner)


class Queue(unittest.TestCase):
    def test_queued_entries_take_the_batch_in_queue_order(self):
        result = mig.plan(files(), QUEUE)
        self.assertEqual([i.id for i in result.issues[:2]], ["TODO-032", "DEBT-080"])
        self.assertEqual((result.issues[0].status, result.issues[0].batch), ("Queued", "2026-10-18"))
        self.assertEqual(by_id(result)["TODO-031"].status, "Ready")

    def test_a_queued_pull_request_is_kept_and_a_shipped_entry_is_skipped(self):
        result = mig.plan(files(), QUEUE)
        self.assertEqual(result.pulls, ["gh#320"])
        self.assertIn("queue: TODO-025 has no entry (shipped) — skipped", result.warnings)


class Links(unittest.TestCase):
    def test_blocked_by_and_slice_of_become_links_to_entries_that_exist(self):
        result = mig.plan(files(), QUEUE)
        issue = by_id(result)["TODO-032"]
        self.assertEqual(issue.blocked_by, ["TODO-031"])
        self.assertEqual(issue.parent, "TODO-030")
        self.assertIn("TODO-032: blocked by TODO-099, which is not an entry (shipped?) — no link", result.warnings)

    def test_a_range_names_every_id_in_it(self):
        self.assertEqual(mig.expand("TODO-017 to TODO-019"), ["TODO-017", "TODO-018", "TODO-019"])
        self.assertEqual(mig.expand("TODO-001, DEBT-002 and FLOW-003"), ["TODO-001", "DEBT-002", "FLOW-003"])


class Render(unittest.TestCase):
    def test_the_dry_run_counts_per_kind_and_lists_failures(self):
        result = mig.plan(files(debt={"DEBT-080.md": DEBT.replace("**Size:** S\n", "")}), QUEUE)
        text = mig.render(result)
        self.assertIn("kind:feature 2, kind:bug 1, kind:debt 0, kind:flow 2 — 5 in all", text)
        self.assertIn("Entry files: 6; issues 5 + failed 1", text)
        self.assertIn("- DEBT-080: no `Size` line", text)
        self.assertIn("  | Migrated from TODO-030.", text)
        self.assertNotIn("  | Migrated", mig.render(result, summary=True))


class FakeGh:
    """Answers the `gh` calls --apply makes, and records them."""

    def __init__(self, existing=()):
        self.calls = []
        self.next = 500
        self.existing = list(existing)

    def __call__(self, args, stdin=None):
        self.calls.append((args, stdin))
        if args[:2] == ["project", "view"]:
            return json.dumps({"id": "PVT_1"})
        if args[:2] == ["project", "field-list"]:
            status = {"name": "Status", "id": "F_S", "options": [{"name": s, "id": f"O_{s}"} for s in mig.STATUSES]}
            size = {"name": "Size", "id": "F_Z", "options": [{"name": s, "id": f"Z_{s}"} for s in mig.SIZES]}
            return json.dumps({"fields": [status, size, {"name": "Batch", "id": "F_B"}]})
        if args[:2] == ["issue", "list"]:
            return json.dumps(self.existing)
        if args[:2] == ["issue", "create"]:
            self.next += 1
            return f"https://github.com/phileggel/PatientManager/issues/{self.next}\n"
        if args[:2] == ["project", "item-add"]:
            return json.dumps({"id": f"ITEM_{args[-3].rsplit('/', 1)[1]}"})
        if args[0] == "api" and args[1].startswith("repos/") and args[-2] == "--jq":
            return "9" + args[1].rsplit("/", 1)[1] + "\n"
        return ""

    def named(self, *prefix):
        return [args for args, _ in self.calls if args[: len(prefix)] == list(prefix)]


class Apply(unittest.TestCase):
    def setUp(self):
        self.said = []

    def test_apply_refuses_while_an_entry_fails(self):
        result = mig.plan(files(debt={"DEBT-080.md": "# not a heading\n"}), QUEUE)
        with self.assertRaises(SystemExit):
            mig.apply(result, 3, FakeGh(), self.said.append)

    def test_apply_creates_labels_fields_links_and_order(self):
        fake = FakeGh()
        numbers = mig.apply(mig.plan(files(), QUEUE), 3, fake, self.said.append)
        self.assertEqual(len(numbers), 6)
        create = fake.named("issue", "create")[0]
        self.assertIn("kind:feature", create)
        self.assertIn("needs-owner", create)  # TODO-032 comes first: it is queued
        self.assertTrue(fake.calls[[a for a, _ in fake.calls].index(create)][1].startswith("Migrated from TODO-032"))
        edits = fake.named("project", "item-edit")
        self.assertIn(["--field-id", "F_B", "--text", "2026-10-18"], [e[-4:] for e in edits])
        self.assertIn(["--field-id", "F_S", "--single-select-option-id", "O_Queued"], [e[-4:] for e in edits])
        posts = [a[3] for a in fake.named("api", "-X", "POST")]
        self.assertIn(f"repos/phileggel/PatientManager/issues/{numbers['TODO-032']}/dependencies/blocked_by", posts)
        self.assertIn(f"repos/phileggel/PatientManager/issues/{numbers['TODO-030']}/sub_issues", posts)
        self.assertTrue(any("pull/320" in a[-3] for a in fake.named("project", "item-add")))
        positions = [a for a in fake.named("api", "graphql")]
        self.assertEqual(len(positions), 3)  # TODO-032, DEBT-080, gh#320
        self.assertIn('afterId: "ITEM_', positions[1][-1])

    def test_an_issue_already_opened_is_skipped_and_still_linked(self):
        fake = FakeGh(existing=[{"number": 42, "body": "Migrated from TODO-031.\n\nSeen"}])
        numbers = mig.apply(mig.plan(files(), QUEUE), 3, fake, self.said.append)
        self.assertEqual(numbers["TODO-031"], 42)
        self.assertEqual(len(fake.named("issue", "create")), 5)
        self.assertTrue(any(a[-1] == "issue_id=942" for a in fake.named("api", "-X", "POST")))
        self.assertIn("TODO-031 → #42 (already open, not created again)", self.said)
        self.assertTrue(any(a[-3].endswith("/issues/42") for a in fake.named("project", "item-add")))

    def test_apply_sends_nothing_when_a_body_holds_an_iban(self):
        leaked = DEBT.replace("duplicated", f"seen on {planted_iban()}")
        fake = FakeGh()
        with self.assertRaises(SystemExit):
            mig.apply(mig.plan(files(debt={"DEBT-080.md": leaked}), QUEUE), 3, fake, self.said.append)
        self.assertEqual(fake.calls, [])

    def test_a_link_github_refuses_is_said_and_the_run_goes_on(self):
        class Refusing(FakeGh):
            def __call__(self, args, stdin=None):
                if args[:3] == ["api", "-X", "POST"] and "sub_issues" in args[3]:
                    raise mig.subprocess.CalledProcessError(1, "gh", stderr="already a sub-issue")
                return super().__call__(args, stdin)

        fake = Refusing()
        mig.apply(mig.plan(files(), QUEUE), 3, fake, self.said.append)
        self.assertIn("⚠️ TODO-032 under TODO-030: not linked (already a sub-issue)", self.said)
        self.assertEqual(len(fake.named("api", "graphql")), 3)

    def test_a_project_without_the_status_values_stops_before_anything_is_created(self):
        class Bare(FakeGh):
            def __call__(self, args, stdin=None):
                if args[:2] == ["project", "field-list"]:
                    return json.dumps({"fields": [{"name": "Status", "id": "F_S", "options": [{"name": "Todo", "id": "x"}]}]})
                return super().__call__(args, stdin)

        fake = Bare()
        with self.assertRaises(SystemExit):
            mig.apply(mig.plan(files(), QUEUE), 3, fake, self.said.append)
        self.assertEqual(fake.named("issue", "create"), [])


if __name__ == "__main__":
    unittest.main()
