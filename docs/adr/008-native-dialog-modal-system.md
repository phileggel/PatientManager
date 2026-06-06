# ADR 008 — Native `<dialog>` top layer for the modal system

**Date**: 2026-06-06
**Status**: Accepted

## Context

The app grew three independent modal primitives, each rendering inline in the
React tree with its own hardcoded z-index and no awareness of the others:

- `Dialog` (`src/ui/components/modal/Dialog.tsx`) — `z-100`, used by ~10 features
- `ModalContainer` — `z-50`
- a hand-rolled `fixed inset-0` overlay in `SelectProcedureModal` — `z-50`

None portals to a stable layer; each picks a z-index by hand. Issue #60 exposed
the failure mode: `EditFundPaymentModal` (a `Dialog` at `z-100`) opens
`SelectProcedureModal` (`z-50`) on top of itself. Because `z-50 < z-100`, the
child rendered _behind_ its parent and the parent's rows intercepted clicks, so
the user could not select anything. The fix shipped for #60 was a surgical bump
to `z-200` (the existing "above-dialog" tier `DateField` already uses) — correct
for that instance, but it does not address the class of bug: any nested or
route-driven modal must manually out-number whatever it opens over, and two
modals at the same tier still collide by DOM order. Hardcoded z-index does not
compose.

A decision is needed now because (a) modal nesting is already happening, (b)
route-driven modals are on the roadmap and would multiply the collision surface,
and (c) the longer the three primitives proliferate, the more consumers a later
consolidation must touch.

## Decision

Standardise on the **native HTML `<dialog>` element opened via `showModal()`** as
the single modal primitive, and migrate the three existing primitives onto it
over time.

`showModal()` promotes the dialog into the browser **top layer**, which paints
above every z-index and every CSS stacking context unconditionally, and stacks
nested dialogs by call order. This removes z-index from modal layering entirely —
there is no number to get wrong, and nested/routed modals "just work" by open
order. The platform also provides the backdrop (`::backdrop`), focus trapping,
and Escape handling natively, shrinking each modal's bespoke code.

Considered and rejected: **React portal to `document.body` + a uniform z-index +
DOM-order stacking** (the Radix/HeadlessUI approach). It is more React-idiomatic
and fully incremental, but it keeps a z-index discipline that must be honoured
forever, and same-tier nesting still depends on insertion order being correct.
Native `<dialog>` eliminates the discipline rather than centralising it.

Migration is incremental and tracked as tech debt: new modals use the native
`<dialog>` primitive; the three existing primitives are folded into it as their
features are touched.

## Consequences

- **Pros**: z-index disappears from modal layering — no per-modal tiering, no
  nested-collision class of bug, route-driven modals stack correctly by open
  order; native backdrop / focus-trap / Escape reduce bespoke modal code; top
  layer is well-supported in both shipping WebViews (WebKitGTK on Linux,
  WebView2 on Windows); consistent with the existing ADR-007 native-dialog usage.
- **Cons**: a real migration cost — one shared primitive must absorb the varied
  layouts/footers of `Dialog`, `ModalContainer`, and `SelectProcedureModal`, and
  ~10+ consumers move over incrementally; `::backdrop` and top-layer styling
  differ from the current Tailwind-overlay approach and need design parity work;
  during the transition the codebase carries both the native primitive and the
  legacy z-index modals (mixed state until migration completes). The #60 `z-200`
  fix on `SelectProcedureModal` is one such interim artefact — its hardcoded
  z-index is deleted when that modal migrates to the native primitive.
