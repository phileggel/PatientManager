# TODO-010 — (backend/arch) — Introduce a DI container for orchestrator wiring

Production orchestrators are currently wired manually in `lib.rs` via explicit `Arc<dyn Trait>` constructor injection. This works but doesn't scale well as the number of dependencies grows: adding a dep means touching `lib.rs`, the orchestrator `new()`, and every integration test `Ctx`. A DI container (e.g. `shaku`) would centralize registration and resolve dependencies automatically, reducing wiring boilerplate and making the `new()` signature irrelevant to callers. Evaluate once the orchestrator count or dep count becomes a maintenance burden.

**User value:** none directly — adding a dependency to an orchestrator touches one place instead of three.

**Done when:** every orchestrator is registered in a container; `lib.rs` no longer builds them by hand; integration tests build their context from the same container; adding a dependency touches the orchestrator and its registration only.

**Design:** none

**Open questions:**

- [ ] Not started until wiring a dependency actually hurts — the owner says when.
