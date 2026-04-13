# Implementation Plan — Overpayment Management (REF)

Spec: `docs/spec/overpayment.md`
Trigram: **REF** (rules REF-010 to REF-240)

---

## 1. Workflow TaskList

- [ ] 📖 Review Architecture & Rules (`ARCHITECTURE.md`, `docs/backend-rules.md`, `docs/frontend-rules.md`)
- [ ] 🏗️ Backend — Phase 1: Domain extensions (enums, new entity)
- [ ] 🏗️ Backend — Phase 2: Database migration
- [ ] 🏗️ Backend — Phase 3: Repository (ProcedureRefund)
- [ ] 🏗️ Backend — Phase 4: Overpayment orchestrator
- [ ] 🏗️ Backend — Phase 5: Guard updates (delete_procedure, delete_fund_payment_group, bank_manual_match)
- [ ] 🏗️ Backend — Phase 6: Procedure orchestration augmentation (REF-170)
- [ ] 🏗️ Backend — Phase 7: lib.rs wiring & specta_builder registration
- [ ] 🔗 Type Synchronization (`just generate-types`)
- [ ] 💻 Frontend — Phase 1: Shared types & presenter updates
- [ ] 💻 Frontend — Phase 2: Overpayment gateway
- [ ] 💻 Frontend — Phase 3: Record Overpayment modal
- [ ] 💻 Frontend — Phase 4: Cancel Refund confirmation dialog
- [ ] 💻 Frontend — Phase 5: ProcedureFormModal — new modes (overpaid / refund) and Refund button
- [ ] 💻 Frontend — Phase 6: StatusBadge updates (REF-180)
- [ ] 💻 Frontend — Phase 7: i18n keys (en + fr)
- [ ] 🧹 Formatting & Linting (`just format` + `python3 scripts/check.py`)
- [ ] 🔍 Code Review (`reviewer` + `reviewer-backend` + `reviewer-frontend`)
- [ ] 🎭 UX Review (`ux-reviewer`)
- [ ] 🌐 i18n Review (`i18n-checker`)
- [ ] 🧪 Unit & Integration Tests
- [ ] 📚 Documentation Update (`ARCHITECTURE.md` + `docs/todo.md`)
- [ ] ✅ Final Validation (`spec-checker` + `workflow-validator`)

---

## 2. Detailed Implementation Plan

### Prerequisites summary

Before implementing the main orchestrator, four cross-cutting changes are required in existing files:
1. Extend `ProcedureStatus` enum — add `Overpaid` and `OverpaymentRefund`.
2. Extend `BankTransferType` enum — add `OutgoingWire`.
3. Extend `delete_procedure` guard (`is_blocking_status`) to include `Overpaid` and `OverpaymentRefund` (POC R5, REF-220, REF-230).
4. Extend `delete_fund_payment_group` to reject deletion of refund groups (REF-240).
5. Extend `create_fund_transfer` / `create_direct_transfer` in bank_manual_match to reject `OutgoingWire` (REF-080).
6. Extend `update_procedure` in procedure_orchestration to propagate `procedure_type_id` to the linked refund procedure (REF-170).

---

### Backend — Phase 1: Domain Extensions

#### 1.1 Extend `ProcedureStatus` enum
File: `src-tauri/src/context/procedure/domain/procedure.rs`

- Add two variants to `ProcedureStatus`:
  - `Overpaid` — source procedure whose overpayment has been recorded.
  - `OverpaymentRefund` — the mirror negative procedure created to offset the overpayment.
- Update the doc-comment on the enum to describe the two new variants.
- Update `RawProcedure::into_procedure()` in `src-tauri/src/use_cases/procedure_orchestration/api.rs` to map `"OVERPAID"` → `ProcedureStatus::Overpaid` and `"OVERPAYMENT_REFUND"` → `ProcedureStatus::OverpaymentRefund`.

#### 1.2 Extend `BankTransferType` enum
File: `src-tauri/src/context/bank/domain/bank_transfer.rs`

- Add `OutgoingWire` variant to `BankTransferType`.
- Update the doc-comment: note that `OutgoingWire` is exclusively created via the overpayment flow (REF-080).
- **Important**: The existing `validate()` method on `BankTransfer::new()` rejects `amount <= 0`. Refund transfers carry a negative amount. The `new()` / `with_id()` / `restore()` factory methods must accept negative amounts for `OutgoingWire` transfers (validation should skip the positivity check when `transfer_type == OutgoingWire`), OR (preferred) create the refund transfer via `restore()` directly in the orchestrator, bypassing the amount check. Document which approach is taken in a code comment referencing REF-110.

#### 1.3 New domain entity: `ProcedureRefund`
File: `src-tauri/src/context/procedure/domain/procedure_refund.rs` (new file)

Struct fields:
- `id: String`
- `source_procedure_id: String`
- `refund_procedure_id: String`
- `refund_date: NaiveDate`
- `reason: Option<String>` (max 255 chars — validated in `new()` and `with_id()`)
- `previous_payment_status: ProcedureStatus`

Factory methods (follow B1):
- `new(source_procedure_id, refund_procedure_id, refund_date: String, reason: Option<String>, previous_payment_status: ProcedureStatus) -> Result<Self>` — generates UUID, validates reason length.
- `restore(id, source_procedure_id, refund_procedure_id, refund_date: NaiveDate, reason: Option<String>, previous_payment_status: ProcedureStatus) -> Self` — no validation.

Update `src-tauri/src/context/procedure/domain/mod.rs` to re-export `ProcedureRefund`.
Update `src-tauri/src/context/procedure/mod.rs` to re-export `ProcedureRefund`.

---

### Backend — Phase 2: Database Migration

File: `src-tauri/migrations/20260413_overpayment.sql` (new file — use the next available date prefix)

Contents:
1. **Alter `procedure` table** — `payment_status` is stored as TEXT. No schema change needed; the new enum variants serialize as `"OVERPAID"` and `"OVERPAYMENT_REFUND"` automatically via `SCREAMING_SNAKE_CASE` serde.
2. **Alter `bank_transfer` table** — `transfer_type` is stored as TEXT. `"OUTGOING_WIRE"` serializes automatically. No schema change needed.
3. **Create `procedure_refund` table**:
   ```sql
   CREATE TABLE IF NOT EXISTS procedure_refund (
     id                       TEXT PRIMARY KEY NOT NULL,
     source_procedure_id      TEXT NOT NULL REFERENCES procedure(id),
     refund_procedure_id      TEXT NOT NULL REFERENCES procedure(id),
     refund_date              TEXT NOT NULL,
     reason                   TEXT,
     previous_payment_status  TEXT NOT NULL
   );
   ```

After adding this migration, run `just clean-db` and `cargo sqlx prepare` to regenerate the query cache.

---

### Backend — Phase 3: ProcedureRefund Repository

#### 3.1 Repository trait
File: `src-tauri/src/context/procedure/repository/procedure_refund.rs` (new file)

Trait `ProcedureRefundRepository`:
- `create_procedure_refund(refund: &ProcedureRefund) -> anyhow::Result<()>`
- `find_by_source_procedure_id(source_id: &str) -> anyhow::Result<Option<ProcedureRefund>>`
- `delete_procedure_refund(id: &str) -> anyhow::Result<()>`

Struct `SqliteProcedureRefundRepository { pool: SqlitePool }`
Implement `ProcedureRefundRepository` using `sqlx::query!` macros (B11).

Update `src-tauri/src/context/procedure/repository/mod.rs` to declare and re-export `procedure_refund`.
Update `src-tauri/src/context/procedure/mod.rs` to re-export `ProcedureRefundRepository` and `SqliteProcedureRefundRepository`.

---

### Backend — Phase 4: Overpayment Orchestrator (new use case)

Directory: `src-tauri/src/use_cases/overpayment/` (new)

Files to create:
- `domain.rs` — request/response DTOs:
  - `CreateOverpaymentRequest { source_procedure_id, refund_date, transfer_type (String), bank_account_id, reason? }`
  - `CancelOverpaymentRequest { source_procedure_id }`
  - `ProcedureRefundInfo { ... }` — the `ProcedureRefund` re-exported for Specta
- `orchestrator.rs` — `OverpaymentOrchestrator` struct and logic
- `api.rs` — two Tauri commands
- `mod.rs` — public re-exports

#### 4.1 `OverpaymentOrchestrator` struct
Dependencies (injected via `Arc<dyn Trait>`):
- `procedure_service: Arc<ProcedureService>` — CRUD on procedures
- `fund_payment_service: Arc<FundPaymentService>` — CRUD on fund payment groups
- `bank_transfer_service: Arc<BankTransferService>` — CRUD on bank transfers
- `transfer_link_repo: Arc<dyn BankTransferLinkRepository>` — junction table
- `procedure_refund_repo: Arc<dyn ProcedureRefundRepository>` — new
- `bank_account_service: Arc<BankAccountService>` — needed to validate bank_account_id (REF-070)

#### 4.2 `create_overpayment()` method
Validates and executes the full creation cascade inside a single `sqlx` transaction (REF-050). Steps in order:

1. Load source procedure; verify its `payment_status` is `FundPayed` or `PartiallyFundPayed` (REF-010).
2. Validate `refund_amount == source.procedure_amount` — full refund only (REF-020).
3. Validate `refund_date` format, not in future, not before `source.confirmed_payment_date` (REF-030).
4. Validate `reason` max 255 chars if provided (REF-040).
5. Validate `transfer_type` is one of `CreditCard`, `Check`, `OutgoingWire`; reject `Cash` and `Fund` (REF-060).
6. Validate `bank_account_id` is provided (REF-070).
7. Create refund `Procedure` using `Procedure::new()` with `payment_status = OverpaymentRefund`, `procedure_amount = -source.procedure_amount`, `procedure_date = refund_date` (REF-090).
8. Create refund `FundPaymentGroup` with `status = BankPayed`, `is_locked = true`, `total_amount = -source.procedure_amount`, one `FundPaymentLine` (REF-100).
9. Create refund `BankTransfer` with `amount = -source.procedure_amount`, `transfer_type` from request, `transfer_date = refund_date` (REF-110). Use `restore()` or a dedicated `new_negative()` factory to bypass the positivity check.
10. Create `BankTransferLink` entry linking the refund transfer to the refund group (REF-120).
11. Save `ProcedureRefund.previous_payment_status = source.payment_status` before update (REF-130).
12. Update source procedure `payment_status` to `Overpaid` (REF-160).

**Note on transactions**: `sqlx` does not have a single built-in "global transaction" across service calls that each hold their own pool connections. The orchestrator must acquire a `sqlx::Transaction` from the pool and pass it down — or use a pattern consistent with how existing orchestrators handle atomicity (check `bank_manual_match/orchestrator.rs` for the established pattern). The implementation must ensure full rollback on any failure (REF-050).

#### 4.3 `cancel_overpayment()` method
Single transaction cascade in reverse order (REF-210):
1. Look up `ProcedureRefund` by `source_procedure_id`.
2. Revert source procedure `payment_status` to `previous_payment_status`.
3. Delete `ProcedureRefund` record.
4. Delete `BankTransferLink` for the refund transfer.
5. Delete refund `BankTransfer`.
6. Delete refund `FundPaymentGroup` (and its lines).
7. Delete refund `Procedure`.

#### 4.4 `get_procedure_refund_by_source()` method
Fetches `ProcedureRefund` by `source_procedure_id`. Used by the frontend when opening the `OverpaymentRefund` modal (REF-200) to resolve `source_procedure_id` before calling cancel.

#### 4.5 Tauri commands in `api.rs`

```
create_overpayment(request: CreateOverpaymentRequest) -> () 
cancel_overpayment(sourceProcedureId: String) -> ()
get_procedure_refund_by_source(sourceProcedureId: String) -> Option<ProcedureRefundInfo>
```

All commands follow the `Result<T, String>` pattern (B13). Log at entry with `tracing::info!` using the `BACKEND` constant (B12, B16).

---

### Backend — Phase 5: Guard Updates

#### 5.1 `delete_procedure` guard (REF-220, REF-230)
File: `src-tauri/src/use_cases/procedure_orchestration/api.rs`

Modify `is_blocking_status()` to include `"OVERPAID"` and `"OVERPAYMENT_REFUND"`:
```rust
fn is_blocking_status(status: &str) -> bool {
    matches!(
        status,
        "RECONCILIATED"
            | "PARTIALLY_RECONCILED"
            | "FUND_PAYED"
            | "PARTIALLY_FUND_PAYED"
            | "DIRECTLY_PAYED"
            | "OVERPAID"
            | "OVERPAYMENT_REFUND"
    )
}
```
Also update the cross-reference comment to mention REF-220 and REF-230.

The frontend `isBlockingStatus` set in `src/features/procedure/model/procedure-row.types.ts` must be updated in the same step to include `"OVERPAID"` and `"OVERPAYMENT_REFUND"`.

#### 5.2 `delete_fund_payment_group` guard (REF-240)
File: `src-tauri/src/context/fund/api.rs`

In the `delete_fund_payment_group` Tauri command, before delegating to the service, call `procedure_refund_repo.find_by_refund_group_id()` (or equivalent lookup) to check if the group is a refund group. If it is, return an explicit error: `"This fund payment group belongs to an overpayment refund and can only be removed by cancelling the refund."`.

**Note**: This requires the `delete_fund_payment_group` command to receive the `ProcedureRefundRepository` as an additional Tauri `State`. Update `lib.rs` wiring accordingly.

Alternatively, add a `is_refund_group` flag to `FundPaymentGroup` or expose a `find_refund_group_id` query on the `ProcedureRefundRepository`. Choose the minimal approach: add `find_by_refund_group_id(group_id: &str) -> anyhow::Result<bool>` to the `ProcedureRefundRepository` trait.

#### 5.3 `OutgoingWire` exclusivity guard (REF-080)
File: `src-tauri/src/use_cases/bank_manual_match/api.rs`

In `create_fund_transfer` and `create_direct_transfer`, validate that `transfer_type != OutgoingWire` and return an explicit error if violated. Since `create_fund_transfer` always creates a `Fund` type transfer, the guard is only relevant for `create_direct_transfer` which accepts a `transferType` parameter.

---

### Backend — Phase 6: Procedure Orchestration Augmentation (REF-170)

File: `src-tauri/src/use_cases/procedure_orchestration/service.rs`

In `update_procedure()`, after the standard update:
1. Check if the updated procedure's `payment_status` is `Overpaid`.
2. If yes, call `procedure_refund_repo.find_by_source_procedure_id(&procedure.id)` to get the linked `ProcedureRefund`.
3. If a refund record exists, load the refund procedure and apply the same `procedure_type_id` update atomically.

This requires `ProcedureOrchestrationService` to receive a new `Arc<dyn ProcedureRefundRepository>` dependency. Update `ProcedureOrchestrationService::new()` signature and `lib.rs` wiring accordingly.

---

### Backend — Phase 7: Wiring (`lib.rs` + `specta_builder.rs`)

#### 7.1 `src-tauri/src/lib.rs`

1. Instantiate `SqliteProcedureRefundRepository`.
2. Inject it into `OverpaymentOrchestrator::new()`.
3. Inject it into `ProcedureOrchestrationService::new()` (for REF-170).
4. Inject it into the `delete_fund_payment_group` Tauri state if needed (REF-240).
5. Register `OverpaymentOrchestrator` as Tauri state: `app.manage(Arc::new(overpayment_orchestrator))`.

#### 7.2 `src-tauri/src/use_cases/mod.rs`

Declare `pub mod overpayment;`.

#### 7.3 `src-tauri/src/core/specta_builder.rs`

Register new types and commands:
- Types: `ProcedureRefundInfo` (from `overpayment`)
- Commands: `overpayment::create_overpayment`, `overpayment::cancel_overpayment`, `overpayment::get_procedure_refund_by_source`
- Import path: `use crate::use_cases::overpayment;`

---

### Type Synchronization

Run `just generate-types` to regenerate `src/bindings.ts` with:
- Updated `ProcedureStatus` (two new variants: `Overpaid`, `OverpaymentRefund`)
- Updated `BankTransferType` (new variant: `OutgoingWire`)
- New commands: `createOverpayment`, `cancelOverpayment`, `getProcedureRefundBySource`
- New type: `ProcedureRefundInfo` (or equivalent DTO)

---

### Frontend — Phase 1: Shared Types & Presenter Updates

#### 1.1 `src/features/procedure/model/procedure-row.types.ts`

Add `"OVERPAID"` and `"OVERPAYMENT_REFUND"` to the `BLOCKING_STATUSES` set (kept in sync with the backend guard per R5 / REF-220 / REF-230).

Add a helper `isOverpaidStatus(status: string | null): boolean` — returns true for `"OVERPAID"`.
Add a helper `isOverpaymentRefundStatus(status: string | null): boolean` — returns true for `"OVERPAYMENT_REFUND"`.

These helpers drive modal mode routing in `ProcedurePage` (REF-190, REF-200).

#### 1.2 `src/features/procedure/ui/procedure_list/StatusBadge.tsx` (REF-180)

Add cases for `"OVERPAID"` and `"OVERPAYMENT_REFUND"` in `getBadgeColor()`:
```
"OVERPAID" | "OVERPAYMENT_REFUND" → "bg-m3-error-container text-m3-on-error-container"
```
Add them to the label resolution logic so `t("status.overpaid")` and `t("status.overpayment_refund")` keys are used.

---

### Frontend — Phase 2: Overpayment Gateway

File: `src/features/overpayment/gateway.ts` (new file — new feature module)

Methods (following gold layout F3):
- `createOverpayment(request: CreateOverpaymentRequest): Promise<void>` — calls `commands.createOverpayment(request)`.
- `cancelOverpayment(sourceProcedureId: string): Promise<void>` — calls `commands.cancelOverpayment(sourceProcedureId)`.
- `getProcedureRefundBySource(sourceProcedureId: string): Promise<ProcedureRefundInfo | null>` — calls `commands.getProcedureRefundBySource(sourceProcedureId)`.

All calls must match the `bindings.ts` signatures exactly (positional args).

Also create `src/features/overpayment/index.ts` for public re-exports.

---

### Frontend — Phase 3: Record Overpayment Modal

Sub-feature directory: `src/features/overpayment/record_overpayment_modal/`

Files:
- `RecordOverpaymentModal.tsx` — modal component
- `useRecordOverpaymentModal.ts` — hook with all state, validation, and submission logic
- `useRecordOverpaymentModal.test.ts` — colocated tests

#### Hook responsibilities (`useRecordOverpaymentModal`)

State managed:
- `refundDate: string` — pre-filled with today; validated per REF-030.
- `transferType: string` — empty initially; options: `CreditCard`, `Check`, `OutgoingWire` (REF-060).
- `bankAccountId: string` — pre-filled per REF-070 resolution logic.
- `reason: string` — optional, max 255 chars (REF-040).
- `loading: boolean`
- `fieldErrors: Record<string, string>`
- `showConfirmation: boolean` — controls the second-step confirmation dialog.

REF-070 pre-fill logic on mount:
1. Read `bankAccounts` from `useAppStore`.
2. If zero accounts: the calling component disables the "Refund" button (handled in `ProcedureFormModal`, not here).
3. If exactly one: `setBankAccountId(bankAccounts[0].id)`.
4. If multiple: attempt to resolve from `sourceProcedure`'s original bank transfer (requires a call to `getProcedureRefundBySource` or — since the source has not yet been refunded — a direct lookup of the source's `BankTransfer`. The frontend cannot directly query "the bank transfer linked to this procedure". Instead, expose a backend query or accept that multi-account resolution falls back to empty if the source procedure's transfer is not directly accessible from the frontend store. Simplest approach: always pre-fill with the single account if there is one; for multiple accounts, leave empty and let the user pick. Document this simplification with a code comment referencing REF-070).

Validation on submit (before showing confirmation):
- `refundDate` must be present, not future, not before source `confirmed_payment_date` (REF-030).
- `transferType` must be `CreditCard`, `Check`, or `OutgoingWire` (REF-060).
- `bankAccountId` must be provided (REF-070).
- `reason` if present must be `<= 255` chars (REF-040).

On confirmation, call `gateway.createOverpayment(request)`, show toast on success, call `onSuccess()`.

#### Component responsibilities (`RecordOverpaymentModal`)

Props: `{ isOpen, sourceProcedure: Procedure, onClose, onSuccess }`.

Content:
- Source procedure summary (patient name, amount, current status).
- `DateField` for refund date.
- `SelectField` for payment method (CreditCard / Check / OutgoingWire).
- `SelectField` for bank account (all `bankAccounts` from store).
- `TextField` for optional reason.
- Confirmation dialog (second step) summarizing financial impact (REF UX draft step 5).

---

### Frontend — Phase 4: Cancel Refund Confirmation Dialog

Sub-feature directory: `src/features/overpayment/cancel_refund_dialog/`

Files:
- `CancelRefundDialog.tsx` — confirmation dialog component.
- `useCancelRefundDialog.ts` — hook managing loading state and the cancel cascade call.
- `useCancelRefundDialog.test.ts` — colocated tests.

Hook responsibilities:
- `loading: boolean`
- `handleConfirm()` — calls `gateway.cancelOverpayment(sourceProcedureId)`, shows toast on success, calls `onSuccess()`.
- When triggered from the `OverpaymentRefund` modal (REF-200), the `sourceProcedureId` is resolved by the parent hook calling `getProcedureRefundBySource(procedure.id)` before opening the dialog.

Props received: `{ isOpen, sourceProcedureId: string, onClose, onSuccess }`.

---

### Frontend — Phase 5: ProcedureFormModal Updates

File: `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx`
File: `src/features/procedure/ui/procedure_form_modal/useProcedureFormModal.ts`
File: `src/features/procedure/ui/ProcedurePage.tsx`

#### Modal mode routing (`ProcedurePage.tsx`)

The current modal routing uses `mode: "create" | "edit" | "view"`. Add two new modes:
- `"overpaid"` — for procedures with `Overpaid` status (REF-190).
- `"refund"` — for procedures with `OverpaymentRefund` status (REF-200).

In `ProcedurePage`, extend the row-click / edit-button handler:
- If `isOverpaidStatus(row.status)` → open with `mode="overpaid"`.
- If `isOverpaymentRefundStatus(row.status)` → open with `mode="refund"`.
- Keep existing routing for other statuses unchanged.

#### `ProcedureFormModal.tsx` — new mode branches

**`mode="overpaid"` (REF-190)**:
- `procedure_type_id` rendered as `SelectField` (editable).
- All other fields rendered as read-only `TextField`s.
- Footer: "Cancel Refund" button + "Save" button (only `procedure_type_id`; disabled if empty).
- "Refund" button absent. "Delete" button absent.
- "Refund" button is absent because the procedure is already overpaid.

**`mode="refund"` (REF-200)**:
- All fields rendered as read-only `TextField`s.
- Footer: "Cancel Refund" button only. "Save" and "Delete" absent.

**`mode="edit"` / `mode="view"` — Refund button (REF-010, REF-070)**:
In `mode="view"` (statuses `FundPayed`, `PartiallyFundPayed`), add a "Refund" button in the footer:
- Disabled if `bankAccounts.length === 0`, with a tooltip: `t("overpayment.noAccountTooltip")` (REF-070).
- On click, opens `RecordOverpaymentModal`.

#### `useProcedureFormModal.ts`

Add state:
- `showRefundModal: boolean` — controls `RecordOverpaymentModal`.
- `showCancelRefundDialog: boolean` + `cancelSourceProcedureId: string | null` — controls `CancelRefundDialog`.

Add handlers:
- `handleRefundClick()` — sets `showRefundModal = true`.
- `handleCancelRefundClick()`:
  - If `mode === "overpaid"`: `cancelSourceProcedureId = procedure.id`, `showCancelRefundDialog = true`.
  - If `mode === "refund"`: call `getProcedureRefundBySource(procedure.id)` to resolve the `source_procedure_id`, then set `cancelSourceProcedureId` and `showCancelRefundDialog = true`.
- `handleRefundSuccess()` — calls `onSuccess()`, closes modal.
- `handleCancelRefundSuccess()` — calls `onSuccess()`, closes modal.

The `RecordOverpaymentModal` and `CancelRefundDialog` are rendered inside `ProcedureFormModal` as nested portals/modals.

---

### Frontend — Phase 6: StatusBadge (already covered in Phase 1.2)

`StatusBadge.tsx` is updated in Phase 1.2. No additional changes needed here.

---

### Frontend — Phase 7: i18n Keys

New namespace: `overpayment`
Files to create:
- `src/i18n/locales/en/overpayment.json`
- `src/i18n/locales/fr/overpayment.json`

Keys needed:
```
modal.title               — "Record Overpayment"
modal.confirmTitle        — "Confirm Refund"
modal.cancelTitle         — "Cancel Refund"
modal.confirmBody         — "This will create a negative bank transfer and fund payment group."
modal.cancelBody          — "This will permanently cancel the refund and revert the source procedure to its previous status."
form.refundDate           — "Repayment Date"
form.paymentMethod        — "Payment Method"
form.bankAccount          — "Bank Account"
form.reason               — "Reason (optional)"
form.sourceProcedure      — "Source Procedure"
action.refund             — "Refund"
action.cancelRefund       — "Cancel Refund"
action.confirmRefund      — "Confirm Refund"
noAccountTooltip          — "A bank account must be created before recording a refund."
paymentMethod.creditCard  — "Credit Card"
paymentMethod.check       — "Check"
paymentMethod.outgoingWire — "Outgoing Wire Transfer"
success.created           — "Refund recorded successfully."
success.cancelled         — "Refund cancelled successfully."
error.create              — "Failed to record the refund."
error.cancel              — "Failed to cancel the refund."
```

Update `src/features/procedure/ui/procedure_list/StatusBadge.tsx` i18n keys:
Keys `status.overpaid` and `status.overpayment_refund` must be added to the existing `procedure` namespace (`en/procedure.json` and `fr/procedure.json`).

Register the new `overpayment` namespace in the i18n configuration (wherever existing namespaces are listed — check `src/i18n/` setup file).

---

### Rules Coverage Table

| Rule | Scope | Implementation Task |
|------|-------|---------------------|
| REF-010 | FE + BE | Backend: eligibility check in `create_overpayment()`; Frontend: "Refund" button only shown in `view` mode for `FundPayed`/`PartiallyFundPayed` |
| REF-020 | BE | Validation in `create_overpayment()`: reject if amount differs from source |
| REF-030 | FE + BE | Backend: date validation in `create_overpayment()`; Frontend: `useRecordOverpaymentModal` field validation |
| REF-040 | FE + BE | Backend: reason max 255 in `ProcedureRefund::new()` and `create_overpayment()`; Frontend: validation in hook |
| REF-050 | BE | Entire `create_overpayment()` wrapped in a single `sqlx` transaction |
| REF-060 | FE + BE | Backend: `transfer_type` allowlist in `create_overpayment()`; Frontend: `SelectField` with 3 options only |
| REF-070 | FE + BE | Backend: reject if `bank_account_id` missing; Frontend: pre-fill logic in `useRecordOverpaymentModal`, disabled button with tooltip if no accounts |
| REF-080 | BE | Guard in `bank_manual_match::api.rs` `create_direct_transfer` rejecting `OutgoingWire` |
| REF-090 | BE | `Procedure::new()` call inside `create_overpayment()` with `OverpaymentRefund` status |
| REF-100 | BE | `FundPaymentGroup` creation inside `create_overpayment()` with `BankPayed` + `is_locked=true` |
| REF-110 | BE | `BankTransfer` creation inside `create_overpayment()` with negative amount |
| REF-120 | BE | `BankTransferLink` entry creation inside `create_overpayment()` |
| REF-130 | BE | `ProcedureRefund::new()` inside `create_overpayment()` storing `previous_payment_status` |
| REF-140 | BE | No update endpoint for `ProcedureRefund` — repository trait does not expose one |
| REF-150 | BE | `ProcedureRefundRepository` trait and `SqliteProcedureRefundRepository` in `context/procedure/` |
| REF-160 | BE | Source procedure `payment_status` updated to `Overpaid` inside `create_overpayment()` |
| REF-170 | BE | Augmented `update_procedure()` in `ProcedureOrchestrationService` propagating `procedure_type_id` |
| REF-180 | FE | `StatusBadge.tsx` error-container token for `OVERPAID` and `OVERPAYMENT_REFUND` |
| REF-190 | FE | `ProcedureFormModal` `mode="overpaid"`: `procedure_type_id` editable, Cancel Refund button |
| REF-200 | FE | `ProcedureFormModal` `mode="refund"`: full read-only, Cancel Refund button |
| REF-210 | BE | `cancel_overpayment()` method in `OverpaymentOrchestrator`, reverse-order cascade transaction |
| REF-220 | BE + FE | Backend: `is_blocking_status()` extended; Frontend: `BLOCKING_STATUSES` set extended |
| REF-230 | BE + FE | Same as REF-220 |
| REF-240 | BE | Guard in `delete_fund_payment_group` command checking `ProcedureRefundRepository` |

---

### Cross-Context Dependency Notes

- `use_cases/overpayment/` imports from: `context/bank/`, `context/fund/`, `context/procedure/`. It must NOT import from any other use case (B6).
- `use_cases/procedure_orchestration/` gains a new dependency on `ProcedureRefundRepository` from `context/procedure/` — this is within the same bounded context boundary (procedure context), so it is permitted.
- `context/fund/api.rs` gains a new state dependency on `ProcedureRefundRepository` for the REF-240 guard. The repository is declared in `context/procedure/`. Since `context/fund/` must not import from `context/procedure/` (B2), the REF-240 guard must be placed in the `use_cases/overpayment/` orchestrator or as a dedicated Tauri command (`delete_fund_payment_group` command relocated to `use_cases/overpayment/api.rs`).

**Resolution for REF-240**: Move the `delete_fund_payment_group` guard logic into the `OverpaymentOrchestrator` by adding a new method `is_refund_fund_payment_group(group_id: &str) -> anyhow::Result<bool>`. Then, in the `context/fund/api.rs` `delete_fund_payment_group` command, add the `OverpaymentOrchestrator` as an additional Tauri state and call this check before delegating to `FundPaymentService`. This keeps the cross-context check inside the use case layer.

---

### Files Modified (Summary)

**Backend — modified**:
- `src-tauri/src/context/procedure/domain/procedure.rs` — extend `ProcedureStatus` enum
- `src-tauri/src/context/procedure/domain/mod.rs` — re-export `ProcedureRefund`
- `src-tauri/src/context/procedure/repository/mod.rs` — declare `procedure_refund` module
- `src-tauri/src/context/procedure/mod.rs` — re-export repository and entity
- `src-tauri/src/context/bank/domain/bank_transfer.rs` — extend `BankTransferType` enum, adjust validation
- `src-tauri/src/context/fund/api.rs` — REF-240 guard (with `OverpaymentOrchestrator` state)
- `src-tauri/src/use_cases/procedure_orchestration/api.rs` — extend `is_blocking_status()`, extend `RawProcedure` status mapping
- `src-tauri/src/use_cases/procedure_orchestration/service.rs` — REF-170 propagation, new repo dependency
- `src-tauri/src/use_cases/bank_manual_match/api.rs` — REF-080 guard
- `src-tauri/src/use_cases/mod.rs` — declare `overpayment` module
- `src-tauri/src/core/specta_builder.rs` — register new types and commands
- `src-tauri/src/lib.rs` — instantiate and wire all new services

**Backend — created**:
- `src-tauri/migrations/20260413_overpayment.sql`
- `src-tauri/src/context/procedure/domain/procedure_refund.rs`
- `src-tauri/src/context/procedure/repository/procedure_refund.rs`
- `src-tauri/src/use_cases/overpayment/domain.rs`
- `src-tauri/src/use_cases/overpayment/orchestrator.rs`
- `src-tauri/src/use_cases/overpayment/api.rs`
- `src-tauri/src/use_cases/overpayment/mod.rs`

**Frontend — modified**:
- `src/features/procedure/model/procedure-row.types.ts` — extend `BLOCKING_STATUSES`
- `src/features/procedure/ui/procedure_list/StatusBadge.tsx` — error-container tokens
- `src/features/procedure/ui/procedure_form_modal/ProcedureFormModal.tsx` — new modes
- `src/features/procedure/ui/procedure_form_modal/useProcedureFormModal.ts` — new handlers
- `src/features/procedure/ui/ProcedurePage.tsx` — modal mode routing
- `src/i18n/locales/en/procedure.json` — add `status.overpaid`, `status.overpayment_refund`
- `src/i18n/locales/fr/procedure.json` — same

**Frontend — created**:
- `src/features/overpayment/gateway.ts`
- `src/features/overpayment/index.ts`
- `src/features/overpayment/record_overpayment_modal/RecordOverpaymentModal.tsx`
- `src/features/overpayment/record_overpayment_modal/useRecordOverpaymentModal.ts`
- `src/features/overpayment/record_overpayment_modal/useRecordOverpaymentModal.test.ts`
- `src/features/overpayment/cancel_refund_dialog/CancelRefundDialog.tsx`
- `src/features/overpayment/cancel_refund_dialog/useCancelRefundDialog.ts`
- `src/features/overpayment/cancel_refund_dialog/useCancelRefundDialog.test.ts`
- `src/features/overpayment/shared/validateOverpayment.ts`
- `src/i18n/locales/en/overpayment.json`
- `src/i18n/locales/fr/overpayment.json`
