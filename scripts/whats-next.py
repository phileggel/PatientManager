#!/usr/bin/env python3
"""The state of the work queue, for the /whats-next skill and `just whats-next`.

Reads the entries of docs/work/ (one file each), the queue and the open pull
requests and prints what is queued (in order), what is ready to queue, what is
blocked and on what, and the debt entries not queued. It classifies; it never
ranks or recommends — ordering is the owner's, proposed by the skill
(docs/workflow.md § 2).

`whats-next.py close <id>...` is the closure of a task: it deletes each entry's
file and removes its reference from the queue, in the pull request that ships it.
`whats-next.py next-id <TODO|DEBT|FLOW>` prints the next free id of a kind.
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
# An entry is one file named by its id, so two closures never touch the same file.
ENTRY_DIRS = {"TODO": "docs/work/todo", "DEBT": "docs/work/debt", "FLOW": "docs/work/flow"}
ENTRY_REF = re.compile(r"(TODO|DEBT|FLOW)-(\d{3})")
# The highest id each kind had given when the entries moved to one file each
# (2026-10-10): the ids of entries closed before the move are in no folder's history.
ID_FLOORS = {"TODO": 21, "DEBT": 46, "FLOW": 35}

TODO_HEADING = re.compile(r"^# (TODO-\d{3}) — (.+?)\s*$", re.MULTILINE)
DEBT_HEADING = re.compile(r"^# (\d{4}-\d{2}-\d{2}) — (DEBT-\d{3}) — (.+?)\s*$", re.MULTILINE)
# One reference per line, as a plain list item. A numbered item is still read, so a
# hand-edited queue is never silently empty.
# A `gh#NN` reference is a pull request worked like an entry: a Dependabot one (FLOW-024).
QUEUE_LINE = re.compile(r"^(?:-|\d+\.)\s+((?:TODO|DEBT|FLOW)-\d{3}|gh#\d+)\b", re.MULTILINE)
PULL_REF = re.compile(r"gh#\d+")
# The bot's login as `gh` and the API give it; an exact match, so no account that merely contains the word counts.
DEPENDABOT_LOGINS = ("app/dependabot", "dependabot[bot]")
FLOW_HEADING = re.compile(r"^# (FLOW-\d{3}) — (.+?)\s*$", re.MULTILINE)
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
class Pull:
    id: str
    title: str
    dependabot: bool


@dataclass
class Flow:
    id: str
    title: str
    decided: bool
    watch: bool = False


def queue(queue_text: str) -> list[str]:
    """The references under `## Next`, in order."""
    section = re.search(r"^## Next\s*$(.*?)(?=^## |\Z)", queue_text, re.MULTILINE | re.DOTALL)
    if not section:
        return []
    return QUEUE_LINE.findall(re.sub(r"<!--.*?-->", "", section.group(1), flags=re.DOTALL))


def _bodies(text: str, heading: re.Pattern) -> list[tuple[re.Match, str]]:
    matches = list(heading.finditer(text))
    ends = [m.start() for m in matches[1:]] + [len(text)]
    return [(m, text[m.end() : end]) for m, end in zip(matches, ends)]


def todo_entries(todo_text: str) -> list[Todo]:
    """The todo entries of `todo_text`: the files of a kind, one after the other."""
    entries = []
    for match, body in _bodies(todo_text, TODO_HEADING):
        marks = list(FIELD.finditer(body))
        ends = [m.start() for m in marks[1:]] + [len(body)]
        fields = {m.group(1): body[m.end() : end].strip() for m, end in zip(marks, ends)}
        entries.append(Todo(match.group(1), match.group(2), fields))
    return entries


def debt_entries(debt_text: str) -> list[Debt]:
    entries = []
    for match, body in _bodies(debt_text, DEBT_HEADING):
        where = re.search(r"^\*\*Where:\*\*\s*(.*)$", body, re.MULTILINE)
        entries.append(Debt(match.group(2), match.group(1), match.group(3), where.group(1).strip() if where else ""))
    return entries


def flow_entries(flow_text: str) -> list[Flow]:
    """The flow entries; one is workable once the owner's decision is written."""
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


def pull_requests(pulls: Sequence[dict]) -> list[Pull]:
    return [
        Pull(f"gh#{pull['number']}", pull.get("title", ""), (pull.get("author") or {}).get("login") in DEPENDABOT_LOGINS)
        for pull in pulls
    ]


def classify(
    refs: list[str], todos: list[Todo], debts: list[Debt], flows: Sequence[Flow] = (), pulls: Sequence[dict] | None = ()
) -> dict:
    """Sort every entry into its bucket. `pulls` is None when GitHub could not be asked: unknown, never none."""
    opened = None if pulls is None else pull_requests(pulls)
    by_id: dict[str, Todo | Debt | Flow | Pull] = {e.id: e for e in [*todos, *debts, *flows, *(opened or [])]}

    def waits(ref: str) -> list[str]:
        if PULL_REF.fullmatch(ref):
            if opened is None:
                return ["unknown: GitHub could not be asked"]
            return [] if ref in by_id else ["no such open pull request"]
        return _waits(by_id.get(ref))

    queued = [(ref, by_id.get(ref), waits(ref)) for ref in refs]
    loose = [t for t in todos if t.id not in refs]
    return {
        "queued": queued,
        "ready": [t for t in loose if not waits_on(t)],
        "blocked": [(t, waits_on(t)) for t in loose if waits_on(t)],
        "debt": [d for d in debts if d.id not in refs],
        "flow": [f for f in flows if f.id not in refs],
        "dependabot": None if opened is None else [pull for pull in opened if pull.dependabot and pull.id not in refs],
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
            ["gh", "pr", "list", "--state", "open", "--json", "number,title,headRefName,author,statusCheckRollup"],
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

    lines += ["", "Flow, not queued:"]
    lines += [
        f"- {flow.id} — {flow.title}"
        + (" — watch" if flow.watch else "" if flow.decided else " — waits on: the owner's decision")
        for flow in buckets.get("flow", [])
    ] or ["(none)"]

    # Their reviewer checks are skips (no secrets): each is proposed for the queue, to be reviewed for real.
    lines.append("")
    if pulls is None:
        lines.append("Dependabot pull requests, not queued: unknown (GitHub could not be asked)")
    else:
        lines.append("Dependabot pull requests, not queued:")
        lines += [f"- {pull.id} — {pull.title}" for pull in buckets.get("dependabot") or []] or ["(none)"]

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


def entry_path(ref: str) -> str | None:
    """The file of the entry `ref`; None when `ref` is not an entry id."""
    match = ENTRY_REF.fullmatch(ref)
    return f"{ENTRY_DIRS[match.group(1)]}/{ref}.md" if match else None


def without_queue_line(queue_text: str, ref: str) -> str:
    """`queue_text` without the reference `ref` under `## Next`; unchanged when it is not queued."""
    section = re.search(r"^## Next\s*$(.*?)(?=^## |\Z)", queue_text, re.MULTILINE | re.DOTALL)
    if not section:
        return queue_text
    kept = re.sub(rf"^(?:-|\d+\.)\s+{re.escape(ref)}\b.*\n", "", section.group(1), flags=re.MULTILINE)
    return queue_text[: section.start(1)] + kept + queue_text[section.end(1) :]


def close(refs: list[str], queue_text: str, exists) -> tuple[list[str], str, list[str]]:
    """What closing `refs` changes (docs/workflow.md § 3, closure): what to say, the queue, the files to delete.

    Raises before anything is decided unless every reference names an entry.
    """
    said, gone = [], []
    for ref in refs:
        unqueued = without_queue_line(queue_text, ref)
        was_queued = unqueued != queue_text
        if PULL_REF.fullmatch(ref):  # a pull request has no entry: only its queue line goes
            if not was_queued:
                raise NoSuchEntry(f"{ref}: not in the queue")
            said.append(f"{ref}: removed from the queue")
        else:
            path = entry_path(ref)
            if path is None:
                raise NoSuchEntry(f"{ref}: not an entry id (TODO-NNN, DEBT-NNN, FLOW-NNN or gh#NN)")
            if path in gone or not exists(path):
                raise NoSuchEntry(f"{ref}: no such entry ({path})")
            gone.append(path)
            said.append(f"{ref}: {path} deleted, " + ("removed from the queue" if was_queued else "it was not queued"))
        queue_text = unqueued
    return said, queue_text, gone


def next_id(kind: str, names: Sequence[str]) -> str:
    """The next free id of `kind`, given every file name the kind has had: ids are never reused."""
    given = [int(m.group(2)) for m in map(ENTRY_REF.search, names) if m and m.group(1) == kind]
    return f"{kind}-{max([ID_FLOORS[kind], *given]) + 1:03d}"


def names_ever(kind: str) -> list[str]:
    """Every file the folder of `kind` holds or has held, from the working tree and the git history."""
    folder = ROOT / ENTRY_DIRS[kind]
    names = [path.name for path in folder.glob("*.md")] if folder.is_dir() else []
    log = subprocess.run(
        ["git", "log", "--all", "--diff-filter=A", "--name-only", "--format=", "--", ENTRY_DIRS[kind]],
        capture_output=True, text=True, check=True, cwd=ROOT,
    )
    return names + log.stdout.split()


def kind_text(kind: str) -> str:
    """The entries of `kind`, one file after the other; debt newest first."""
    folder = ROOT / ENTRY_DIRS[kind]
    files = sorted(folder.glob(f"{kind}-*.md"), reverse=kind == "DEBT") if folder.is_dir() else []
    return "\n".join(path.read_text(encoding="utf-8") for path in files)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["close"]:
        if len(argv) < 2:
            print("usage: whats-next.py close <TODO-NNN | DEBT-NNN | FLOW-NNN | gh#NN>...", file=sys.stderr)
            return 2
        queue_file = ROOT / QUEUE_HOME
        queue_text = queue_file.read_text(encoding="utf-8")
        try:
            said, unqueued, gone = close(argv[1:], queue_text, lambda path: (ROOT / path).is_file())
        except NoSuchEntry as error:
            print(f"❌ {error} — nothing was changed", file=sys.stderr)
            return 1
        if unqueued != queue_text:
            queue_file.write_text(unqueued, encoding="utf-8")
        for path in gone:
            (ROOT / path).unlink()
        print("\n".join(said))
        return 0
    if argv[:1] == ["next-id"]:
        if len(argv) != 2 or argv[1] not in ENTRY_DIRS:
            print("usage: whats-next.py next-id <TODO | DEBT | FLOW>", file=sys.stderr)
            return 2
        print(next_id(argv[1], names_ever(argv[1])))
        return 0
    queue_text = (ROOT / QUEUE_HOME).read_text(encoding="utf-8")
    pulls = open_pull_requests()
    buckets = classify(
        queue(queue_text),
        todo_entries(kind_text("TODO")),
        debt_entries(kind_text("DEBT")),
        flow_entries(kind_text("FLOW")),
        pulls,
    )
    print(render(buckets, pulls, lambda path: (ROOT / path).exists()))
    return 0


if __name__ == "__main__":
    import usage_log

    usage_log.start()
    sys.exit(main())
