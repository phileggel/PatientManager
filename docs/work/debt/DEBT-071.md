# 2026-10-18 — DEBT-071 — The procedure orchestration spec's structure lags the spec template

**Found by:** `spec-reviewer` on TODO-025's pull request (PRO-090, PRO-150 edited), findings that predate the branch

**Where:** `docs/spec/procedure-orchestration.md`, `docs/spec-index.md`, `docs/adr/004-e2e-rtl-test-boundary-combobox.md`

**Observation:** the spec's rules are PRO-NNN, but `docs/spec-index.md` registers the trigram POC (🔴 for the reviewer); the title names no trigram; no `## UX Draft` nor `## Open Questions` section; PRO-010, 020, 025, 060, 070, 100, 110, 170 and 180 carry no scope tag; the status lists spell the glossary's discrepant `Reconciliated` / `…Payed`, and PRO-090's token list keys them in SCREAMING_CASE where the rules and glossary use PascalCase (`docs/ubiquitous-language.md` § ProcedureStatus). PRO-080 does not say that the creation button carries the typed search into the new-patient form, which the code does (`ProcedureFormModal.tsx`, `onCreateNew`). PRO-150 and PRO-160 (third `spec-reviewer` round on TODO-025, the owner chose to leave their wording, 2026-10-18): not atomic; the two-character opening threshold, the message's wording, the creation button's place as the dropdown's last item and the six-match cap (ADR-005) are written nowhere; whether spaces count, and whether the fund field shares the threshold and message, are open. ADR-004 says anchored `ComboboxOptions` produce no accessible options in jsdom; `src/ui/components/field/ComboboxField.test.tsx` now finds them there (`userEvent.type`). A spec drifting from right code: gated "when next touched" by `/spec-writer`.

**Size:** M

**Waits on the owner:** no
