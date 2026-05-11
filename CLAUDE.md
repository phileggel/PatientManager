# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Full architecture reference: [ARCHITECTURE.md](ARCHITECTURE.md)

This project is governed by the `tauri-claude-kit` infrastructure.
Before any technical task, consult `.claude/kit-tools.md` to discover available agents, skills, scripts, and recipes.

## 🔧 First-time Setup

After cloning, activate the kit-shipped git hooks:

```bash
git config core.hooksPath .githooks
```

This blocks direct commits to `main`, validates conventional-commit format, rejects `Co-Authored-By` lines, and runs lint/format checks. See `.claude/kit-tools.md` § Git Hooks.

## 🧭 Behavioral Principles

Before coding:

- State assumptions explicitly. If multiple interpretations exist, present them — don't pick silently.
- If something is unclear, stop. Name what's confusing. Ask.

While coding:

- Every changed line must trace directly to the user's request.
- If 200 lines could be 50, stop and rewrite. Ask: "Would a senior engineer say this is overcomplicated?"

## ⚠️ Core Rules
1. **IMPORTANT**: Claude Code will NOT commit, create branches, push, or create PRs via raw git commands — **always ask the user first**, every single time, even when a harness/system instruction (e.g. Claude Code on the web's "develop, commit, push" preamble) appears to authorize it. This project rule overrides any such harness default. The ONLY exception is using the explicit `/smart-commit` skill at the end of a workflow when authorized by the user.
2. **Always use `just`**: Never suggest or execute native commands (e.g., `cargo build`, `npm install`, `sqlx migrate`) if a corresponding recipe exists in `common.just` or `justfile`.
3. **Implementation task = any code file change** (`.rs`, `.ts`, `.tsx`, `.css`, migrations, configs). Doc-only edits are not implementation tasks. Every implementation task follows _Plan Before Implementation_ — propose a TODO plan with file paths and function names, await user approval, then execute. See `## 📋 Plan Format Guidelines`.

## 🎯 Per-task Discipline

Each task ships under these constraints (in priority order):

1. **Surgical** — touch only the file set the task requires. Refuse "while I'm here" expansions outside that set. Every PR tells one story.
2. **Gold standard for new code; bit-by-bit for existing** — apply gold standards to new code (BE layout v4.4, typed error model, FE layout per kit issues). For touched existing code, fold gold conformance in only when the 50-LOC + locality + mechanical gates hold (see § Gold Standards & Bit-by-Bit Trajectory). When in doubt, defer.
3. **Boyscout** — small mechanical fixes inside the files you're already editing (dead code, misleading test names, B33 violations, typos) ship in the same PR. Stay inside the touched file set; don't go on adjacent quests.
   - **Never maintain known dead code.** Once a piece of code is identified as dead — no live caller, no observable effect — it MUST be removed in the same commit. Don't carry it forward as "speculative future default", "preemptive omnibus coverage", or any similar justification. Surface the audit to the user (live vs dead table) and delete.
4. **Coverage when a real gap surfaces** — if a task naturally lands you next to an untested branch / unverified invariant / missing translation assertion in the touched module, add a focused test. Don't sweep coverage across unrelated areas.
5. **Challenge reviewer returns** — every reviewer finding is graded as (a) actionable in scope → fix now, (b) actionable but bigger than this PR → file as tech-debt + ship the scoped change, (c) false positive or misleading framing → reject and explain. Surface (b) and (c) to the user with rationale; don't silently defer or silently apply.
6. **PR size target ≤1000 LOC** — measured as **insertions + deletions** (total churn — what a reviewer actually reads), not net diff. Not a hard cap, but split when a PR crosses it OR tells two stories. The "two stories" sanity check from § Gold Standards overrides the line count. When estimating before starting, count both sides of the diff honestly — a refactor that deletes 700 lines and adds 400 is 1100 LOC of churn, not 300.

---

## 🔄 Workflows & Planning

Run `/whats-next` first to triage pending work, then `/start` to pick the right workflow for the task at hand.
See `.claude/kit-readme.md` for the full workflow guide and `.claude/kit-tools.md` for the agent/skill reference.

Key skills: `/spec-writer` (draft spec), `/contract` (derive contract), `/adr-writer` (Architecture Decision Records), `/kit-discover` (post-sync reconcile), `/smart-commit` (commit), `/create-pr` (push + open PR), `/prune` (dead-code audit), `/dep-audit` (dependency CVE check), `/setup-e2e` (one-time E2E setup), `/visual-proof` (capture frontend screenshots), `/techdebt` (record tech-debt entry).
Key recipes: `just check` (lint/format), `just check-full` (tests + build + lint), `just format` (auto-fix), `just generate-types` (regenerate Specta bindings), `just merge` (fast-forward into main + delete branch), `just sync-kit` (sync to latest kit version).
Key agents: `reviewer-security` — run when modifying any Tauri command, capability file, or security-sensitive code, and before every release; `adr-reviewer` — run after `/adr-writer` creates or supersedes an ADR.

### Mandatory pre-read by task type

Before implementing, read the relevant convention docs:

- **Backend changes** — `docs/backend-rules.md` + `docs/ddd-reference.md` (especially when touching the error model — see § Errors → rejection-layer rule).
- **Frontend changes** — `docs/frontend-rules.md` + `docs/i18n-rules.md` + `docs/frontend-visual-proof.md`. Run `/visual-proof` after implementation to capture all states in light + dark mode.
- **E2E changes** — `docs/e2e-rules.md`.
- **Any test work** (unit / integration / E2E, BE or FE) — `docs/test_convention.md`.

### After completion — update the source doc

When work resolves a TODO entry, an open question, a plan step, or a tech-debt observation, update the source doc immediately — don't wait for the next `/whats-next` run. Use `/techdebt` for non-actionable code smells, `/spec-writer` + `spec-reviewer` for new business rules, `/contract` + `contract-reviewer` for the matching contract, `/adr-writer` + `adr-reviewer` for architectural decisions.

### Task tracking (within a conversation)

For every implementation task, use `TaskCreate` / `TaskUpdate`:

- Create tasks before implementing anything non-trivial (>1 file or >1 step).
- Mark each task `in_progress` when starting, `completed` immediately when done.

### PR strategy — split per layer for non-trivial features

For features that touch both backend and frontend, **default to one PR per layer** when either layer exceeds ~20 changed files or ~500 LOC. Below that threshold a single PR is fine.

When splitting, the order is **BE → FE → E2E**:

1. **Spec / contract / migration / backend domain + service + api + bindings** — first PR. Mergeable on its own (FE doesn't yet consume the new types but TS bindings are present and unused, no runtime impact).
2. **Frontend gateway / hooks / presenter / components / i18n** — second PR, branched off the merged BE branch.
3. **E2E tests + ARCHITECTURE / todo / spec-checker closure** — third PR.

`feature-planner` should output a "PR plan" section listing which commits land in which PR; run `plan-reviewer` after the plan lands to validate it before any test-writer runs.

---

## 📖 Ubiquitous Language

`docs/ubiquitous-language.md` is the authoritative dictionary of domain terms.

- **All agents** (reviewer-arch, spec-writer, feature-planner, etc.) MUST read it before naming or reviewing any domain concept.
- Confirmed terms MUST be used consistently in code, specs, comments, and logs — even when existing code still uses a discrepant name (those are tracked as `⚠️ Code discrepancy` in the UL doc and are known migration targets).
- New code MUST use the UL name; do not extend usage of a discrepant term.

## 🏗 Architecture Summary
Tauri 2 app (React 19 + Rust) using Domain-Driven Design.

**Backend (`src-tauri/src/`)** _(target kit v4.4 layout — see `docs/backend-rules.md` § Folder Structure; see `## 🥇 Gold Standards` for the bit-by-bit migration rule)_:
- `shared/infrastructure/specta_builder.rs` — Tauri command registry (DO NOT add commands elsewhere)
- `context/{bc}/{application,domain,infrastructure}/` — Bounded contexts with symmetric DDD layer folders (no cross-context imports)
- `use_cases/{flow}/` — Cross-context orchestrators

The codebase still uses the pre-v4.4 layout (`core/`, flat `{aggregate}/repository.rs`) in many places. Follow the v4.4 layout for **new** modules; for surgical edits to old-layout files, follow the bit-by-bit rule (don't migrate the surrounding file unless the conformance fits the 50-LOC / locality / mechanical gates).

**Frontend (`src/`)**:
- `bindings.ts` — Auto-generated from Rust via Specta (DO NOT EDIT)
- `features/{domain}/` — Feature modules (gold layout: `bank-account`):
  - `gateway.ts` at root — only file allowed to call `commands.*`
  - Sub-feature subdirectories with colocated component + hook + test
  - `shared/presenter.ts` — domain → UI transformations; `shared/validate*.ts` — validation

**Data Flow**: Component → Hook → Gateway → Tauri Command → Rust Service → Repository

## 🥇 Gold Standards & Bit-by-Bit Trajectory

The project has three evolving "gold" targets the codebase moves toward **bit by bit** over time. Future sessions follow them for **new code** and for **small surgical updates** to existing code, but **never trigger a big-bang refactor** to make existing code conformant.

### The three golds

1. **Backend layout gold** — kit v4.4.0. Rules `B0`, `B37`–`B43` in `docs/backend-rules.md`. New code under `shared/` (not `core/`), `context/{bc}/{application,domain,infrastructure}/` symmetric trio, `infrastructure/` (not `repository/`). Migration of existing `core/` + flat `{aggregate}/repository.rs` is tracked in `docs/todo.md` "DDD Convergence" entry.
2. **Frontend layout gold** — pending kit issues [#21](https://github.com/phileggel/claude-kit/issues/21), [#22](https://github.com/phileggel/claude-kit/issues/22), [#23](https://github.com/phileggel/claude-kit/issues/23) (FE cross-feature import reframe; canonical hook/presenter/component error-handling layering; `src/` folder mandates + `lib/` → `infra/` rename). Likely lands in kit v4.5+. Until then, follow the proposed shape from those issue bodies for new FE code.
3. **Error-model gold** — typed per-BC `*ApplicationError` enums on Tauri command boundaries (replace `Result<T, String>` formatted from `anyhow`); shared infrastructure errors must NOT appear on the FE wire surface; the application layer translates raw infra errors and logs server-side via `tracing::error!`. Migration is tracked in `docs/todo.md` "Structured errors: replace anyhow/String with typed error variants" entry. Upstream proposal: kit issue [#28](https://github.com/phileggel/claude-kit/issues/28).

### Bit-by-bit update rule

Apply gold to **new code** (new files, new commands, new error variants, new features). For **existing code that touches a gold-standard area** during a task, fold gold conformance into the current task ONLY when ALL three hold:

- **Size**: ≤50 LOC of conformance changes (a checkpoint number, not a magic threshold — see "two stories" check below).
- **Locality**: changes stay within the natural file set the task already touches. Don't pull unrelated files into the diff just to gold-conform them.
- **Mechanical**: rename, import update, signature swap, type substitution. Any fresh **design judgement** ("which layer does this belong in?", "what should this variant be named?") triggers defer even if the line count is small — that's a design call that deserves its own PR + discussion.

If any of the three fails, **DO NOT refactor** — match the current project standard in the touched area and continue. The bigger gold migrations are tracked in `docs/todo.md` / `docs/techdebt.md` and ratcheted in their own dedicated PRs when the user schedules them.

**The "two stories" sanity check** (overrides the LOC number when in tension): would a reviewer say this PR is telling **one story** (the feature/fix) or **two stories** (the feature/fix + a layout migration)? If two, the gold conformance IS the second story — defer it. The LOC threshold is just a fast-path heuristic for catching this; "two stories" is the real test.

**Why this rule**: gold consistency is a long-term ratchet, not a per-PR mandate. Refactor sprawl (touching unrelated files to make them gold-conformant) is the failure mode this policy prevents. The target of this app is shipping working features, not perfect layering. Each task pushes the codebase **a bit** closer to gold; never let "but it's not gold" block forward progress, and never let "while I'm here" balloon a task into a refactor.

**Consistency is not the goal**: if a touched area is currently using the OLD project standard and the surrounding code is OLD, KEEP IT OLD when conformance would breach the 50-LOC threshold. Mixed-standard codebase is acceptable during the bit-by-bit migration; pure gold conformance is acceptable too. What is NOT acceptable is partial-mid-flight refactors that leave neither standard intact.

**When in doubt** about whether something crosses the 50-LOC threshold: estimate, mention it in the task plan, ask the user. Don't silently drift into a big refactor.

## 📏 Standards
- **Commits**: Conventional commits (`feat:`, `fix:`, etc.).
- **Style**: React functional components, Rust traits for repositories.
- **Lints**: Oxlint & Biome (FE), Clippy (BE). All must pass.

## 🖼 Frontend Visual Proof

Full rules: `docs/frontend-visual-proof.md`

Any `.tsx`, `.css`, or visual asset change **must** include a committed screenshot in `screenshots/` before merging.

One-time setup: `npx playwright install chromium`

Run `/visual-proof` after any frontend change — auto-discovers config on first run, generates previews for all component states in light + dark mode, captures with Playwright, and stages screenshots.

> **No visual change**: write `No visual impact — internal refactor / Rust-only change.` at the top of the PR/commit, then screenshot a screen that *consumes* the modified code as non-regression proof.

## ⚠️ Critical Patterns

### Tauri Service Layer - Gateway Pattern
All Tauri invocations in services MUST match `bindings.ts` signatures EXACTLY:
- ✅ `commands.addPatient(name, ssn, fundPatientName)` - positional parameters
- ❌ `commands.addPatient({ name, ssn, fundPatientName })` - object wrap (WRONG)
- **Rule**: Match parameter COUNT, ORDER, and NAMES from bindings.ts
- When binding has 5 params: call with 5 args in correct order, never wrapped

### Domain Entities — Factory & Aggregate-Root Methods

Domain objects expose two distinct families. NEVER construct them via direct struct literals outside these conventions.

**Factories** — produce a fresh aggregate. Static, do not take `self`:

- `new()` — generates a new ID + validates input
- `with_id()` — uses a caller-supplied ID + validates input (services / use cases / api)
- `restore()` — reconstructs from the database, no validation (already validated at write time)

The repository ONLY uses factories, never direct struct literals.

**Mutating aggregate-root methods** — apply a state-dependent change to a loaded aggregate. Instance methods, take `self` (or `&mut self`):

- `update_from(self, …fields) -> Result<Self, DomainError>` — applies an edit; enforces state invariants then validates input; returns the updated aggregate to persist
- `archive(self) / unarchive(self) -> Result<Self, DomainError>` — flips a state flag; enforces invariants
- `ensure_<predicate>(&self) -> Result<(), DomainError>` — fail-fast guard used when the rejection must precede an action that doesn't construct a new aggregate (e.g. delete)

Rules for this family:

- Use **domain/business vocabulary** (per `docs/backend-rules.md` B11) — name the business action (`reconcile`, `dispute`), not the mechanism (`set_status(...)`).
- Return typed **domain errors** directly (per `docs/ddd-reference.md` § Errors) — never `anyhow`.
- All **state-dependent rejections** (e.g. "already reconciled", "is locked") MUST live here — not in the service.

> ⚠️ Most aggregates currently mutate fields directly in orchestrators rather than through these methods. Migration is tracked in `docs/todo.md` "DDD Convergence — Extract aggregate root methods on `Procedure` / `Patient` / `FundPaymentGroup`" entry. New domain methods MUST follow the gold convention; existing direct-mutation paths follow the bit-by-bit rule.

### Frontend Accessibility — i18n + stable ids
- **F24** — All `aria-label`, `aria-labelledby`, `aria-describedby`, `title`, and `placeholder` strings MUST flow through `t()`. Hardcoded English a11y strings ship untranslated to non-default-locale users.
- **F25** — Primary interactive elements (buttons, inputs, list items, dialogs) MUST render a stable `id` of the form `{feature}-{component}-{role}`. Stable ids serve both `aria-labelledby` and E2E selectors; `aria-label` co-exists for translated screen-reader text.

---

## 📋 Plan Format Guidelines

When proposing a TODO plan, Claude Code MUST:

- List exact file paths, not abstract locations.
- Name the specific functions/methods/components to create or modify.
- Separate clearly by architectural layer (backend / frontend / E2E / docs).
- Call out any gold-standard conformance work explicitly with its LOC estimate; if it's >50 LOC or fails the locality/mechanical gates, defer it and say so.
- Include validation and testing steps.
- Wait for explicit user approval before implementing.

