# Frontend Test Coverage — Plan

> **Goal**: bring the **logic tier** (`use*.ts` with state, `shared/validate*.ts`,
> `shared/presenter.ts`, transforming gateways) to **80–100%** with tests that
> exercise real behaviour. **No mirror tests, no getter-returns-input tests.**

> **Acceptance is scope-based, not %-based.** A commit is done when every file in
> its scope has the meaningful tests listed below. Coverage % is informational,
> not a gate. (Decided 2026-05-05.)

---

## What "meaningful" means

A meaningful test asserts a **decision** the production code makes — a state
transition, an error branch, an output that depends on input shape, a side
effect that gets wired up.

Anything that simply re-states the production line in `expect()` is a mirror
test. Skip it.

### ✅ DO test

- **State transitions** — open/close, idle → loading → success → error,
  errors-reset-on-input, cancel mid-flight, double-submit guard
- **Branch outcomes** — every `if/else`/`switch` arm a hook can take, including
  the "service returned `success: false`" path (mock it explicitly)
- **Reshape & transformation** — presenter input → output mapping for at least:
  one happy case, one boundary (empty input, malformed date, null IBAN), one
  i18n-routed string
- **Validators** — one passing case + one failing case **per rule**, plus the
  "all rules pass together" case
- **RTL integration (per UI state)** — for each component, render once per
  distinct state declared in `frontend-rules.md`: `idle`, `loading`, `results`,
  `empty`, `error`. One `it` per state, asserting the user-visible thing
  (visible text, role=alert, button disabled).
- **Wiring** — that a button click calls the right gateway function with the
  right args (use `vi.mock("../gateway")` then assert on the mock call)

### ❌ DON'T test (these are unmeaningful — skip and move on)

```ts
// Mirror test — asserts the production line literally
it("calls commands.foo with the args", async () => {
  await fooGateway("a", "b");
  expect(commands.foo).toHaveBeenCalledWith("a", "b"); // production code says exactly this
});

// Getter-returns-input — asserts no logic at all
it("returns the id passed in", () => {
  const x = makePatient({ id: "p1" });
  expect(x.id).toBe("p1"); // factory just stored the field
});

// Empty-in / empty-out — proves nothing
it("returns [] when given []", () => {
  expect(presentList([])).toEqual([]); // no transformation in the empty case
});

// Does-not-throw — asserts absence, not behaviour
it("does not panic", () => {
  expect(() => publishEvents([])).not.toThrow();
});

// Mock echo — when the only thing tested is the mock you set up
it("returns whatever the gateway returns", async () => {
  vi.mocked(gw.foo).mockResolvedValue({ success: true, data: 42 });
  const r = await useFoo().load();
  expect(r).toBe(42); // just unwraps the mock
});
```

If a hook is a thin pass-through (no state, no callbacks, no derived value), it
is **transitively covered** by the component test that uses it. Don't write a
dedicated test — that's a mirror test.

If a gateway is `(a, b) => commands.foo(a, b)` with no error mapping, no
reshape, no logger branching — same. Cover it through the hook test that calls
it.

---

## Scope: files in the logic tier

### In-scope

| Tier                 | Pattern                                                                 | Why testable                            |
| -------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| Pure                 | `features/**/shared/validate*.ts`                                       | One rule per `it`; pure functions       |
| Pure                 | `features/**/shared/presenter.ts`                                       | Input-shape → output-shape mapping      |
| State-machine        | `use*Modal.ts`, `use*Form.ts`, `use*Panel.ts`, `use*Page.ts`            | Open/close, submit, errors, transitions |
| State-machine        | List/sort/search hooks (`useSort*`, `usePatientList`, `useFundList`, …) | Sorting, filtering, derived state       |
| Transforming gateway | gateway functions that **reshape args, map errors, call a presenter**   | Real transformation logic               |

### Out-of-scope (do not test directly)

- `useXxxManager.ts` files of size ≤ 8 lines (thin facade) — covered by their
  consumers
- `useBankTransferController.ts` (4 lines) — pass-through
- Pure pass-through gateway functions (`(a) => commands.foo(a)` with no logger
  branching, no error mapping, no reshape) — covered by hook tests
- `bindings.ts` — generated, never edited
- Material UI re-exports / layout-only components

If a file looks borderline, **inspect it first**. Rule of thumb: if you
struggle to write a non-mirror test for it, it's out-of-scope.

---

## Current state (2026-05-05, after `just coverage-fe`)

```
Statements : 51.67% (2512/4861)
Branches   : 47.79% (1364/2854)
Functions  : 48.97% ( 623/1272)
Lines      : 52.84% (2359/4464)
```

(Codecov reports ~48% — its denominator includes generated files vitest's v8
coverage skips.)

### Logic-tier gaps (lowest first — full per-file in commit sections below)

- **3 pure files** at 64–88% — fast wins
- **~12 hooks at 0%** (e.g. `useEditPatientModal`, `useSelectProceduresPanel`,
  `useBankTransferOperations`, list hooks)
- **~8 hooks at 1.8–42.8%** including the just-merged `useBankStatementModal`
  (42.8%, 166 lines) and `useRecordOverpaymentModal` (1.8%, 56 lines)
- **~6 hooks at 60–87%** with small remaining gaps
- **Multiple gateways at 0%** — most are pass-through; a few wrap `Result<T,E>`
  → `ServiceResult<T>` (borderline; cover transitively unless inspection shows
  branching logic)

---

## Commit plan (4 commits, by layer)

Each commit lists its **scope**, **what to test** per file, and a **suggested
commit message**. Commits are independent — the user may interleave with other
work between them.

> **Workflow per commit:** branch → write tests file-by-file → `just check-full`
> → `/smart-commit`. Re-run `just coverage-fe` at the end of each commit to log
> the delta in the commit body (informational only, not a gate).

### Workflow TaskList

- [ ] Commit 1 — Pure validators & presenters
- [ ] Commit 2 — List, sort, and small selector hooks
- [ ] Commit 3 — Form & edit hooks (state machines)
- [ ] Commit 4 — Multi-step orchestrators + RTL integration

---

### Commit 1 — Pure validators & presenters

Smallest, easiest, no async. Establishes the testing pattern for the rest.

**Scope (3 files):**

| File                                                  | Cur   | Gap        |
| ----------------------------------------------------- | ----- | ---------- |
| `src/features/fund-payment/shared/presenter.ts`       | 64.3% | 5/14 lines |
| `src/features/bank-account/shared/presenter.ts`       | 66.7% | 1/3 lines  |
| `src/features/fund-payment/shared/validatePayment.ts` | 87.5% | 1/8 lines  |

**For each presenter**: one `it` per shape transformation branch — happy case,
boundary case (null/empty/missing optional field), and the i18n-routed branch
(if any). No `presenter([])` empty-in-empty-out tests.

**For `validatePayment.ts`**: one passing test that satisfies all rules; one
failing test per rule the file enforces (read the file — write one `it` per
discrete rule, named `validatePayment_rejects_<rule>`).

**Acceptance**: every branch in each file is exercised at least once. Aim for
100% on these three files.

**Suggested commit**: `test(shared): cover presenters and validatePayment branches`

---

### Commit 2 — List, sort, and small selector hooks

The state-light tier. Small, similar shape; good batch.

**Scope (~10 files; inspect before testing):**

| File                        | Cur             | Notes                              |
| --------------------------- | --------------- | ---------------------------------- |
| `useFundPaymentList.ts`     | 0%              | Inspect — may be thin pass-through |
| `usePatientList.ts`         | 0%              | Inspect — may be thin pass-through |
| `useBankAccountList.ts`     | 0%              | Sort/filter likely                 |
| `useProcedureTypeList.ts`   | 0%              | Sort/filter likely                 |
| `useFundList.ts`            | 0% (9 lines)    | Inspect — may be thin pass-through |
| `useSortFundPaymentList.ts` | 29.6%           | Sort comparator branches           |
| `useSortBankAccountList.ts` | 84%             | Close gap                          |
| `useSortPatientList.ts`     | 85.2%           | Close gap                          |
| `useDoubleClickRow.ts`      | 41.7%           | Click timing / row-id state        |
| `useSelectFundModal.ts`     | 0% (8 lines)    | Selection state                    |
| `useSelectPatientModal.ts`  | 0% (13 lines)   | Selection state                    |
| `useFuzzySearch.ts`         | 83.3% (6 lines) | Close gap                          |

**For list/sort hooks**: one `it` per **comparator branch** (asc/desc, by-each-
sortable-column, ties), plus one `it` for "empty list returns empty" only if
the empty path triggers a real branch (e.g. early return) — otherwise skip per
DON'T rule above.

**For selector hooks**: one `it` per state transition (open/close, select/
deselect, confirm/cancel).

**Skip immediately if inspection shows**: a hook that just `return useState()`
or `return value` with no derived logic — drop it from this commit and add a
note in the commit body.

**Acceptance**: every comparator/state-transition exercised; thin-pass-through
hooks documented as skipped.

**Suggested commit**: `test(features): cover list, sort, and selector hooks`

---

### Commit 3 — Form & edit hooks (state machines)

The bulk of the form-flow state. Uses `renderHook` + `vi.mock("../gateway")`.

**Scope (~9 files):**

| File                          | Cur        | What to test                                                                                    |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `useEditPatientModal.ts`      | 0% (36)    | Open with seed, edit field, errors-reset-on-input, submit success/error, cancel                 |
| `useAddPatientPanel.ts`       | 84.8%      | Close gap (likely error branch)                                                                 |
| `useEditBankTransferModal.ts` | 82.4%      | Close gap (likely a delete or status branch)                                                    |
| `useAddBankAccountPanel.ts`   | 86.5%      | Close gap                                                                                       |
| `useCreateEntityForm.ts`      | 32.4% (34) | Validation orchestration, submit branches                                                       |
| `useAddFundPaymentPanel.ts`   | 63.6%      | Close gap (likely payment-date validation)                                                      |
| `useCancelRefundDialog.ts`    | 5.6% (18)  | Confirm/cancel/error                                                                            |
| `useUpdater.ts`               | 29.2% (24) | Inspect — may be Tauri side-effect heavy; if so, test only the state-machine, mock the platform |
| `useSelectProcedureModal.ts`  | 37.3% (83) | Selection, filter, confirm                                                                      |

**Test pattern per file**:

1. `it("opens with seed data")` — render with initial values, assert form state
2. `it("clears errors when input changes")` — set error, type into field, assert cleared
3. `it("submits successfully and emits result")` — mock gateway resolves success, assert state + callback
4. `it("surfaces gateway error")` — mock gateway resolves `{ success: false, error: "X" }`, assert error visible
5. `it("does nothing on cancel mid-flight")` — start submit, cancel, assert no state mutation after

Adapt the list to the hook's actual transitions — if a hook has none of (3)–
(5), it's probably out of scope for this commit.

**Acceptance**: every gateway-call branch (success + error) exercised; cancel
path covered where it exists.

**Suggested commit**: `test(features): cover form and edit-modal hooks`

---

### Commit 4 — Multi-step orchestrators + RTL integration

The highest-value chunk. Long-lived modal flows + the user-visible UI states.

**Hooks scope (~7 files):**

| File                           | Cur         | Notes                                                                                                                                                                                        |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useBankStatementModal.ts`     | 42.8% (166) | Just-merged feature; cover all 7 step transitions (`loading`, `matching`, `create-account`, `label-mapping`, `results`, `done`, `error`) and the inline-create-account form within the modal |
| `useRecordOverpaymentModal.ts` | 1.8% (56)   | Multi-step state machine; cover each step + cancel                                                                                                                                           |
| `useReconciliationModal.ts`    | 85.9% (85)  | Close gap — likely an error branch or an auto-correction path                                                                                                                                |
| `useProcedureFormModal.ts`     | 87.4% (103) | Close gap                                                                                                                                                                                    |
| `useBankTransferOperations.ts` | 0% (26)     | Cover each operation branch                                                                                                                                                                  |
| `useSelectFundGroupsPanel.ts`  | 0% (56)     | Selection + confirm                                                                                                                                                                          |
| `useSelectProceduresPanel.ts`  | 0% (56)     | Selection + confirm                                                                                                                                                                          |
| `useDashboardPage.ts`          | 61%         | Close gap (likely a derived metric branch)                                                                                                                                                   |

**RTL integration scope** (one test file per component, **one `it` per state**):

| Component                                                        | States to cover (per `frontend-rules.md`)                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `BankStatementModal.tsx`                                         | idle, loading, matching results, create-account form, label-mapping, success/done, error, empty (no entries matched) |
| `RecordOverpaymentModal.tsx`                                     | idle, loading, success, error                                                                                        |
| `ReconciliationModal.tsx`                                        | idle, loading, results, error                                                                                        |
| `ProcedureFormModal.tsx`                                         | idle, loading on submit, success, error                                                                              |
| Any bank-transfer / fund-payment list view that has all 5 states | idle, loading, results, empty, error                                                                                 |

**RTL test rules** (from `e2e-rules.md` / `frontend-rules.md`):

- Mock the gateway with `vi.mock`, not `invoke`
- Assert user-visible content: text, `role="alert"`, disabled/enabled buttons
- One `it` per UI state — do not combine "loading then success" in one test;
  split into two
- For wiring: render, click, assert `expect(gw.foo).toHaveBeenCalledWith(...)`
  with the **shape** the user produced (form values), not the literal
  arguments the production code constructs

**Acceptance**: every step in every multi-step modal's state machine is
exercised by a hook test, **and** every distinct UI state declared in the
rules is rendered at least once in an RTL test.

**Suggested commit**: `test(features): cover multi-step modals and RTL UI states`

---

## How to run / verify

```bash
just coverage-fe              # generates coverage/frontend/lcov.info + summary
just check-full               # full quality gate before each commit
```

Per-file coverage drill-down (used in this plan):

```bash
awk '
/^SF:/ { file=$0; sub(/^SF:/, "", file); lh=0; lf=0 }
/^LH:/ { sub(/^LH:/, "", $0); lh=$0 }
/^LF:/ { sub(/^LF:/, "", $0); lf=$0 }
/^end_of_record/ {
  if (lf > 0) { pct = (lh*100)/lf;
    if (pct < 100) printf "%6.1f%%  %4d/%-4d  %s\n", pct, lh, lf, file }
}' coverage/frontend/lcov.info | sort -n
```

---

## Out of scope for this plan

- Component-level coverage of pure layout / Material UI wrapper components
- E2E tests (separate effort — see `docs/TODO.md` "Force English locale during
  E2E")
- Backend coverage (separate `just coverage-be` flow)
- Removing the trivial B25-violating tests already flagged in `docs/TODO.md`
  (a separate cleanup commit)

---

## Notes for the agent picking this up

1. Read this plan top-to-bottom before starting any commit. The DO/DON'T
   examples are the contract.
2. Inspect each file before writing tests. If it's a thin pass-through, drop
   it from the commit and note "skipped: pass-through, covered transitively
   by `<consumer>`" in the commit body.
3. Use existing factories (`src/tests/patient.factory.ts`) and the patterns
   already in adjacent `*.test.ts` files. Don't introduce a new style.
4. Run `just check-full` before committing — pre-commit will refuse otherwise.
5. **Never** edit `bindings.ts`, never test by mocking `invoke` directly when
   a gateway exists — mock the gateway via `vi.mock("../gateway")`.
6. If you finish a commit and the global coverage barely moved — that's fine.
   This plan trades coverage % for signal density on purpose.
