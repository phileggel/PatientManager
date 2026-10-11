# FLOW-051 — The deny list of the agent's settings can be walked around

- Kind: quality
- Size: S
- Observed: the release sweep of 2026-10-11 (`reviewer-infra`, 🔴 twice, 🟡 once) read
  `.claude/settings.json` against what `CLAUDE.md` forbids. `just release*` is denied,
  but `Bash(python3 scripts/*)` allows `python3 scripts/release.py -y`, which commits,
  tags and pushes. The denials of `--no-verify` and of a push to `main` match one word
  order: `git commit -m x --no-verify`, `git push origin br --no-verify` and
  `git push origin HEAD:refs/heads/main` match an allow rule and no deny rule.
  `Bash(gh api *)` can merge a pull request or move a ref, which the denial of
  `gh pr merge` was meant to stop. None of this was used: the agent follows the written
  rule. The list is the net under that rule, and it has holes. Whether the repository
  also protects `main` on GitHub's side was not checked.
- Proposal: deny `*scripts/release.py*`, `git commit *--no-verify*`,
  `git push *--no-verify*`, `git push *refs/heads/main*` and the writing forms of
  `gh api`; a script test reads the settings and fails when one of these denials goes.
  The owner edits the file: the agent does not change the list that restrains it.
- Costs: a few lines of settings, one test. A denial that is too wide refuses a
  legitimate command once, and is then narrowed.
- Decision (owner, 2026-10-11): accepted. The owner adds the denials to `.claude/settings.json`; the agent adds
  the test that fails when one goes, and never edits that file.
