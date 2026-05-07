# ADR 006 — Frontend pre-resolves all translations and formatting for the backend PDF renderer

**Date**: 2026-05-07
**Status**: Accepted

## Context

The post-reconciliation PDF report (FPR spec, `use_cases::fund_payment_report_pdf`)
embeds ~20 user-facing labels in two locales (`fr`, `en`) plus locale-aware
currency and date strings. The frontend already owns a complete i18n
infrastructure based on `react-i18next`, including templated keys with
`{{placeholder}}` interpolation, plus the platform `Intl.NumberFormat` and
`Intl.DateTimeFormat` APIs.

Three architectures were considered for the backend:

1. **Hand-rolled `match (locale, label)` table in Rust** — zero dependencies,
   compile-time exhaustiveness, but every translation duplicated between FE
   and BE. Hand-rolled `fmt_currency` and `fmt_datetime_long` per locale.
   Risk: silent drift between FE and BE strings; templated word-order swaps
   across locales are awkward.
2. **Backend reads the FE-owned locale JSON via `include_str!`** — one source
   of truth for label strings, no new crate. Cost: a Rust file under
   `src-tauri/` references paths inside `src/i18n/locales/`; adds a `Label`
   enum, `OnceLock` cache, JSON flatten step, and a hand-rolled `t_args()`
   helper for `{{placeholder}}` keys would still be needed. Currency and date
   formatters remain hand-rolled in Rust. Two i18n consumers of the same
   files (i18next + Rust renderer) means breaking JSON shape changes must
   consider both sides.
3. **Frontend pre-resolves every string before invoking the command** — the
   request payload carries already-translated labels and already-formatted
   numeric/date values. Backend has no language tables, no formatters, and
   no locale field; it is a pure data → PDF assembler.

Option 1 was rejected for translation duplication. Option 2 was prototyped
and shipped (with a hand-rolled `t()` and `fmt_*` helpers) but raised a
real concern: templated translations such as "from {{start}} to {{end}}"
hard-coded their word order in `format!()` calls, which fails for any
locale that places the placeholders differently. Adding a Rust mirror of
i18next's `{{placeholder}}` interpolation duplicates a feature i18next
already ships, and the hand-rolled currency / date formatters
(NBSP-for-FR, hand-tabulated month names) are fragile for additional
locales.

## Decision

The frontend resolves every label, currency, and date string before
invoking `generate_fund_reconciliation_report_pdf`. The backend command
accepts only pre-resolved strings:

- Pre-translated `title`, `continuation_title`, `correction_section_heading`,
  `page_label`, every `UnreconciledColumns` cell, every `total_label`,
  every `CorrectionGroup.title`.
- Pre-formatted `header_lines` (period, generation date, source PDF), each
  produced by the FE through i18next interpolation + `Intl.*` formatting.
- Pre-formatted `UnreconciledRow` cells (date, patient, SSN, currency)
  and `total_value`.
- Pre-joined `CorrectionGroup.rows` — each correction's variant-specific
  columns are concatenated by the FE into a single row string.

The backend's `Renderer` is a pure assembler: it places strings at fixed
geometry, computes page breaks, applies typography, and stamps page
numbers using the `page_label` supplied in the request. It never inspects
content and has no `locale` field.

Validation on the backend is restricted to structural and DoS guards:
empty checks on required strings, length caps, control-character
rejection, and collection-size caps.

Convention pinned: **the frontend owns every translator-facing and
locale-formatted string in the report; the backend assembles and never
translates or formats.** Future locales add a JSON file on the FE with
no Rust changes.

## Consequences

- **Pros**:
  - One i18n system across the stack — i18next on the FE handles labels
    (including `{{placeholder}}` interpolation natively), `Intl.*` handles
    numbers and dates per locale. No mirror to maintain in Rust.
  - Backend becomes orthodox: pure data → PDF assembler. Removed `Label`
    enum, `t()`, `OnceLock` caches, `LOCALE_*_JSON` constants, JSON flatten
    helpers, hand-rolled `fmt_currency` / `fmt_date_short` /
    `fmt_datetime_long`, and the `every_label_resolves_in_both_locales`
    test (~250 LOC deletion).
  - Adding a third locale = new JSON file on the FE only. Zero Rust
    recompile, zero new `Label` variants, zero new month-name tables.
  - Templated translations work correctly across word orders because
    interpolation is performed by i18next on the FE, not by `format!()`
    in Rust.
  - No cross-layer reference: `src-tauri/` no longer references paths
    inside `src/`.
- **Cons**:
  - Wider request contract: the FE must know the report's structure
    deeply (which 20 labels exist, where each pre-formatted value goes).
    Vocabulary that previously lived on the BE now lives on the FE.
  - No headless / CLI / cron PDF generation possible — the BE cannot
    render without a frontend resolving labels first. Not a use case for
    this app, but a door closed.
  - Trust boundary inverted for display strings: the BE echoes
    FE-supplied content into the PDF. Mitigated by length caps (1024
    bytes per string), control-character rejection, and collection-size
    caps.
  - A third-party that integrates the Tauri command directly (out of
    scope for this app) would need to perform translation and formatting
    themselves.
