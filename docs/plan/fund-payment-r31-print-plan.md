# Implementation Plan — R31: Print Report Button (fund-payment-auto-match)

## Scope

Frontend-only. Single rule added to an existing, fully-implemented feature.
No backend changes. No `just generate-types` required.

---

## Workflow TaskList

- [x] 💻 Frontend Implementation — Print button in report header
- [x] 🌐 i18n — Add `modal.header.print` key (fr + en)
- [x] 🎨 CSS — Add `@media print` rules to `tailwind.css`
- [x] 🧪 Unit Test — Add test case to `ReconciliationModal.test.tsx`
- [x] 🧹 Formatting & Linting (`just format` + `./scripts/check.sh`)
- [x] 🔍 Code Review (`reviewer`)
- [x] 🎭 UX Review (`ux-reviewer`)
- [x] 🌐 i18n Review (`i18n-checker`)
- [x] ✅ Final Validation (`spec-checker` + `workflow-validator`)

---

## Detailed Implementation Plan

### Task 1 — Add Print button to the report header in `ReconciliationModal.tsx`

**File**: `src/features/fund-payment-match/reconciliation_modal/ReconciliationModal.tsx`

The post-validation branch (lines 52–76) renders a standalone header `<div>` before `<UnreconciledReportView>`. This is the "fixed/sticky" header that R31 refers to. A "Print" button must be added there, to the left of the close (`X`) button, inside the existing `flex items-center justify-between` row.

Specifically, replace the right-hand side of that header from a single close button to a small row containing:
- A `<Button variant="outline" size="sm">` labeled with `t("modal.header.print")`, with `onClick={() => window.print()}`.
- The existing `X` close button unchanged.

The button must only appear in this branch (post-validation report). It must not appear in the main reconciliation workflow branch (lines 78–136). No state is needed; `window.print()` is a fire-and-forget call.

Import `Printer` from `lucide-react` and pass it as the `icon` prop to `Button` for visual clarity.

### Task 2 — Add i18n keys

**Files**:
- `src/i18n/locales/fr/fund-payment-match.json`
- `src/i18n/locales/en/fund-payment-match.json`

Add a `print` key under `modal.header` (a new sub-object inside `modal`) in both files.

```
"modal": {
  ...existing keys...,
  "header": {
    "print": "Imprimer"          // fr
    "print": "Print"             // en
  }
}
```

### Task 3 — Add `@media print` CSS rules

**File**: `src/ui/tailwind.css`

The modal renders inside a `fixed inset-0 z-50` overlay (`ModalContainer`). When `window.print()` is called, browsers print the entire document by default, which would print the overlay backdrop and the modal chrome rather than just the report content.

Add a `@media print` block at the end of `tailwind.css` with two rules:

1. **Hide everything except the report content**: `body > * { display: none; }` and a selector that makes the modal dialog panel visible. In practice, target the `role="dialog"` element and its content: set the dialog to `display: block; position: static; max-height: none; overflow: visible; box-shadow: none; border-radius: 0;` and hide the modal header and close button using a `print:hidden` Tailwind class (added directly in JSX — see Task 1) or an explicit CSS rule.

2. **Simpler, more robust approach** (preferred): Use Tailwind's `print:hidden` utility directly in JSX on elements that must not print (the header div, the close button), and add `print:block print:overflow-visible` on the report content div. This avoids writing raw CSS and keeps styling co-located in the component. In `tailwind.css`, only add one rule to prevent the backdrop from printing:

```css
@media print {
  /* Hide the modal backdrop overlay */
  .fixed.inset-0.z-50 > button[aria-label="Close modal"] {
    display: none;
  }
}
```

**Recommended JSX approach in `ReconciliationModal.tsx`**: Add `print:hidden` to the header `<div>` (the one containing title and buttons) in the report branch, so only the `UnreconciledReportView` content is printed. Wrap `UnreconciledReportView` in a `<div className="print:overflow-visible">` to remove the scroll constraint. The "Fermer/Close" button inside `UnreconciledReportView` itself should get `className="print:hidden"`.

**Also add `print:hidden` to `UnreconciledReport.tsx`**: The "Fermer/Close" `<Button>` at the bottom of `UnreconciledReportView` should include `className="print:hidden"` so it does not appear on the printed page.

### Task 4 — Add test case to `ReconciliationModal.test.tsx`

**File**: `src/features/fund-payment-match/reconciliation_modal/ReconciliationModal.test.tsx`

Add one test in the existing `describe("ReconciliationModal")` block:

- Name: `"shows Print button in report header after validation, not during reconciliation workflow"`
- Setup: same as the existing `"closes modal when clicking Close in unreconciled report"` test (mock `createFundPaymentWithAutoCorrections` to resolve `[]`, let `getUnreconciledProceduresInRange` resolve `[]`).
- Assert: after `waitFor` that the report view appears (`screen.getByText(/Unreconciled procedures/)`), `screen.getByRole("button", { name: /print/i })` is in the document.
- Also assert that before the report phase (during loading or reconciliation), the print button is absent — but since these are already covered by other tests that do not reach the report phase, a single positive assertion is sufficient.

Spy on `window.print` with `vi.spyOn(window, "print").mockImplementation(() => {})`, click the Print button, and assert `window.print` was called once.

---

## Rules Coverage

| Rule | Implementation |
|------|---------------|
| R31 — Print button in report header only | Task 1: Button in post-validation branch of `ReconciliationModal.tsx` |
| R31 — `window.print()` trigger | Task 1: `onClick={() => window.print()}` |
| R31 — Button absent during other steps | Task 1: button only in the `unreconciledReport !== null` branch, not in the main workflow branch |
| R31 — No applicative error state | No state or error handling added; browser manages print lifecycle |
| R31 — i18n label | Task 2: `modal.header.print` key in fr + en |

---

## File Summary

| File | Action |
|------|--------|
| `src/features/fund-payment-match/reconciliation_modal/ReconciliationModal.tsx` | Add Print button + `print:hidden` to header |
| `src/features/fund-payment-match/unreconciled_report/UnreconciledReport.tsx` | Add `print:hidden` to Close button |
| `src/i18n/locales/fr/fund-payment-match.json` | Add `modal.header.print` |
| `src/i18n/locales/en/fund-payment-match.json` | Add `modal.header.print` |
| `src/ui/tailwind.css` | Add `@media print` backdrop hide rule |
| `src/features/fund-payment-match/reconciliation_modal/ReconciliationModal.test.tsx` | Add R31 test case |
