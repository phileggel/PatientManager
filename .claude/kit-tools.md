# Kit Tools Reference

Thematic index of all agents, skills, convention docs, scripts, git hooks, and justfile recipes provided by **claude-kit** — an opinionated Claude-assisted factory for Tauri 2 + React 19 + Rust projects, built around the **spec → contract → plan → test-first → verify** workflow. Use this file to discover what is available without reading each agent definition individually.

---

## Discovery files (`.claude/`)

Sync writes these kit-managed files at the root of `.claude/` alongside agents and skills.
Read on demand to orient — none are auto-loaded by Claude Code.

| File               | Purpose                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `kit-tools.md`     | This inventory — what the kit provides across all surfaces                                                |
| `kit-readme.md`    | Onboarding readme for the kit                                                                             |
| `kit-version.md`   | Current kit version + changelog delta since the project's previous sync                                   |
| `kit-manifest.txt` | Sorted list of every kit-owned file written by the last sync; consumed by `bash scripts/validate-sync.sh` |

---

## Convention Docs

Synced to `docs/` in downstream projects on first sync (copy-once — never overwrites project customizations). Agents reference these directly; no "if exists" hedging needed.

| File                       | Purpose                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend-rules.md`         | Rust DDD structure: bounded context layout, aggregate roots, repositories, services, error handling, logging (B0–B43)                                                                                             |
| `frontend-rules.md`        | React feature layout: top-level `src/` buckets (features/shell/ui/infra/), gateway pattern, smart/dumb components, hook colocation, i18n, logging, cross-feature routing (F1–F28)                                 |
| `e2e-rules.md`             | WebdriverIO testability: form/field `id` conventions, aria labels, `setReactInputValue`, deterministic dates (E1–E10)                                                                                             |
| `test_convention.md`       | Testing strategy across all tiers: frontend Vitest, BE unit/repo/integration, mocking rules, async patterns                                                                                                       |
| `ddd-reference.md`         | DDD concept glossary + error-handling guidance: Entity, Aggregate, Repository, Domain Event, Bounded Context, Unit of Work, error categories (domain/application/infrastructure), travel rule, flow toward the UI |
| `i18n-rules.md`            | Translation structure, key naming (`domain.component.element`), locale consistency rules                                                                                                                          |
| `frontend-visual-proof.md` | Visual proof requirements: screenshot/video workflow for any `.tsx`/`.css` change, Playwright capture process                                                                                                     |

---

## Spec & Planning Agents

| Agent               | Trigger                                                                | Description                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec-reviewer`     | After spec-writer, before /contract                                    | Quality gate on a spec doc: rule atomicity, scope, DDD alignment, UX completeness, contractability, conflicts                                                                 |
| `contract-reviewer` | After /contract, before feature-planner                                | Quality gate on a domain contract: coverage vs spec, traceability, error exhaustiveness, type correctness                                                                     |
| `retro-spec`        | Onboarding an existing feature to the kit                              | Infers TRIGRAM-NNN rules from existing code and writes a first-pass `docs/spec/{domain}.md` with `retro-inferred` annotations for human review                                |
| `feature-planner`   | After spec-reviewer and contract-reviewer approve                      | Translates spec into `docs/plan/{feature}-plan.md` with DDD layer breakdown, rule-to-task mapping, Workflow TaskList                                                          |
| `plan-reviewer`     | After feature-planner, before any test-writer                          | Quality gate on the plan: rule coverage, contract coverage, layer routing, ADR adherence, schema completeness, TaskList integrity, PR Plan, minimal-implementation discipline |
| `adr-reviewer`      | After /adr-writer creates or supersedes an ADR; before a release sweep | Quality gate on ADRs: structure, 3-criteria appropriateness, status & supersedes integrity, index integrity, content quality, cross-spec consistency                          |
| `spec-checker`      | After implementation, before final commit                              | Verifies every TRIGRAM-NNN rule is implemented and tested; checks all contract commands are covered in backend, frontend, and tests                                           |

> **Resuming after interruption or compaction:** The plan is always saved to `docs/plan/{feature}-plan.md`.
> After any interruption, ground the agent explicitly:
>
> ```
> Read docs/plan/{feature}-plan.md, then execute step 4.2 only. Stop after.
> ```
>
> Never say "continue" alone — the agent will re-plan from scratch instead of resuming.

---

## Code Review & Test Agents

| Agent                  | Trigger                                                                              | Description                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reviewer-arch`        | Any `.rs`, `.ts`, or `.tsx` modified                                                 | DDD architecture: bounded context isolation, gateway pattern, factory methods, data flow direction, dead code, English-only                                                                                                                                                                                                |
| `reviewer-backend`     | Any `.rs` modified                                                                   | Rust quality: anyhow error handling, no `unwrap()` in production, Clippy, trait-based repositories, async correctness, inline tests                                                                                                                                                                                        |
| `reviewer-frontend`    | Any `.ts` / `.tsx` modified                                                          | React/TS quality + UX/M3: gateway encapsulation, hook colocation, presenter layer, `useCallback`/`useMemo` correctness, M3 design tokens, UX completeness (empty/loading/error states), accessibility                                                                                                                      |
| `reviewer-sql`         | Any `migrations/` file modified or added                                             | SQL migrations: atomicity, idempotency, destructive DDL guards, FK indexes, SQLite type affinity, primary key convention, NOT NULL                                                                                                                                                                                         |
| `reviewer-infra`       | Any workflow, config, or capabilities file modified; before a release                | CI/config/capability correctness, security, consistency; delegates dependency audit to `/dep-audit`                                                                                                                                                                                                                        |
| `reviewer-security`    | Any Tauri command, capability, or security-sensitive file modified; before a release | Application security: IPC input validation, path traversal, SQL injection, unsafe Rust, XSS, eval, storage misuse, hardcoded secrets, capability surface audit, cross-layer compound risks                                                                                                                                 |
| `test-writer-backend`  | After plan-reviewer, before backend impl                                             | Writes all failing Rust test stubs from the domain contract; confirms red via cargo test                                                                                                                                                                                                                                   |
| `test-writer-frontend` | After backend commit, before frontend impl                                           | Writes two layers of failing Vitest tests: gateway unit tests (mocking invoke, from contract + bindings.ts) and RTL component integration tests (mocking the gateway, both directions); also writes focused unit tests for modified existing functions when a modified_functions list is provided; confirms red via vitest |
| `test-writer-e2e`      | Phase 4 (quality) — after full implementation, before release                        | Writes passing Tauri WebDriver E2E tests for every command in a domain contract; exercises full UI→IPC→backend against the real running app; no mocking at any layer; verifies green before finishing                                                                                                                      |

---

## Skills (slash commands)

### SDD skills

Skills that directly drive or support the spec → contract → plan → test-first → verify pipeline.

| Skill          | Command          | Description                                                                                                                                                    |
| -------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`        | `/start [scope]` | Select workflow A (full) or B (simple) for the current task; outputs actionable checklist. Optional scope: `fix`, `chore`, `test`, `feature`, `refactor`       |
| `spec-writer`  | `/spec-writer`   | Interactive spec writer: interviews user, reads domain, produces `docs/spec/{feature}.md` with TRIGRAM-NNN rules                                               |
| `contract`     | `/contract`      | Derives or updates `docs/contracts/{domain}-contract.md` from a validated spec; upsert-aware, human-approved                                                   |
| `adr-writer`   | `/adr-writer`    | Author Architecture Decision Records in `docs/adr/`: create, supersede, or index. Run `adr-reviewer` after to validate                                         |
| `whats-next`   | `/whats-next`    | Triage pending work across TODOs, plans, specs, and in-flight git; returns value/effort table and one suggested next action                                    |
| `smart-commit` | `/smart-commit`  | Conventional commit with sensitive-file check, linter run, suggested title with char count, and user confirmation                                              |
| `create-pr`    | `/create-pr`     | Push the current feature branch and open a GitHub PR; drafts title + body from commits and plan doc; requires `gh` CLI                                         |
| `setup-e2e`    | `/setup-e2e`     | One-time Tauri WebDriver E2E setup: installs npm packages, generates `wdio.conf.ts` from the binary name, adds `test:e2e` / `test:e2e:ci` scripts. Idempotent. |

### Sanity skills

Generic lifecycle tools. No direct SDD connection — included because they must run somewhere in any project's lifecycle.

| Skill          | Command         | Description                                                                                                                                                                                       |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dep-audit`    | `/dep-audit`    | Audit npm + Cargo dependencies for outdated versions and CVEs; run before every release                                                                                                           |
| `prune`        | `/prune [path]` | Audit the project for dead code, pass-through methods, verbose patterns, and duplicate definitions; coverage report mandatory, read-only output                                                   |
| `visual-proof` | `/visual-proof` | Capture and commit visual proof screenshots for any `.tsx`/`.css` change. Auto-discovers config on first run. Generates a complete preview for all component states and captures with Playwright. |
| `techdebt`     | `/techdebt`     | Produces a normalized tech-debt entry (date + git context + observation) for the main agent to persist; convention is `docs/techdebt.md`; output-only, no writes                                  |

### Kit sync

Not a workflow tool — run only after syncing a new kit version to realign `CLAUDE.md` with what the kit now ships.

| Skill          | Command         | Description                                                                                                                                              |
| -------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kit-discover` | `/kit-discover` | Cross-references CLAUDE.md against `kit-tools.md` and `kit-version.md`; surfaces drift, gaps, and redundancies and proposes a patch (never auto-applied) |

---

## Git Hooks (`.githooks/`)

| Hook               | Runs on      | Behaviour                                                                                                          |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pre-commit`       | `git commit` | Blocks direct commits to `main`; runs `python3 scripts/check.py --fast` (lint + format); rejects commit on failure |
| `commit-msg`       | `git commit` | Enforces conventional format (`type: description`), valid types, ≤72-char title, no co-author lines                |
| `pre-push`         | `git push`   | Runs `python3 scripts/check.py` (full suite: tests + build + lint); blocks push on failure                         |
| `pre-merge-commit` | `git merge`  | Blocks non-fast-forward merge commits to enforce linear history; does not affect `--ff-only` or `--squash`         |

Activate with: `git config core.hooksPath .githooks`

---

## Scripts

Synced to downstream `scripts/` on every sync.

### Shared helpers

| Script             | Command                              | Description                                                                                                                         |
| ------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `changed-files.sh` | `bash scripts/changed-files.sh`      | Print sort-unique union of changed-vs-HEAD, staged, and untracked files. Use for pre-commit / uncommitted-work context              |
| `branch-files.sh`  | `bash scripts/branch-files.sh`       | Print sort-unique union of all files changed on the current branch vs main, plus uncommitted changes. Use in review agents          |
| `report-path.sh`   | `bash scripts/report-path.sh <slug>` | Compute and print the next available `tmp/<slug>-YYYY-MM-DD-NN.md` report path; creates `tmp/` if needed                            |
| `whats-next.py`    | `python3 scripts/whats-next.py`      | Deterministic data collector for the `/whats-next` skill; emits JSON describing TODOs, plans, specs, git, roadmap, techdebt         |
| `validate-sync.sh` | `bash scripts/validate-sync.sh`      | Verify every file in `.claude/kit-manifest.txt` is present after `just sync-kit`; exit 1 on any missing. Invoked by `/kit-discover` |

### Quality & release

| Script            | Command                           | Description                                                     |
| ----------------- | --------------------------------- | --------------------------------------------------------------- |
| `check.py`        | `python3 scripts/check.py`        | Full quality check: lint, format, tests, build                  |
| `check.py --fast` | `python3 scripts/check.py --fast` | Fast check: lint + format only (used by pre-commit hook)        |
| `release.py`      | `python3 scripts/release.py`      | Interactive release manager: bumps version, tags, and publishes |

---

## Justfile Recipes (`common.just`)

| Recipe           | Command               | Description                                                                                          |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `check`          | `just check`          | Fast quality check — lint + format only                                                              |
| `check-full`     | `just check-full`     | Full quality check — tests + build + lint                                                            |
| `format`         | `just format`         | Auto-fix formatting: `cargo fmt`, `cargo clippy --fix`, frontend                                     |
| `release`        | `just release`        | Interactive release manager                                                                          |
| `sync-kit`       | `just sync-kit`       | Sync this kit into the project (latest release tag)                                                  |
| `merge`          | `just merge`          | Fast-forward current branch into main, then delete the branch                                        |
| `clean-branches` | `just clean-branches` | **Destructive** — removes stale remote-tracking branches                                             |
| `stat`           | `just stat`           | Line count stats via `cloc`                                                                          |
| `migrate`        | `just migrate`        | Run pending SQLx database migrations                                                                 |
| `generate-types` | `just generate-types` | Regenerate Specta TypeScript bindings after adding or changing Tauri commands (project-configurable) |
| `prepare-sqlx`   | `just prepare-sqlx`   | Regenerate SQLx offline query cache after schema or query changes                                    |
| `clean-db`       | `just clean-db`       | **Destructive** — deletes local database and recreates schema                                        |
