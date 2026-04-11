# Implementation Plan: Overpayment Management

**Feature Spec**: [../spec/overpayment.md](../spec/overpayment.md)

**Scope**: Multi-context use case (Patient, Fund, Procedure, Bank) with atomic refund creation/deletion

**Architecture**: Tauri 2 (React 19 + Rust) using DDD

---

## Workflow Checklist (Mandatory Quality & Process Steps)

- [ ] 📖 Review Architecture & Rules (`ARCHITECTURE.md`, `backend-rules.md`, `frontend-rules.md`, `testing.md`)
- [ ] 🏗️ **Phase 1: Database Schema** — Create `procedure_refund` table migration
- [ ] 🏗️ **Phase 2: Backend Implementation** — Domain entity, repository, service, API
- [ ] 🔗 **Type Synchronization** — `just generate-types` (required before frontend work)
- [ ] 💻 **Phase 3: Frontend Implementation** — Gateway, hook, components, i18n
- [ ] 🧹 **Code Quality** — `python3 scripts/check.py` (lint + format)
- [ ] 🔍 **Code Review** — Run `reviewer` agent
- [ ] 🎭 **UX Review** — Run `ux-reviewer` agent (if `.tsx` modified)
- [ ] 🌐 **i18n Review** — Run `i18n-checker` agent (if UI text added)
- [ ] 🧪 **Unit & Integration Tests** — Backend Rust tests + Frontend Vitest
- [ ] 📚 **Documentation Update** — `ARCHITECTURE.md` + `docs/todo.md`
- [ ] ✅ **Final Validation** — `spec-checker` + `workflow-validator` agents

---

## Rules Coverage Map

| Rule Code   | Domain                      | Implementation Task                                                        | Layer              |
| ----------- | --------------------------- | -------------------------------------------------------------------------- | ------------------ |
| **REF-010** | Eligibility check           | Validate procedure status (REF-010) in gateway + backend                   | Frontend + Backend |
| **REF-011** | Full refund only            | No partial amount input in DTO                                             | Backend            |
| **REF-012** | Refund date validation      | Date validator + backend validation                                        | Frontend + Backend |
| **REF-013** | Reason field validation     | Length validator + backend check                                           | Frontend + Backend |
| **REF-020** | Atomic creation (3 records) | Service method + factory methods                                           | Backend            |
| **REF-021** | Payment method selection    | Form field + DTO mapping                                                   | Frontend + Backend |
| **REF-022** | ProcedureRefund link        | Repository create + entity definition                                      | Backend            |
| **REF-030** | Status transitions          | Service updates source→Overpaid, refund→OverpaymentRefund, group→BankPayed | Backend            |
| **REF-040** | Deletion atomicity          | Service delete method (cascading)                                          | Backend            |
| **REF-041** | Source deletion guard       | Deletion check in service                                                  | Backend            |
| **REF-042** | Refund deletion guard       | Deletion check in service                                                  | Backend            |

---

## Phase 1: Database Schema

### P1.1 — Create Procedure Refund Table Migration

**File**: `src-tauri/migrations/20260411_procedure_refund.sql`

**Checklist**:

- [ ] Create `procedure_refund` table:
  - `id` (PK, TEXT)
  - `source_procedure_id` (FK to procedure, TEXT NOT NULL)
  - `refund_procedure_id` (FK to procedure, TEXT NOT NULL)
  - `refund_date` (TEXT NOT NULL, YYYY-MM-DD)
  - `reason` (TEXT, max 255 chars)
  - `is_deleted` (INTEGER NOT NULL DEFAULT 0)
- [ ] Create indexes:
  - `idx_procedure_refund_source` on `source_procedure_id`
  - `idx_procedure_refund_refund` on `refund_procedure_id`
  - `idx_procedure_refund_deleted` on `is_deleted`
- [ ] Verify migration syntax (no BEGIN/COMMIT, sqlx-compatible)

### P1.2 — Update Procedure Status Enum

**Context**: Add new statuses to the `ProcedureStatus` enum to support `Overpaid` and `OverpaymentRefund` states.

**File**: `src-tauri/src/context/procedure/domain/procedure.rs`

**Checklist**:

- [ ] Add `Overpaid` variant to `ProcedureStatus` enum (mapping to `OVERPAID` in Serde)
- [ ] Add `OverpaymentRefund` variant to `ProcedureStatus` enum (mapping to `OVERPAYMENT_REFUND`)
- [ ] Add docstring explaining each new status
- [ ] Verify Specta serialization (Type derive)

---

## Phase 2: Backend Implementation

### P2.1 — Create ProcedureRefund Domain Entity

**File**: `src-tauri/src/use_cases/overpayment_management/domain.rs`

**Description**: Define the `ProcedureRefund` aggregate with factory methods following backend-rules.md (B1).

**Checklist**:

- [ ] Define `pub struct ProcedureRefund`:
  - `id: String`
  - `source_procedure_id: String`
  - `refund_procedure_id: String`
  - `refund_date: NaiveDate`
  - `reason: Option<String>` (max 255 chars validation)
- [ ] Implement `ProcedureRefund::new()` (validates, generates UUID)
  - Validate `refund_date` not in future
  - Validate `reason` length ≤ 255
  - Return `Result<Self, String>` (Anyhow)
- [ ] Implement `ProcedureRefund::with_id(id, ...)` (validates, uses provided ID)
- [ ] Implement `ProcedureRefund::restore(...)` (direct DB restore, no validation)
- [ ] Add `Serialize, Deserialize, Type` derives for Specta binding generation

---

### P2.2 — Create ProcedureRefund Repository Trait

**File**: `src-tauri/src/use_cases/overpayment_management/repository.rs`

**Description**: Define the repository trait for CRUD operations on `ProcedureRefund`.

**Checklist**:

- [ ] Define `pub trait ProcedureRefundRepository`:
  - `create_refund(refund: &ProcedureRefund) -> Result<Vec<ProcedureRefund>>`
  - `read_refund(id: &str) -> Result<Option<ProcedureRefund>>`
  - `read_all_refunds() -> Result<Vec<ProcedureRefund>>`
  - `read_by_source_procedure_id(source_id: &str) -> Result<Vec<ProcedureRefund>>`
  - `read_by_refund_procedure_id(refund_id: &str) -> Result<Option<ProcedureRefund>>`
  - `delete_refund(id: &str) -> Result<()>` (soft-delete via is_deleted = 1)
  - `delete_refund_by_bank_transfer_id(transfer_id: &str) -> Result<()>` (cascading deletion)
- [ ] Add docstrings explaining each method's purpose

### P2.3 — Implement SQLite ProcedureRefund Repository

**File**: `src-tauri/src/use_cases/overpayment_management/repository_impl/sqlite_procedure_refund_repository.rs`

**Description**: Implement the repository trait using sqlx macros for compile-time query verification.

**Checklist**:

- [ ] Structure:
  ```rust
  pub struct SqliteProcedureRefundRepository {
      db: Arc<Database>,
  }
  ```
- [ ] Implement `new(db: Arc<Database>) -> Self`
- [ ] Implement `#[async_trait] ProcedureRefundRepository`:
  - `create_refund`: INSERT into `procedure_refund` table
  - `read_refund`: SELECT by id where is_deleted = 0
  - `read_all_refunds`: SELECT where is_deleted = 0
  - `read_by_source_procedure_id`: SELECT where source_procedure_id and is_deleted = 0
  - `read_by_refund_procedure_id`: SELECT where refund_procedure_id and is_deleted = 0
  - `delete_refund`: UPDATE is_deleted = 1 by id
  - `delete_refund_by_bank_transfer_id`:
    - Query `bank_transfer_fund_group_link` to find refund fund group
    - Query `fund_payment_line` to find refund procedure
    - Query `procedure_refund` to find link
    - Soft-delete the link, refund procedure, and group
- [ ] Use sqlx prepared statements for all queries
- [ ] Add error handling with anyhow::Result

---

### P2.4 — Create Overpayment Management Service (Orchestrator)

**File**: `src-tauri/src/use_cases/overpayment_management/service.rs`

**Description**: Service orchestrator implementing atomic operations across Patient, Procedure, Fund, Bank contexts.

**Checklist**:

- [ ] Define `pub struct OverpaymentManagementService`:
  - `procedure_service: Arc<ProcedureService>`
  - `fund_payment_service: Arc<FundPaymentService>`
  - `bank_transfer_service: Arc<BankTransferService>`
  - `refund_repository: Arc<Box<dyn ProcedureRefundRepository>>`
  - `procedure_orchestration_service: Arc<ProcedureOrchestrationService>` (for status updates)
  - `event_bus: Arc<EventBus>`
- [ ] Implement `OverpaymentManagementService::new()` constructor
- [ ] Implement `create_refund()` method (REF-020, REF-021, REF-022, REF-030):
  - **Input parameters**:
    - `source_procedure_id: String`
    - `refund_date: String` (YYYY-MM-DD)
    - `payment_method: PaymentMethod`
    - `reason: Option<String>` (max 255 chars)
    - `bank_account_id: String` (for bank transfer)
  - **Validation** (REF-010, REF-012, REF-013):
    - Fetch source procedure; verify status is `FundPayed` or `PartiallyFundPayed`
    - Verify refund_date is valid and ≤ today
    - Verify refund_date ≥ source procedure_date
    - Verify reason length ≤ 255
  - **Atomic execution** (transactional, single backend method):
    - **Step 1**: Create negative `Procedure` (refund procedure):
      - `patient_id` = source.patient_id
      - `fund_id` = source.fund_id
      - `procedure_type_id` = source.procedure_type_id
      - `procedure_date` = refund_date
      - `procedure_amount` = -source.procedure_amount (negate)
      - `payment_method` = `PaymentMethod::BankTransfer`
      - `confirmed_payment_date` = refund_date
      - `actual_payment_amount` = -source.actual_payment_amount or -source.procedure_amount
      - `payment_status` = `ProcedureStatus::OverpaymentRefund` (direct, not via orchestration)
      - Call `Procedure::new()` factory method, save via `procedure_service.create()`
    - **Step 2**: Create negative `FundPaymentGroup`:
      - `fund_id` = source.fund_id
      - `payment_date` = refund_date
      - `total_amount` = -source.procedure_amount (negate)
      - `status` = `GroupStatus::BankPayed` (locked)
      - Create `FundPaymentLine` linking refund procedure to group
      - Save via `fund_payment_service.create_fund_payment_group()`
    - **Step 3**: Create negative `BankTransfer`:
      - `transfer_date` = refund_date
      - `amount` = -(refund group total_amount) = source.procedure_amount (negate again = positive flow)
      - `transfer_type` = match payment_method { BankTransfer → Fund, Check → Check, CreditCard → CreditCard }
      - `bank_account_id` = provided
      - Call `bank_transfer_service.create_bank_transfer()`
      - Link transfer to refund group via `bank_transfer_fund_group_link` junction table
    - **Step 4**: Create `ProcedureRefund` link:
      - `source_procedure_id` = source.id
      - `refund_procedure_id` = refund.id
      - `refund_date` = provided
      - `reason` = provided
      - Save via `refund_repository.create_refund()`
    - **Step 5**: Update source procedure status (REF-030):
      - Fetch source procedure
      - Call `procedure_orchestration_service.update_procedure()` with new `payment_status = Overpaid`
      - Publish `ProcedureUpdated` event
  - **Error handling**:
    - If any step fails, roll back all changes (or use DB transaction)
    - Return `Result<ProcedureRefund, String>`
- [ ] Implement `delete_refund()` method (REF-040, REF-041, REF-042):
  - **Input parameter**: `refund_procedure_id: String` (or bank_transfer_id)
  - **Validation**:
    - Verify refund procedure exists with status `OverpaymentRefund`
    - Verify source procedure exists with status `Overpaid`
  - **Atomic execution** (cascading):
    - **Step 1**: Find linked `ProcedureRefund` entry by `refund_procedure_id`
    - **Step 2**: Update source procedure status back to previous status (`FundPayed` or `PartiallyFundPayed`):
      - Use stored original status or infer from fund payment group
    - **Step 3**: Delete refund procedure (soft-delete)
    - **Step 4**: Delete refund fund payment group (soft-delete)
    - **Step 5**: Delete associated bank transfer (soft-delete)
    - **Step 6**: Delete `ProcedureRefund` link (soft-delete)
    - **Step 7**: Publish `ProcedureUpdated` events for source and refund procedures
  - **Return**: `Result<(), String>`
- [ ] Add logging (B12, using `tracing::{info, debug}` with BACKEND constant)

---

### P2.5 — Create API Layer (Tauri Commands)

**File**: `src-tauri/src/use_cases/overpayment_management/api.rs`

**Description**: Tauri command handlers for frontend invocation.

**Checklist**:

- [ ] Implement `#[tauri::command]` functions:
  - `create_refund_for_procedure(source_procedure_id: String, refund_date: String, payment_method: String, reason: Option<String>, bank_account_id: String) -> Result<ProcedureRefund, String>` (REF-020, REF-021, REF-022, REF-030):
    - Parse `payment_method` string to `PaymentMethod` enum
    - Call service.create_refund()
    - Return created `ProcedureRefund` (serialized via Specta)
  - `delete_refund_by_procedure_id(refund_procedure_id: String) -> Result<(), String>` (REF-040):
    - Call service.delete_refund()
    - Return empty OK or error
- [ ] Command signatures **MUST** match positional parameters (not object-wrapped), per gateway pattern (F3, backend-rules.md B17)
- [ ] Add docstrings

---

### P2.6 — Register Tauri Commands in Specta Builder

**File**: `src-tauri/src/core/specta_builder.rs`

**Description**: Register new commands for automatic TypeScript bindings generation.

**Checklist**:

- [ ] Update `tauri_specta::collect_commands![]` to include:
  - `create_refund_for_procedure`
  - `delete_refund_by_procedure_id`
- [ ] Run `just generate-types` to regenerate `src/bindings.ts`
- [ ] Commit-gated: Verify `src/bindings.ts` reflects exact function signatures

---

### P2.7 — Create Overpayment Management Module

**File**: `src-tauri/src/use_cases/overpayment_management/mod.rs`

**Checklist**:

- [ ] Re-export public API:

  ```rust
  mod api;
  mod domain;
  mod repository;
  mod repository_impl;
  mod service;

  pub use api::*;
  pub use domain::*;
  pub use service::*;
  ```

- [ ] Verify all public interfaces are exported

---

### P2.8 — Integrate Service into App Wiring

**File**: `src-tauri/src/lib.rs`

**Description**: Register `OverpaymentManagementService` in the main dependency injection.

**Checklist**:

- [ ] In `initialize_app()`:
  - Create `SqliteProcedureRefundRepository` with Arc<Database>
  - Create `OverpaymentManagementService` with all required service dependencies
  - Add to Tauri state via `app.manage(Arc::new(service))`
  - Ensure initialization happens **after** all bounded context services are created
- [ ] Verify no circular dependencies

---

### P2.9 — Backend Unit Tests

**File**: `src-tauri/src/use_cases/overpayment_management/service.rs` (inline `#[cfg(test)]`)

**Description**: Test atomic operations and edge cases per testing.md (B15).

**Checklist**:

- [ ] Test: `create_refund_success()` — Full happy path
  - Setup: source procedure with `FundPayed` status
  - Execute: create_refund()
  - Assert: Refund procedure created with `OverpaymentRefund` status
  - Assert: Fund group created with `BankPayed` status
  - Assert: Bank transfer linked correctly
  - Assert: Source procedure updated to `Overpaid`
  - Assert: ProcedureRefund link created
  - Assert: All amounts negative/correct
- [ ] Test: `create_refund_validation_date_future()` — REF-012 validation
- [ ] Test: `create_refund_validation_date_before_procedure()` — REF-012 validation
- [ ] Test: `create_refund_validation_ineligible_status()` — REF-010 validation (status not FundPayed/PartiallyFundPayed)
- [ ] Test: `create_refund_validation_reason_too_long()` — REF-013 validation
- [ ] Test: `delete_refund_success()` — Full deletion cascade
  - Setup: Source procedure `Overpaid` with linked refund
  - Execute: delete_refund(refund_id)
  - Assert: Refund procedure soft-deleted
  - Assert: Fund group soft-deleted
  - Assert: Bank transfer soft-deleted
  - Assert: Source procedure reverted to previous status
  - Assert: Link soft-deleted
- [ ] Test: `delete_refund_deletion_guard()` — REF-041, REF-042 guards
  - Try to delete source directly (guard should block)
  - Try to delete refund directly (guard should block)

---

## Phase 3: Type Synchronization

### P3.1 — Generate TypeScript Bindings

**Command**: `just generate-types`

**Description**: Regenerate `src/bindings.ts` from Rust API layer to ensure frontend has exact signatures.

**Checklist**:

- [ ] Run `just generate-types`
- [ ] Verify `src/bindings.ts` updated with:
  - `create_refund_for_procedure` command signature
  - `delete_refund_by_procedure_id` command signature
  - `ProcedureRefund` type definition
  - `PaymentMethod` enum exported
- [ ] Verify no TypeScript errors from bindings

---

## Phase 4: Frontend Implementation

### P4.1 — Create Overpayment Feature Module Structure

**Directory**: `src/features/overpayment/`

**Checklist**:

- [ ] Create directory structure:
  ```
  src/features/overpayment/
    gateway.ts
    index.ts
    shared/
      presenter.ts
      validateRefundDate.ts
      validateReason.ts
    record_overpayment_modal/
      RecordOverpaymentModal.tsx
      useRecordOverpayment.ts
      useRecordOverpayment.test.ts
  ```

---

### P4.2 — Create Overpayment Gateway

**File**: `src/features/overpayment/gateway.ts`

**Description**: Only file in the feature allowed to call Tauri `commands.*` (F3).

**Checklist**:

- [ ] Implement async functions (wrapper around `commands.*`):
  - `createRefundForProcedure(sourceProcedureId: string, refundDate: string, paymentMethod: PaymentMethod, reason: string | null, bankAccountId: string): Promise<ProcedureRefund>` (calls `commands.create_refund_for_procedure()`)
  - `deleteRefundByProcedureId(refundProcedureId: string): Promise<void>` (calls `commands.delete_refund_by_procedure_id()`)
- [ ] Add error handling and logging
- [ ] Match gateway pattern from `src/features/bank-transfer/gateway.ts`

---

### P4.3 — Create Validators

**File**: `src/features/overpayment/shared/validateRefundDate.ts`

**Description**: Validate refund date per REF-012.

**Checklist**:

- [ ] Implement `validateRefundDate(refundDate: string | null, sourceProcedureDate: string): string | null`:
  - Return error message if invalid, null if valid
  - Check: refund date is not empty
  - Check: refund date is valid date format (YYYY-MM-DD)
  - Check: refund date is not in the future
  - Check: refund date is on or after source procedure date
- [ ] Export for use in form validation

**File**: `src/features/overpayment/shared/validateReason.ts`

**Description**: Validate reason field per REF-013.

**Checklist**:

- [ ] Implement `validateReason(reason: string | null): string | null`:
  - Return error message if invalid, null if valid
  - Check: if provided, length ≤ 255 characters
- [ ] Export for use in form validation

---

### P4.4 — Create Presenter

**File**: `src/features/overpayment/shared/presenter.ts`

**Description**: Transform domain data to UI view models (F5).

**Checklist**:

- [ ] Implement functions:
  - `formatProcedureRefund(refund: ProcedureRefund, procedures: Procedure[]): FormattedRefund`:
    - Extract source and refund procedure names
    - Format amounts
    - Format dates
    - Return typed view model
  - `getProcedureEligibilityMessage(procedure: Procedure | null): string`:
    - Return reason if procedure ineligible for refund
    - Return empty string if eligible
  - `calculateRefundAmount(procedure: Procedure): number` (in cents or formatted amount)
- [ ] Pure functions, easily testable

---

### P4.5 — Create useRecordOverpayment Hook

**File**: `src/features/overpayment/record_overpayment_modal/useRecordOverpayment.ts`

**Description**: Main hook for modal state and logic (F10).

**Checklist**:

- [ ] Define state:
  - `isOpen: boolean` — modal open/close
  - `isLoading: boolean` — API call in progress
  - `sourceProcedureId: string | null` — selected procedure ID
  - `refundDate: string` — form input (YYYY-MM-DD)
  - `paymentMethod: PaymentMethod | null` — form select
  - `reason: string` — optional reason text
  - `bankAccountId: string | null` — form select
  - `errors: { refundDate?: string; reason?: string }` — validation errors
- [ ] Implement functions:
  - `openModal(sourceProcedureId: string)` — Set sourceProcedureId, reset form
  - `closeModal()` — Set isOpen = false, clear state
  - `setRefundDate(date: string)` — Update field, validate
  - `setPaymentMethod(method: PaymentMethod)` — Update field
  - `setReason(text: string)` — Update field, validate
  - `setBankAccountId(accountId: string)` — Update field
  - `submitRefund()` — async:
    - Validate all fields
    - Set isLoading = true
    - Call `gateway.createRefundForProcedure()`
    - Show success toast or error snackbar
    - Close modal on success
    - Set isLoading = false
  - `deleteRefund(refundProcedureId: string)` — async:
    - Confirm with user (dialog)
    - Set isLoading = true
    - Call `gateway.deleteRefundByProcedureId()`
    - Show success/error
    - Refresh procedure list
    - Set isLoading = false
- [ ] Use `useCallback` for memoization where needed
- [ ] Log on mount (F13) and critical errors (F14)
- [ ] Clean up subscriptions (F9)

---

### P4.6 — Create RecordOverpaymentModal Component

**File**: `src/features/overpayment/record_overpayment_modal/RecordOverpaymentModal.tsx`

**Description**: Modal component for recording overpayments (F11, M3 design).

**Checklist**:

- [ ] Props:
  - `open: boolean` — modal open state
  - `onClose: () => void` — close callback
  - `sourceProcedure: Procedure | null` — pre-filled procedure
  - `availablePaymentMethods: PaymentMethod[]` — allowed methods
  - `bankAccounts: BankAccount[]` — for selection
  - Custom hook: `useRecordOverpayment()`
- [ ] Layout:
  - **Header**: "Record Overpayment" with source procedure summary
  - **Fields**:
    - Source Procedure info (read-only summary)
    - Refund Amount (read-only, calculated from source)
    - Refund Date (DateField, REF-012 validation)
    - Payment Method (SelectField with CREDIT_CARD, CHECK, BANK_TRANSFER)
    - Bank Account (SelectField, conditionally visible if BankTransfer selected)
    - Reason (TextField, optional, REF-013 validation)
  - **Footer**: Buttons (Cancel, Confirm)
- [ ] States:
  - **Loading**: Show spinner, disable form
  - **Error**: Show snackbar (F17)
  - **Success**: Close modal after 2s toast
- [ ] Use i18n for all text (F16)
- [ ] Respect M3 design and generic `ui/components` (F11)

---

### P4.7 — Add Refund Button to EditProcedureModal

**File**: `src/features/procedure/edit_procedure_modal/EditProcedureModal.tsx` (or equivalent)

**Description**: Add "Refund" button when procedure is eligible per REF-010.

**Checklist**:

- [ ] Locate EditProcedureModal component in procedure feature
- [ ] Add conditional button:
  - Visible if procedure.payment_status === `FundPayed` or `PartiallyFundPayed`
  - Label: "Refund" (via i18n)
  - `onClick`: Open `RecordOverpaymentModal`
- [ ] Pass required props to modal (procedure, bank accounts, etc.)
- [ ] Use `isEligibleForRefund()` helper to determine visibility

---

### P4.8 — Create i18n Translation Keys

**Files**:

- `src/i18n/locales/fr/overpayment.json`
- `src/i18n/locales/en/overpayment.json`

**Description**: All UI text strings per F16.

**Checklist**:

- [ ] French translations (`fr/overpayment.json`):
  - `recordOverpaymentTitle` = "Enregistrer un remboursement"
  - `refundDate` = "Date du remboursement"
  - `refundDateInvalid` = "La date doit être valide, pas dans le futur, et postérieure à la date de l'acte"
  - `paymentMethod` = "Méthode de paiement"
  - `bankAccount` = "Compte bancaire"
  - `reason` = "Motif (optionnel)"
  - `reasonTooLong` = "Le motif ne doit pas dépasser 255 caractères"
  - `confirmRefund` = "Confirmer le remboursement"
  - `refundSuccess` = "Remboursement enregistré avec succès"
  - `refundError` = "Erreur lors de l'enregistrement du remboursement"
  - `deleteRefund` = "Supprimer le remboursement"
  - `deleteRefundConfirm` = "Êtes-vous sûr de vouloir supprimer ce remboursement ?"
  - `deleteRefundSuccess` = "Remboursement supprimé"
  - `refundButton` = "Remboursement"
  - `sourceAmount` = "Montant original"
  - `refundAmount` = "Montant du remboursement"
- [ ] English translations (`en/overpayment.json`):
  - `recordOverpaymentTitle` = "Record Overpayment"
  - `refundDate` = "Refund Date"
  - `refundDateInvalid` = "Date must be valid, not in the future, and on or after the procedure date"
  - `paymentMethod` = "Payment Method"
  - `bankAccount` = "Bank Account"
  - `reason` = "Reason (optional)"
  - `reasonTooLong` = "Reason must not exceed 255 characters"
  - `confirmRefund` = "Confirm Refund"
  - `refundSuccess` = "Refund recorded successfully"
  - `refundError` = "Error recording refund"
  - `deleteRefund` = "Delete Refund"
  - `deleteRefundConfirm` = "Are you sure you want to delete this refund?"
  - `deleteRefundSuccess` = "Refund deleted"
  - `refundButton` = "Refund"
  - `sourceAmount` = "Original Amount"
  - `refundAmount` = "Refund Amount"

---

### P4.9 — Create useRecordOverpayment Tests

**File**: `src/features/overpayment/record_overpayment_modal/useRecordOverpayment.test.ts`

**Description**: Test hook behavior per testing.md (F18, F19).

**Checklist**:

- [ ] Test: `openModal_presetsForm()` — Form is pre-populated correctly
- [ ] Test: `setRefundDate_validatesFutureDate()` — Future date rejected
- [ ] Test: `setRefundDate_validatesDateBeforeProcedure()` — Date before source procedure rejected
- [ ] Test: `setReason_validatesTooLong()` — >255 chars rejected
- [ ] Test: `submitRefund_callsGateway()` — Correct arguments passed to gateway
- [ ] Test: `submitRefund_showsSuccessSnackbar()` — Success flow
- [ ] Test: `submitRefund_showsErrorSnackbar()` — Error flow
- [ ] Test: `deleteRefund_confirmsWithUser()` — Confirmation dialog shown
- [ ] Test: `deleteRefund_callsGatewayOnConfirm()` — Delete called with correct ID
- [ ] Use `vi.mock()` for gateway (F19: stable references before renderHook)
- [ ] Seed Zustand store with test data (bank accounts, procedures)
- [ ] Mock snackbar and event bus

---

### P4.10 — Create RecordOverpaymentModal Tests

**File**: `src/features/overpayment/record_overpayment_modal/RecordOverpaymentModal.test.tsx`

**Description**: Test component rendering and user interactions.

**Checklist**:

- [ ] Test: `renders_whenOpen()` — Modal displays when open prop is true
- [ ] Test: `closesOnCancel()` — onClose called on cancel button
- [ ] Test: `submitsForm_onConfirm()` — Form submission triggered
- [ ] Test: `disablesFormWhileLoading()` — Inputs disabled during API call
- [ ] Test: `showsValidationErrors()` — Error messages displayed
- [ ] Use React Testing Library for DOM assertions
- [ ] Mock gateway functions

---

## Phase 5: Integration & Testing

### P5.1 — Backend Integration Test

**File**: `src-tauri/src/use_cases/overpayment_management/service.rs` (`#[cfg(test)]`)

**Description**: Integration test with real repositories (not mocked).

**Checklist**:

- [ ] Test: `integration_refund_workflow_end_to_end()` — Full flow with database
  - Setup: Create test database, patient, fund, procedure types, bank account
  - Create source procedure with `FundPayed` status
  - Create fund payment group + bank transfer linked to it
  - Execute: Service.create_refund()
  - Assert: All 3 records (negative procedure, group, transfer) created in DB
  - Assert: Source procedure status updated to `Overpaid`
  - Assert: ProcedureRefund link exists
  - Assert: Bank transfer fund group link updated
  - Teardown: Clean up test database

---

### P5.2 — Format & Lint Check

**Command**: `python3 scripts/check.py`

**Checklist**:

- [ ] Run full check: linting, formatting, type-checking
- [ ] Fix any violations (Clippy warnings, Biome style)
- [ ] Ensure all files pass

---

### P5.3 — Frontend Tests

**Command**: `npm run test`

**Checklist**:

- [ ] Run all frontend tests (Vitest)
- [ ] Verify useRecordOverpayment tests pass
- [ ] Verify RecordOverpaymentModal tests pass
- [ ] Verify validator tests pass
- [ ] Ensure no coverage gaps for new code

---

### P5.4 — Backend Tests

**Command**: `cd src-tauri && cargo test`

**Checklist**:

- [ ] Run all backend tests
- [ ] Verify service unit tests pass
- [ ] Verify repository tests pass
- [ ] Verify integration tests pass
- [ ] Ensure no compilation warnings (Clippy)

---

## Phase 6: Code Review & Quality Assurance

### P6.1 — Code Review (Reviewer Agent)

**Command**: `/reviewer` agent

**Checklist**:

- [ ] Run `reviewer` agent
- [ ] Address DDD violations
- [ ] Address backend rule violations (B1–B17)
- [ ] Address frontend rule violations (F1–F20)
- [ ] Verify all fixes applied

---

### P6.2 — UX Review (UX-Reviewer Agent)

**Command**: `/ux-reviewer` agent (if .tsx modified)

**Checklist**:

- [ ] Run `ux-reviewer` agent
- [ ] Verify M3 design compliance
- [ ] Verify empty/loading/error states
- [ ] Verify form UX (validation, error display)
- [ ] Verify accessibility
- [ ] Fix any issues

---

### P6.3 — i18n Review (i18n-Checker Agent)

**Command**: `/i18n-checker` agent (if UI text added)

**Checklist**:

- [ ] Run `i18n-checker` agent
- [ ] Verify no hardcoded strings remain
- [ ] Verify all translation keys exist in both locales (fr, en)
- [ ] Fix any missing translations

---

### P6.4 — Documentation Update

**Files**:

- `ARCHITECTURE.md`
- `docs/todo.md`

**Checklist**:

- [ ] Update `ARCHITECTURE.md`:
  - Add new use case to "Use Cases" section
  - Document `OverpaymentManagementService` entry point
  - Document Tauri commands provided
  - List cross-context dependencies (Procedure, Fund, Bank)
  - Document database schema (`procedure_refund` table)
- [ ] Update `docs/todo.md`:
  - Mark overpayment feature as completed
  - Remove from backlog if applicable

---

### P6.5 — Spec Checker

**Command**: `/spec-checker` agent

**Purpose**: Verify all Rn rules from spec are implemented and tested.

**Checklist**:

- [ ] Run `spec-checker` agent
- [ ] Verify REF-010 implemented (eligibility check)
- [ ] Verify REF-011 implemented (full refund only)
- [ ] Verify REF-012 implemented (refund date validation)
- [ ] Verify REF-013 implemented (reason validation)
- [ ] Verify REF-020 implemented (atomic creation)
- [ ] Verify REF-021 implemented (payment method selection)
- [ ] Verify REF-022 implemented (refund link)
- [ ] Verify REF-030 implemented (status transitions)
- [ ] Verify REF-040 implemented (deletion cascade)
- [ ] Verify REF-041 implemented (source deletion guard)
- [ ] Verify REF-042 implemented (refund deletion guard)
- [ ] Address any missing implementations

---

### P6.6 — Workflow Validator

**Command**: `/workflow-validator` agent

**Purpose**: Verify all workflow steps completed and checkboxes marked.

**Checklist**:

- [ ] Run `workflow-validator` agent
- [ ] Verify all Phase checkboxes are ticked
- [ ] Verify all mandatory quality steps completed
- [ ] Verify no incomplete tasks remain

---

## Dependency Graph

```
Phase 1: Database Schema
    └── P1.1 procedure_refund table
    └── P1.2 Procedure status enum update

Phase 2: Backend Implementation
    └── P2.1 ProcedureRefund domain
    └── P2.2 Repository trait
    └── P2.3 SQLite repository impl
    └── P2.4 Service orchestrator (depends on P2.1, P2.2, P2.3)
    └── P2.5 API layer (depends on P2.4)
    └── P2.6 Specta registration (depends on P2.5)
    └── P2.7 Module exports
    └── P2.8 App wiring
    └── P2.9 Backend tests

Phase 3: Type Synchronization ⚠️ BLOCKING PHASE 4
    └── P3.1 just generate-types

Phase 4: Frontend Implementation (BLOCKED until P3.1 complete)
    └── P4.1 Feature structure
    └── P4.2 Gateway (depends on P3.1)
    └── P4.3 Validators
    └── P4.4 Presenter
    └── P4.5 Hook (depends on P4.2)
    └── P4.6 Component (depends on P4.5)
    └── P4.7 Edit procedure modal update
    └── P4.8 i18n translations
    └── P4.9 Hook tests
    └── P4.10 Component tests

Phase 5: Integration & QA
    └── P5.1 Backend integration test
    └── P5.2 python3 scripts/check.py
    └── P5.3 npm run test
    └── P5.4 cargo test

Phase 6: Code Review & Closure
    └── P6.1 /reviewer agent
    └── P6.2 /ux-reviewer agent
    └── P6.3 /i18n-checker agent
    └── P6.4 Documentation update
    └── P6.5 /spec-checker agent
    └── P6.6 /workflow-validator agent
```

---

## Critical Notes

1. **Atomicity**: REF-020, REF-040 must execute in a single backend method. No partial creation/deletion allowed.
2. **Gateway Pattern**: Tauri commands must match bindings.ts parameter COUNT, ORDER, and NAMES exactly.
3. **Status Enum**: Update must support new `Overpaid` and `OverpaymentRefund` statuses in both Rust and database.
4. **Soft-Delete**: All deletions use `is_deleted = 1` pattern, consistent with existing schema.
5. **Type Sync**: MUST run `just generate-types` after P2.6 before starting frontend work.
6. **Eligibility**: Only `FundPayed` and `PartiallyFundPayed` procedures can be refunded (REF-010).
7. **Amount Negation**: Refund procedure and transfers have negative amounts throughout the chain.
8. **Testing**: No trivial tests; verify atomicity and cascade behavior.
9. **i18n**: All UI text must be translated to French and English.

---

## Success Criteria

✅ All Rn rules implemented and tested
✅ All 3 phases (Backend, Frontend, QA) completed
✅ All checkboxes marked as complete
✅ No linting/formatting violations
✅ No untranslated strings
✅ Backend atomic operations verified
✅ Frontend validation and error handling working
✅ Modal states (loading, error, success) functional
✅ Refund button visible on eligible procedures
✅ Deletion with confirmation functional
✅ All tests passing (Frontend + Backend)
