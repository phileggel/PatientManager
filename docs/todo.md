# TODO

## (backend/frontend) — Specta

convertir les objets domain en camelCase lors du passage ds le frontend

## (frontend/fund-payment) — confirmed_payment_date

normalement la date de confirmation de paiement ne devrait pas etre mise à jour par cette opération (on doit attendre le bank-transfer)

## (backend/fund) — Tech Debt fund/patient creation in reconciliation feature

- Actuellement les fund/patient sont créé automatiquement lors d'une réconciliation fund-payment
- est-ce normal ?
- solution ?

## (backend/fund) — Tech debt purpose of FundPaymentLine as domain object

## (frontend) — Toutes les pages
- alignment des "actions" avec les autres pages (consistances des icones)

## (frontend) — BottomBar
- ajouter la version en bas a droite (patient manager v0.7)

## (frontend/procedure) — Page procédure
- fix: recu/en attente toujours egal a 0 (??)

## (frontend/fund-payment-match) — Page Rapprochement Caisse
- supprimer le texte en dessous du titre (doublon)
- vérifier la limite indiquée (10MO, pourquoi?)

## (frontend) — Tech debt — showSnackbar deprecated
8 components still use the backward-compat showSnackbar shim instead of toastService.show()
directly. Should be migrated at some point.

## (backend) — Tech debt - Event emission reduction — Steps 3 & 4
From the previous multi-session work (noted in memory):
- Step 3: Batch patient/fund creation during reconciliation (instead of N individual creations)
- Step 4: Batch group creation events

## (backend) — champs date non validé?
- bank_transfer
`fn validate(_transfer_date: &str, amount: i64, source: &str) -> Result<()>`
- fund_payment_group
  fn validate(fund_id: &str, _payment_date: &str, total_amount: i64) -> Result<()>
- procedure
  gestion des dates?

## (backend) — Sauvegarde + historisation des bases de données
fonction de sauvegarde + gestion historisation des bases de données pour pouvoir revenir en arrière si besoin.

## (frontend/fund-payment-match) — retour sur le précédant
retour sur le précédant, on réavance direct sur le suivant (rapprochement caisse)

## (backend/excel-import) — Reduce import excel logs

## (frontend/fund-payment) — Date range in list
In the list, replace "date" with start date (oldest procedure) and end date (latest procedure)

## (frontend) - add day/night mode with a toggle.

## (backend/fund-payment-reconciliation) — Perf: halve DB calls in duplicate candidate check

In `orchestrator.rs`, `is_duplicate_candidate` is called twice per candidate in both `create_multiple_from_candidates` and `create_multiple_with_auto_corrections` (once to count duplicates, once to filter them). Each call hits the DB.

Fix: collect results into a `Vec<bool>` in the first pass and reuse in the filter pass.

## (backend/fund-payment-reconciliation) — Perf: batch procedure reset on group delete

In `delete_fund_payment_group_with_cleanup`, procedures are reset one by one (`read_procedure` + `update_procedure` per ID, N+N DB round-trips).

Fix: use `read_procedures_by_ids` → mutate in-memory → `update_procedures_batch`. Requires verifying `ProcedureService` exposes a batch update at the service layer.

## fix spec missing tests:
  Highest priority (behavioral regressions possible):
  - R7 — No test for procedure reset to Created when removed from a group
  - R8 — No test for procedure set to Reconciliated + date + amount when added
  - R11 — No integration test for post-delete procedure state reset
  - R10 — No test for is_locked recomputation in read_all_fund_payment_groups

## saisie des actes: champs reçu et en attente ne sont jamais mis à jour

## saisie des actes: le montant, la caisse, la date d'un acte reconcilié ou réglé ne doit pas etre modifiable.

## F10 — Extract logic to dedicated hooks (procedure feature)

The reviewer flagged multiple F10 violations in the procedure feature: business logic (state, memos, callbacks) lives directly in component files instead of colocated hook files. These are deferred because they are large architectural refactors with no functional impact.

### Files to refactor

- **`ProcedurePage.tsx`** → extract to `useProcedurePage.ts`
  - All `useState` (selectedMonth, selectedYear, rows, searchTerm, editingProcedure, pendingDeleteId)
  - `reloadRows`, `handleRowUiSync`, `handleAddNewRow`, `handleEdit`, `handleCloseModal`, `handleDelete`, `handleCancelDelete`, `handleConfirmDelete`, `handleProcedureUpdate`
  - `filteredRows` useMemo + `procedure_updated` event listener useEffect

- **`ProcedureUpdateModal.tsx`** → extract to `useProcedureUpdateModal.ts`
  - All `useState` (patientId, fundId, procedureTypeId, procedureDate, procedureAmount, paymentMethod, paymentDate, loading, submitted)
  - `sortedFunds` (useMemo), `selectedPatient`, `selectedFund`, `handleSubmit`

- **`WorkflowTable.tsx`** → extract to `useWorkflowTable.ts`
  - `useReducer` + all `useMemo` (tableContext, latestDate, actions, bundle)
  - `useTableLifeCycle` and `useTablePersistance` (move from module-level functions to the hook file)
  - Sync draft `useEffect`

- **`PeriodSelector.tsx`** → extract to `usePeriodSelector.ts`
  - `navigateMonth`, `canGoPrev`, `canGoNext`, months/years array computation

- **`SummaryStats.tsx`** → extract to `useSummaryStats.ts`
  - `uniquePatients`, `procedureCount`, `totalAmount`, `totalReceived`, `totalAwaited` (all with useMemo)

- **`CreatePatientForm.tsx`** / **`CreateFundForm.tsx`** (minor)
  - Move `validator` and `toFormData` inline literals to module-level constants to stabilize references passed to `useCreateEntityForm`
