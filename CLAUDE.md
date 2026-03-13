# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Workflow & Planning
**IMPORTANT**: Claude Code will NOT commit, create branches, or create PRs. The user handles all git operations.

### CRITICAL: Implementation task
- Any code file is considered as implemtantion task
- ONLY exception is doc files
- Every task should follow *Plan Before Implementation*

### ⚠️ CRITICAL: Plan Before Implementation
BEFORE starting any implementation task, Claude MUST:
1. **Analyze** the request and current codebase.
2. for backend **follow** `/docs/development/backend-rules.md`
3. for frontend **follow** `/docs/development/frontend-rules.md`
4. **Propose a TODO plan**.
5. **Wait for user validation** before modifying any files.
6. **Implementation** only starts after explicit user approval.

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
