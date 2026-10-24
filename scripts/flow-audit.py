#!/usr/bin/env python3
"""Deterministic figures for the /flow-audit skill.

Measures how work moved between two batch ends (releases or `batch/<date>` tags) — the pull requests merged, how long each
took from opening to merging, the CI rounds and what failed, how long each workflow
runs, how long the batch took, how many issues and Dependabot pull requests
were open at its start and at its end, the backlog by size against its ceiling — and prints them as one JSON document, beside the
same figures for the batch before when asked. It also reads the repository itself:
which tools the usage log saw and which it never did, the paths the documents name that
no longer exist, and the length of the documents and prompts the agent works from,
beside the batch before.

Usage:
    python3 scripts/flow-audit.py v0.5.0                 # from that batch end to now
    python3 scripts/flow-audit.py v0.5.0 v0.6.0          # between two batch ends
    python3 scripts/flow-audit.py v0.5.0 v0.6.0 --previous v0.4.0
    python3 scripts/flow-audit.py v0.5.0 --pretty

A release is named by its tag; its moment is when it was published on GitHub. A batch
that ended without a release is named by its `batch/<date>` tag, dated by the tag. The skill
posts the figures on the batch's `batch-audit` issue. This script has
no judgment — only counting.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import shutil
import statistics
import subprocess
import sys
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PULL_REQUEST_FIELDS = (
    "number,title,state,createdAt,mergedAt,closedAt,additions,headRefName,author"
)
ISSUE_FIELDS = "number,createdAt,closedAt"
# The bot's login as `gh` and the API give it.
DEPENDABOT_LOGINS = ("app/dependabot", "dependabot[bot]")
RUN_FIELDS = (
    "workflowName,headBranch,headSha,conclusion,event,createdAt,startedAt,updatedAt"
)
# The workflow whose runs count the CI rounds of a branch: it runs on every push.
ROUND_WORKFLOW = "Quality"
# The conventional commit types of `docs/commit-rules.md`.
COMMIT_TYPES = {"feat", "fix", "refactor", "chore", "ci", "docs", "test"}
# What the agent works from: rules, the workflow and every prompt. Their length is
# stated beside the batch before, so a document that only grows is seen.
GUIDES = (
    "CLAUDE.md",
    "docs/workflow.md",
    "docs/agentic-setup.md",
    "docs/*-rules.md",
    ".claude/skills/*/SKILL.md",
    ".claude/agents/*.md",
    ".claude/rules/*.md",
)
# Records keep the paths of their day; every other document names paths that exist.
RECORDS = ("CHANGELOG.md", "docs/adr/", "docs/lessons.md")
# A backticked token is read as a path only when it starts at the repository root.
PATH_ROOTS = ("src/", "src-tauri/", "docs/", "scripts/", "e2e/", ".github/", ".claude/", ".githooks/")
# The two halves of the usage log itself: they log the others and never themselves.
LOGGERS = ("usage_log.py", "usage-log.sh")
# A run that ended without passing; a cancelled one is counted apart — nothing ran to its end.
FAILED = ("failure", "timed_out", "startup_failure")
# Ticket #492: the backlog counted by size; a ticket with none counts as an M.
SIZE_WEIGHTS = {"size:S": 1, "size:M": 2, "size:L": 4, "size:XL": 8}
UNSIZED_WEIGHT = 2
# What raises the ceiling: a ticket the owner asked to add. The batch's audit issue is no work.
OWNER_ASKED = "owner-asked"
NOT_WORK = "batch-audit"
PULL_REQUEST_LIMIT = 500
ISSUE_LIMIT = 500
RUN_LIMIT = 1000


def parse_moment(text: str) -> datetime:
    """A GitHub timestamp (`2026-10-04T05:31:00Z`) as an aware datetime."""
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _within(text: str | None, since: datetime, until: datetime) -> bool:
    return text is not None and since < parse_moment(text) <= until


def _minutes(start: str, end: str) -> float:
    return (parse_moment(end) - parse_moment(start)).total_seconds() / 60


def _rounded(value: float) -> float:
    return round(value, 1)


def commit_type(title: str) -> str:
    """The conventional type a pull request's title starts with, or `other`."""
    head = title.split(":", 1)[0].strip()
    return head if ":" in title and head in COMMIT_TYPES else "other"


def measure_pull_requests(
    pull_requests: list[dict], since: datetime, until: datetime
) -> dict:
    """The pull requests merged in the window, and those closed in it without merging."""
    merged = sorted(
        (pr for pr in pull_requests if _within(pr.get("mergedAt"), since, until)),
        key=lambda pr: pr["number"],
    )
    closed = [
        pr
        for pr in pull_requests
        if pr.get("mergedAt") is None and _within(pr.get("closedAt"), since, until)
    ]
    minutes = [_minutes(pr["createdAt"], pr["mergedAt"]) for pr in merged]
    by_type: dict[str, int] = {}
    for pr in merged:
        kind = commit_type(pr["title"])
        by_type[kind] = by_type.get(kind, 0) + 1
    return {
        "merged": len(merged),
        "first": merged[0]["number"] if merged else None,
        "last": merged[-1]["number"] if merged else None,
        "closed_without_merging": sorted(pr["number"] for pr in closed),
        "lines_added": sum(pr.get("additions", 0) for pr in merged),
        "mean_minutes_to_merge": _rounded(statistics.fmean(minutes))
        if minutes
        else None,
        "median_minutes_to_merge": _rounded(statistics.median(minutes))
        if minutes
        else None,
        # How long the batch took: from the first pull request opened to the last merged.
        "minutes_first_opened_to_last_merged": _rounded(
            _minutes(
                min(pr["createdAt"] for pr in merged),
                max(pr["mergedAt"] for pr in merged),
            )
        )
        if merged
        else None,
        "by_type": dict(sorted(by_type.items())),
    }


def measure_ci(
    runs: list[dict], pull_requests: list[dict], since: datetime, until: datetime, reruns: Sequence[dict] = ()
) -> dict:
    """The CI rounds of the window's pull request branches, what failed, how long runs take.

    A round is one pushed commit of a branch that the round workflow ran on; the rounds
    beyond the first of each branch are the ones a rebase or a fix cost. Runs are matched
    to a pull request by its branch, within the window: a pull request opened before the
    window loses the rounds it ran before it. A failure is counted per run, so a commit
    run again after a failure counts once as a round and once per failed run. `gh run list`
    shows a run's last attempt only: `reruns` carries the earlier attempts of each run that
    was re-run (`collect_reruns`), and their failures count too (FLOW-057).
    """
    branches = {
        pr["headRefName"]
        for pr in pull_requests
        if _within(pr.get("mergedAt"), since, until)
        or (pr.get("mergedAt") is None and _within(pr.get("closedAt"), since, until))
    }

    def in_window(items: list[dict]) -> list[dict]:
        return [
            run
            for run in items
            if run.get("event") == "pull_request"
            and run.get("headBranch") in branches
            and _within(run.get("createdAt"), since, until)
        ]

    in_window_runs = in_window(runs)
    rounds = {
        (run["headBranch"], run["headSha"])
        for run in in_window_runs
        if run.get("workflowName") == ROUND_WORKFLOW
    }
    branches_run = {branch for branch, _ in rounds}
    failures: dict[str, int] = {}
    cancelled: dict[str, int] = {}
    durations: dict[str, list[float]] = {}
    rerun_lines = []
    for rerun in in_window(list(reruns)):
        name = rerun.get("workflowName") or "unknown"
        failed = sum(conclusion in FAILED for conclusion in rerun.get("attempts", ()))
        failures[name] = failures.get(name, 0) + failed
        rerun_lines.append({"workflow": name, "branch": rerun.get("headBranch"), "failed_attempts": failed})
    for run in in_window_runs:
        name = run.get("workflowName") or "unknown"
        if run.get("conclusion") in FAILED:
            failures[name] = failures.get(name, 0) + 1
        if run.get("conclusion") == "cancelled":
            cancelled[name] = cancelled.get(name, 0) + 1
        if (
            run.get("conclusion") == "success"
            and run.get("startedAt")
            and run.get("updatedAt")
        ):
            durations.setdefault(name, []).append(
                _minutes(run["startedAt"], run["updatedAt"])
            )
    return {
        "rounds": len(rounds),
        "branches": len(branches_run),
        "rounds_beyond_the_first": len(rounds) - len(branches_run),
        "failures_by_workflow": dict(sorted(failures.items())),
        "cancelled_by_workflow": dict(sorted(cancelled.items())),
        "reruns": rerun_lines,
        "median_minutes_by_workflow": {
            name: _rounded(statistics.median(values))
            for name, values in sorted(durations.items())
        },
    }


def _open_at(item: dict, moment: datetime) -> bool:
    closed = item.get("closedAt")
    return parse_moment(item["createdAt"]) <= moment and (
        closed is None or parse_moment(closed) > moment
    )


def measure_open(items: list[dict], since: datetime, until: datetime) -> dict:
    """How many of `items` were open when the window started and when it ended (FLOW-042)."""
    return {
        "at_start": sum(_open_at(item, since) for item in items),
        "at_end": sum(_open_at(item, until) for item in items),
    }


def _weight(issue: dict) -> int:
    sizes = [SIZE_WEIGHTS[label] for label in issue["labels"] if label in SIZE_WEIGHTS]
    return max(sizes) if sizes else UNSIZED_WEIGHT


def measure_backlog(issues: list[dict], since: datetime, until: datetime) -> dict:
    """The open backlog by size at both ends (ticket #492): a parent weighs nothing while
    one of its slices is open; the ceiling is the start's count plus the owner's additions.
    Sizes are today's labels, not the ones each ticket had then."""
    work = [issue for issue in issues if NOT_WORK not in issue["labels"]]

    def weight_at(moment: datetime) -> int:
        return sum(
            _weight(issue)
            for issue in work
            if _open_at(issue, moment)
            and not any(_open_at(sub, moment) for sub in issue["subIssues"])
        )

    asked = [
        issue
        for issue in work
        if OWNER_ASKED in issue["labels"] and _within(issue["createdAt"], since, until)
    ]
    at_start, at_end = weight_at(since), weight_at(until)
    ceiling = at_start + sum(_weight(issue) for issue in asked)
    return {
        "at_start": at_start,
        "at_end": at_end,
        "ceiling": ceiling,
        "within_ceiling": at_end <= ceiling,
    }


def dependabot_pull_requests(pull_requests: list[dict]) -> list[dict]:
    return [
        pr
        for pr in pull_requests
        if (pr.get("author") or {}).get("login") in DEPENDABOT_LOGINS
    ]


def measure(
    pull_requests: list[dict], runs: list[dict], since: datetime, until: datetime, reruns: Sequence[dict] = ()
) -> dict:
    """Every figure of one window."""
    return {
        "since": since.isoformat(),
        "until": until.isoformat(),
        "pull_requests": measure_pull_requests(pull_requests, since, until),
        "ci": measure_ci(runs, pull_requests, since, until, reruns),
    }


def measure_usage(
    log_lines: list[str], since: datetime, until: datetime, tools: list[str]
) -> dict:
    """What the usage log saw in the window: runs and failures by tool, and the tools it never saw.

    The log is local and written outside CI only: a tool that only CI runs is never
    seen, and a log that starts after `since` covers part of the window. A recipe that
    runs no script of its own logs `started` and nothing else: a run with no outcome,
    counted apart, never as a failure (FLOW-047).
    """
    runs: dict[str, int] = {}
    failed: dict[str, int] = {}
    no_outcome: dict[str, int] = {}
    stamps = []
    for line in log_lines:
        parts = line.rstrip("\n").split("\t")
        if len(parts) != 4 or not _within(parts[0], since, until):
            continue
        stamp, tool, _, outcome = parts
        stamps.append(stamp)
        runs[tool] = runs.get(tool, 0) + 1
        if outcome == "started":
            no_outcome[tool] = no_outcome.get(tool, 0) + 1
        elif outcome != "ok":
            failed[tool] = failed.get(tool, 0) + 1
    return {
        "first_line": min(stamps) if stamps else None,
        "runs": dict(sorted(runs.items())),
        "failed": dict(sorted(failed.items())),
        "no_outcome": dict(sorted(no_outcome.items())),
        "never_run": sorted(set(tools) - set(runs)),
    }


def dangling_paths(texts: dict[str, str], exists) -> dict[str, list[str]]:
    """The paths each document names that are not in the repository.

    Only a backticked token that starts at the repository root is read as a path; a
    pattern or a placeholder (`docs/spec/*.md`, `docs/spec/TRI-NNN.md`) is not one.
    """
    found: dict[str, list[str]] = {}
    for document, text in sorted(texts.items()):
        gone = []
        for token in re.findall(r"`([^`\n]+)`", text):
            path = token.split(":", 1)[0].rstrip(".,;")
            if not path.startswith(PATH_ROOTS) or re.search(r"[{}*…<>\s]|NNN|\.\.\.", path):
                continue
            if not exists(path) and path not in gone:
                gone.append(path)
        if gone:
            found[document] = gone
    return found


def compare_lengths(now: dict[str, int], before: dict[str, int]) -> dict[str, dict]:
    """Each guide with its length now and at the batch before; None where it did not exist."""
    return {
        path: {"lines": now.get(path), "was": before.get(path)}
        for path in sorted(set(now) | set(before))
    }


def _git(*args: str) -> str:
    try:
        result = subprocess.run(
            ["git", *args], check=True, capture_output=True, text=True, cwd=ROOT
        )
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            f"flow-audit: git {' '.join(args[:2])} failed: {error.stderr.strip()}"
        ) from error
    return result.stdout


def guide_lengths(revision: str) -> dict[str, int]:
    """The line count of every guide as it stood at `revision`."""
    files = _git("ls-tree", "-r", "--name-only", revision).splitlines()
    return {
        path: len(_git("show", f"{revision}:{path}").splitlines())
        for path in files
        if any(fnmatch.fnmatchcase(path, pattern) for pattern in GUIDES)
    }


def known_tools() -> list[str]:
    """Every tool the usage log can name: the scripts, and the recipes that run none."""
    scripts = [
        path.name
        for path in (ROOT / "scripts").iterdir()
        if path.suffix in (".py", ".sh", ".mjs") and path.name not in LOGGERS
    ]
    recipes = re.findall(r'_used "([^"]+)"', (ROOT / "justfile").read_text(encoding="utf-8"))
    return sorted({*scripts, *recipes})


def measure_repository(
    since: datetime, until: datetime, now: str, before: str
) -> dict:
    """What the repository itself says: tools used, dead paths in the documents, guide lengths."""
    log = ROOT / "logs" / "usage.log"
    log_lines = log.read_text(encoding="utf-8").splitlines() if log.exists() else []
    documents = [
        path
        for path in _git("ls-files", "*.md").splitlines()
        if not path.startswith(RECORDS) and (ROOT / path).is_file()
    ]
    texts = {path: (ROOT / path).read_text(encoding="utf-8") for path in documents}
    return {
        "usage": measure_usage(log_lines, since, until, known_tools()),
        "dangling_paths": dangling_paths(texts, lambda path: (ROOT / path).exists()),
        "guides": compare_lengths(guide_lengths(now), guide_lengths(before)),
    }


def _gh_json(*args: str) -> object:
    if not shutil.which("gh"):
        raise SystemExit("flow-audit: the GitHub command line (gh) is not installed")
    try:
        result = subprocess.run(
            ["gh", *args], check=True, capture_output=True, text=True, timeout=120
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise SystemExit(
            f"flow-audit: gh {' '.join(args[:2])} failed: {error}"
        ) from error
    return json.loads(result.stdout or "null")


def _gh_json_lines(*args: str) -> list[dict]:
    """One JSON object per line, as `gh api --paginate --jq` prints them page after page."""
    if not shutil.which("gh"):
        raise SystemExit("flow-audit: the GitHub command line (gh) is not installed")
    try:
        result = subprocess.run(
            ["gh", *args], check=True, capture_output=True, text=True, timeout=300
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"flow-audit: gh {' '.join(args[:2])} failed: {error}") from error
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


BACKLOG_QUERY = """
query($owner: String!, $repo: String!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    issues(first: 100, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt closedAt
        labels(first: 20) { nodes { name } }
        subIssues(first: 50) { nodes { createdAt closedAt } }
      }
    }
  }
}
"""


def collect_backlog() -> list[dict]:
    """Every issue with its labels and its slices, as `measure_backlog` reads them."""
    nodes = _gh_json_lines(
        "api", "graphql", "--paginate", "-F", "owner={owner}", "-F", "repo={repo}",
        "-f", f"query={BACKLOG_QUERY}",
        "--jq", ".data.repository.issues.nodes[]",
    )
    return [
        {
            "createdAt": node["createdAt"],
            "closedAt": node["closedAt"],
            "labels": [label["name"] for label in node["labels"]["nodes"]],
            "subIssues": node["subIssues"]["nodes"],
        }
        for node in nodes
    ]


def collect_reruns(earliest: datetime) -> list[dict]:
    """The runs re-run since `earliest`, each with the conclusions of its earlier attempts.

    `gh run list` has no attempt field: GitHub's REST list gives `run_attempt`, in one
    paginated call narrowed to the window, and each earlier attempt is read on its own.
    """
    rerun = _gh_json_lines(
        "api", "-X", "GET", "repos/{owner}/{repo}/actions/runs", "--paginate",
        "-f", "per_page=100", "-f", f"created=>={earliest.date().isoformat()}",
        "--jq", ".workflow_runs[] | select(.run_attempt > 1)"
        " | {id, run_attempt, name, head_branch, event, created_at}",
    )
    return [
        {
            "workflowName": run["name"],
            "headBranch": run["head_branch"],
            "event": run["event"],
            "createdAt": run["created_at"],
            "attempts": [
                (_gh_json("api", f"repos/{{owner}}/{{repo}}/actions/runs/{run['id']}/attempts/{attempt}") or {}).get("conclusion")
                for attempt in range(1, run["run_attempt"])
            ],
        }
        for run in rerun
    ]


BATCH_TAG_PREFIX = "batch/"


def batch_end_moment(tag: str) -> datetime:
    """When the batch end `tag` happened: a release's publication on GitHub, or the
    tagger date of a `batch/<date>` tag for a batch that ended without one (FLOW-074)."""
    if tag.startswith(BATCH_TAG_PREFIX):
        made = _git(
            "for-each-ref", f"refs/tags/{tag}", "--format=%(taggerdate:iso-strict)"
        ).strip()
        if not made:
            raise SystemExit(f"flow-audit: batch tag {tag} has no tagger date")
        return parse_moment(made)
    release = _gh_json("release", "view", tag, "--json", "publishedAt")
    published = release.get("publishedAt") if isinstance(release, dict) else None
    if not published:
        raise SystemExit(f"flow-audit: release {tag} has no publication date")
    return parse_moment(published)


def collect() -> tuple[list[dict], list[dict]]:
    """The repository's pull requests and workflow runs, as GitHub lists them."""
    pull_requests = _gh_json(
        "pr",
        "list",
        "--state",
        "all",
        "--limit",
        str(PULL_REQUEST_LIMIT),
        "--json",
        PULL_REQUEST_FIELDS,
    )
    runs = _gh_json("run", "list", "--limit", str(RUN_LIMIT), "--json", RUN_FIELDS)
    return list(pull_requests or []), list(runs or [])


def truncated(
    pull_requests: list[dict], runs: list[dict], issues: list[dict], earliest: datetime
) -> list[str]:
    """What GitHub's lists cut short: a list that came back full and whose oldest item
    is later than the earliest moment asked for does not cover the window."""
    cut = []
    for name, items, limit in (
        ("pull requests", pull_requests, PULL_REQUEST_LIMIT),
        ("workflow runs", runs, RUN_LIMIT),
        ("issues", issues, ISSUE_LIMIT),
    ):
        if (
            len(items) >= limit
            and min(parse_moment(i["createdAt"]) for i in items) > earliest
        ):
            cut.append(name)
    return cut


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("since", help="the release (or `batch/<date>` tag) the window starts after")
    parser.add_argument(
        "until", nargs="?", help="the release (or `batch/<date>` tag) the window ends at (default: now)"
    )
    parser.add_argument(
        "--previous", help="the batch end before `since`, to print its window too"
    )
    parser.add_argument("--pretty", action="store_true", help="indented JSON")
    args = parser.parse_args(argv)

    since = batch_end_moment(args.since)
    until = batch_end_moment(args.until) if args.until else datetime.now(timezone.utc)
    pull_requests, runs = collect()
    issues = list(
        _gh_json(
            "issue", "list", "--state", "all", "--limit", str(ISSUE_LIMIT), "--json", ISSUE_FIELDS
        )
        or []
    )
    earliest = batch_end_moment(args.previous) if args.previous else since
    reruns = collect_reruns(earliest)
    report = {"current": measure(pull_requests, runs, since, until, reruns)}
    report["current"]["open"] = {
        "issues": measure_open(issues, since, until),
        "dependabot_pull_requests": measure_open(
            dependabot_pull_requests(pull_requests), since, until
        ),
    }
    report["current"]["backlog"] = measure_backlog(collect_backlog(), since, until)
    report["repository"] = measure_repository(
        since, until, args.until or "HEAD", args.since
    )
    if args.previous:
        report["previous"] = measure(pull_requests, runs, earliest, since, reruns)
    report["truncated"] = truncated(pull_requests, runs, issues, earliest)
    if report["truncated"]:
        print(
            f"flow-audit: the list of {' and '.join(report['truncated'])} does not reach"
            " back to the earliest batch end asked for; the oldest figures are incomplete",
            file=sys.stderr,
        )
    json.dump(report, sys.stdout, indent=2 if args.pretty else None)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    import usage_log

    usage_log.start()
    sys.exit(main())
