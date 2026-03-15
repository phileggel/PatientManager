# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.2] - 2026-03-15

## [0.10.1] - 2026-03-15

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

