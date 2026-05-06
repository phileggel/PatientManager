# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

