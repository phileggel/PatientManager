#!/usr/bin/env python3
"""Every document has one location, every rule one home (TODO-015).

Two checks against drift:

1. The doc map. `docs/README.md` lists each kind of document with its locations
   (backticked paths, relative to `docs/`). Every tracked Markdown file must sit in
   a listed location, every listed location must exist, and the Rules kind holds
   exactly the `*-rules.md` files.
2. Rule homes. A rule, entry or lesson is defined where its ID opens a line
   followed by an em dash — `**B24** —`, `## E11 —`, `**BAS-010 (R1) —`,
   `# TODO-003 —`, `# 2026-09-27 — DEBT-008 —`, `# FLOW-001 —`, `### TL-001 —`. Anywhere else an
   ID is a mention. One ID defined in two places fails: the copy is removed and
   the other document links to the home.
3. Entry files. A todo, debt or flow entry is one file under `docs/work/`, named
   by the one ID it defines (`docs/work/debt/DEBT-008.md`), in the folder of its kind.
4. The agentic setup (FLOW-036). `docs/agentic-setup.md` gives one list item to each
   piece, opened by its backticked path. Every script, skill, agent prompt and git
   hook that exists is listed once, and everything listed exists.

Use: python3 scripts/rule-homes.py
"""

import posixpath
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP = "docs/README.md"
DEFINITION = re.compile(
    r"^(?:\*\*([A-Z]{1,3}\d+)\*\* —"
    r"|#{2,3} ([A-Z]{1,3}\d+) —"
    r"|\*\*([A-Z]{3}-\d{3}[A-Z]?)(?: \([^)]*\))? —"
    r"|#{1,3} ((?:TODO|TL|FLOW)-\d{3}) —"
    r"|#{1,2} \d{4}-\d{2}-\d{2} — (DEBT-\d{3}) —)"
)
KIND = re.compile(r"^- \*\*([^*]+)\*\* — (.*)$")
PATH = re.compile(r"`([^`\s]+(?:\.md|/))`")
ENTRY_FILE = re.compile(r"docs/work/(todo|debt|flow)/(.+)\.md")
SETUP = "docs/agentic-setup.md"
PIECE = re.compile(r"^- `([^`\s]+)`")
SKILL = re.compile(r"(\.claude/skills/[^/]+/).+")


def defined_ids(text: str) -> list[str]:
    """The IDs a document defines, in order."""
    ids = []
    for line in text.splitlines():
        match = DEFINITION.match(line)
        if match:
            ids.append(next(group for group in match.groups() if group))
    return ids


def duplicates(found: dict[str, list[str]]) -> dict[str, list[str]]:
    """IDs defined more than once, with every place, sorted."""
    homes: dict[str, list[str]] = {}
    for path, ids in found.items():
        for rule_id in ids:
            homes.setdefault(rule_id, []).append(path)
    return {rule_id: sorted(paths) for rule_id, paths in homes.items() if len(paths) > 1}


def kinds(map_text: str) -> dict[str, list[str]]:
    """Each kind in the map with its locations, as repository paths.

    A kind is a `- **Kind** — …` bullet; its continuation lines belong to it.
    """
    found: dict[str, list[str]] = {}
    current = None
    for line in map_text.splitlines():
        match = KIND.match(line)
        if match:
            current = match.group(1)
            found[current] = []
            line = match.group(2)
        elif not line.startswith("  "):
            current = None
        if current:
            for raw in PATH.findall(line):
                path = posixpath.normpath(posixpath.join("docs", raw))
                found[current].append(path + "/" if raw.endswith("/") else path)
    return found


def unmapped(files: list[str], locations: list[str]) -> list[str]:
    """Markdown files that sit in no listed location."""
    return [
        f for f in files
        if f != MAP and not any(f == loc or (loc.endswith("/") and f.startswith(loc)) for loc in locations)
    ]


def misfiled(found: dict[str, list[str]], files: list[str]) -> list[str]:
    """Rules docs outside the Rules kind, and anything else inside it."""
    rules = set(found.get("Rules", []))
    problems = [f"{loc}: listed under Rules but not a *-rules.md" for loc in rules if not loc.endswith("-rules.md")]
    problems += [f"{f}: a *-rules.md not listed under Rules" for f in files if f.endswith("-rules.md") and f not in rules]
    return sorted(problems)


def misnamed(found: dict[str, list[str]]) -> list[str]:
    """Entry files whose name, folder and heading do not say the same ID."""
    problems = []
    for path, ids in sorted(found.items()):
        entry = ENTRY_FILE.fullmatch(path)
        if not entry:
            continue
        folder, name = entry.groups()
        if not re.fullmatch(rf"{folder.upper()}-\d{{3}}", name):
            problems.append(f"{path}: an entry of {folder}/ is named {folder.upper()}-NNN.md")
        elif ids != [name]:
            problems.append(f"{path}: defines {', '.join(ids) or 'no ID'}, not the one ID {name} it is named after")
    return problems


def listed_pieces(setup_text: str) -> list[str]:
    """The paths the setup document gives a line to, in order: each opens a list item."""
    return [match.group(1) for line in setup_text.splitlines() if (match := PIECE.match(line))]


def setup_pieces(files: list[str]) -> list[str]:
    """The pieces that owe a line: scripts, skills (as their folder), agent prompts, git hooks."""
    pieces = set()
    for f in files:
        skill = SKILL.fullmatch(f)
        if skill:
            pieces.add(skill.group(1))
        elif re.fullmatch(r"scripts/[^/]+|\.claude/agents/[^/]+\.md", f):
            pieces.add(f)
        elif re.fullmatch(r"\.githooks/[^/.]+", f):
            pieces.add(f)
    return sorted(pieces)


def setup_problems(pieces: list[str], listed: list[str], exists) -> list[str]:
    """Pieces without a line, lines without their piece, and pieces listed twice."""
    problems = [f"{piece}: exists but has no line in {SETUP}" for piece in pieces if piece not in listed]
    problems += [f"{path}: listed in {SETUP} but missing" for path in dict.fromkeys(listed) if not exists(path)]
    problems += [f"{path}: listed twice in {SETUP}" for path in dict.fromkeys(listed) if listed.count(path) > 1]
    return problems


def tracked(*patterns: str) -> list[str]:
    out = subprocess.run(["git", "ls-files", *patterns], cwd=ROOT, capture_output=True, text=True, check=True)
    return [line for line in out.stdout.splitlines() if (ROOT / line).is_file()]


def main() -> int:
    files = tracked("*.md")
    found = kinds((ROOT / MAP).read_text(encoding="utf-8"))
    locations = [loc for locs in found.values() for loc in locs]
    problems = [f"{loc}: listed in {MAP} but missing" for loc in locations if not (ROOT / loc).exists()]
    problems += [f"{f}: not in any location of {MAP}" for f in unmapped(files, locations)]
    problems += misfiled(found, files)

    documents = [f for f in files if f in ("CLAUDE.md", "ARCHITECTURE.md") or f.startswith(("docs/", ".claude/"))]
    defined = {f: defined_ids((ROOT / f).read_text(encoding="utf-8")) for f in documents}
    problems += [f"{rule_id}: defined in {', '.join(paths)}" for rule_id, paths in sorted(duplicates(defined).items())]
    problems += misnamed(defined)

    listed = listed_pieces((ROOT / SETUP).read_text(encoding="utf-8"))
    pieces = setup_pieces(tracked("scripts", ".claude", ".githooks"))
    problems += setup_problems(pieces, listed, exists=lambda path: (ROOT / path).exists())

    if problems:
        print(f"❌ rule homes: {len(problems)} problem(s)")
        for problem in problems:
            print(f"   {problem}")
        return 1
    print(f"✅ rule homes: {len(files)} documents mapped, every ID defined once, {len(pieces)} setup pieces listed")
    return 0


if __name__ == "__main__":
    import usage_log

    usage_log.start()
    sys.exit(main())
