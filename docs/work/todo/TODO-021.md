# TODO-021 — (backend) — Every bounded context follows the B0 folder layout

Last entry split from TODO-006: it moves every file the four others edit, so it comes after them. The target is rule B0 in `docs/backend-rules.md` (`application/`, `domain/`, `infrastructure/` inside each context): `bank` follows it today; `fund`, `patient` and `procedure` do not.

**User value:** none directly — every bounded context is laid out the same way, so code is found where the rule says.

**Done when:** `fund`, `patient` and `procedure` follow B0 as `bank` does; `just arch-check` checks the layout; `ARCHITECTURE.md` matches; no behaviour changes — moves and import paths only. Comes after TODO-017 to TODO-020.

**Design:** none

**Open questions:** none
