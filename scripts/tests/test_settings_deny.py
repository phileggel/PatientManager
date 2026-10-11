"""The deny list of `.claude/settings.json` refuses what `CLAUDE.md` forbids — run with `just test-scripts`.

FLOW-051: the list is the net under the written rule, and a release sweep found that a release
or a hook bypass written another way went through it. Each command below must match at least
one deny rule. The match is read as a glob over the whole command (`*` is any text),
which is how the rules are written; the tool's own matcher is not called here.
"""

import fnmatch
import json
import unittest
from pathlib import Path

SETTINGS = Path(__file__).resolve().parents[2] / ".claude" / "settings.json"

# What CLAUDE.md rule 1 forbids, in the usual ways of writing it. The list is a net under
# the written rule, not a proof (owner, 2026-10-11): it does not chase every spelling, and
# `gh api` is left to the rule itself. What stops a push to `main` for good is on GitHub's side.
FORBIDDEN = {
    "cutting a release": [
        "just release",
        "just release -y",
        "python3 scripts/release.py -y",
        "python3 ./scripts/release.py",
        "python scripts/release.py --dry-run",
    ],
    "bypassing a hook": [
        "git commit --no-verify -m x",
        "git commit -m x --no-verify",
        "git commit -n -m x",
        "git commit -m x -n",
        "git push --no-verify",
        "git push origin branch --no-verify",
    ],
    "pushing to main": [
        "git push origin main",
        "git push origin HEAD:main",
        "git push origin HEAD:refs/heads/main",
    ],
    "force-pushing": [
        "git push --force origin branch",
        "git push -f origin branch",
    ],
    "tagging and merging by hand": [
        "git tag v9.9.9",
        "gh pr merge 12 --rebase",
    ],
    "touching the installed application's data": [
        "ls ~/.local/share/com.projectsf.patient-manager/",
    ],
}

# What the flow itself runs through the shell and must stay free to run.
ALLOWED = [
    "just merge",
    "just watch-pr",
    "just harness",
    "git commit -m 'docs: a title'",
    "git commit -q --fixup HEAD",
    "git push -q -u origin HEAD",
    "git push -q",
    "gh api repos/o/r/commits/abc/check-runs?filter=latest --paginate --jq .check_runs",
    "gh pr create --title t --body-file b.md",
    "gh run rerun 123 --failed",
    "gh release edit v1.2.3 --draft=false --latest",
    "python3 scripts/work-queue.py remaining",
    "python3 scripts/release-notes.py v1.2.3",
]


def bash_rules(kind: str) -> list[str]:
    rules = json.loads(SETTINGS.read_text(encoding="utf-8"))["permissions"][kind]
    return [rule[len("Bash(") : -1] for rule in rules if rule.startswith("Bash(") and rule.endswith(")")]


def matching(command: str, rules: list[str]) -> list[str]:
    return [rule for rule in rules if fnmatch.fnmatchcase(command, rule)]


class DenyList(unittest.TestCase):
    def test_flow_051_every_forbidden_command_is_denied_however_it_is_written(self):
        deny = bash_rules("deny")
        missed = [
            f"{what}: `{command}`"
            for what, commands in FORBIDDEN.items()
            for command in commands
            if not matching(command, deny)
        ]
        self.assertEqual(missed, [])

    def test_flow_051_what_the_flow_runs_is_not_denied(self):
        deny = bash_rules("deny")
        refused = [f"`{command}` by `{matching(command, deny)[0]}`" for command in ALLOWED if matching(command, deny)]
        self.assertEqual(refused, [])

    def test_flow_051_the_settings_file_itself_cannot_be_edited(self):
        deny = json.loads(SETTINGS.read_text(encoding="utf-8"))["permissions"]["deny"]
        self.assertIn("Edit(.claude/settings.json)", deny)


if __name__ == "__main__":
    unittest.main()
