#!/usr/bin/env python3
"""The state of the work queue, for the /whats-next skill and `just whats-next`.

Reads docs/todo.md, docs/techdebt.md and the open pull requests and prints what
is queued (in order), what is ready to queue, what is blocked and on what, and
the debt entries not queued. It classifies; it never ranks or recommends —
ordering is the owner's, proposed by the skill (docs/workflow.md § 2).

`whats-next.py close <id>...` is the closure of a task: it removes each entry
from its file and its reference from the queue, in the pull request that ships it.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ("User value", "Done when", "Design", "Open questions")
# A Where path is checked only when it starts at the repository root.
PATH_ROOTS = ("src/", "src-tauri/", "docs/", "scripts/", "e2e/", ".github/", ".claude/")
PASSING = ("SUCCESS", "NEUTRAL", "SKIPPED")
QUEUE_HOME = "docs/todo.md"
ENTRY_HOMES = {"TODO": QUEUE_HOME, "DEBT": "docs/techdebt.md", "FLOW": "docs/flow.md"}

TODO_HEADING = re.compile(r"^## (TODO-\d{3}) — (.+?)\s*$", re.MULTILINE)
DEBT_HEADING = re.compile(r"^## (\d{4}-\d{2}-\d{2}) — (DEBT-\d{3}) — (.+?)\s*$", re.MULTILINE)
# One reference per line, as a plain list item. A numbered item is still read, so a
# hand-edited queue is never silently empty.
QUEUE_LINE = re.compile(r"^(?:-|\d+\.)\s+((?:TODO|DEBT|FLOW)-\d{3})\b", re.MULTILINE)
FLOW_HEADING = re.compile(r"^## (FLOW-\d{3}) — (.+?)\s*$", re.MULTILINE)
FIELD = re.compile(r"^\*\*(" + "|".join(FIELDS) + r"):\*\*", re.MULTILINE)


@dataclass
class Todo:
    id: str
    title: str
    fields: dict[str, str]


@dataclass
class Debt:
    id: str
    date: str
    title: str
    where: str


@dataclass
class Flow:
    id: str
    title: str
    decided: bool
    watch: bool = False


def queue(todo_text: str) -> list[str]:
    """The references under `## Next`, in order."""
    section = re.search(r"^## Next\s*$(.*?)(?=^## |\Z)", todo_text, re.MULTILINE | re.DOTALL)
    if not section:
        return []
    return QUEUE_LINE.findall(re.sub(r"<!--.*?-->", "", section.group(1), flags=re.DOTALL))


def _bodies(text: str, heading: re.Pattern) -> list[tuple[re.Match, str]]:
    matches = list(heading.finditer(text))
    ends = [m.start() for m in matches[1:]] + [len(text)]
    return [(m, text[m.end() : end]) for m, end in zip(matches, ends)]


def todo_entries(todo_text: str) -> list[Todo]:
    entries = []
    for match, body in _bodies(todo_text, TODO_HEADING):
        marks = list(FIELD.finditer(body))
        ends = [m.start() for m in marks[1:]] + [len(body)]
        fields = {m.group(1): body[m.end() : end].strip().removesuffix("---").strip() for m, end in zip(marks, ends)}
        entries.append(Todo(match.group(1), match.group(2), fields))
    return entries


def debt_entries(debt_text: str) -> list[Debt]:
    entries = []
    for match, body in _bodies(debt_text, DEBT_HEADING):
        where = re.search(r"^\*\*Where:\*\*\s*(.*)$", body, re.MULTILINE)
        entries.append(Debt(match.group(2), match.group(1), match.group(3), where.group(1).strip() if where else ""))
    return entries


def flow_entries(flow_text: str) -> list[Flow]:
    """The entries of docs/flow.md; one is workable once the owner's decision is written."""
    return [
        Flow(
            match.group(1),
            match.group(2),
            bool(re.search(r"^- Decision \(", body, re.MULTILINE)),
            bool(re.search(r"^- Watch \(", body, re.MULTILINE)),
        )
        for match, body in _bodies(flow_text, FLOW_HEADING)
    ]


def flow_waits(flow: Flow) -> list[str]:
    """Why a flow entry cannot be worked: a watch has nothing to do, an undecided one waits on the owner."""
    if flow.watch:
        return ["nothing to do: a watch entry"]
    return [] if flow.decided else ["the owner's decision"]


def waits_on(entry: Todo) -> list[str]:
    """What keeps an entry from being ready (docs/workflow.md § 2); empty when ready."""
    waits = [name for name in ("User value", "Done when") if not entry.fields.get(name)]
    design = entry.fields.get("Design", "")
    if design not in ("none", "validated"):
        waits.append("design approval")
    questions = entry.fields.get("Open questions", "")
    if questions != "none":
        items = re.findall(r"^- \[ \]\s+(.+)$", questions, re.MULTILINE) or [questions or "not written"]
        waits += [f"open question: {item}" for item in items]
    return waits


def missing_paths(where: str, exists) -> list[str]:
    """Root-anchored paths a Where line names that are gone — the entry may be obsolete."""
    gone = []
    for token in re.findall(r"`([^`]+)`", where):
        path = token.split(":", 1)[0]
        if path.startswith(PATH_ROOTS) and not re.search(r"[{*…\s]", path) and not exists(path):
            gone.append(path)
    return gone


def _waits(entry) -> list[str]:
    if entry is None:
        return ["no such entry"]
    if isinstance(entry, Todo):
        return waits_on(entry)
    if isinstance(entry, Flow):
        return flow_waits(entry)
    return []


def classify(refs: list[str], todos: list[Todo], debts: list[Debt], flows: Sequence[Flow] = ()) -> dict:
    by_id: dict[str, Todo | Debt | Flow] = {e.id: e for e in [*todos, *debts, *flows]}
    queued = [(ref, by_id.get(ref), _waits(by_id.get(ref))) for ref in refs]
    loose = [t for t in todos if t.id not in refs]
    return {
        "queued": queued,
        "ready": [t for t in loose if not waits_on(t)],
        "blocked": [(t, waits_on(t)) for t in loose if waits_on(t)],
        "debt": [d for d in debts if d.id not in refs],
        "flow": [f for f in flows if f.id not in refs],
    }


def checks_state(rollup: list[dict]) -> str:
    if not rollup:
        return "no checks"
    def running(check: dict) -> bool:
        return check.get("status", "COMPLETED") != "COMPLETED" or check.get("state") in ("PENDING", "EXPECTED")

    # Anything finished that is not a pass counts as failing, whatever GitHub calls it.
    failing = sorted(
        c.get("name") or c.get("context") or "?"
        for c in rollup
        if not running(c) and (c.get("conclusion") or c.get("state")) not in PASSING
    )
    if failing:
        return f"failing ({', '.join(failing)})"
    return "running" if any(running(c) for c in rollup) else "green"


def open_pull_requests() -> list[dict] | None:
    """Open pull requests, or None when GitHub cannot be asked (unknown, not empty)."""
    try:
        result = subprocess.run(
            ["gh", "pr", "list", "--state", "open", "--json", "number,title,headRefName,statusCheckRollup"],
            capture_output=True, text=True, check=True, timeout=20, cwd=ROOT,
        )
        return json.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return None


def render(buckets: dict, pulls: list[dict] | None, exists) -> str:
    lines = ["Queued (docs/todo.md § Next, in order):"]
    for position, (ref, entry, waits) in enumerate(buckets["queued"], start=1):
        title = f" — {entry.title}" if entry else ""
        state = f"waits on: {'; '.join(waits)}" if waits else "ready"
        lines.append(f"{position}. {ref}{title} — {state}")
    if not buckets["queued"]:
        lines.append("(empty)")

    lines += ["", "Ready, not queued:"]
    lines += [f"- {t.id} — {t.title}" for t in buckets["ready"]] or ["(none)"]

    lines += ["", "Blocked, not queued:"]
    lines += [f"- {t.id} — {t.title} — waits on: {'; '.join(waits)}" for t, waits in buckets["blocked"]] or ["(none)"]

    lines += ["", "Debt, not queued (newest first):"]
    for debt in buckets["debt"]:
        gone = missing_paths(debt.where, exists)
        stale = f" — path gone: {', '.join(gone)}" if gone else ""
        lines.append(f"- {debt.id} ({debt.date}) — {debt.title}{stale}")
    if not buckets["debt"]:
        lines.append("(none)")

    lines += ["", "Flow, not queued (docs/flow.md):"]
    lines += [
        f"- {flow.id} — {flow.title}"
        + (" — watch" if flow.watch else "" if flow.decided else " — waits on: the owner's decision")
        for flow in buckets.get("flow", [])
    ] or ["(none)"]

    lines.append("")
    if pulls is None:
        lines.append("Open pull requests: unknown (GitHub could not be asked)")
    elif not pulls:
        lines.append("Open pull requests: none")
    else:
        lines.append("Open pull requests:")
        for pull in pulls:
            state = checks_state(pull.get("statusCheckRollup") or [])
            lines.append(f"- gh#{pull['number']} — {pull['title']} ({pull['headRefName']}) — {state}")
    return "\n".join(lines)


class NoSuchEntry(Exception):
    """`close` was given a reference that names no entry."""


def without_entry(text: str, ref: str) -> str | None:
    """`text` without the entry `ref`, heading to next heading; None when it is not there."""
    heading = re.search(rf"^## (?:\d{{4}}-\d{{2}}-\d{{2}} — )?{re.escape(ref)} — .*$", text, re.MULTILINE)
    if not heading:
        return None
    following = re.compile(r"^## ", re.MULTILINE).search(text, heading.end())
    if following:
        return text[: heading.start()] + text[following.start() :]
    before = text[: heading.start()].rstrip()
    # The last entry: the separator above it separates nothing any more, unless the entry ended on its own.
    if not text.rstrip().endswith("---"):
        before = before.removesuffix("---").rstrip()
    return before + "\n"


def without_queue_line(todo_text: str, ref: str) -> str:
    """`todo_text` without the reference `ref` under `## Next`; unchanged when it is not queued."""
    section = re.search(r"^## Next\s*$(.*?)(?=^## |\Z)", todo_text, re.MULTILINE | re.DOTALL)
    if not section:
        return todo_text
    kept = re.sub(rf"^(?:-|\d+\.)\s+{re.escape(ref)}\b.*\n", "", section.group(1), flags=re.MULTILINE)
    return todo_text[: section.start(1)] + kept + todo_text[section.end(1) :]


def close(refs: list[str], read, write) -> list[str]:
    """Remove each entry from its file and its reference from the queue (docs/workflow.md § 3, closure).

    Nothing is written unless every reference names an entry.
    """
    texts: dict[str, str] = {}
    said = []
    for ref in refs:
        home = ENTRY_HOMES.get(ref.split("-", 1)[0]) if re.fullmatch(r"(?:TODO|DEBT|FLOW)-\d{3}", ref) else None
        if home is None:
            raise NoSuchEntry(f"{ref}: not an entry id (TODO-NNN, DEBT-NNN or FLOW-NNN)")
        for path in (home, QUEUE_HOME):
            if path not in texts:
                texts[path] = read(path)
        remaining = without_entry(texts[home], ref)
        if remaining is None:
            raise NoSuchEntry(f"{ref}: no such entry in {home}")
        texts[home] = remaining
        unqueued = without_queue_line(texts[QUEUE_HOME], ref)
        was_queued = unqueued != texts[QUEUE_HOME]
        texts[QUEUE_HOME] = unqueued
        said.append(f"{ref}: removed from {home} " + ("and from the queue" if was_queued else "(it was not queued)"))
    for path, text in texts.items():
        write(path, text)
    return said


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["close"]:
        if len(argv) < 2:
            print("usage: whats-next.py close <TODO-NNN | DEBT-NNN | FLOW-NNN>...", file=sys.stderr)
            return 2
        def read(path: str) -> str:
            try:
                return (ROOT / path).read_text(encoding="utf-8")
            except FileNotFoundError:
                raise NoSuchEntry(f"{path} does not exist") from None

        try:
            said = close(argv[1:], read, lambda path, text: (ROOT / path).write_text(text, encoding="utf-8"))
        except NoSuchEntry as error:
            print(f"❌ {error} — nothing was changed", file=sys.stderr)
            return 1
        print("\n".join(said))
        return 0
    todo_text = (ROOT / "docs/todo.md").read_text(encoding="utf-8")
    debt_text = (ROOT / "docs/techdebt.md").read_text(encoding="utf-8")
    flow_file = ROOT / "docs/flow.md"
    flow_text = flow_file.read_text(encoding="utf-8") if flow_file.exists() else ""
    buckets = classify(queue(todo_text), todo_entries(todo_text), debt_entries(debt_text), flow_entries(flow_text))
    print(render(buckets, open_pull_requests(), lambda path: (ROOT / path).exists()))
    return 0


if __name__ == "__main__":
    import usage_log

    usage_log.start()
    sys.exit(main())
