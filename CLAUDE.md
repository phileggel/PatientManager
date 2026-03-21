# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Full architecture reference: [ARCHITECTURE.md](ARCHITECTURE.md)

## ⚠️ Workflow & Planning
**IMPORTANT**: Claude Code will NOT commit, create branches, or create PRs. The user handles all git operations.

### CRITICAL: Implementation task
- Any code file is considered as implementation task
- ONLY exception is doc files
- Every task should follow *Plan Before Implementation*

### Workflow
1. Read relevant documentation
   - for backend **follow** `/docs/backend-rules.md`
   - for frontend **follow** `/docs/frontend-rules.md`
2. **Analyze** the request and current codebase.
3. **Propose a TODO plan**
4. CRITICAL: ask user to validate
5. Implementation
6. Test & Lint `./scripts/check.sh`
7. Run the `reviewer` subagent → fix any critical issues → repeat until clean
8. If frontend text was added/changed → run `i18n-checker` subagent
9. If tests are missing → write them directly (backend: Rust `#[cfg(test)]` inline, frontend: `.test.ts` colocated) — follow `/docs/testing.md`
10. Update documentation:
    - Update `ARCHITECTURE.md` if new files, modules, or features were added/removed
    - Update the relevant spec in `docs/` if new business rules were added
    - If a spec doc exists → run `spec-checker` subagent to confirm all rules are covered
11. CRITICAL: ask user if commit is needed and follow his instructions

### Available Subagents (`.claude/agents/`)
- `reviewer` — DDD + backend/frontend rules compliance check (step 7)
- `i18n-checker` — finds hardcoded strings, missing/dead translation keys fr + en (step 8)
- `spec-checker` — verifies all Rn rules in a feature spec are implemented and tested (step 10)

## 🛠 Commands
- Dev: `./scripts/start-app.sh` (Unix) | `scripts\start-app.bat` (Win)
- Quality: `./scripts/check.sh` (Full check)
- Tests: `npm run test` (Frontend) | `cd src-tauri && cargo test` (Backend)
- Types: `just generate-types` (Sync Rust to TS via Specta)
- Database schema update: `just clean-db`

## 🏗 Architecture Summary
Tauri 2 app (React 19 + Rust) using Domain-Driven Design.

**Backend (`src-tauri/src/`)**:
- `core/specta_builder.rs` — Tauri command registry (DO NOT add commands elsewhere)
- `context/{domain}/` — Bounded contexts (self-contained, no cross-context imports):
  - `bank/`, `fund/`, `patient/`, `procedure/`
  - Each has: `domain.rs`, `service.rs`, `repository.rs`, `api.rs`, `mod.rs`
- `use_cases/{name}/` — Cross-context orchestrators:
  - `bank_manual_match/`, `bank_statement_reconciliation/`, `excel_import/`, `fund_payment_reconciliation/`, `procedure_orchestration/`

**Frontend (`src/`)**:
- `bindings.ts` — Auto-generated from Rust via Specta (DO NOT EDIT)
- `features/{domain}/` — Feature modules:
  - `api/gateway.ts` — Only file allowed to call `commands.*`
  - `presentation/` — React components + colocated hooks

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

---

## 📋 Plan Format Guidelines
When proposing a TODO plan, Claude Code MUST:
- List exact file paths, not abstract locations
- Name the specific functions/methods/components to create or modify
- Separate clearly by architectural layer (backend / frontend)
- Include validation and testing steps
- Wait for explicit user approval before implementing
