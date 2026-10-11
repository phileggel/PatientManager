#!/usr/bin/env python3
"""Wait for the checks of a pull request and say how they ended.

Use:  just watch-pr            the pull request of the current branch
      just watch-pr 178        that pull request
Exit: 0 every check green · 1 a check failed · 2 GitHub unreachable · 3 timed out
      4 the pull request is not open · 5 the pull request never reached the local commit
      6 a reviewer lane was stopped by the CI account's usage limit (the reset time is printed)

It reads the check runs of the head commit, the newest run per name, as
`scripts/merge.py` does, and it is done only once every check named in
`required-checks.json` has reported. For the pull request of the current branch, no
check is read before GitHub knows the local commit: right after a push it still answers
with the commit before, whose checks are green (FLOW-038). A push moves the watch to the
new head. A failed poll is retried: five in a row end the watch. When a check has failed
and the required ones still missing do not appear over four polls, the watch ends as
failed: a job that starts others (the reviewer lanes) failed before starting them.

Every line printed is something to act on (a failure when it lands, a stuck check,
the verdict), so the script can run under a monitor without noise. A reviewer lane that
failed without a report is explained from its sticky comment (FLOW-055): the stated
reason, what the session said, and when that is the usage limit, the reset time.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PASSING = ("success", "skipped", "neutral")
LANE = "reviewer-"
# The sticky comment review.yml writes when a lane produced no report: its stated reason and the session's last words.
# The quote carries one `> ` on its first line only; a message of several lines runs to the end of the comment.
NO_REPORT = re.compile(r"— no report\n.*?On the second try (?P<reason>.+?)\.\n\nSession said:\n\n(?P<said>>.*)", re.S)
# "You've hit your usage limit. Your limit resets 11:50am (UTC)." — the time, as the session gave it.
USAGE_LIMIT = re.compile(
    r"\b(?:usage|rate) limit\b.*?\bresets?\b(?: at)?\s+(?P<when>\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*\(?UTC\)?)?)", re.I | re.S
)


class GitHubError(Exception):
    """GitHub could not be asked, or did not answer: worth another try."""


@dataclass(frozen=True)
class Run:
    id: int
    name: str
    status: str
    conclusion: str
    url: str
    completed_at: str

    @property
    def done(self) -> bool:
        return self.status == "completed"

    @property
    def stuck(self) -> bool:
        """GitHub recorded an end but still reports the run in progress."""
        return not self.done and bool(self.completed_at)


def parse_runs(lines: str) -> list[Run]:
    runs = []
    for line in lines.splitlines():
        if line.strip():
            raw = json.loads(line)
            runs.append(
                Run(int(raw["id"]), raw["name"], raw["status"], raw.get("conclusion") or "", raw.get("html_url") or "", raw.get("completed_at") or "")
            )
    return runs


def latest(runs: Iterable[Run]) -> list[Run]:
    """One run per name: a re-run has a higher id and replaces the earlier one."""
    newest: dict[str, Run] = {}
    for run in runs:
        if run.name not in newest or run.id > newest[run.name].id:
            newest[run.name] = run
    return list(newest.values())


def verdict(runs: list[Run], required: list[str]) -> tuple[str, list[str]]:
    """("running", what is awaited), ("failing", the failed checks) or ("green", [])."""
    names = {run.name for run in runs}
    waiting = [name for name in required if name not in names] + [run.name for run in runs if not run.done]
    if waiting:
        return "running", waiting
    failing = sorted(run.name for run in runs if run.conclusion not in PASSING)
    return ("failing", failing) if failing else ("green", [])


def _failure(run: Run) -> str:
    return f"{run.name}: {run.conclusion} — {run.url}"


SAID_LIMIT = 200


def _plain(text: str) -> str:
    """The text with its control characters dropped and capped: the session read an unreviewed diff,
    so its words are printed as data, never as escapes or a wall of text."""
    text = "".join(char for char in text if char.isprintable())
    return text if len(text) <= SAID_LIMIT else text[:SAID_LIMIT] + "…"


def no_report(comment: str) -> tuple[str, str] | None:
    """(the reason the workflow stated, what the session said) when a lane's sticky comment reports no report."""
    found = NO_REPORT.search(comment)
    if not found:
        return None
    said = " ".join(line.removeprefix(">").strip() for line in found.group("said").splitlines() if line.strip())
    return _plain(found.group("reason")), _plain(said)


def usage_limit_reset(said: str) -> str | None:
    """The reset time when the session's words say a usage limit stopped it, as they give it."""
    found = USAGE_LIMIT.search(said)
    return found.group("when").strip() if found else None


def explain(failed: list[Run], comment_of: Callable[[str], str | None], out: Callable[[str], None]) -> int:
    """Say why each failed reviewer lane wrote no report.

    6 when every failure is a lane the usage limit stopped (nothing to fix, re-run after the reset);
    1 as soon as any check failed for another reason, that failure being the one to read first.
    """
    limited = 0
    for run in failed:
        if not run.name.startswith(LANE):
            continue
        comment = comment_of(run.name[len(LANE):])
        if comment is None:
            out(f"{run.name}: no sticky comment to read")
            continue
        stopped = no_report(comment)
        if stopped is None:
            continue
        reason, said = stopped
        out(f"{run.name}: no report — {reason}; session said: {said}")
        when = usage_limit_reset(said)
        if when:
            out(f"USAGE LIMIT: {run.name} resets {when} — re-run that job then, nothing to fix")
            limited += 1
    return 6 if limited and limited == len(failed) else 1


def watch(
    read_head: Callable[[], str],
    read_runs: Callable[[str], list[Run]],
    required: list[str],
    out: Callable[[str], None],
    sleep: Callable[[float], None],
    clock: Callable[[], float],
    interval: float = 30,
    timeout: float = 1800,
    max_errors: int = 5,
    patience: int = 4,
    expected: str = "",
    push_patience: int = 10,
    report_failed: Callable[[list[Run]], None] | None = None,
) -> int:
    """`expected` is the local commit of the watched branch, or "" to watch whatever the head is.

    `report_failed` is handed the failed runs when the watch ends with 1, so the caller can explain them.
    """
    deadline = clock() + timeout
    head, errors, stalled, waiting = "", 0, 0, ["the first answer"]
    told: set[tuple[str, str]] = set()
    behind = 0
    while True:
        try:
            sha = read_head()
            # Checks are read only once the pull request is on the pushed commit.
            lagging = bool(expected) and sha != expected and not head
            runs = [] if lagging else latest(read_runs(sha))
        except GitHubError as error:
            errors += 1
            out(f"poll error ({errors}/{max_errors}): {error}")
            if errors >= max_errors:
                out(f"GITHUB UNREACHABLE after {max_errors} tries")
                return 2
        else:
            errors = 0
            if lagging:
                behind += 1
                if behind == 1:
                    out(f"waiting for GitHub to know {expected[:7]}: the pull request is still on {sha[:7]}")
                if behind >= push_patience:
                    out(f"OUT OF STEP: the pull request is on {sha[:7]}, the local branch on {expected[:7]} — push or pull, then watch again")
                    return 5
                waiting = [f"the pushed commit {expected[:7]}"]
                sleep(interval)
                if clock() >= deadline:
                    out(f"TIMED OUT after {timeout:g} s, still waiting on: {', '.join(waiting)}")
                    return 3
                continue
            if sha != head:
                if head:
                    out(f"head moved to {sha[:7]}")
                head, told, stalled = sha, set(), 0
            for run in runs:
                kind = "stuck" if run.stuck else "failed" if run.done and run.conclusion not in PASSING else ""
                if kind and (run.name, kind) not in told:
                    told.add((run.name, kind))
                    out(_failure(run) if kind == "failed" else f"{run.name}: stuck in_progress with a completion time — {run.url}")
            state, names = verdict(runs, required)
            if state == "green":
                out(f"ALL CHECKS GREEN on {sha[:7]}")
                return 0
            failed = [run for run in sorted(runs, key=lambda r: r.name) if run.done and run.conclusion not in PASSING]
            # Everything that reported is done and something failed: what is still missing may never come.
            stalled = stalled + 1 if failed and all(run.done for run in runs) else 0
            if state == "failing" or stalled >= patience:
                never = f" (never reported: {', '.join(names)})" if state == "running" else ""
                out(f"FINISHED WITH FAILURES on {sha[:7]}{never}:")
                for run in failed:
                    out(f"  {_failure(run)}")
                if report_failed:
                    report_failed(failed)
                return 1
            waiting = names
        sleep(interval)
        if clock() >= deadline:
            out(f"TIMED OUT after {timeout:g} s on {head[:7] or 'no head'}, still waiting on: {', '.join(waiting)}")
            return 3


class NotOpen(Exception):
    """The pull request is merged or closed: nothing left to watch."""


def gh(*args: str) -> str:
    try:
        result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60, cwd=ROOT)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise GitHubError(str(error)) from error
    if result.returncode != 0:
        raise GitHubError((result.stderr or result.stdout).strip().splitlines()[-1] if (result.stderr or result.stdout).strip() else "gh failed")
    return result.stdout


def head_of(pull: str | None) -> str:
    """The head commit of the pull request (of the current branch when none is named)."""
    answer = gh("pr", "view", *([pull] if pull else []), "--json", "headRefOid,state")
    try:
        data = json.loads(answer)
    except json.JSONDecodeError as error:
        raise GitHubError("gh pr view did not answer JSON") from error
    if data["state"] != "OPEN":
        raise NotOpen(data["state"])
    return data["headRefOid"]


def expected_head(pull_branch: str, local_branch: str, local_head: str) -> str:
    """The commit the watch waits for: the local one when the pull request is the current branch's."""
    return local_head if pull_branch == local_branch else ""


def local_commit(pull: str | None, say: Callable[[str], None]) -> str:
    """The local commit to wait for, or "" when the watched pull request is another branch's.

    When it cannot be read, the watch says so in one line and watches whatever head GitHub gives (FLOW-053).
    """
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], capture_output=True, text=True, check=True, cwd=ROOT).stdout.strip()

    try:
        branch = json.loads(gh("pr", "view", *([pull] if pull else []), "--json", "headRefName"))["headRefName"]
        return expected_head(branch, git("branch", "--show-current"), git("rev-parse", "HEAD"))
    except (GitHubError, json.JSONDecodeError, KeyError, OSError, subprocess.CalledProcessError) as error:
        say(f"the local commit could not be read ({error}): watching whatever head GitHub gives")
        return ""


def comment_of(pull: str | None, lane: str) -> str | None:
    """The sticky comment of a reviewer lane on the pull request, or None when there is none to read."""
    try:
        number = json.loads(gh("pr", "view", *([pull] if pull else []), "--json", "number"))["number"]
        # One JSON string per line; the marker is matched here, so the lane's name never enters a jq filter.
        lines = gh("api", f"repos/{{owner}}/{{repo}}/issues/{number}/comments", "--paginate", "--jq", ".[].body | @json")
        bodies = [json.loads(line) for line in lines.splitlines() if line.strip()]
    except (GitHubError, json.JSONDecodeError, KeyError):
        return None
    return next((body for body in bodies if body.startswith(f"<!-- review:{lane} -->")), None)


def runs_of(sha: str) -> list[Run]:
    answer = gh(
        "api", f"repos/{{owner}}/{{repo}}/commits/{sha}/check-runs?filter=latest", "--paginate",
        "--jq", ".check_runs[] | {id, name, status, conclusion, html_url, completed_at}",
    )
    try:
        return parse_runs(answer)
    except (json.JSONDecodeError, KeyError) as error:
        raise GitHubError("the check runs could not be read") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pull", nargs="?", help="pull request number (default: the current branch's)")
    parser.add_argument("--interval", type=float, default=30, help="seconds between two polls (default 30)")
    parser.add_argument("--timeout", type=float, default=1800, help="seconds before giving up (default 1800)")
    args = parser.parse_args(argv)
    required = list(json.loads((ROOT / "required-checks.json").read_text(encoding="utf-8"))["checks"])

    def say(line: str) -> None:
        print(line, flush=True)

    failed: list[Run] = []
    try:
        code = watch(
            lambda: head_of(args.pull), runs_of, required, say, time.sleep, time.monotonic, args.interval, args.timeout,
            expected=local_commit(args.pull, say), report_failed=failed.extend,
        )
        return explain(failed, lambda lane: comment_of(args.pull, lane), say) if code == 1 else code
    except NotOpen as state:
        say(f"PULL REQUEST {state}: nothing to watch")
        return 4


if __name__ == "__main__":
    import usage_log

    usage_log.start()
    sys.exit(main())
