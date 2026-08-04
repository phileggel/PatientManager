# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.22.0] - 2026-08-04

### Added

- two-screen flow, display window, leave-aside (BAS-118-123)
- zero-item acknowledged remainder resolves (BAS-123B)

### Fixed

- close spec-checker gaps; wizard entry to pinned footer
- id-safe label slugs; settings Enter-submit; review fixes
- resolve cargo-audit RUSTSEC advisories

## [0.21.0] - 2026-08-03

### Added

- assign dialog gains procedure scope and context header
- assign open procedures and birth groups at validate

### Fixed

- live remainder text; close spec-checker test gaps
- gate remainder ack on assignment success; review fixes

## [0.20.2] - 2026-07-31

### Fixed

- distinct tone for unlinked labels in the reconciliation list
- order candidates most recent first, flag exact amounts
- widen auto-match window to 15 days
- manual candidate search unbounded by date

## [0.20.1] - 2026-07-30

### Fixed

- apply review findings, clear stale dialog errors, busy guards
- auto-match nearest-offset order; cover BAS-015/051/052/071
- date-window guard, wizard suggestion text, locale formatters
- emit real unparsed count and warn in the import modal
- allow manual cross-fund group assignment per amended BAS-090
- seed current assignment and fold remainder into assign modal
- show correction errors inside the open dialog
- validate fails loudly when lock or status writes fail

## [0.20.0] - 2026-07-29

### Added

- wizard assign-group step offers the candidate selector

### Fixed

- space- and tie-tolerant fund suggestion heuristic
- wizard link-fund step requires explicit choice or reject
- drop hidden broadened selections when narrowing candidates
- identify assign-group candidates by fund name
- themed, sorted fund selects in link-fund modal and wizard

## [0.19.0] - 2026-06-21

### Added

- flag overdue procedures with a warning row
  Overdue is derived live in the frontend — a CREATED procedure dated
  before the latest fund-reconciled procedure — not a persisted status.
  Kept out of ProcedureStatus to avoid feeding the status conflation;
  no backend, contract, or migration change.
- render reconciliation list as a table for column alignment
  Grid auto-columns let amounts float; a real table with date/fund/amount/
  status columns + headers right-aligns the amount column on a shared edge.
  Row + status stable ids unchanged.
- one-line reconciliation rows with gold status badge
  Each line is now a single row — date · fund name · amount · status — with
  the fund name resolved from cache and locale-formatted amounts. The four
  correction-needed statuses render as a gold (m3-tertiary) badge so the
  lines to tackle stand out at a glance; resolved lines stay subdued.
- unified reconciliation list + correction modals + wizard
  Frontend half (PR 2 of 3) of the bank-reconciliation rework: replaces the
  stepwise import wizard with a unified document-order list driven by the
  recompute engine — per-line correction modals (link-fund/assign-groups/
  remainder), guided wizard, and revert. Also lands the BE+FE removal of the
  now-superseded commands (label-mapping/match/create-transfers/config).
- reconciliation draft engine + validate command
  Backend half (PR 1, additive) of the bank-reconciliation rework: a pure
  recompute engine computing the per-line draft from the parsed statement +
  an ordered correction list, plus a validate command that recomputes
  server-side before committing. The 4 stepwise commands stay registered so
  the current FE still compiles; they're removed in PR 2 with the FE rework.
- reversible corrections + explicit validate
  Supersede FPA-460: validation no longer auto-fires when the last anomaly
  resolves, which left no window to review or undo a correction. Corrections
  now stage in memory and stay reversible (Modify) until one explicit Validate
  applies the batch. Frontend-only — persistence already deferred to validate.
- wire typed reconciliation errors through F27
  FE half of the fund_payment_reconciliation typed-error migration. The 4 fallible gateway commands return ServiceResult<T, FundPaymentReconciliationError> (typed pass-through, no longer throwing the error code); a new shared/errorPresenter.ts maps each code to an i18n key; useReconciliationModal routes errors through it to t(key). Adds en+fr error keys and gateway/presenter/hook tests. The 2 report fns stay throwing (deferred fund_payment_report_pdf). No .tsx/.css change.

### Fixed

- restore heuristic suggestion + broaden/hide-resolved/revert
  spec-checker closure gate caught 4 spec gaps the rework left: the fund
  heuristic suggestion (BAS-032) was dropped when resolve_fund_labels
  collapsed into the engine — restored + now carried on every needs-link
  line; plus the missing BAS-068 broaden affordance (BE broadened_candidates

* FE toggle), BAS-069 hide-resolved filter, and BAS-065 revert-any-correction.

- select import modal by stable id, not role attribute
  Native <dialog> carries the role implicitly — the attribute selector
  stopped matching after ADR-008 and broke the post-merge E2E run.
- resolve npm audit findings in E2E dev chain
  serialize-javascript forced to 7.0.5 via overrides (mocha pins ^6);
  ws bumped in-range. npm audit now reports 0 vulnerabilities.
- toast delete errors in hook instead of throwing
  The thrown presenter message was caught and re-wrapped by the component
  ("Failed to delete payment group: Error: ...") — double-framed and off the
  sibling toast-in-hook pattern. The dialog now stays open on failure (boolean
  return). Also fixes the test file's dead @ui/components mock specifier, which
  had silently never applied. Closes the 2026-06-08 tech-debt entry.

## [0.18.1] - 2026-06-07

### Fixed

- run migrations with foreign_keys off (correct #67 fix)
  The real cause of #67 is not an orphan — the affected DB is FK-clean. 20260524 rebuilds the parent table procedure, and dropping a parent under enforced foreign keys trips SQLite's deferred-violation counter once per child row, so COMMIT fails. Run migrations on a foreign_keys=OFF connection (SQLite's documented table-rebuild recipe) + foreign_key_check after; supersedes the no-op orphan repair from the previous commit.
- repair procedure FK orphans before migrating (#67)
  0.18.0's 20260524 rebuild re-validates every procedure foreign key at commit; a legacy orphan (FK never historically enforced) aborted the migration and crashed startup. Repair orphans non-destructively before sqlx::migrate! so the untouched migration commits. Adds adversarial-data regression tests — the clean-data testing gap that let this ship; prevention tracked in techdebt.
- format root CHANGELOG.md via broadened prettier glob
  The format:docs fixer only globbed docs/**/\*.md while the CI checker globs **/\*.md, so release.py left the generated root CHANGELOG.md unformatted and Quality failed. Broaden the fixer to match the checker.

## [0.18.0] - 2026-06-06

### Added

- wire typed OverpaymentError through F27 FE pipeline
  Surface typed OverpaymentError through gateway, presenter, hooks, i18n, and
  ProcedureFormModal so the UI matches on error codes instead of strings.
  Add gateway/presenter/hook + orchestrator branch tests, and exclude the
  logicless gateway.ts (vitest) and api.rs (tarpaulin) pass-through layers.
  Also reconcile the contract error names and log PR 4a in the migration todo.
- sheet-based selection + execute-time skip report
- BE: orchestrator filters by sheet_month; EXI-280/281 date+month gates emit SkippedRow entries
- FE: SheetSelectionStep replaces MonthSelectionStep; ParsingReportModal surfaces execute-time skips
- spec EXI-270/280/281/290 + IFC-026 (source_row transport metadata); amended EXI-110/160/170/180/220
- closes techdebt 2026-05-24 silent month-prefix fallback
- tighten billed_amount + add PRO-025 propagation
  A migration backfills legacy NULL rows from the procedure type's
  `default_amount` and adds the NOT NULL constraint, closing the
  null-paid_amount defect in reconciliation and removing the FE
  `effectiveAmount` fallback chain that compensated for it.
- add fund_reconciliation_date to split Stage 1/2 dates
  confirmed_payment_date previously carried Stage 1 (fund-document date,
  set at reconciliation) AND Stage 2 (bank-transfer date) — the two
  collided and dashboard "Payments" double-counted. The new field
  separates Stage 1 cleanly; migration backfills losslessly. Dashboard
  metric now narrows to Stage 2 only — the semantically correct view.
- show care-period range in groups list
  payment_date is the fund-document date and doesn't tell the user which
  care window the payment actually covers. The list cell now derives
  min/max procedure_date from each group's lines (FPM-360 new), collapsing
  to a single date when start === end and to "—" when no procedure
  resolves. Search filter extended to match the displayed range (FPM-540).

### Fixed

- scope link key per PDF line
  Two unmatched fund-group lines on the same date share one nearby_candidates
  list. The link-resolution key was procedure_id only, so linking a candidate
  to one line marked every sibling line resolved — the second proposal
  vanished and auto-correct-all skipped it. Key is now scoped by line_index.
  Closes #61
- raise select-procedure modal above parent
  SelectProcedureModal opened from inside the EditFundPaymentModal Dialog
  (z-100) but rendered at z-50, so it sat behind its parent and the parent's
  rows intercepted clicks. Bump to z-200 (the DateField above-dialog tier).
  ADR-008 ratifies migrating modals to native <dialog> as the structural fix.
  Closes #60
- map types only for selected sheets
  The mapping step derived its amount list from all parsed sheets, prompting
  type mappings (and orphan type creation) for months the user never selected.
  The backend already filters by sheet (EXI-270); this aligns the UI.
  No visual impact — row count only.
- count integration tests in BE coverage + fix inert exclude
  tarpaulin ran `--lib` only, so the 8 integration tests under src-tauri/tests/
  scored zero coverage (BE understated ~70.6% vs real ~76%); add `--tests`.
  Also fix the overpayment api.rs exclude path that never matched
  (`use_cases/...` → `src/use_cases/...`). Route CI through `just coverage-be`
  (single source of truth) + add `just` to install-action, killing the drift.
- unicode case-fold patient name lookup
  SQLite's LOWER() only folds ASCII, so a DB row "élodie dupont" and an
  Excel row "Élodie Dupont" missed each other and produced a duplicate
  patient on re-import. The parser already uses Rust's Unicode-aware
  to_lowercase() (excel_import/parser.rs); moving the DB-side compare
  into Rust restores EXI-080 dedup symmetry on accented names.
- update codec round-trip imports for pdf_extractor move
  Sweep merge 2ab199b removed parsing::extract_pdf_text re-export; these integration tests still consumed it. Caught only by GH Dev Fixtures CI (pre-push doesn't enable --features dev-fixtures).
- locale-aware currency display across the app (#33)

## [0.17.1] - 2026-05-13

### Added

- remember last folder for export and import
  Extends lastFolderStore with a shared "db-backup" key — users
  typically save and restore backups from the same folder, so a
  single memory slot matches the natural workflow. Mirrors the
  existing Excel / fund-PDF / bank-PDF folder-memory pattern.

### Fixed

- move dev binaries out of src/bin/
  The Tauri NSIS bundler walks src/bin/ for binary candidates and
  expects each entry to produce a bundled .exe. Moving generate*\*
  binaries and the fixtures*\* submodules to src-tauri/dev/ stops
  the bundler from looking for phantom artifacts. autobins=false
  is no longer needed; tarpaulin / dev-fixtures workflows updated.
- pending-import lookup follows db_path under E2E redirect
  Startup checked app_data_dir/patient_manager.db.pending while the
  import side staged at db_path.parent()/patient_manager.db.pending —
  paths diverged only when PATIENT_MANAGER_E2E_DB redirected the live
  DB. Production mode is byte-identical. Adds pending_path_for helper +
  three regression tests.

## [0.17.0] - 2026-05-13

### Added

- export PDF to Downloads and open in viewer
  Replaces preview modal + save dialog with one click: render, write to
  Downloads under a locale-aware {stem}\_{YYYY-MM}.pdf name, then launch
  the system PDF viewer. Filename leaf is validated server-side; same-
  name collisions get a ' (N)' suffix. Spec, contract, ADR-007, and
  ARCHITECTURE updated.
- wire tauri-plugin-opener
  Plugin required to launch system PDF viewer from Rust. Used by the
  upcoming export-and-open command. No new capability — the plugin is
  called from backend code only, not from the renderer.
- add optional priorityKey to promote items in suggestions
  useFuzzySearch gains a 5th optional parameter; ComboboxField + useComboboxField
  thread it through. Items whose `item[priorityKey]` field is truthy are
  surfaced above falsy ones via a stable secondary sort, preserving Fuse's
  intra-bucket match-score order. No behaviour change when omitted.
- add session-reflect end-of-session ceremony
  Audits recent work for emergent rules, contradicted rules, and trim
  signals; proposes add / trim / memory-only / nothing decisions for
  CLAUDE.md. Output-only — surfaces proposals; the user confirms each.
  Compact-resilient: signals come from git, memory files, and
  CLAUDE.md diff, not just conversation context.
- remember last folder per import kind
  Persist the parent folder of the picked file in localStorage under
  per-kind keys (excel / fund-pdf / bank-pdf) and pass it as
  defaultPath on the next pick. Trust the native dialog's OS-level
  fallback when the folder is gone. Drop one illegit techdebt entry
  (make_mock_proc_repo coverage) on review.
- F24 + F25 compliance across modal and dialog surfaces
  Routes all a11y labels through i18n (F24), enforces stable ids on
  the 7 modal wrappers and 28 feature call sites (F25), adds Escape
  and aria-labelledby wiring throughout, and migrates CreatePatientForm
  off @headlessui/react onto the project Dialog. DesignSystemPage is
  exempted from F24 (dev-only, build-pinned locale).
- E2E native-dialog override pattern (ADR-007)
  Single typed window.\_\_e2e namespace + e2eOverride() helper that every
  native-dialog gateway routes through. Migrates 4 picker sites (shell +
  db-backup). Override branch gated by import.meta.env.DEV so it
  tree-shakes out of release builds. Unblocks FPR E2E (PR C).
- extend import codec to bank-statement PDFs
- extend import codec to fund-payment-reconciliation PDFs
  PDF bytes are non-deterministic (printpdf 0.9 emits a fresh /ID array
  per save), so the round-trip test, not byte equality, is the gate;
  CI drift-check excludes \*.pdf via pathspec. printpdf is reused from
  the FPR renderer (IFC-065) to avoid inflating prod deps; rust_xlsxwriter
  stays the only Excel-only dev dep gated by the dev-fixtures feature.
- add Excel codec dev binary and round-trip test
  Excel fixtures previously required scarce real documents or hand
  anonymization. This adds an inverse generator that turns a
  ParsedExcelData value into an .xlsx the production parser inverts
  under structural equality, validated by a round-trip test. The
  binary and rust_xlsxwriter dep are gated by `dev-fixtures`.
- add report preview modal and FE-resolved request flow
  Add ReportPreviewModal with iframe blob URL + Save / Close. Extend
  gateway with generateReportPdf and saveReportPdf. New presenter +
  formatters resolve every label, currency, and date on the FE before
  dispatch (ADR-006). Drop legacy HTML-print template and rename the
  report-step button from Print to Report.
- add backend PDF generation command
  New use_case `fund_payment_report_pdf` exposes
  `generate_fund_reconciliation_report_pdf` as a Tauri command. Renders
  the post-reconciliation report with printpdf 0.9 and embedded Roboto
  TTFs (Apache 2.0). Validates locale, dates, row caps, deny_unknown_fields;
  generic mapping for renderer-internal errors.
- auto-backup before migrations and improve startup logs
  Snapshot the live DB via VACUUM INTO when migrations are pending so a
  failed upgrade can be rolled back by restoring the file. Skipped on
  fresh installs and when nothing is pending. Add a panic hook that
  routes panics to tracing (visible on Windows release builds where
  windows_subsystem=windows hides stderr), log app version + build_os
  on startup, and bracket sqlx::migrate! with INFO entries.
- inline create-account on unknown IBAN
  Replaces the no-account dead-end with an inline create form (BAS-011..017):
  IBAN read-only pre-filled, name required (inline validation), on success
  continues to label-mapping; on backend error maps the IbanAlreadyUsed sentinel
  to a translated message; cancel closes modal entirely. Adds 8 unit tests, 8
  visual-proof screenshots (idle/loading/error-validation/error-backend × light+dark).
- enforce IBAN uniqueness across soft-deleted accounts
  Introduces BAS-010..017 + R5: bank-statement-auto-match now offers an
  inline create form when the IBAN is unknown. Backend layer adds
  find_by_iban_including_deleted repo method and a service-layer guard
  on create + update (self-match allowed). Spec/contract/plan updated.
  No IPC surface change — errors flow as IbanAlreadyUsed string sentinel.
- implement FPR print report
- add bank-account smoke test and fix E2E testability gaps
- procedure form modal amendments (R9 R18 R26 R28-R32)
- add overpayment refund management (REF)
  Implements REF-010 to REF-240: create/cancel overpayment refund cascade
  across Procedure, Fund, and Bank contexts. Adds ProcedureStatus::Overpaid
  and OverpaymentRefund, BankTransferType::OutgoingWire, ProcedureRefund
  entity, deletion guards (REF-220/230/240). ADR-002 documents the
  accepted partial-state trade-off (no DB transaction, REF-050).
- add print button to report header (R31)
  Print button shown only during post-validation report step via window.print().
  Header hidden on print, table max-height removed. R31.
- always show label mapping step with two-block display
  R7/R23-R28: two-block display, sticky Accepter, confirmed pre-filled, hint-only suggestion
  R26: NO_VIR_SEPA_LINES structured error; ADR-001: BankFundLabelMapping persistence
  UX: M3 semantic tokens for dark mode, CompactSelectField with chevron
  UX: rejected row left-border style, modal reduced to max-w-2xl, sticky header padding
  Extract logic to useFundLabelMappingStep hook (F10)
- add INS label and view-partial mode to procedure modal
  R26: view-partial mode — only procedure_type_id editable, payment fields absent
  R28/R31: formatPatientLabel returns "NOM Prénom (INS)"
  R29/R32: ComboboxField for patient in create+edit, onCreateNew in create only
  R30: edit mode passes payment fields through unchanged
  R9: fund inline creation removed from modal
- add procedure type management with FAB modal
- Backend: case-insensitive dedup, import-pdf guard, category normalization (R3,R4,R22,R21)
- Frontend: CreateProcedureTypeModal (FAB) replaces side panel, filter sentinel import-pdf (R16,R23)
- Frontend: empty/no-results/error+retry states, fix EditProcedureTypeModal submit (R12,R13,R15)
- Extract useDoubleClickRow hook; i18n keys fr+en
- docs/plan/procedure-type-plan.md: all 20 steps checked
- replace modal drawer with persistent M3 navigation rail
  Drawer is now a persistent flex sidebar (w-70 expanded / w-16 rail).
  DrawerToggle removed; toggle button embedded in branding section.
  Icons via lucide-react. aria-current on active page, mainNavigation
  aria-label, useMemo for page title/subtitle, snackbar centered on content.
- replace lists accordion with unified management modal
  Replace the Lists accordion in the drawer with a single "Gestion"
  entry opening a modal with 6 cards (patients, funds, procedure types,
  fund payment, bank transfer, bank accounts).
  Prerequisite checks preserved.
- unify import entry points into a single modal
  Replace the three separate drawer entries (Excel import, fund
  reconciliation, bank reconciliation) with a single "Importer"
  entry that opens a modal with three clickable cards.
  Prerequisite checks (funds, bank accounts) are preserved.
- add database backup and restore via modal
- procedure list with sort, status filter, and table redesign
- allow viewing locked fund payments in read-only modal
- add design system page and button components
- add dark mode with theme toggle and M3 token migration
- add day/night/auto theme toggle with Clinical Atelier dark palette
  Cycles day→night→auto, persists to localStorage, applies .dark on <html>, OS media query for auto. Dark palette from Stitch. 13 tests, spec in docs/theme.md.
- T17/T18/T19 — Edit fund payment modal with add procedures flow
- EditFundPaymentModal: M3 design, summary bar (R20), SelectProcedureModal (R19)
- SelectProcedureModal: logic extracted to hook, month filter, preload support
- presenter: formatAmountEUR + formatDateFR helpers, pure rowId from group.id
- Backend: find_unpaid_by_fund, QueryBuilder batch queries, BACKEND tracing (B16)
- reviewer agent: dead code warning rule; backend-rules: B16
- T20 — Clinical Atelier design system alignment
  Indigo/purple M3 tokens, primary-tinted shadows, Inter+Manrope fonts.
  Button: gradient primary CTA + rounded-xl. Dialog+ModalContainer: glassmorphism.
  ux-reviewer enforces Clinical Atelier. Fix ConfirmationDialog cancelLabel (required).
- enforce R4 transfer type immutability in backend orchestrator
- Guard update/delete_fund_transfer: assert type == FUND before mutation
- Guard update/delete_direct_transfer: assert type != FUND before mutation
- Guards fire before any revert/compute to prevent silent corruption
- Add 4 integration tests covering each cross-call rejection scenario
- implement R12 fund filter and sort in expanded search
- implement CASH transfer type with auto cash account (R13)
- Add get_cash_bank_account_id Tauri command + CASH_ACCOUNT_ID constant
- Auto-assign cash account on CASH selection; reactive fallback for late load
- Exclude cash account from dropdown; show i18n label (not DB name)
- Add 6 tests for R13 behaviors in useAddBankTransferForm
- Add typeCash/cashAccount i18n keys in en + fr
- implement manual bank transfer
- improve manual match
- handle negative procedure
- add excel-import mapping memo
- add update feature

### Fixed

- check duplicates before applying corrections
  create_multiple_with_auto_corrections used to apply corrections + create
  patients/procedures BEFORE checking duplicates, persisting partial state
  on bail. Reorders steps so the duplicate check runs first; adds a
  mockall regression test and fixes a behavior test that used
  ProcedureStatus::None where production writes Created.
- reject already-imported PDFs at reconcile time
  Hoists the duplicate-PDF guard into reconcile_and_create_candidates so
  a re-import surfaces an 'already imported' empty-state at modal open,
  instead of letting the user walk through the anomaly UI before the
  validate step bails. Updates contract + i18n + RTL coverage.
- exclude reconciled procs from matcher
  Adds payment_status = 'CREATED' to the matcher SQL so already-reconciled
  procedures stop surfacing as ghost anomalies on PDF re-imports. Adds
  a repository regression test; defers related dead-method removal.
- surface SSN-bearing patients first in the form combobox
  useProcedureFormModal bakes a hasSsn flag onto each patientItem, and
  both Patient ComboboxField call sites (create + edit modes) pass
  priorityKey="hasSsn". Patients with a non-empty SSN now appear above
  SSN-less patients in fuzzy results, preserving Fuse intra-bucket order.
- remove "Importer un autre fichier" button
  The button only re-fired onClose and the Excel import is a full-view
  page reachable from the side menu, so users have a clearer exit path
  already. Removes the dead i18n key from both locales and the test that
  clicked it.
- replace hardcoded fr-FR with locale-aware formatting
  Sweep every remaining date display through useFormatters / formatShortDate:
- bank-transfer: BankTransferList, SelectProceduresPanel, SelectFundGroupsPanel, useSelectPatientModal
- fund-payment: SelectProcedureModal, EditFundPaymentModal (delete formatDateFR helper)
- procedure: ProcedureList (formatDateDisplay deleted), PeriodSelector + getMonthName now take a locale arg
- localize remaining raw-ISO leak sites
  Route group/payment/procedure dates through useFormatters in
  PdfDataTable, UnreconciledReport (period header + table rows),
  MatchResultsStep (select option + confirmation line), and
  FundPaymentList table cell.
- localize auto-correction comparison dates
  formatProcedureDateFromLine now takes a locale and routes both the
  single-date and period branches through formatShortDate, so the
  auto-correction comparison cards (Single/Group/NotFound) no longer
  leak raw YYYY-MM-DD into the rendered DOM. RTL regression test on
  SingleMatchCard DateMismatch row pins both columns.
- fall back to name-based lookup when SSN is empty
  Re-importing the same workbook every month was creating a fresh
  blank-SSN patient each time because the DB lookup was SSN-only.
  Now: SSN missing → case-insensitive name lookup, SSN-bearing match
  wins over blank-SSN. Renumbers excel-import spec rules to the
  EXI-NNN trigram pattern (gold), keeping (Rxx) for traceability.
- swap inverted PDF period dates at parse time
  When a PDF line has start > end (e.g. "du 16/04 au 13/04"),
  parse_date_range now swaps the two endpoints and logs a
  tracing::warn so the inversion is auditable. Format-agnostic —
  comparison runs on parsed NaiveDate, covering both DD/MM and
  DD/MM/YYYY. New rule FPA-025.
- canonicalize user-supplied paths in IPC commands
  Adds core::secure_path with PathPolicy + PathValidationError; the 3
  file-path commands (extract_pdf_text, parse_bank_statement,
  save_fund_reconciliation_report_pdf) now canonicalize and assert
  the result falls under $HOME with a matching extension before
  touching the filesystem. Closes the renderer-spoofs-path attack.
- redact PII and paths from frontend gateways
  Drop or replace sensitive values in 10 gateway log sites:

- patient/gateway.ts:13,18,27 — drop patient `name` (3 sites; replace
  with `hasName: !!name` boolean on add)
- bank-statement-match/gateway.ts:42,61 — drop `filePath` and full `iban`
- fund-payment-match/gateway.ts:23,210 — drop `filePath` and saved-PDF
  path
- excel-import/api/gateway.ts:42 — drop `filePath`
- db-backup/gateway.ts:37,50 — drop `destPath`/`sourcePath`

Same theme as the prior backend redaction commit. Patient names and
IBANs are PII; file paths leak the user's home directory across
operating systems.

- redact PII and paths from backend tracing
  Drop or replace sensitive values in 11 backend log sites:

- patient/api.rs:61 — replace `name = ?name` with `has_name = name.is_some()`
- fund_payment_reconciliation/api.rs:256 — drop file_path
- bank_statement_reconciliation/api.rs:35 — drop file_path
- db_backup/orchestrator.rs:29,50,87 — drop dest/source path fields
- excel_import/parser.rs:98 + api.rs:63 — drop file_path
- core/db.rs:51 — drop db_path (TRACE)
- lib.rs:324 — drop log_file path (TRACE)

Patient names are PII (medical-records context, GDPR). File paths embed
the user's home directory across macOS/Linux. None of the dropped
values are needed for operational debugging — error paths already log
the relevant operation context separately.

- heal CRLF-LF migration checksum drift on startup
  v0.14.0 was built with git autocrlf=true on Windows, baking CRLF-based
  SHA-384 checksums into the binary. Subsequent LF-built binaries panicked
  at startup when sqlx::migrate! validated the stored checksums against
  its compiled-in LF hashes. Detect the CRLF pattern and rewrite stored
  checksums to LF before sqlx::migrate! runs.
- add translated titles to import file-picker dialogs
- route native dialog calls through feature gateways
  Fixes F3 violation: open()/save() from @tauri-apps/plugin-dialog were called
  directly from useDbBackupPanel and useImportModal. Wrapped in gateway functions
  (pickExportPath, pickImportPath, pickExcelFilePath, pickPdfFilePath) so tests
  can mock at the gateway boundary.
- return em dash from formatDateDisplay on malformed input
- exhaustive switch for all BankEntryType variants
- add isMounted guard to both useEffect calls
- route date period conjunction through i18n
- rename locale_obj to localeObj in DatePickerLegacy
- resolve all OxLint warnings across frontend codebase
- replace ! assertions with safe patterns
- use locale-aware formatters in EditPatientModal
- guard cash account row and translate backend errors
- bank-account: disable edit/delete on cash row via getCashBankAccountId
- bank-statement: replace raw backend error strings with unknownError i18n fallback
- procedure: skip stale latest_procedure_type on patient select; resolve name in EditPatientModal
- fix summary stats received/awaited totals
- address FPR reviewer findings
- commit package-lock.json to fix npm cache in CI
- fix config effect using broken shared isMounted ref
- fix spinner stuck and label list not scrolling
- move file picker to ImportModal, fix double-dialog and stray nav
  React StrictMode double-invokes useEffect on mount, causing two dialogs to open
  simultaneously; for PDF pages the simulated unmount misfired onClose.

Fix: selection moves to button click in ImportModal via Tauri open(). Pages
receive filePath as a required prop and start processing immediately on mount.

- use target: BACKEND in tracing and add B13 fund decision todo
- propagate date errors and resolve B7/B32 violations
- enforce NotFound and CashAccountProtected
- use ephemeral DB to isolate test runs
- exclude e2e/ from Vitest to prevent Mocha API bleed
- address infra and frontend review findings
- use real DB column names in seed_procedure helpers
  The UL rename in 8246f91 renamed the domain fields procedure_amount →
  billed_amount and actual_payment_amount → paid_amount, but the
  production repo INSERTs deliberately keep the original SQLite column
  names and bind the renamed domain field into them. Two test seed
  helpers (bank_manual_match::orchestrator and
  fund_payment_reconciliation::orchestrator) used raw INSERTs and got
  renamed too, producing 'no such column: billed_amount/paid_amount'
  panics in 18 tests. Restore the column names to procedure_amount and
  actual_payment_amount.
- replace removed oxlint extends and fix array-index key
  Oxlint 1.42 rejects ESLint shared configs in 'extends', so the config
  fails to parse and the pre-push 'check.py' aborts. Replace
  'extends: ["oxc/recommended"]' with the equivalent 'categories' block
  (correctness/suspicious/perf), which is oxlint's native mechanism.

Also drop the array index from the ProcedureGroupCard key in
PdfDataTable; fund_label + payment_date already uniquely identify a
group per the type's docstring, and Biome flags index-as-key.

- drop redundant dispatchEvent, store handles refresh
- remove redundant subtitle below page title
- fix BankEntryType serde names and PartiallyReconciled date
- use type default_amount for summary aggregations
- replace full table scan with patient_id query on delete
- fix patient tracking on create and delete
- fix invalid confirmed_payment_date format on update
- cancel from refund modal and populate payment method
  Cancel from OverpaymentRefund modal was calling getProcedureRefundBySource with the refund procedure id instead of the source id. Added find_by_refund_procedure_id to resolve source_procedure_id correctly. Also propagates transfer_type and refund_date to the refund Procedure fields so the payment method column is populated in the list.
- regenerate offline cache with test queries
- fix gaps in procedure orchestration spec
- R5: add backend deletion guard + disable delete button for blocking statuses
- R26: route edit modal to read-only view mode for Reconciliated/FundPayed/DirectlyPayed
- fix PARTIALLY_RECONCILED and PARTIALLY_FUND_PAYED missing in RawProcedure mapping
- add is_blocking_status() helper (Rust) and isBlockingStatus() utility (TS)
- amend R5, R6, R15, R19 in procedure_orchestration.md
- fix UX and i18n issues in procedure feature
- dark mode compliance for bank-transfer feature
- dark mode compliance for fund-payment add panel
- dark mode compliance for excel-import feature
- quick wins from reviewer pass
- fix dark mode criticals and extract dashboard hook
- Define custom-scrollbar utility (C2)
- Gradient .btn-primary/.m3-button-filled, rounded-xl (C3/UC4)
- Extract useDashboardPage hook, add reload error toast (C1/UC2)
- Drawer accordion fade-in (UC1)
- R6 waiver in docs/theme.md
- T17/T18/T19 — UI polish for edit fund payment modal
- DateField: portal rendering, locale weekdays, aria-labels, M3 tokens
- Checkmarks: rounded-full + Lucide Check, consistent across both modals
- formatAmountEUR: fr-FR locale (24,00 €), ?? null coalescing
- Buttons: size sm, reduced summary bar, disabled tooltip on Add button
- i18n: previousMonth/nextMonth keys added to common namespace
- minor lint fixes
- sort expanded procedures by procedure_date DESC (R20)
- enforce R13 CASH read-only label in edit transfer modal
  bankAccount state and isCash flag moved into hook.
  Edit modal mirrors add form: read-only label for CASH.
  isValid guards bankAccount for non-CASH transfers.
  Removed dead i18n key. Added R13 tests.
- display current fund-transfer
- update/delete rejected for bank-reconciled groups
- correct infinite loop on edit modal
- display fund identifier
- handle delete confirmation
- prevents re-adv when back to a solved card
- amount proposal on mapping procedure-type
- ensure that a fund-payment group can be validate in all cases
- correct gh actions

## [0.16.1] - 2026-05-06

### Fixed

- heal CRLF-LF migration checksum drift on startup
  v0.14.0 was built with git autocrlf=true on Windows, baking CRLF-based
  SHA-384 checksums into the binary. Subsequent LF-built binaries panicked
  at startup when sqlx::migrate! validated the stored checksums against
  its compiled-in LF hashes. Detect the CRLF pattern and rewrite stored
  checksums to LF before sqlx::migrate! runs.

## [0.16.0] - 2026-05-06

### Added

- inline create-account on unknown IBAN
  Replaces the no-account dead-end with an inline create form (BAS-011..017):
  IBAN read-only pre-filled, name required (inline validation), on success
  continues to label-mapping; on backend error maps the IbanAlreadyUsed sentinel
  to a translated message; cancel closes modal entirely. Adds 8 unit tests, 8
  visual-proof screenshots (idle/loading/error-validation/error-backend × light+dark).
- enforce IBAN uniqueness across soft-deleted accounts
  Introduces BAS-010..017 + R5: bank-statement-auto-match now offers an
  inline create form when the IBAN is unknown. Backend layer adds
  find_by_iban_including_deleted repo method and a service-layer guard
  on create + update (self-match allowed). Spec/contract/plan updated.
  No IPC surface change — errors flow as IbanAlreadyUsed string sentinel.
- implement FPR print report
- add bank-account smoke test and fix E2E testability gaps
- procedure form modal amendments (R9 R18 R26 R28-R32)

### Fixed

- add translated titles to import file-picker dialogs
- route native dialog calls through feature gateways
  Fixes F3 violation: open()/save() from @tauri-apps/plugin-dialog were called
  directly from useDbBackupPanel and useImportModal. Wrapped in gateway functions
  (pickExportPath, pickImportPath, pickExcelFilePath, pickPdfFilePath) so tests
  can mock at the gateway boundary.
- return em dash from formatDateDisplay on malformed input
- exhaustive switch for all BankEntryType variants
- add isMounted guard to both useEffect calls
- route date period conjunction through i18n
- rename locale_obj to localeObj in DatePickerLegacy
- resolve all OxLint warnings across frontend codebase
- replace ! assertions with safe patterns
- use locale-aware formatters in EditPatientModal
- guard cash account row and translate backend errors
- bank-account: disable edit/delete on cash row via getCashBankAccountId
- bank-statement: replace raw backend error strings with unknownError i18n fallback
- procedure: skip stale latest_procedure_type on patient select; resolve name in EditPatientModal
- fix summary stats received/awaited totals
- address FPR reviewer findings
- commit package-lock.json to fix npm cache in CI
- fix config effect using broken shared isMounted ref
- fix spinner stuck and label list not scrolling
- move file picker to ImportModal, fix double-dialog and stray nav
  React StrictMode double-invokes useEffect on mount, causing two dialogs to open
  simultaneously; for PDF pages the simulated unmount misfired onClose.

Fix: selection moves to button click in ImportModal via Tauri open(). Pages
receive filePath as a required prop and start processing immediately on mount.

- use target: BACKEND in tracing and add B13 fund decision todo
- propagate date errors and resolve B7/B32 violations
- enforce NotFound and CashAccountProtected
- use ephemeral DB to isolate test runs
- exclude e2e/ from Vitest to prevent Mocha API bleed
- address infra and frontend review findings
- use real DB column names in seed_procedure helpers
  The UL rename in ca2be48 renamed the domain fields procedure_amount →
  billed_amount and actual_payment_amount → paid_amount, but the
  production repo INSERTs deliberately keep the original SQLite column
  names and bind the renamed domain field into them. Two test seed
  helpers (bank_manual_match::orchestrator and
  fund_payment_reconciliation::orchestrator) used raw INSERTs and got
  renamed too, producing 'no such column: billed_amount/paid_amount'
  panics in 18 tests. Restore the column names to procedure_amount and
  actual_payment_amount.
- replace removed oxlint extends and fix array-index key
  Oxlint 1.42 rejects ESLint shared configs in 'extends', so the config
  fails to parse and the pre-push 'check.py' aborts. Replace
  'extends: ["oxc/recommended"]' with the equivalent 'categories' block
  (correctness/suspicious/perf), which is oxlint's native mechanism.

Also drop the array index from the ProcedureGroupCard key in
PdfDataTable; fund_label + payment_date already uniquely identify a
group per the type's docstring, and Biome flags index-as-key.

- drop redundant dispatchEvent, store handles refresh
- remove redundant subtitle below page title
- fix BankEntryType serde names and PartiallyReconciled date
- use type default_amount for summary aggregations
- replace full table scan with patient_id query on delete
- fix patient tracking on create and delete
- fix invalid confirmed_payment_date format on update

## [0.15.0] - 2026-04-18

### Added

- add overpayment refund management (REF)
  Implements REF-010 to REF-240: create/cancel overpayment refund cascade
  across Procedure, Fund, and Bank contexts. Adds ProcedureStatus::Overpaid
  and OverpaymentRefund, BankTransferType::OutgoingWire, ProcedureRefund
  entity, deletion guards (REF-220/230/240). ADR-002 documents the
  accepted partial-state trade-off (no DB transaction, REF-050).

### Fixed

- cancel from refund modal and populate payment method
  Cancel from OverpaymentRefund modal was calling getProcedureRefundBySource with the refund procedure id instead of the source id. Added find_by_refund_procedure_id to resolve source_procedure_id correctly. Also propagates transfer_type and refund_date to the refund Procedure fields so the payment method column is populated in the list.

## [0.14.0] - 2026-04-10

### Added

- add print button to report header (R31)
- always show label mapping step with two-block display
- add INS label and view-partial mode to procedure modal
- add procedure type management with FAB modal
- Backend: case-insensitive dedup, import-pdf guard, category normalization (R3,R4,R22,R21)
- Frontend: CreateProcedureTypeModal (FAB) replaces side panel, filter sentinel import-pdf (R16,R23)
- Frontend: empty/no-results/error+retry states, fix EditProcedureTypeModal submit (R12,R13,R15)
- Extract useDoubleClickRow hook; i18n keys fr+en
- docs/plan/procedure-type-plan.md: all 20 steps checked

### Fixed

- regenerate offline cache with test queries

## [0.13.0] - 2026-03-24

### Added

- replace modal drawer with persistent M3 navigation rail
- replace lists accordion with unified management modal
- unify import entry points into a single modal
- add database backup and restore via modal

### Fixed

- fix gaps in procedure orchestration spec

## [0.12.0] - 2026-03-23

### Added

- procedure list with sort, status filter, and table redesign
- allow viewing locked fund payments in read-only modal

### Fixed

- fix UX and i18n issues in procedure feature

## [0.11.0] - 2026-03-22

### Added

- add design system page and button components
- add dark mode with theme toggle and M3 token migration
- add day/night/auto theme toggle with Clinical Atelier dark palette
- T17/T18/T19 — Edit fund payment modal with add procedures flow
- T20 — Clinical Atelier design system alignment
- enforce R4 transfer type immutability in backend orchestrator
- implement R12 fund filter and sort in expanded search
- implement CASH transfer type with auto cash account (R13)
- implement manual bank transfer
- improve manual match
- handle negative procedure

### Fixed

- dark mode compliance for bank-transfer feature
- dark mode compliance for fund-payment add panel
- dark mode compliance for excel-import feature
- quick wins from reviewer pass
- fix dark mode criticals and extract dashboard hook
- T17/T18/T19 — UI polish for edit fund payment modal
- minor lint fixes
- sort expanded procedures by procedure_date DESC (R20)
- enforce R13 CASH read-only label in edit transfer modal
- display current fund-transfer
- fix disabled button state and locking rules
- correct infinite loop on edit modal
- display fund identifier
- handle delete confirmation

## [0.10.0] - 2026-03-15

### Added

- add excel-import mapping memo

### Fixed

- prevents re-adv when back to a solved card
- amount proposal on mapping procedure-type
- ensure that a fund-payment group can be validate in all cases

## [0.9.2] - 2026-03-13

## [0.9.1] - 2026-03-13

### Fixed

- correct gh actions

## [0.9.0] - 2026-03-13

### Added

- add update feature

## [0.8.0] - 2026-03-13

### Added

- major improvement on reconciliation feature
- improve fund-payment-match feature
- improve patient page
- remove unused fund patient name
- handle excel import per month
- small frontend adjustement
- simplify database structure
- add autocompletion in add procedure
- anomymisation of test
- add amount field
- improve add procedure side pannel
- improve drawer ux
- clean ui folder
- clean shell
- clean reconciliation
- clean procedure-type
- clean procedure
- clean patient
- clean notification
- clean fund-payment
- clean fund
- clean excel-import
- polish dashboard
- polish bank-transfer
- polish bank-statement page
- polish bank-account page
- remove unused about modal
- clean reconciliation page
- clean fund-payment page
- clean import-excel
- add translation
- parse old excel sheet
- filter on procedure status in procedure page
- add status in procedure page
- improve fund-payment feature
- add batch procedure creation
- update procedure after bank-transfer
- save windows size and position when closed
- improve bank statement reconciliation

### Fixed

- avoid link procedure duplication
- link procedure not availabl
- correct that amount was not properly set
- patient name not set after creation in procedure
- missing procedure status info on frontend
- remove emoji from text
- add payed amount properly
- fund-payment not created when procedure is auto-created

## [0.7.0] - 2026-02-24

### Added

- improve excel import performance
- print anomaly
- improve fund-payment selection
- add filter and sort on fund payment list
- add iban on bank-account
- import bank transfer
- add fund payment reconciliation backend
- add procedure status
- add bank account crud page
- add bank account to transfer
- add bank account
- improve bank transfer page
- improve fund-payment ux
- apply consistant m3 pattern on procedure type
- add snackbar
- apply design system on fund
- improve m3 design
- add bank transfer feature
- add edit/update functionality for fund payment groups
- add fund payment usecase
- improve procedure selection and payment group management
- improve procedure selection modal layout and formatting
- complete fund payment group creation with procedure selection
- add fund payment group state management and event listeners
- add fund reconciliation frontend components
- add fund payment DTOs, API handlers, and Tauri commands
- implement fund payment service layer
- register fund payment module
- implement fund payment repository
- implement fund payment domain entities
- add fund payment database tables
- improve fund selector display and sorting
- implement event-driven updates for procedures, patients, and funds
- persist selected month/year in procedure page
- add editable payment fields and reduce row height by 5%
- add patient and procedure count columns to dashboard
- add side-by-side year comparison in dashboard
- add sticky header and scrollable tables with compact layout
- add financial dashboard with monthly breakdowns
- add summary stats to procedure page
- add readonly payment columns to procedure table
- implement PaymentMethod enum with import mapping logic
- add fund_patient_name field to patient forms
- enhance patient form with SSN and tracking fields
- add delete buttons to patient and fund lists
- add delete endpoints for patient and fund
- complete patient and fund CRUD with edit modals
- remove demo page and start adding patient CRUD
- add procedure type management with CRUD and edit modal
- convert procedure type mapping to modal view
- simplify progress indicator with merged steps
- initial excel import polish (errors, UX, quality)
- add production procedure type mapping UI
- complete excel import workflow with temp_ids
- add app state management with event listeners
- add temp_id mapping for batch operations
- implement frontend excel import orchestration workflow
- simplify excel import to parsing only
- add payment fields and implement procedure batch endpoints
- add fund batch validation and creation endpoints
- add patient batch validation and creation endpoints
- add async event bus with broadcast channels and observer pattern
- add procedure type mapping to excel import workflow
- support name-only patients in excel import
- add requires_reconciliation field to patient
- sort preview tables by status (conflicts first)
- add Excel import execution with confirmation modal
- add comprehensive Excel import UI with parsing and preview
- add preview_excel_import Tauri command
- implement Excel import preview logic and service
- add repository query methods for import preview
- implement validators for patients, funds, procedures
- implement ExcelParser and data models
- add calamine dependency for Excel parsing

### Fixed

- correct all linter issues
- stabilize fund-payment feature
- bank transfer
- fund-payment page small fixes
- correct excel import feature
- sync frontend gateway with backend update
- correct payment page
- correct issue related to fund identifier unique constraint
- add bank transfer event listener to app initialization
- register bank transfer event observer for real-time list updates
- complete edit modal pre-population and performance optimization
- use controlled dialog instead of window.confirm for delete
- listen to FundPaymentGroupUpdated
- improve procedure selection
- improve add payment group consistency
- increase select height and line height for text visibility
- align icon colors across all procedure pages
- add padding to prevent delete icon hiding behind scrollbar
- calculate annual unique patients, not monthly sum
- improve layout to prevent content hiding behind header/footer
- resolve TypeScript errors in dashboard
- dynamically detect Excel data rows instead of hardcoded skip
- correct Excel serial date conversion for all dates
- format confirmed payment date to DD/MM/YYYY display
- apply date conversion to confirmed_payment_date during import
- convert Excel imported procedure dates to ISO format
- improve year range calculation in procedure period selector
- procedure type mapping with tmp_id approach
- apply minor fixes
- refactor event bus to use Updated events with empty payloads
- align fund_identifier usage throughout excel import feature
- excel import parsing and ui adjustments
- improve date validation to check month range
- resolve TypeScript compilation errors in reconciliation features

## [0.6.0] - 2026-02-07

### Added

- add export button to reconciliation results ui
- add export_reconciliation_csv command to tauri
- add csv export service in rust
- group not-found procedures by patient ssn
- group anomalies by patient ssn
- add reconciliation results ui component
- add reconciliation command and api
- add reconciliation service with matching logic
- add procedure query by ssn and date range
- add global total amount in summary
- show sample unparsed lines for debugging
- add structured pdf data display component
- detect group totals in pdf
- add pdf line parser for procedure data
- display extracted pdf text in modal
- add rust pdf extraction with pdf-extract crate
- add pdf upload button to procedure page
- add period selector with draft persistence
- reload patients after saving procedure
- auto-fill procedure fields from patient tracking
- track latest procedure amount in patient
- add procedure in drawer
- add procedure page
- implement automatic workflow navigation and row management
- auto-navigate to fund identifier after patient creation
- add SSN support to patient creation endpoint
- add create-on-the-fly modal forms to prestation list
- add blur handlers and auto-save logic
- add autocomplete and create-on-fly integration
- add field enablement and auto-population logic
- update column configuration for editable grid
- add grid hook and phase 9 plan

### Fixed

- add dialog capabilities
- improve error handling and logging for csv export
- correct TypeScript errors in tests
- preserve procedure amount from patient tracking
- enable date picker after procedure type selection (#62)
- preserve pending changes and navigation in entity creation workflow
- implement 2026 drawer pattern with proper layout
- solve multiple linting errors
- prevent cell height change on focus with consistent sizing
- remove fundPatientName from create patient form
- populate autocomplete display values after form submission
- enable patient-dependent fields after patient selection
- enable patient name field on empty new row
- add empty row feature and resolve test issues
- resolve logger import and build validation

## [0.5.0] - 2026-01-22

### Added

- add Phase 8 create entity forms with Material Design 3
- create Autocomplete component with Headless UI and Excel keyboard nav
- integrate Tauri Log Plugin for unified frontend/backend logging
- add PrestationType API service with CRUD operations
- add patient tracking fields
- add soft delete to Patient and AffiliatedFund
- add prestation type entity with CRUD operations
- integrate healthcare prestation API
- add healthcare service backend with crud operations
- add services page with monthly tabs and year selector
- add patient list display with two-column layout and move getLogLevel to app service
- add read all patients API endpoint
- add home page and patient navigation

### Fixed

- resolve lint, clippy, and type errors in backend
- improve Autocomplete keyboard navigation and Headless UI v2 compatibility

## [0.4.0] - 2026-01-14

### Added

- refactor and enhance fund management features

### Fixed

- improve emoji rendering and list spacing

## [0.3.0] - 2026-01-13

### Added

- add side drawer menu with About modal

## [0.2.0] - 2026-01-13

### Added

- add frontend logging with backend sync
- add tracing logging to backend
- add patient form with success toast
- implement patient database with SQLx and CRUD operations

## [0.1.1] - 2026-01-12

### Fixed

- improve emoji rendering and list spacing

## [0.1.0] - Initial Release

### Added

- Project scaffolding with React + Vite
- Tauri desktop application framework integration
- React component with connection validation between frontend and Rust backend
- Test infrastructure with Vitest and comprehensive test suite
- Automated release management system with semantic versioning
