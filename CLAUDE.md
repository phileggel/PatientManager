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
4. CRITICAL: ask user to validate. If changes, go back to step 3 with the adapted plan.
4b. (Optional) For significant new/redesigned UI → run **Stitch workflow** (see 🎨 Stitch Workflow section)
5. Implementation
6. Test & Lint `./scripts/check.sh`
7. Run the `reviewer` subagent → **show the full report to the user** → ask which issues to tackle → fix selected issues → re-run until 0 critical
7b. If any `.tsx` file was modified → run `ux-reviewer` subagent → **show the full report to the user** → ask which issues to tackle → fix selected issues → re-run until 0 critical
7c. If any `.sh`, `.py`, or `.githooks` file was modified → run `script-reviewer` subagent
8. If frontend text was added/changed → run `i18n-checker` subagent
9. If tests are missing → write them directly (backend: Rust `#[cfg(test)]` inline, frontend: `.test.ts` colocated) — follow `/docs/testing.md`
10. Update documentation:
    - Update `ARCHITECTURE.md` if new files, modules, or features were added/removed
    - Update the relevant spec in `docs/` if new business rules were added
    - If a spec doc exists → run `spec-checker` subagent to confirm all rules are covered
11. **Self-check** — before asking to commit, explicitly verify each step:
    - [ ] Docs read (step 1)
    - [ ] Reviewer run and clean (step 7)
    - [ ] UX reviewer run and clean if .tsx modified (step 7b)
    - [ ] script-reviewer run if .sh/.py/.githooks modified (step 7c)
    - [ ] i18n-checker run if text changed (step 8)
    - [ ] Tests written (step 9)
    - [ ] ARCHITECTURE.md updated if needed (step 10)
    - [ ] Spec updated + spec-checker run if spec exists (step 10)
12. CRITICAL: ask user if commit is needed and follow his instructions

### Task tracking (within a conversation)
Use `TaskCreate` / `TaskUpdate` to track workflow steps for non-trivial tasks:
- Create one task per workflow step at the start of implementation
- Mark each step `in_progress` when starting, `completed` when done
- This prevents skipping steps and gives the user visibility

### Available Subagents (`.claude/agents/`)
- `reviewer` — DDD + backend/frontend rules compliance check (step 7)
- `ux-reviewer` — M3 + Clinical Atelier compliance, empty/loading/error states, form UX, accessibility, consistency (step 7b, frontend only)
- `i18n-checker` — finds hardcoded strings, missing/dead translation keys fr + en (step 8)
- `spec-checker` — verifies all Rn rules in a feature spec are implemented and tested (step 10)
- `maintainer` — reviews `.github/workflows/`, `tauri.conf.json`, `Cargo.toml`, `package.json`, `scripts/`, `.githooks/`, and `justfile` for CI correctness, security, reliability, and cross-file consistency; also suggests CI improvements (performance, cost, observability, DX) when run as a standalone audit
- `script-reviewer` — Bash and Python expert reviewer for `scripts/` and `.githooks/` files; checks safety (`set -euo pipefail`, quoting, injection), robustness, portability, and consistency with CI
- `ia-reviewer` — meta-reviewer for AI configuration: audits all agent definitions, skills, and CLAUDE.md for correctness, clarity, completeness, and internal consistency

---

## 🎨 Stitch Workflow

### When to use Stitch
Use Stitch when the task involves a **significant new or redesigned UI component** (new page, new modal, major UX change). Not for small fixes or backend-only work. Insert as optional **step 3b**, between plan validation and implementation.

### Process
```
Step 3b-1: Claude generates initial mockup
           → mcp__stitch__generate_screen_from_text (project: ProjectSF / 7705025027636758446)
           → device: DESKTOP, model: GEMINI_3_1_PRO
           Optional: generate variants for design exploration
           → mcp__stitch__generate_variants (2-5 variants, EXPLORE range)
           → present variants to user, user picks one
Step 3b-2: User refines the chosen design on stitch.withgoogle.com
           Minor corrections can be done by Claude via mcp__stitch__edit_screens
           (e.g. "move the search field below the section label")
Step 3b-3: Claude downloads the result
           → mcp__stitch__list_screens → mcp__stitch__get_screen
           → curl HTML to docs/stitch/{feature}.stitch  (.stitch = no linting, gitignored, ephemeral)
Step 3b-4: Claude reads the HTML and extracts structure as implementation reference
```

### Adapting Stitch output to the codebase
- **Layout/structure** → reimplement in TSX using `ui/components` — never copy-paste Stitch HTML
- **Colors** → map Stitch tokens to our M3 tokens (same semantic names, our values in `tailwind.css`)
- **Fonts/shadows/glassmorphism** → only use if already adopted in our design system (see design system alignment)
- **Stitch HTML is reference only** — it shows intent, not implementation

### UX changes made during Stitch edition
After downloading, Claude identifies UX elements added/changed by the user in Stitch (e.g. new button, new section). These become **complementary todos** — not blocking the current implementation. Implementation follows two phases:
1. **UI structure** — match the Stitch screen layout and visual design
2. **UX wiring** — implement the behavior behind new UI elements (separate task)

### .stitch file lifecycle
- Created at step 3b-3
- Used during implementation (step 5) as visual reference
- **Delete when `ux-reviewer` passes** on the implemented component — the reference is done

### Design system alignment
When Stitch introduces new design patterns (new tokens, shadows, component styles), create a **dedicated todo** for design system alignment — never block feature implementation on it. After alignment, update the `ux-reviewer` agent rules to enforce the new patterns. Stitch project design system and our `tailwind.css` stay naturally in sync once T20 is done.

### Design system reference
- Stitch project: `projects/7705025027636758446` — use this single project for all features, never create a new one
- Design system spec: `docs/stitch/design-system.md` ("The Clinical Atelier") — committed to git
- Target alignment: indigo/purple M3 palette, Manrope (headlines) + Inter (body), primary-tinted ambient shadows, no structural borders (tonal surfaces instead), gradient primary CTAs, glassmorphism modals

## 🛠 Commands
- Dev: `./scripts/start-app.sh`
- Quality: `./scripts/check.sh` (Full check)
- Tests: `npm run test` (Frontend) | `cd src-tauri && cargo test` (Backend)
- Types: `just generate-types` (Sync Rust to TS via Specta)
- Database schema update: `just clean-db`
- Release: `python3 scripts/release.py [--dry-run] [--version X.Y.Z]`

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
When proposing a TODO plan, Claude Code MUST:
- List exact file paths, not abstract locations
- Name the specific functions/methods/components to create or modify
- Separate clearly by architectural layer (backend / frontend)
- Include validation and testing steps
- Wait for explicit user approval before implementing
