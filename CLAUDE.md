# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Full architecture reference: [ARCHITECTURE.md](ARCHITECTURE.md)

## ⚠️ Core Rules
**IMPORTANT**: Claude Code will NOT commit, create branches, or create PRs via raw git commands. The user handles all git operations. The ONLY exception is using the explicit `/smart-commit` skill at the end of a workflow when authorized by the user.

---

## 🔄 Workflows & Planning

Before starting any task, analyze the request, state which workflow you are following, and follow its steps precisely.

### OPTION A: Full Feature Workflow
*Use for: New features, new business logic, significant UI changes, or complex refactoring.*

**Phase 1: Pre-implementation (Spec & Plan)**
1. Run **`/spec-writer`** skill to interview the user and produce `docs/spec/{feature}.md`.
2. (Optional) **/adr-manager** skill to produce `docs/adr/{ref}.md` if required.
3. Run **`spec-reviewer`** agent to validate the spec quality (DDD alignment, rule atomicity).
4. Run **`feature-planner`** agent. It reads the spec and architecture, and outputs a persistent implementation plan at `docs/spec/{feature}-plan.md`.

**Phase 2: Execution (CRITICAL)**
1. Read relevant documentation (`docs/backend-rules.md` and `docs/frontend-rules.md`).
2. Read the generated `docs/spec/{feature}-plan.md`. **This file is your Primary TaskList.** You are strictly forbidden from deviating from it.
3. Implement the feature layer by layer.
4. **Real-time Tracking**: You MUST physically update the checkboxes (`[ ]` to `[x]`) in the `docs/spec/{feature}-plan.md` file using file editing tools (`write_file` or `replace_lines`) immediately after completing each task. This allows the user to monitor your exact progress.

**Phase 3: Review & Quality**
1. Test & Lint: Run `python3 scripts/check.py` (or `just format`).
2. Write missing tests directly following `docs/testing.md` (Backend: `#[cfg(test)]`, Frontend: `.test.ts`).
3. Run the Subagent Gauntlet:
   - Run **`reviewer`** agent → fix issues.
   - If `.tsx` modified: run **`ux-reviewer`** agent → fix issues.
   - If `.sh`, `.py`, or `.githooks` modified: run **`script-reviewer`** agent.
   - If UI text changed: run **`i18n-checker`** agent.

**Phase 4: Validation & Closure**
1. Update documentation (`ARCHITECTURE.md` and `docs/todo.md` if needed).
2. Run **`spec-checker`** agent to confirm all Rn rules from the spec are successfully covered in the code.
3. Run **`workflow-validator`** agent to verify that the whole workflow was executed and all checkboxes in the `plan.md` file are ticked.
4. CRITICAL: Ask user if commit is needed. If yes, use the **`/smart-commit`** skill.

---

### OPTION B: Simple Technical Workflow
*Use for: Bug fixes, dependency updates, minor maintenance (no new business rules).*

1. **Analysis**: Read relevant documentation and analyze the codebase.
2. **Direct Plan**: Propose a concise TODO plan with exact file paths in the chat. Ask user to validate.
3. **Tracking**: Use internal `TaskCreate` / `TaskUpdate` tools to track workflow steps (mark `in_progress` when starting, `completed` when done) for user visibility.
4. **Implementation**: Execute the code changes.
5. **Review & Quality**: Run static checks (`python3 scripts/check.py`), write tests, and run the relevant subagents (`reviewer`, `script-reviewer`, etc.) just like in Phase 3 of the Full Workflow.
6. **Closure**: Ask user if another task is needed before commit, otherwise use **`/smart-commit`** skill.

---

## 🤖 Available Subagents (`.claude/agents/`)

**Pre-implementation (spec & planning)**
- `/spec-writer` (Skill) — Interactive spec writer: interviews the user, reads the domain, produces `docs/spec/{feature}.md` with Rn rules + UX draft.
- `/adr-manager` (Skill) — Technical decision maker: interviews the user on architecture/tech choices, produces `docs/adr/ADR-XXX.md`.
- `spec-reviewer` (Agent) — Quality control: reviews draft specs for rule atomicity, DDD alignment, and UX completeness before planning.
- `feature-planner` (Agent) — Architect: reads spec + ADRs + architecture, produces the persistent implementation plan in `docs/spec/{feature}-plan.md`.

**Post-implementation (review & quality)**
- `reviewer` — DDD + backend/frontend rules compliance check
- `ux-reviewer` — M3 + Clinical Atelier compliance, empty/loading/error states, form UX, accessibility, consistency (frontend only)
- `i18n-checker` — finds hardcoded strings, missing/dead translation keys fr + en
- `spec-checker` — verifies all Rn rules in a feature spec are implemented and tested
- `maintainer` — reviews CI/CD, manifests, and scripts for security, reliability, and cross-file consistency
- `script-reviewer` — Bash and Python expert reviewer for `scripts/` and `.githooks/` files
- `workflow-validator` — verifies that the entire workflow was executed correctly and all plan checkboxes are checked

**Meta & Skills**
- **`/dep-audit`** (Skill) — Security: audits npm and Cargo dependencies for CVEs and updates.
- **`/smart-commit`** (Skill) — Finalizer: generates conventional commits after final validation.

---

## 🛠 Commands
- Dev: `./scripts/start-app.sh`
- Quality: `python3 scripts/check.py` (Full check) | `python3 scripts/check.py --fast` (Lint only)
- Tests: `npm run test` (Frontend) | `cd src-tauri && cargo test` (Backend)
- Types: `just generate-types` (Sync Rust to TS via Specta)
- Database schema update: `just clean-db`
- Release: `python3 scripts/release.py [--dry-run] [--version X.Y.Z] [-y]`

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

---

## 📋 Plan Format Guidelines
When proposing a direct TODO plan (Option B), Claude Code MUST:
- List exact file paths, not abstract locations
- Name the specific functions/methods/components to create or modify
- Separate clearly by architectural layer (backend / frontend)
- Include validation and testing steps
- Wait for explicit user approval before implementing