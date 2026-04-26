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

## (frontend/procedure) — Page procédure

- fix: recu/en attente toujours egal a 0 (??) → à vérifier en prod : `actualPaymentAmount` est calculé dans SummaryStats, `awaitedAmount` calculé côté frontend (procedureAmount - actualPaymentAmount)

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

## (frontend/fund-payment-match) — retour sur le précédant

retour sur le précédant, on réavance direct sur le suivant (rapprochement caisse)

## (backend/excel-import) — Reduce import excel logs

## (frontend/fund-payment) — Date range in list

In the list, replace "date" with start date (oldest procedure) and end date (latest procedure)

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

## saisie des actes: champs reçu et en attente ne sont jamais mis à jour → doublon avec todo ci-dessus, à vérifier en prod

## (backend/procedure-orchestration) — Suivi patient non recalculé à la suppression du dernier acte (R20)

Si l'acte supprimée était la plus récente mais que le patient a d'autres actes, les champs de suivi (`latest_date`, `latest_procedure_type`, `latest_fund`, `latest_procedure_amount`) ne sont pas recalculés — ils conservent des valeurs "fantômes". Cela fausse le pré-remplissage R4 pour le prochain acte du patient. À corriger dans `use_cases/procedure_orchestration/` : chercher le nouvel acte le plus récent du patient après suppression et mettre à jour les champs en conséquence.

## (backend/procedure-orchestration) — latest_fund non effacé quand le dernier acte n'a pas de fonds

R19 de `procedure-orchestration-spec.md` : `ProcedureOrchestrationService::create_batch()` ne remet pas `latest_fund` à `None` lorsque l'acte la plus récente du patient n'a pas de `fund_id`. Le champ conserve l'ancienne valeur jusqu'à la création d'un acte plus récent avec un fonds. À corriger dans `use_cases/procedure_orchestration/`.

## (frontend/procedure) — Infos patient par défaut si type d'acte supprimé

Lors de l'affichage des informations par défaut d'un patient (latest_procedure_type), le type d'acte référencé peut avoir été supprimé. La spec `procedure-type-spec.md` ne couvre pas ce cas : à documenter dans la spec d'ajout d'acte et à gérer côté frontend (affichage dégradé ou fallback).

## F10 — Extract logic to dedicated hooks (procedure feature)

The reviewer flagged multiple F10 violations in the procedure feature: business logic (state, memos, callbacks) lives directly in component files instead of colocated hook files. These are deferred because they are large architectural refactors with no functional impact.

## (frontend/fund-payment-match) — Créer plusieurs procédures lors de la correction automatique

Actuellement, la correction automatique (rapprochement caisse) ne permet de créer qu'une seule procédure. Il faudrait pouvoir en créer plusieurs dans la même opération.

## (frontend/fund-payment-match) — Impression du rapport après rapprochement : centrage et contenu

Le document imprimé après rapprochement n'est pas correctement centré — une partie du contenu est coupée. À corriger. Amélioration complémentaire : lister dans le rapport les corrections automatiques effectuées.

## (backend/procedure) — Format de date invalide sur confirmed_payment_date lors de la mise à jour

Lors de la mise à jour d'une procédure, une erreur "invalid confirmed payment date format" est déclenchée. À investiguer et corriger.

## (backend/frontend) — Structured errors: replace anyhow/String with typed error variants

Tauri commands currently return `Result<T, String>` (via `anyhow` formatted with `{:#}`). Replace with a typed error enum per domain, serialized via Specta, so the frontend can pattern-match on error codes instead of parsing strings. Scope: define error enums in each bounded context, expose via Specta, update gateway.ts to switch on error type.

## (frontend/excel-import) — Déclencher l'import directement depuis le bouton

Le bouton d'import devrait ouvrir directement le sélecteur de fichier, sans naviguer vers une page dédiée qui ne contient qu'un seul bouton. Supprimer la page intermédiaire ou intégrer le sélecteur dans la navigation existante.
