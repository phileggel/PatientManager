# FLOW-020 — Each E2E suite writes its own "open a management page" helper (DEBT-026)

- Kind: effort
- Size: S
- Observed: opening the management dialog and clicking a card is written again in
  `e2e/patient-duplicate/`, `e2e/bank-statement-label/`, `e2e/patient/`, `e2e/fund/` and
  `e2e/bank-account/`.
- Proposal: one helper in `e2e/helpers/` replaces the copies.
- Costs: one small pull request. Protects: a change of the dialog breaking five suites
  in five ways.
- Decision (owner, 2026-10-04): one shared helper in `e2e/helpers/`, used by the five suites.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): decided, not worked; carried a third time. Left.
- Refined (2026-10-14, before queuing): the five suites named are still the ones that open the management dialog themselves; `e2e/helpers/` holds `e2e.ts`, `seed.ts`, `tauri-invoke.ts`. Comes after FLOW-019 (the same E2E tree on WebdriverIO 10). Done when: one helper in `e2e/helpers/e2e.ts` opens the management dialog and clicks a card; the five suites use it and keep no copy; the E2E suites pass. Size S holds.
