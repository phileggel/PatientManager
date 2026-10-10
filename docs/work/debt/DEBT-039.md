# 2026-10-05 — DEBT-039 — A fund identifier already used is reported as a database error

**Found by:** the agent, during TODO-016's fund audit (branch `refactor/todo-016-fund-validator`)

**Where:** `src-tauri/src/context/fund/repository.rs` (`create_fund`, `update_fund`), `src-tauri/src/context/fund/service.rs`

**Observation:** creating a fund with an identifier another fund has makes the repository answer "Fund identifier already exists" as an `anyhow` error, which the service turns into `DatabaseError`: the user reads "a database error occurred". Editing a fund onto a used identifier fails the same way on the unique index. The fund contract used to promise a `DuplicateIdentifier` code that never existed. A code of its own shows a message under the identifier field — a visible change, so the wording is the owner's.
