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
1. **IMPORTANT**: Claude Code will NOT commit, create branches, or create PRs via raw git commands. The user handles all git operations. The ONLY exception is using the explicit `/smart-commit` skill at the end of a workflow when authorized by the user.
2. **Always use `just`**: Never suggest or execute native commands (e.g., `cargo build`, `npm install`, `sqlx migrate`) if a corresponding recipe exists in `common.just` or `justfile`.
---

## 🔄 Workflows & Planning

Run `/start` at session start to pick the right workflow for the task at hand.
See `.claude/kit-readme.md` for the full workflow guide and `.claude/kit-tools.md` for the agent/skill reference.

---

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

