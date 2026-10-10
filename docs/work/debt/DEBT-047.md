# 2026-10-10 — DEBT-047 — Documents and comments point at notes in `docs/todo.md`, a file that no longer exists

**Found by:** the agent, while moving the queue to `docs/work/queue.md` (the pointers were already stale: no entry carried either note)

**Where:** `docs/ubiquitous-language.md` (the overdue term, "see the pending `ProcedureStatus` de-conflation note"), `docs/spec/procedure-orchestration.md` (the known limitation under PRO-260, "see `docs/todo.md`"), `.claude/skills/spec-writer/SKILL.md`, `.claude/agents/spec-reviewer.md` (both exclude a `todo.md` from `docs/spec/`, where there is none), and two code comments: `src-tauri/src/use_cases/fund_payment_reconciliation/orchestrator.rs`, `src-tauri/src/shared/infrastructure/secure_path.rs`

**Observation:** the glossary and the spec each send the reader to a todo note that exists nowhere, so nobody can tell whether the `ProcedureStatus` de-conflation and the `latest_fund` clearing are still owed. The second may be the cascade DEBT-042 describes. Owner's call for each: write the entry it promises, or drop the sentence. The two prompts carry a dead exclusion; removing it is mechanical.
