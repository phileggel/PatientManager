# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns. Not commitments — tech-debt entries describe _what's odd_, not _what to do_. For action items see `docs/todo.md`.

`whats-next` reads from this file; entries surface as work candidates labelled with their date.

---

## 2026-05-09 — Aria-labels not consistently localized
- Found by: manual
- Where: across `src/` (notably `src/features/shell/DesignSystemPage.tsx` with 10+ hardcoded English aria-labels; full sweep pending)
- Context: branch `chore/e2e-infra-hardening` @ `938ef70`
- Observation: Hardcoded `aria-label="..."` literal strings exist in `src/` outside the i18n layer. Screen readers announce these in their hardcoded language regardless of the user's runtime locale, producing inconsistent a11y output (a French-locale user hears English announcements for some buttons, and vice versa). The current PR translates the two hardcoded cases its scope touches (`ModalContainer`, `Snackbar`); a project-wide sweep is needed, and there is no automated guard preventing future hardcoded values from landing.
