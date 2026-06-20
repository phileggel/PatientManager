# Reconciliation UX Pattern

A shared **interaction convention** for document-reconciliation flows. Both the
fund-payment reconciliation (PDF) and the bank-statement reconciliation flows
MUST present the same user-facing experience so a user learns one mental model.

> **Convergence is at the UX layer only — NOT the code layer.** Each feature
> implements this pattern **independently** inside its own bounded context.
> There is deliberately **no shared `ReconciliationResultsView` component**, no
> cross-feature domain code. The two flows look and behave alike; their code
> does not converge. See [§ What is shared vs not](#what-is-shared-vs-not).

This doc is the **single source of truth** for the pattern. Because consistency
is not compiler-enforced (no shared component), it is held by this doc +
design review + `/visual-proof` whenever either flow changes.

---

## Why a convention, not a shared component

The two documents look similar but are different domain operations:

- **Fund PDF** — lines are **procedure-level** anomalies (amount / fund / date
  mismatch, missing procedure). Match target: a `Procedure`.
- **Bank statement** — lines are **credit → fund-group(s)** matches, including
  the bank-only composite case (one credit → N groups + an untracked remainder).
  Match target: `FundPaymentGroup`(s).

A shared component would be a leaky abstraction forcing two genuinely different
domain shapes through one code path, and would couple two bounded contexts
(violating the spirit of frontend-rules **F26**). Duplication of the _frame_ is
the cheaper, correct trade. The price paid is **drift risk**, managed by this
doc + review (see [§ Drift](#drift-management)).

---

## The pattern (interaction contract)

Every reconciliation flow MUST follow these six rules.

1. **Whole-document list.** Show **every** line of the imported document at once
   — never bit-by-bit / one-card-at-a-time. The user sees the full scope before
   acting.
2. **Status per line.** Each row shows its identity columns plus a **status**:
   `OK`, or `correction needed` labelled with the correction _type_.
3. **Exception-first ordering.** Rows needing correction float to the top. A
   **summary count** is always visible (e.g. `193 OK · 7 need correction`), with
   a filter toggle to hide OK rows. All-OK rows give scope confidence without
   burying the actionable ones.
4. **Per-line correction.** Clicking a correction-needed row opens a
   **type-specific modal scoped to that single line**. These modals differ per
   feature and per correction type — that is expected and correct.
5. **Batch action.** A single "correct all" / wizard button resolves the whole
   list in one gesture (see [§ Batch semantics](#batch-semantics)).
6. **Live update + explicit validate.** The list re-derives status after **each**
   applied correction. Nothing is persisted until a final **Validate** commits
   the staged corrections. Staging is in-memory and reversible until validate.

---

## Per-document line schema

The columns differ by document; the _frame_ (identity… → status) does not.

**Fund-payment line**

- fund · patient name · date · value · **status**
- correction types: amount mismatch · fund mismatch · date mismatch ·
  create procedure · link to nearby procedure · too-many-matches (blocking)

**Bank-statement line**

- fund · value · **status**
- correction types: assign group · **multi-group** (1 line → N groups, with a
  live `selected sum / line amount` + remainder readout) · **remainder**
  (annotate the untracked portion)

> The multi-group and remainder corrections are **bank-only** and carry net-new
> domain work; they do not exist on the fund side.

---

## Batch semantics

The "correct all" button MUST have a defined meaning per flow — pick one and
keep it consistent:

- **Auto-apply** — stage every _safe_ correction in one click (the current fund
  `handleAutoCorrectAll` behaviour). Best when most corrections are
  unambiguous.
- **Guided walkthrough** — step the user through each correction-needed line in
  turn. Best when corrections need a per-line decision.

A flow MAY offer both, but the buttons must be visually distinct. The batch
action stages into the same in-memory model as per-line corrections, so the
list updates identically and Validate is the single commit point.

---

## What is shared vs not

**Shared (allowed):**

- This interaction contract (the six rules above).
- Generic, BC-agnostic `ui/` primitives (buttons, modal shell, table, badges) —
  this is the design system, not domain code.
- Ubiquitous-language terms (`docs/ubiquitous-language.md`) and i18n key
  discipline (`docs/i18n-rules.md`).

**NOT shared (each feature owns its own):**

- The results-list component, the row components, the correction modals.
- Any domain types, presenters, gateways, hooks.
- Validation / staging logic.

If a future change tempts you to extract a shared domain-aware reconciliation
component "to avoid duplication," **stop** — that re-introduces the cross-BC
coupling this convention exists to avoid. Duplicating the frame is intentional.

---

## Current state → target (gap)

Neither flow implements the target pattern yet; both converge toward it.

- **Fund-payment** — today: **step-by-step** card review (`ReconciliationResultsView`,
  one anomaly card at a time, Enter advances) + `handleAutoCorrectAll`. Gap:
  move to whole-document list with per-line click-to-correct.
- **Bank-statement** — today: `MatchResultsStep` list with **single-group**
  selection per line (`userSelections: Map<lineId, groupId | null>`). Gap:
  multi-group selection + remainder; exception-first ordering + summary.

---

## Drift management

With no shared code, two independent implementations will diverge unless pinned.
The pins are:

1. This doc — the authoritative interaction contract; update it first when the
   pattern itself evolves, then bring both flows into line.
2. `/visual-proof` + design review on any change to either flow — the
   consistency gate that compiler-enforced sharing would otherwise provide.

---

## Open decisions (resolve in each feature's spec, not here)

These are deliberately left to per-feature `/spec-writer` work:

- **Surface** — ephemeral modal (import-time) vs a persistent, revisitable view
  (storing partial reconciliation state — a meaningfully larger build). This
  gates the whole shape; decide it first.
- **Uncovered amount** — lightweight **remainder annotation** (no new aggregate,
  ships fast) vs a first-class **aid-payment entity**.
- **Batch** — auto-apply vs guided walkthrough (per [§ Batch semantics](#batch-semantics)).
