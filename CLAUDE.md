# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
7. Review the code using the `reviewer` subagent. Go again to Implementation step if needed.
8. Update documentation.
9. CRITICAL: ask user if commit is needed and follow his instructions

### Available Subagents (`.claude/agents/`)
- `reviewer` — DDD + backend/frontend rules compliance check (used at step 7)
- `test-writer` — generates missing backend (Rust) and frontend (TS) tests
- `i18n-checker` — finds hardcoded strings, missing/dead translation keys (fr + en)
- `spec-checker` — verifies all Rn rules in a feature spec are implemented and tested

## 🛠 Commands
- Dev: `./scripts/start-app.sh` (Unix) | `scripts\start-app.bat` (Win)
- Quality: `./scripts/check.sh` (Full check)
- Tests: `npm run test` (Frontend) | `cd src-tauri && cargo test` (Backend)
- Types: `just generate-types` (Sync Rust to TS via Specta)
- Database schema update: `just clean-db`

## 🏗 Architecture Summary
Tauri 2 app (React 19 + Rust) using Domain-Driven Design.
- **Backend (`src-tauri/src/`)**: 
  - `commands.rs`: Centralized Tauri commands.
  - `{domain}/`: Feature modules (domain, service, repository, api).
- **Frontend (`src/`)**: 
  - `bindings.ts`: Auto-generated (DO NOT EDIT).
  - `features/{domain}/`: API (Tauri calls) and Presentation (UI).
- **Data Flow**: Component -> Service Layer -> Tauri Command -> Rust Service -> Repo.

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

**Guidelines:**
- List exact file paths, not abstract locations
- Name the specific functions/methods/components
- Separate clearly by architectural layers
- Include all validation/testing steps
- Wait for user validation before implementing
