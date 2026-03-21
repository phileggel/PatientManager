# ARCHITECTURE.md

> **For Claude Code** — kept up to date after each implementation (workflow step 10).
> Rules: [docs/backend-rules.md](docs/backend-rules.md) | [docs/frontend-rules.md](docs/frontend-rules.md)
> Feature specs: [docs/](docs/)

---

## Stack

- **Desktop app**: Tauri 2 (single executable)
- **Frontend**: React 19 + TypeScript, Zustand, i18n (fr/en)
- **Backend**: Rust, SQLite via sqlx (compile-time query verification)
- **IPC**: Specta-generated bindings (`src/bindings.ts`) — run `just generate-types` to sync

---

## Backend (`src-tauri/src/`)

### App Wiring (`lib.rs`)

`initialize_app()` constructs and injects all services as Tauri state in this order:

1. `Arc<Database>`, `Arc<EventBus>`
2. Bounded context services: `PatientService`, `FundService`, `ProcedureTypeService`, `ProcedureService`, `BankAccountService`, `BankTransferService`, `FundPaymentService`
3. Shared repositories: `SqliteExcelAmountMappingRepository`, `SqliteBankTransferLinkRepository`
4. Use case orchestrators: `ProcedureOrchestrationService`, `ReconciliationService`, `BankStatementOrchestrator`, `FundPaymentReconciliationOrchestrator`, `ExcelImportOrchestrator`, `BankManualMatchOrchestrator`

### Command Registry (`core/specta_builder.rs`)

All Tauri commands are registered here via `tauri_specta::collect_commands![]`. **Never register commands elsewhere.**

### Event Bus

Published on every state change. Frontend listens via `useEffect` + window event listeners.

| Event | Published by |
|-------|-------------|
| `PatientUpdated` | `context/patient/` |
| `FundUpdated` | `context/fund/` |
| `ProcedureUpdated` | `context/procedure/` + `use_cases/procedure_orchestration/` |
| `ProcedureTypeUpdated` | `context/procedure/` |
| `FundPaymentGroupUpdated` | `context/fund/` |
| `BankTransferUpdated` | `context/bank/` |
| `BankAccountUpdated` | `context/bank/` |

---

## Bounded Contexts (`context/`)

No cross-context imports. Public API via `mod.rs` only.

### Patient (`context/patient/`)

**Entity: `Patient`**
- `id`, `name`, `ssn`, `is_anonymous`
- Tracking fields (updated by `ProcedureOrchestrationService`): `latest_procedure_type`, `latest_fund`, `latest_date`, `latest_procedure_amount`
- Batch import: `temp_id`
- Factory methods: `new()`, `new_with_temp_id()`, `with_id()`, `restore()`

**Repository trait: `PatientRepository`**
- `create_patient`, `read_patient`, `read_all_patients`, `update_patient`, `delete_patient`
- `find_patient_by_ssn`, `create_batch`

**Service: `PatientService`**
- CRUD + `find_patient_by_ssn`
- Batch: `validate_batch(candidates) -> Vec<PatientValidationResult>`, `create_batch`

**Tauri commands (`api.rs`)**
- `add_patient(name?, ssn?) -> Patient`
- `read_all_patients() -> Vec<Patient>`
- `update_patient(patient) -> Patient`
- `delete_patient(id)`
- `validate_batch_patients(patients) -> ValidateBatchPatientsResponse`
- `create_batch_patients(patients) -> CreateBatchPatientsResponse`

---

### Fund (`context/fund/`)

**Entity: `AffiliatedFund`**
- `id`, `fund_identifier`, `name`, `temp_id`
- Factory methods: `new()`, `new_with_temp_id()`, `with_id()`, `restore()`

**Entity: `FundPaymentGroup`**
- `id`, `fund_id`, `payment_date` (NaiveDate), `total_amount`, `lines: Vec<FundPaymentLine>`, `is_locked`
- Status: `Active` | `BankPayed` (locked once linked to a bank transfer)

**Entity: `FundPaymentLine`**
- `procedure_id`, `amount`

**Repository traits: `FundRepository`, `FundPaymentRepository`**

FundRepository: `create_fund`, `read_fund`, `read_all_funds`, `update_fund`, `delete_fund`, `find_fund_by_identifier`, `create_batch`

FundPaymentRepository: `create_fund_payment_group`, `read_fund_payment_group`, `read_all_fund_payment_groups`, `update_fund_payment_group`, `delete_fund_payment_group`, `read_by_status`

**Services: `FundService`, `FundPaymentService`**

FundService: CRUD + `find_fund_by_identifier` + batch validate/create

FundPaymentService: CRUD + `get_by_status`

**Tauri commands (`api.rs`)**
- `add_fund(fundIdentifier, fundName) -> AffiliatedFund`
- `read_all_funds() -> Vec<AffiliatedFund>`
- `update_fund(fund) -> AffiliatedFund`
- `delete_fund(id)`
- `validate_batch_funds(funds) -> ValidateBatchFundsResponse`
- `create_batch_funds(funds) -> CreateBatchFundsResponse`
- `read_all_fund_payment_groups() -> Vec<FundPaymentGroup>`
- `create_fund_payment_group(fundId, paymentDate, procedureIds) -> FundPaymentGroup`
- `update_fund_payment_group_with_procedures(groupId, paymentDate, procedureIds) -> FundPaymentGroup`
- `delete_fund_payment_group(groupId)`

---

### Procedure (`context/procedure/`)

**Entity: `Procedure`**
- `id`, `patient_id`, `fund_id?`, `procedure_type_id`, `procedure_date` (NaiveDate), `procedure_amount?` (i64 cents)
- `payment_method`: `None` | `Cash` | `Check` | `BankCard` | `BankTransfer`
- `payment_status`: `None` | `Created` | `Reconciliated` | `PartiallyReconciled` | `DirectlyPayed` | `FundPayed` | `PartiallyFundPayed` | `ImportDirectlyPayed` | `ImportFundPayed`
- `confirmed_payment_date?`, `actual_payment_amount?`

**Entity: `ProcedureType`**
- `id`, `name`, `default_amount` (i64), `category?`
- Factory methods: `new()`, `with_id()`, `restore()`

**Repository traits: `ProcedureRepository`, `ProcedureTypeRepository`**

ProcedureRepository: CRUD + `read_procedures_by_ids`, `read_by_fund`, `read_by_patient`, `create_batch`

ProcedureTypeRepository: CRUD

**Services: `ProcedureService`, `ProcedureTypeService`**

> Note: `ProcedureService` in this context handles basic CRUD. Business logic (FK validation, patient tracking) lives in `use_cases/procedure_orchestration/`.

**Tauri commands (`api.rs`)**
- `add_procedure_type(name, defaultAmount, category?) -> ProcedureType`
- `read_all_procedure_types() -> Vec<ProcedureType>`
- `update_procedure_type(raw) -> ProcedureType`
- `delete_procedure_type(id)`

> `add_procedure`, `read_all_procedures`, `update_procedure`, `delete_procedure` are registered from `use_cases/procedure_orchestration/api.rs`, not here.

---

### Bank (`context/bank/`)

**Entity: `BankAccount`**
- `id`, `name`, `iban?`
- Factory methods: `new()`, `with_id()`, `restore()`

**Entity: `BankTransfer`**
- `id`, `transfer_date` (NaiveDate), `amount` (i64 cents), `bank_account: BankAccount`
- `transfer_type`: `Fund` | `Check` | `CreditCard` | `Cash`

**Repository traits: `BankAccountRepository`, `BankTransferRepository`, `BankTransferLinkRepository`**

BankAccountRepository: CRUD + `find_by_iban`

BankTransferRepository: CRUD

BankTransferLinkRepository: junction table management (transfer ↔ fund groups / procedures)

**Services: `BankAccountService`, `BankTransferService`**

**Tauri commands (`api.rs`)**
- `create_bank_account(name, iban?) -> BankAccount`
- `read_all_bank_accounts() -> Vec<BankAccount>`
- `read_bank_account(id) -> Option<BankAccount>`
- `update_bank_account(id, name, iban?) -> BankAccount`
- `delete_bank_account(id)`
- `get_cash_bank_account_id() -> &str` — returns the fixed id of the default cash account (R13)
- `create_bank_transfer(transferDate, amount, transferType, bankAccountId) -> BankTransfer`
- `read_all_bank_transfers() -> Vec<BankTransfer>`
- `read_bank_transfer(id) -> Option<BankTransfer>`
- `update_bank_transfer(transfer) -> BankTransfer`
- `delete_bank_transfer(id)`

---

## Use Cases (`use_cases/`)

May import from contexts. Never from another use case. No domain events.

### Procedure Orchestration (`use_cases/procedure_orchestration/`)

**Entry point: `ProcedureOrchestrationService`**

Cross-context coordinator for procedure CRUD. Validates FK references, infers payment status, and updates patient tracking fields after every create/update.

Key behaviors:
- FK validation: patient, procedure type, fund (optional) must exist
- Patient tracking: updates `latest_*` fields if new procedure date > current latest
- Payment inference: sets `payment_method = BankTransfer` if `confirmed_payment_date` is present
- Status determination: derives initial `ProcedureStatus` from payment info

**Tauri commands (`api.rs`)**
- `add_procedure(patientId, fundId?, procedureTypeId, procedureDate, procedureAmount?) -> Procedure`
- `read_all_procedures() -> Vec<Procedure>`
- `update_procedure(raw) -> Procedure`
- `delete_procedure(id)`
- `validate_batch_procedures(procedures) -> ValidateBatchProceduresResponse`
- `create_batch_procedures(procedures) -> CreateBatchProceduresResponse`
- `get_unpaid_procedures_by_fund(fundId) -> Vec<Procedure>`
- `read_procedures_by_ids(ids) -> Vec<Procedure>`

---

### Excel Import (`use_cases/excel_import/`)

**Entry point: `ExcelImportOrchestrator`**

Two-phase flow: parse → execute. `procedure_type_tmp_id` UUIDs are generated at parse time — re-parsing creates different IDs incompatible with the user's type mapping, so `execute_excel_import` always receives the original `ParseExcelResponse`.

Key domain types: `ParseExcelResponse`, `ImportExecutionResult` (patients_created, funds_created, procedures_created, blocked_months), `ExcelAmountMapping`

**Tauri commands (`api.rs`)**
- `parse_excel_file(filePath) -> ParseExcelResponse`
- `execute_excel_import(parsedData, procedureTypeMapping, selectedMonths) -> ImportExecutionResult`
- `get_excel_amount_mappings() -> Vec<ExcelAmountMapping>`
- `save_excel_amount_mappings(mappings)`

---

### Fund Payment Reconciliation (`use_cases/fund_payment_reconciliation/`)

**Entry point: `FundPaymentReconciliationOrchestrator`**

Parses PDF payment statements and matches lines to procedures. Spec: [docs/fund-payment-manual-match.md](docs/fund-payment-manual-match.md), [docs/fund-payment-auto-match.md](docs/fund-payment-auto-match.md)

Key domain types:
- `PdfParseResult` — groups of lines by (fund, payment_date) + unparsed lines
- `NormalizedPdfLine` — parsed line: payment_date, invoice_number, fund_name, patient_name, ssn, amount, etc.
- `ReconciliationResult` — matches (perfect, partial, not_found, too_many)
- `AnomalyType` — `FundMismatch` | `AmountMismatch` | `DateMismatch`

**Tauri commands (`api.rs`)**
- `extract_pdf_text(filePath) -> String`
- `extract_pdf_text_from_bytes(bytes) -> String`
- `parse_pdf_text(text) -> PdfParseResult`
- `reconcile_pdf_procedures(parseResult) -> ReconciliationResult`
- `reconcile_and_create_candidates(parseResult) -> ReconcileAndCandidatesResponse`
- `export_reconciliation_csv(result) -> String`
- `create_fund_payment_from_candidates(request) -> FundPaymentGroup`
- `create_fund_payment_with_auto_corrections(request) -> FundPaymentGroup`
- `get_unreconciled_procedures_in_range(startDate, endDate) -> Vec<UnreconciledProcedure>`
- `get_fund_payment_group_edit_data(groupId, fundId) -> FundPaymentGroupEditData`

---

### Bank Statement Reconciliation (`use_cases/bank_statement_reconciliation/`)

**Entry point: `BankStatementOrchestrator`**

Parses bank statements (PDF/bytes) and creates bank transfers linked to fund payment groups. Spec: [docs/bank-statement-auto-match.md](docs/bank-statement-auto-match.md)

Key domain types:
- `BankStatementParseResult` — iban, credit_lines, total_credits
- `FundLabelResolution` — label → fund candidates (saved to `BankFundLabelMapping`)
- `BankStatementMatchResult` — credit lines matched against fund groups
- `ConfirmedMatch` — user-confirmed credit_line + fund_group_id

**Tauri commands (`api.rs`)**
- `parse_bank_statement(bytes) -> BankStatementParseResult`
- `resolve_bank_account_from_iban(iban) -> Option<BankAccount>`
- `resolve_bank_fund_labels(bankAccountId, labels) -> Vec<FundLabelResolution>`
- `save_bank_fund_label_mappings(bankAccountId, mappings)`
- `match_bank_statement_lines(resolvedLines) -> BankStatementMatchResult`
- `create_bank_transfers_from_statement(bankAccountId, confirmedMatches)`
- `get_bank_statement_reconciliation_config() -> BankStatementReconciliationConfig`

---

### Bank Manual Match (`use_cases/bank_manual_match/`)

**Entry point: `BankManualMatchOrchestrator`**

Creates manual links between bank transfers and fund payment groups (Fund flow) or procedures (Direct payment flow). Spec: [docs/bank-statement-manual-match.md](docs/bank-statement-manual-match.md)

Key domain types:
- `FundGroupCandidate` — fund_id, fund_name, payment_date, total_amount
- `DirectPaymentProcedureCandidate` — procedure_id, patient_name, amount
- `BankManualMatchResult` — transfer + linked fund_group_ids + procedure_ids

**Tauri commands (`api.rs`)**

Fund flow:
- `get_unsettled_fund_groups(transferDate) -> Vec<FundGroupCandidate>` (±7 days window)
- `get_all_unsettled_fund_groups() -> Vec<FundGroupCandidate>` (all Active groups)
- `create_fund_transfer(bankAccountId, transferDate, groupIds) -> BankManualMatchResult`
- `update_fund_transfer(transferId, newTransferDate, newGroupIds) -> BankManualMatchResult`
- `delete_fund_transfer(transferId)`

Direct payment flow:
- `get_eligible_procedures_for_direct_payment(paymentDate) -> Vec<DirectPaymentProcedureCandidate>` (±7 days, status Created)
- `get_all_eligible_procedures_for_direct_payment() -> Vec<DirectPaymentProcedureCandidate>` (all Created)
- `create_direct_transfer(bankAccountId, transferDate, transferType, procedureIds) -> BankManualMatchResult`
- `update_direct_transfer(transferId, newTransferDate, newProcedureIds) -> BankManualMatchResult`
- `delete_direct_transfer(transferId)`

Queries:
- `get_transfer_fund_group_ids(transferId) -> Vec<String>`
- `get_transfer_procedure_ids(transferId) -> Vec<String>`

---

### Database

- SQLite, migrations in `src-tauri/migrations/`
- Latest: `20260316_bank_manual_match.sql`
- After schema changes: `just clean-db` → `cargo sqlx prepare`
- Never add `BEGIN`/`COMMIT` in migrations (sqlx wraps each in a transaction)

---

## Frontend (`src/`)

### Global Store (`lib/appStore.ts`)

**`useAppStore`** (Zustand) — shared data across features:

| Field | Type | Loaded by |
|-------|------|-----------|
| `patients` | `Patient[]` | `PatientUpdated` event |
| `funds` | `AffiliatedFund[]` | `FundUpdated` event |
| `procedureTypes` | `ProcedureType[]` | `ProcedureTypeUpdated` event |
| `bankAccounts` | `BankAccount[]` | `BankAccountUpdated` event |
| `fundPaymentGroups` | `FundPaymentGroup[]` | `FundPaymentGroupUpdated` event |

Actions: `setPatients`, `addPatients`, `setFunds`, `addFunds`, `setProcedureTypes`, `addProcedureTypes`, `setBankAccounts`, `addBankAccounts`, `setFundPaymentGroups`, `addFundPaymentGroups`, `setLoading`

### Infrastructure

| Path | Role |
|------|------|
| `bindings.ts` | Auto-generated Tauri bindings — **DO NOT EDIT** |
| `lib/logger.ts` | Structured logging — always use instead of `console.log` |
| `i18n/locales/fr/` + `en/` | Translation files — all visible text must go through `t(...)` |
| `ui/components/` | Shared generic UI (Button, DateField, SelectField…) — never modify for a specific use case |
| `core/snackbar/` | Toast notifications |
| `core/events/` | Window event bus |

---

### Features (`src/features/`)

#### Bank Account (`features/bank-account/`)
Flat layout. Gateway: `create_bank_account`, `read_all_bank_accounts`, `update_bank_account`, `delete_bank_account`. Single component: `BankAccountManager`.

#### Bank Transfer + Manual Match (`features/bank-transfer/`)
Mixed layout: root-level `gateway.ts`, `store.ts` (feature-scoped transfer list), and top-level hooks (`useBankTransferManager`, `useBankTransferController`, `useBankTransferOperations`), with subdirectories for each sub-feature. Gateway covers `context/bank/` (CRUD).
- `add_bank_transfer_form/` — creation form with fund/patient selection modals
- `bank_transfer_list/` — transfer list display
- `edit_bank_transfer_modal/` — edit modal + `useEditBankTransferModal` hook (loads linked groups/procedures, handles update submit)
- `select_items_panel/` — `SelectFundGroupsPanel` + `useSelectFundGroupsPanel`, `SelectProceduresPanel` + `useSelectProceduresPanel`; both panels call `use_cases/bank_manual_match/` commands through the root `gateway.ts`
- `shared/` — `validateBankTransfer.ts`

#### Bank Statement Auto-Match (`features/bank-statement-match/`)
Flat layout. `BankStatementPage` + gateway wrapping all `use_cases/bank_statement_reconciliation/` commands.

#### Fund (`features/fund/`)
Flat layout. Gateway: `add_fund`, `read_all_funds`, `update_fund`, `delete_fund`. Component: `FundsManager`.

#### Fund Payment (`features/fund-payment/`)
Flat layout. `FundPaymentManager` + gateway wrapping `create_fund_payment_group`, `update_fund_payment_group_with_procedures`, `delete_fund_payment_group`.

#### Fund Payment Match (`features/fund-payment-match/`)
Flat layout. `ReconciliationPage` + `useReconciliationPage`. Gateway wraps all `use_cases/fund_payment_reconciliation/` commands.

#### Patient (`features/patient/`)
Flat layout. Gateway: `add_patient`, `read_all_patients`, `update_patient`, `delete_patient`. Component: `PatientsManager`.

#### Procedure (`features/procedure/`)
**`api/` + `presentation/` split** (reference layout for new features).
- `api/gateway.ts` — wraps all procedure commands + inline entity creation (patient, fund, procedure type)
- `api/procedureService.ts` — higher-level service combining multiple gateway calls
- `model/` — domain logic: `workflow.reducer.ts`, `workflow.logic.ts`, `date.logic.ts`, `procedure-row.mapper.ts`, `workflow.types.ts`
- `hooks/` — `useProcedureData`, `useProcedurePeriod`, `useProcedureFormModals`, `useCreateEntityForm`
- `ui/` — `ProcedurePage`, `WorkflowTable`, `WorkflowRow`, cells (`AmountCell`, `StatusCell`, `FundCell`…), editors (`AmountEditor`, `AutocompleteEditor`…), forms (`CreatePatientForm`, `CreateFundForm`, `CreateProcedureTypeForm`)

#### Procedure Type (`features/procedure-type/`)
Flat layout. Gateway: `add_procedure_type`, `read_all_procedure_types`, `update_procedure_type`, `delete_procedure_type`.

#### Excel Import (`features/excel-import/`)
**`api/` + `presentation/` split**.
- `api/gateway.ts` — `parse_excel_file`, `execute_excel_import`, `get_excel_amount_mappings`, `save_excel_amount_mappings`
- `presentation/ImportExcelPage.tsx` — 5-step wizard: upload → parsing → mapping → importing → complete
- Components: `FileUploadSection`, `ProcedureTypeMappingStep`, `MonthSelectionStep`, `ValidationSummaryCard`, `ParsingReportModal`, `CreateProcedureTypeModal`

#### Notification (`features/notification/`)
`BottomBar` + `useNotification`. Displays backend-emitted notifications.

#### Shell (`features/shell/`)
Layout: `Drawer`, `Header`, `Footer`, `PageContent`, `DrawerToggle`, `useDrawerController`.

#### Updater (`features/updater/`)
`UpdateBanner` + `useUpdater`. Tauri auto-updater integration.

---

### Data Flow

```
Component
  └─ Hook (state, useMemo, callbacks)
       └─ Gateway (commands.* — positional args, matches bindings.ts exactly)
            └─ Tauri IPC
                 └─ Rust api.rs handler (Result<T, String>)
                      └─ Service / Orchestrator (anyhow::Result<T>)
                           └─ Repository (sqlx, Arc<dyn Trait>)
                                └─ SQLite

Backend publishes {Domain}Updated event
  └─ Frontend useEffect listener
       └─ Store updated → UI re-renders
```

### Feature Layout Convention

**Layout generations (oldest → newest):**

| Generation | Features | Pattern |
|---|---|---|
| Flat (old) | fund, patient, bank-account, fund-payment, bank-statement-match, fund-payment-match, procedure-type | Everything at root — `gateway.ts`, component, hook, `shared/` |
| Layer-first (middle) | excel-import, procedure | `api/` + `presentation/` split — do not replicate |
| **Feature-first (gold)** | **bank-transfer** | `gateway.ts` at root + subdirectories by sub-feature, hooks colocated |

**New features must follow the bank-transfer (gold) layout:**

```
features/{domain}/
├── gateway.ts                     # ONLY file that calls commands.* for this domain
├── store.ts                       # Feature-scoped Zustand store (if needed)
├── {sub_feature}/
│   ├── {SubFeature}.tsx           # Component
│   ├── use{SubFeature}.ts         # Colocated hook
│   └── use{SubFeature}.test.ts    # Colocated test
├── shared/
│   ├── presenter.ts               # Domain → UI transformations (toRow, toFormData…)
│   └── validate{Domain}.ts        # Pure validation logic
└── index.ts                       # Public re-exports
```

**Key rules:**
- `gateway.ts` at the feature root — no `api/` wrapper folder
- Sub-features are directories grouped by **feature concern**, not by layer (no `components/`, `hooks/` folders)
- Hooks are colocated next to their component inside the sub-feature folder
- One `gateway.ts` per feature at the root — sub-features import from it, never create their own
- `shared/presenter.ts` — pure object with static-style methods (`toRow`, `toFormData`) that transform domain types into UI shapes; keeps components free of mapping logic
- `shared/` for any logic used across multiple sub-features
