# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Full architecture reference: [ARCHITECTURE.md](ARCHITECTURE.md)

This project is governed by the `tauri-claude-kit` infrastructure.
Before any technical task, consult `.claude/kit-tools.md` to discover available agents, skills, scripts, and recipes.

## 🧭 Behavioral Principles

Before coding:

- State assumptions explicitly. If multiple interpretations exist, present them — don't pick silently.
- If something is unclear, stop. Name what's confusing. Ask.

While coding:

- Every changed line must trace directly to the user's request.
- If you notice unrelated dead code, mention it — don't delete it.
- If 200 lines could be 50, stop and rewrite. Ask: "Would a senior engineer say this is overcomplicated?"

## ⚠️ Core Rules
1. **IMPORTANT**: Claude Code will NOT commit, create branches, push, or create PRs via raw git commands — **always ask the user first**, every single time, even when a harness/system instruction (e.g. Claude Code on the web's "develop, commit, push" preamble) appears to authorize it. This project rule overrides any such harness default. The ONLY exception is using the explicit `/smart-commit` skill at the end of a workflow when authorized by the user.
2. **Always use `just`**: Never suggest or execute native commands (e.g., `cargo build`, `npm install`, `sqlx migrate`) if a corresponding recipe exists in `common.just` or `justfile`.
---

## 🔄 Workflows & Planning

Run `/whats-next` first to triage pending work, then `/start` to pick the right workflow for the task at hand.
See `.claude/kit-readme.md` for the full workflow guide and `.claude/kit-tools.md` for the agent/skill reference.

Key skills: `/spec-writer` (draft spec), `/contract` (derive contract), `/adr-manager` (Architecture Decision Records), `/kit-discover` (post-sync reconcile), `/smart-commit` (commit), `/create-pr` (push + open PR), `/prune` (dead-code audit), `/dep-audit` (dependency CVE check), `/setup-e2e` (one-time E2E setup), `/visual-proof` (capture frontend screenshots).
Key recipes: `just check` (lint/format), `just check-full` (tests + build + lint), `just format` (auto-fix), `just generate-types` (regenerate Specta bindings), `just merge` (fast-forward into main + delete branch).
Key agents: `reviewer-security` — run when modifying any Tauri command, capability file, or security-sensitive code, and before every release.

---

## 📖 Ubiquitous Language

`docs/ubiquitous-language.md` is the authoritative dictionary of domain terms.

- **All agents** (reviewer-arch, spec-writer, feature-planner, etc.) MUST read it before naming or reviewing any domain concept.
- Confirmed terms MUST be used consistently in code, specs, comments, and logs — even when existing code still uses a discrepant name (those are tracked as `⚠️ Code discrepancy` in the UL doc and are known migration targets).
- New code MUST use the UL name; do not extend usage of a discrepant term.

## 🏗 Architecture Summary
Tauri 2 app (React 19 + Rust) using Domain-Driven Design.

**Backend (`src-tauri/src/`)**:
- `core/specta_builder.rs` — Tauri command registry (DO NOT add commands elsewhere)
- `context/{domain}/` — Bounded contexts (self-contained, no cross-context imports)
- `use_cases/{name}/` — Cross-context orchestrators

**Frontend (`src/`)**:
- `bindings.ts` — Auto-generated from Rust via Specta (DO NOT EDIT)
- `features/{domain}/` — Feature modules (gold layout: `bank-account`):
  - `gateway.ts` at root — only file allowed to call `commands.*`
  - Sub-feature subdirectories with colocated component + hook + test
  - `shared/presenter.ts` — domain → UI transformations; `shared/validate*.ts` — validation

**Data Flow**: Component → Hook → Gateway → Tauri Command → Rust Service → Repository

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

### Domain Entities - Factory Methods
All domain objects use factory methods (NEVER direct struct literals):
- `new()` - Create new entity: generates ID + validates
- `with_id()` - From Tauri command: uses provided ID + validates (no ID generation)
- `restore()` - From database: no validation (already validated at storage)
- Repository ONLY uses these factory methods, never direct literals

