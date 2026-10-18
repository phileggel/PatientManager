# TODO-008 — (frontend/fund-payment-match) — Create multiple procedures during auto-correction

Currently, the auto-correction flow only allows creating a single procedure. It should support creating multiple procedures in the same operation.

**Size:** L — a spec and a contract change, and a changed correction form: mocks.

**User value:** the user creates every missing procedure of a fund payment line in one correction, not just one.

**Done when:** in the correction of a fund payment line with no matching procedure, the user can add several procedures, each with its date and amount; the correction is accepted only when the amounts add up to the line's amount; every created procedure joins the fund payment group and ends `Reconciliated` after confirmation, as FPA-250 does for one. The spec and the contract carry the rule; Rust tests cover the sum check and the creation, one E2E the flow. Refined (2026-10-18): today no form exists — `buildNotFoundCorrection` (`src/features/fund-payment-match/shared/utils.ts`) builds one `AutoCorrection::CreateProcedure` per line from the PDF data (`src-tauri/src/use_cases/fund_payment_reconciliation/dto.rs`, `orchestrator.rs`), keyed by the line; the correction form is new and follows TODO-024's rule (the sum is refused by the backend, at the field). Size L holds.

**Decided (owner, 2026-10-18):** the backend judges the split when the card's "Valider la répartition" is clicked (TODO-024's rule): a check command refuses an unbalanced total under the total and a date outside the line's range under that date, the running total staying display only; the split is offered on every "not found" line, each date within the line's start → end (that day for a single-date line); every created procedure keeps the `import-pdf` type, as FPA-250 does for one.

**Design:** validated (owner, 2026-10-18) — `screenshots/design/TODO-008-*.png`: "Répartir en plusieurs actes" beside "Créer un nouvel acte", the editor in the card, the refusals at the field, "3 actes seront créés".

**Open questions:** none
