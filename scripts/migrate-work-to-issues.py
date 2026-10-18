#!/usr/bin/env python3
"""One-off move of docs/work/ to GitHub Issues and the repository's Project (gh#332).

Reads every entry of docs/work/{todo,debt,flow}/ and the queue (docs/work/queue.md)
and says, per entry, the issue it would open: its title (no id, no scope prefix),
its labels (`kind:feature`, `kind:bug`, `kind:debt`, `kind:flow`, `needs-owner`),
its body (starting "Migrated from <id>", so old commit and PR references stay
findable), its Project fields (Status, Batch, Size) and its "blocked by" and
sub-issue links. It ends with the counts per kind and what failed.

A dry run by default: nothing is sent. `--apply` creates the issues, adds them to
the Project with their fields and links, and prints the id → #number map. It
refuses while anything fails, and never opens an entry's issue twice (its body
starts "Migrated from <id>"): it adds an existing one to the Project again, so an
interrupted run is resumed by running it again.

Every title and body goes through privacy-check.py's text check first: a hit is a
failure, never sent, and its value is never printed.

A todo is `kind:bug` when it says so (`**Kind:** bug`) or `--bug <id>` names it,
`kind:feature` otherwise — the dry run lists the todos whose kind was assumed.

Use:
  python3 scripts/migrate-work-to-issues.py [--summary] [--bug TODO-NNN]...
  python3 scripts/migrate-work-to-issues.py --apply [--project N] [--map FILE]
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = "docs/work"
OWNER, REPO = "phileggel", "PatientManager"
PROJECT = 4  # github.com/users/phileggel/projects/4
KINDS = ("todo", "debt", "flow")
ENTRY_ID = r"(?:TODO|DEBT|FLOW)-\d{3}"
HEADINGS = {
    "todo": re.compile(r"^# (TODO-\d{3}) — (?:\([^)]*\) — )?(.+?)\s*$"),
    "debt": re.compile(r"^# (\d{4}-\d{2}-\d{2}) — (DEBT-\d{3}) — (.+?)\s*$"),
    "flow": re.compile(r"^# (FLOW-\d{3}) — (.+?)\s*$"),
}
# The lines each kind carries today (docs/workflow.md § 2); the issue forms ask for the same.
REQUIRED = {
    "todo": ("Size", "User value", "Done when", "Design"),
    "debt": ("Found by", "Where", "Observation", "Size", "Waits on the owner"),
    "flow": ("Size", "Observed", "Costs"),
}
SIZES = ("S", "M", "L", "XL")
STATUSES = ("Inbox", "Ready", "Queued", "In progress", "In review", "Done")
# What says an entry waits on another, and what says it is a slice of a parent.
BLOCKERS = re.compile(
    rf"\b(?:comes after|depends on|blocked by|blocked-by:?)\s+({ENTRY_ID}(?:\s*(?:,|and|to)\s*{ENTRY_ID})*)",
    re.IGNORECASE,
)
SLICE_OF = re.compile(rf"\bslice of ({ENTRY_ID})\b", re.IGNORECASE)
QUEUE_LINE = re.compile(rf"^(?:-|\d+\.)\s+({ENTRY_ID}|gh#\d+)\b", re.MULTILINE)
BATCH = re.compile(r"Batch of (\d{4}-\d{2}-\d{2})")
MIGRATED = re.compile(rf"^Migrated from ({ENTRY_ID})\b", re.MULTILINE)


def _privacy():
    spec = importlib.util.spec_from_file_location("privacy_check", ROOT / "scripts" / "privacy-check.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


privacy = _privacy()


@dataclass
class Issue:
    id: str
    kind: str  # feature, bug, debt or flow
    title: str
    body: str
    size: str | None
    needs_owner: bool
    status: str = "Ready"
    batch: str = ""
    blocked_by: list[str] = field(default_factory=list)
    parent: str | None = None
    kind_assumed: bool = False

    @property
    def labels(self) -> list[str]:
        return [f"kind:{self.kind}"] + (["needs-owner"] if self.needs_owner else [])


@dataclass
class Plan:
    issues: list[Issue]
    pulls: list[str]  # queued pull requests (Dependabot), added to the Project as they are
    failures: list[str]
    warnings: list[str]
    files: int


def line_value(body: str, name: str) -> str | None:
    """The text of a `**Name:**` / `**Name (…):**` / `- Name:` line and what follows it up to the next one."""
    start = re.search(rf"^(?:\*\*{re.escape(name)}(?: \([^)]*\))?:\*\*|- {re.escape(name)}(?: \([^)]*\))?:)", body, re.MULTILINE)
    if not start:
        return None
    rest = body[start.end() :]
    end = re.search(r"^(?:\*\*[^*\n]+:\*\*|- [A-Z][\w ]*(?: \([^)]*\))?:)", rest, re.MULTILINE)
    return rest[: end.start() if end else len(rest)].strip()


def expand(refs: str) -> list[str]:
    """The ids a list names: `TODO-017 to TODO-020` is the four of them."""
    ids: list[str] = []
    for low, high in re.findall(rf"({ENTRY_ID})(?:\s*to\s*({ENTRY_ID}))?", refs):
        if high and low[:4] == high[:4]:
            ids += [f"{low[:4]}-{n:03d}" for n in range(int(low[5:]), int(high[5:]) + 1)]
        else:
            ids += [low] + ([high] if high else [])
    return list(dict.fromkeys(ids))


def waits_on_owner(kind: str, body: str) -> bool:
    if kind == "todo":
        questions = line_value(body, "Open questions") or ""
        return "- [ ]" in questions or not questions.lower().startswith("none")
    if kind == "debt":
        return not re.match(r"no\b", line_value(body, "Waits on the owner") or "", re.IGNORECASE)
    # A flow entry waits on the owner until its Decision is written; a watch has nothing to decide.
    return line_value(body, "Decision") is None and line_value(body, "Watch") is None


def parse(kind: str, name: str, text: str, bugs: Sequence[str] = ()) -> tuple[Issue | None, list[str]]:
    """The issue an entry file becomes, or None and why it cannot be migrated."""
    first, _, rest = text.partition("\n")
    heading = HEADINGS[kind].match(first)
    if not heading:
        return None, [f"{name}: the first line is not a {kind} heading"]
    groups = heading.groups()
    date, ref, title = (None, *groups) if kind != "debt" else groups
    if f"{ref}.md" != name:
        return None, [f"{name}: the heading says {ref}"]
    body = rest.strip()
    problems = [f"{ref}: no `{line}` line" for line in REQUIRED[kind] if line_value(body, line) is None]
    # A decided flow entry may carry its proposal in the decision itself.
    if kind == "flow" and line_value(body, "Proposal") is None and line_value(body, "Decision") is None:
        problems.append(f"{ref}: no `Proposal` nor `Decision` line")
    size = re.match(r"(XL|S|M|L)\b", line_value(body, "Size") or "")
    if line_value(body, "Size") is not None and not size:
        problems.append(f"{ref}: the size is not one of {', '.join(SIZES)}")
    issue_kind, assumed = kind, False
    if kind == "todo":
        stated = re.match(r"(feature|bug)\b", line_value(body, "Kind") or "", re.IGNORECASE)
        issue_kind = "bug" if ref in bugs else stated.group(1).lower() if stated else "feature"
        assumed = not stated and ref not in bugs
    filed = f" (filed {date})" if date else ""
    issue = Issue(
        id=ref,
        kind=issue_kind,
        title=title.strip(),
        body=f"Migrated from {ref}{filed}.\n\n{body}\n",
        size=size.group(1) if size else None,
        needs_owner=waits_on_owner(kind, body),
        blocked_by=[b for match in BLOCKERS.findall(body) for b in expand(match) if b != ref],
        parent=next((p for p in SLICE_OF.findall(body) if p != ref), None),
        kind_assumed=assumed,
    )
    problems += [f"{ref}:{line}: {what}" for line, what in privacy.text_findings(f"{issue.title}\n{issue.body}", allowed())]
    return (None if problems else issue), problems


_ALLOWED: set[str] | None = None


def allowed() -> set[str]:
    global _ALLOWED
    if _ALLOWED is None:
        _ALLOWED = privacy.load_allowlist(ROOT)
    return _ALLOWED


def plan(files: dict[str, dict[str, str]], queue_text: str, bugs: Sequence[str] = ()) -> Plan:
    """The issues the entries become. `files` maps a kind to its files' names and texts."""
    issues: list[Issue] = []
    failures: list[str] = []
    for kind in KINDS:
        for name, text in sorted(files.get(kind, {}).items()):
            issue, problems = parse(kind, name, text, bugs)
            failures += problems
            if issue:
                issues.append(issue)
    by_id = {issue.id: issue for issue in issues}
    warnings = [f"{bug}: --bug names no todo entry" for bug in bugs if bug not in by_id or by_id[bug].kind != "bug"]
    warnings += [f"{issue.id}: no kind line — kind:feature assumed" for issue in issues if issue.kind_assumed]

    queued = QUEUE_LINE.findall(re.sub(r"<!--.*?-->", "", queue_text, flags=re.DOTALL))
    batch = next(iter(BATCH.findall(queue_text)), "")
    pulls = []
    for ref in queued:
        if ref.startswith("gh#"):
            pulls.append(ref)
        elif ref in by_id:
            by_id[ref].status, by_id[ref].batch = "Queued", batch
        else:
            warnings.append(f"queue: {ref} has no entry (shipped) — skipped")
    order = [ref for ref in queued if ref in by_id]
    issues.sort(key=lambda i: (order.index(i.id) if i.id in order else len(order), KINDS.index(_folder(i)), i.id))
    for issue in issues:
        if issue.status != "Queued":
            issue.status = "Inbox" if issue.needs_owner else "Ready"
        gone = [b for b in issue.blocked_by if b not in by_id]
        warnings += [f"{issue.id}: blocked by {b}, which is not an entry (shipped?) — no link" for b in gone]
        issue.blocked_by = [b for b in issue.blocked_by if b in by_id]
        if issue.parent and issue.parent not in by_id:
            warnings.append(f"{issue.id}: a slice of {issue.parent}, which is not an entry — no parent")
            issue.parent = None
    count = sum(len(texts) for texts in files.values())
    return Plan(issues, pulls, failures, warnings, count)


def _folder(issue: Issue) -> str:
    return {"feature": "todo", "bug": "todo"}.get(issue.kind, issue.kind)


def render(result: Plan, summary: bool = False) -> str:
    lines = []
    for issue in result.issues:
        fields = f"Status {issue.status}" + (f", Batch {issue.batch}" if issue.batch else "") + f", Size {issue.size or '—'}"
        lines.append(f"{issue.id} → {issue.title}")
        lines.append(f"  labels: {', '.join(issue.labels)} | {fields}")
        if issue.blocked_by:
            lines.append(f"  blocked by: {', '.join(issue.blocked_by)}")
        if issue.parent:
            lines.append(f"  sub-issue of: {issue.parent}")
        if not summary:
            lines += [f"  | {line}" if line else "  |" for line in issue.body.rstrip().splitlines()]
        lines.append("")
    lines += [f"{ref} → the pull request, added to the Project: Status Queued" for ref in result.pulls]
    kinds = {kind: sum(i.kind == kind for i in result.issues) for kind in ("feature", "bug", "debt", "flow")}
    lines += ["", "Issues: " + ", ".join(f"kind:{k} {n}" for k, n in kinds.items()) + f" — {len(result.issues)} in all"]
    failed = {f.split(":")[0] for f in result.failures}
    lines.append(f"Entry files: {result.files}; issues {len(result.issues)} + failed {len(failed)}")
    lines.append(f"needs-owner: {sum(i.needs_owner for i in result.issues)}")
    if result.warnings:
        lines += ["", "Warnings:"] + [f"- {w}" for w in result.warnings]
    lines += ["", "Failed:"] + ([f"- {f}" for f in result.failures] or ["(none)"])
    return "\n".join(lines)


# --- --apply -------------------------------------------------------------------

Gh = Callable[[list[str], str | None], str]


def gh(args: list[str], stdin: str | None = None) -> str:
    return subprocess.run(["gh", *args], input=stdin, capture_output=True, text=True, check=True, cwd=ROOT).stdout


def project_fields(run: Gh, project: int) -> dict:
    """The Project's id, and each field's id and options, by name."""
    meta = json.loads(run(["project", "view", str(project), "--owner", OWNER, "--format", "json"], None))
    fields = json.loads(run(["project", "field-list", str(project), "--owner", OWNER, "--format", "json"], None))["fields"]
    by_name = {f["name"]: {"id": f["id"], "options": {o["name"]: o["id"] for o in f.get("options", [])}} for f in fields}
    missing = [name for name in ("Status", "Batch", "Size") if name not in by_name]
    missing += [f"Status option {s}" for s in STATUSES if s not in by_name.get("Status", {}).get("options", {})]
    if missing:
        raise SystemExit(f"❌ Project {project} lacks: {', '.join(missing)}")
    return {"id": meta["id"], "fields": by_name}


def existing_issues(run: Gh) -> dict[str, int]:
    """The issues an earlier run opened, by the id their body says they come from."""
    issues = json.loads(run(["issue", "list", "--repo", f"{OWNER}/{REPO}", "--state", "all", "--limit", "1000", "--json", "number,body"], None))
    return {m.group(1): i["number"] for i in issues if (m := MIGRATED.search(i.get("body") or ""))}


def apply(result: Plan, project: int, run: Gh = gh, say: Callable[[str], None] = print) -> dict[str, int]:
    if result.failures:
        raise SystemExit("❌ --apply refuses while an entry fails: run the dry run")
    meta = project_fields(run, project)
    numbers = existing_issues(run)
    repo = f"{OWNER}/{REPO}"

    def set_field(item: str, name: str, value: str) -> None:
        target = meta["fields"][name]
        args = ["project", "item-edit", "--id", item, "--project-id", meta["id"], "--field-id", target["id"]]
        args += ["--single-select-option-id", target["options"][value]] if target["options"] else ["--text", value]
        run(args, None)

    def add(url: str, issue: Issue | None) -> str:
        item = json.loads(run(["project", "item-add", str(project), "--owner", OWNER, "--url", url, "--format", "json"], None))["id"]
        set_field(item, "Status", issue.status if issue else "Queued")
        if issue and issue.size:
            set_field(item, "Size", issue.size)
        if issue and issue.batch:
            set_field(item, "Batch", issue.batch)
        return item

    queued_items = []
    for issue in result.issues:
        if issue.id in numbers:
            # Added again: a run cut between the create and the Project left it out; adding twice is harmless.
            url = f"https://github.com/{repo}/issues/{numbers[issue.id]}"
            say(f"{issue.id} → #{numbers[issue.id]} (already open, not created again)")
        else:
            args = ["issue", "create", "--repo", repo, "--title", issue.title, "--body-file", "-"]
            for label in issue.labels:
                args += ["--label", label]
            url = run(args, issue.body).strip()
            numbers[issue.id] = int(url.rsplit("/", 1)[1])
            say(f"{issue.id} → #{numbers[issue.id]}")
        item = add(url, issue)
        if issue.status == "Queued":
            queued_items.append(item)
    for ref in result.pulls:
        queued_items.append(add(f"https://github.com/{repo}/pull/{ref[3:]}", None))

    def db_id(number: int) -> str:
        return run(["api", f"repos/{repo}/issues/{number}", "--jq", ".id"], None).strip()

    def link(path: str, key: str, number: int, what: str) -> None:
        # A link an interrupted run already made is refused by GitHub: said, not fatal.
        try:
            run(["api", "-X", "POST", f"repos/{repo}/issues/{path}", "-F", f"{key}={db_id(number)}"], None)
        except subprocess.CalledProcessError as error:
            say(f"⚠️ {what}: not linked ({(error.stderr or '').strip() or error})")

    for issue in result.issues:
        for blocker in issue.blocked_by:
            link(f"{numbers[issue.id]}/dependencies/blocked_by", "issue_id", numbers[blocker], f"{issue.id} blocked by {blocker}")
        if issue.parent:
            link(f"{numbers[issue.parent]}/sub_issues", "sub_issue_id", numbers[issue.id], f"{issue.id} under {issue.parent}")
    # The batch's order is the order of the Project's rows.
    previous = None
    for item in queued_items:
        after = f', afterId: "{previous}"' if previous else ""
        query = f'mutation {{ updateProjectV2ItemPosition(input: {{projectId: "{meta["id"]}", itemId: "{item}"{after}}}) {{ clientMutationId }} }}'
        run(["api", "graphql", "-f", f"query={query}"], None)
        previous = item
    return numbers


def read_files(root: Path) -> dict[str, dict[str, str]]:
    return {
        kind: {path.name: path.read_text(encoding="utf-8") for path in sorted((root / WORK / kind).glob("*.md"))}
        for kind in KINDS
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="create the issues (the default is a dry run)")
    parser.add_argument("--project", type=int, default=PROJECT, help=f"the Project number (default {PROJECT})")
    parser.add_argument("--bug", action="append", default=[], metavar="TODO-NNN", help="a todo that becomes kind:bug")
    parser.add_argument("--summary", action="store_true", help="the dry run without the bodies")
    parser.add_argument("--map", default="work-to-issues.json", help="where --apply writes the id → number map")
    args = parser.parse_args(argv)

    result = plan(read_files(ROOT), (ROOT / WORK / "queue.md").read_text(encoding="utf-8"), args.bug)
    if not args.apply:
        print(render(result, args.summary))
        return 1 if result.failures else 0
    numbers = apply(result, args.project)
    Path(args.map).write_text(json.dumps(numbers, indent=2) + "\n", encoding="utf-8")
    created = len(numbers)
    print(f"{created} issues for {result.files} entry files — map in {args.map}")
    return 0 if created == result.files else 1


if __name__ == "__main__":
    import usage_log

    usage_log.start()
    sys.exit(main())
