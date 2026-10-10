<!-- Format: docs/workflow.md § 3, step 8. Under 20 lines. -->

**Task** — the entry (TODO-NNN / DEBT-NNN) or the request, in one line. **Scope** — commit type and layers. **Design** — mock approved, or none. **Touching** — the paths.

What changes for the user (or "Nothing changes for a user — internal").

- Done when "…" → the test that proves it
- Closure: the entry's file deleted (`just whats-next close <id>`)

Reviewers (local): findings that changed something; techdebt filed.

Screenshots: one per changed component, or "No visual impact" and the screen that consumes the change.
