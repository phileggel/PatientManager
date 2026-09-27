# Commit Policy & Versioning

Conventional commits, checked by the `commit-msg` hook and by CI on every pull request.
The merged titles drive the version bump and the changelog (`just release`), so a
title is written for whoever reads the changelog.

## Format

```
type: description
```

**Title only.** No body: the pull request carries the context and the proof. At most
72 characters, lowercase, imperative mood, no trailing period, no `Co-Authored-By` or
any AI attribution. No SSN, IBAN or patient name — the `commit-msg` hook refuses them
(`scripts/privacy-check.py`).

## Choosing the type

| Type       | Touches                                |
| ---------- | -------------------------------------- |
| `feat`     | something a user can now do or see     |
| `fix`      | something a user saw go wrong          |
| `refactor` | production code, no change a user sees |
| `chore`    | build, dependencies, tooling, scripts  |
| `ci`       | workflows, hooks, the harness          |
| `docs`     | documentation and records only         |
| `test`     | tests only                             |

- `feat` and `fix` are the only types that reach `CHANGELOG.md`, so they are reserved
  for a change a user notices, and their titles describe it in the user's words: no
  layer tags, rule ids, code identifiers or abbreviations.
- Pick the other types by **what the change touches**, not by how large it feels. A
  change to production code is never `chore`; a change to none is never `refactor`.
  Removing dead production code is `refactor`.

## One task, one commit

A task (a todo entry, a techdebt entry, a request) lands on `main` as **one** commit:
review fixes, coverage top-ups and closure edits belong inside it.

- Before the first push: fold locally (`git commit --amend`).
- After a push: `git commit --fixup <sha>` and push. `just merge` folds every `fixup!`
  into the commit it names; the hook and CI accept `fixup! <valid title>`. Never
  force-push by hand, never `squash!` / `amend!`.

## One changelog line per user-visible change

A `feat` / `fix` commit adds user-visible value of its own. A commit that does not —
review fixes of a not-yet-released feature, second-layer wiring of a feature another
commit already announced — is folded into its feature commit or typed
`refactor` / `chore` / `ci` / `test` / `docs`, so it never reaches the changelog. Two
near-identical `feat` / `fix` titles in one release are the tell.

## Semantic versioning

`just release` computes the bump from the titles merged since the last tag:

| Titles since the last tag    | Bump  |
| ---------------------------- | ----- |
| a breaking change (`type!:`) | major |
| at least one `feat`          | minor |
| at least one `fix`           | patch |
| none of those                | none  |

## Examples

- ✅ `feat: search patients by name or social security number`
- ✅ `fix: the fund list keeps its order after an import`
- ✅ `ci: run the end-to-end suite on every pull request`
- ❌ `feat(FE): add PatientSearch component` — layer tag, code identifier
- ❌ `fix: review fixes` — no user-visible value: fold it into the commit it fixes
- ❌ `Fixed the bug.` — no type, past tense, trailing period
