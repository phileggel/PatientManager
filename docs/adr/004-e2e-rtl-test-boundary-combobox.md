# ADR 004 — E2E / RTL test boundary for HeadlessUI ComboboxField

**Date**: 2026-05-02
**Status**: Accepted

## Context

`ComboboxField` (`src/ui/components/field/ComboboxField.tsx`) wraps HeadlessUI v2's
`Combobox`. It is used in `ProcedureFormModal` for patient and fund selection.

During the `test/improve-e2e-testing` branch, every attempt to automate the
ComboboxField interaction via WebdriverIO / WebKit failed:

1. **`addValue`** (real keystrokes via WebDriver protocol): inconsistently triggers
   HeadlessUI's `onChange`. Sometimes the `<li>` options appear in the DOM; sometimes
   they do not. Root cause: WebKit's WebDriver implementation does not reliably deliver
   all keyboard events to JavaScript event listeners at the speed the test runner
   expects.

2. **`setReactInputValue`** (native setter + `dispatchEvent("input")`): always fails.
   Root cause: programmatically dispatched events have `isTrusted = false`. HeadlessUI
   v2's `ComboboxInput` uses an internal state machine (`machine.actions.openCombobox`)
   that is only triggered by trusted browser events.

3. **`ComboboxOptions` floating-ui portal**: even when the dropdown is triggered, the
   `<li>` options are rendered in a portal positioned by floating-ui. In WebKit via
   WebDriver, the portal position is outside WDIO's "element displayed" viewport check,
   causing `waitForDisplayed` to time out.

These are open issues in HeadlessUI's own tracker (issues #3294, discussion #3665) and
in Playwright's tracker (issue #31741). No framework-supported workaround exists.

The same limitations apply in RTL / jsdom for floating-ui portal rendering.
`ComboboxOptions` with `anchor` fails to produce accessible options in jsdom because
floating-ui's layout engine is not available. Testing the HeadlessUI state machine
interaction directly is therefore not reliable in any automated environment available to
this project.

## Decision

### 1. E2E tests stop at the ComboboxField boundary

E2E tests (WebdriverIO / tauri-driver) cover:

- Navigation, page rendering, and all form interactions that use **native HTML elements**
  (`<input>`, `<select>`, native date pickers).
- Create/update flows for bank accounts, funds, patients, and procedure types — none of
  which require ComboboxField interaction.

E2E tests do **not** attempt to automate ComboboxField interactions. Any E2E test that
requires seeding a procedure (which requires patient selection via ComboboxField) is
excluded from the suite until a reliable seeding strategy exists (e.g. direct Tauri
`invoke` in a seed helper).

### 2. ComboboxField wiring is covered by RTL component tests

`ProcedureFormModal.test.tsx` uses React Testing Library with a **mocked `ComboboxField`**
(replaced by a native `<select>`) to verify:

- The ComboboxField receives the correct `items`, `displayKey`, and `idKey` from the
  store.
- Selecting a patient / fund via the mock's `onChange` correctly updates form state.
- `addProcedure` is called with the right positional arguments on submit.
- The submit button disabled logic (requires patient + procedure type + date).

This is the right layer for this test: the hook (`useProcedureFormModal.test.ts`) already
covers business logic; the component test covers UI wiring. HeadlessUI's ComboboxField
own behavior (fuzzy search, keyboard navigation, dropdown rendering) is covered by
HeadlessUI's own test suite — not our responsibility to duplicate.

### 3. `DateField` and `ModalContainer` are also mocked in component tests

`DateField` uses a custom calendar rendered via `createPortal` with layout-dependent
positioning. `ModalContainer` uses HeadlessUI `Dialog` with focus trapping. Both are
replaced by simple test doubles in `ProcedureFormModal.test.tsx` for the same reasons
as `ComboboxField` — they are portal-based and layout-dependent in ways that jsdom cannot
support.

## Consequences

**Pros:**

- RTL tests are deterministic and fast (no portal or timing issues).
- E2E tests are stable and reliable (only native elements).
- The ComboboxField → form state wiring is covered and will catch regressions if
  `handlePatientChange`, `handleFundChange`, or the `addProcedure` call signature
  changes.

**Cons:**

- No automated test verifies that a user can actually type, see dropdown options, and
  click one in a real browser. This interaction is covered only by manual testing.
- Any E2E test requiring procedure seeding is blocked until a Tauri-invoke-based seed
  helper is implemented.

## Alternatives Considered

- **Custom `combobox:select` DOM event on `ComboboxField`**: add a `useEffect` in the
  component listening for a custom event that directly calls `onChange`. Reliable in E2E,
  but embeds test infrastructure in production code. Rejected as "test code in prod".

- **Hidden native `<select>` alongside `ComboboxField`**: adds a parallel select element
  for E2E. Reliable if interacted with via `browser.execute`, but adds DOM weight and
  requires careful `aria-hidden` / `tabIndex` treatment to avoid AT regressions. Rejected
  as unnecessarily complex given the RTL approach covers the same wiring.

- **Switch to Playwright**: Playwright's `getByRole('option')` is slightly more reliable
  than WebdriverIO for HeadlessUI components. However, the Tauri 2 WebDriver stack is
  based on tauri-driver / WebKitWebDriver; switching to Playwright would require a full
  E2E infrastructure rewrite. The same portal/positioning issues remain in WebKit
  regardless of the test runner.

## References

- `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.test.tsx` — RTL tests
- `src/features/procedure/ui/procedure_form_modal/useProcedureFormModal.test.ts` — hook tests
- `src/ui/components/field/ComboboxField.tsx` — component under test
- HeadlessUI issue [#3294](https://github.com/tailwindlabs/headlessui/issues/3294) — portal testing
- HeadlessUI discussion [#3665](https://github.com/tailwindlabs/headlessui/discussions/3665) — programmatic value setting
- Playwright issue [#31741](https://github.com/microsoft/playwright/issues/31741) — ComboboxField click failures
- `docs/adr/005-combobox-feasibility-investigation.md` — full replacement feasibility study; accepted Option 1 (Tauri invoke seed helper, `e2e/helpers/seed.ts::seedProcedure`)
