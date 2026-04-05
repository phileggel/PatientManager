# Règles métier — Saisie des actes (Procedure Orchestration)

## Contexte

La page de saisie des actes est l'écran principal de saisie. Elle permet aux praticiens
d'enregistrer les actes médicaux mois par mois, via une liste en lecture seule. Les actes
sont créés via un formulaire modal et édités via ce même modal. La saisie inline a été
supprimée au profit du workflow modal.

Côté backend, la feature repose sur `use_cases/procedure_orchestration/` qui orchestre les
contextes `patient`, `fund` et `procedure` : validation des FK, inférence du statut de
paiement, et mise à jour du suivi patient en tant qu'effets de bord.

---

## Règles frontend

**R1 — Filtre par période** : Les actes sont filtrés par mois et année. Par défaut, la période correspond au mois et à l'année en cours. La période sélectionnée persiste entre les navigations via `sessionStorage` (`procedureSelectedMonth`, `procedureSelectedYear`).

> _R2 et R3 ont été supprimés._

**R4 — Pré-remplissage à la sélection du patient** : En mode création, lorsqu'un patient
est sélectionné dans le modal, le fonds, le type d'acte et le montant sont pré-remplis
depuis le dernier acte enregistré du patient (`latest_fund`, `latest_procedure_type`,
`latest_procedure_amount`). La date du jour est également pré-remplie si aucune date n'a
encore été saisie.

**R5 — Confirmation avant suppression** : La suppression d'un acte requiert toujours une `ConfirmationDialog`. Aucune ligne ne peut être supprimée sans confirmation explicite. La suppression est bloquée (frontend + backend) pour les actes en statut `Reconciliated`, `PartiallyReconciled`, `FundPayed`, `PartiallyFundPayed` ou `DirectlyPayed` — ces actes sont rattachées à un groupe de paiement fond ou à une transaction bancaire directe ; les supprimer rendrait ces enregistrements incohérents. Pour les supprimer, il faut d'abord supprimer le virement, le groupe de paiement fond ou le paiement direct associé. Côté frontend, le bouton de suppression est `disabled` (`isBlockingStatus`) pour ces statuts. Côté backend, `delete_procedure` vérifie le statut avant suppression et retourne une erreur explicite.

**R6 — Édition via modal** : Les actes enregistrés peuvent être édités dans `ProcedureFormModal` (mode="edit"), sauf pour les actes dont la suppression est bloquée (statuts `Reconciliated`, `PartiallyReconciled`, `FundPayed`, `PartiallyFundPayed`, `DirectlyPayed`) qui s'ouvrent en mode lecture seule (cf. R26). Pour les actes éditables, le modal pré-remplit tous les champs depuis l'acte existante. Champs éditables : `patient_id`, `fund_id`, `procedure_type_id`, `procedure_date`, `procedure_amount`, `payment_method`, `confirmed_payment_date`. Champs en lecture seule : `payment_status` et `actual_payment_amount` (affichés à titre informatif, transmis tels quels lors de la mise à jour). Note : `payment_method` et `confirmed_payment_date` ne sont disponibles qu'en mode édition — la commande `add_procedure` ne les expose pas (cf. R15).

**R7 — Statistiques agrégées** : La barre d'en-tête affiche des statistiques agrégées pour les lignes filtrées (période + recherche) : nombre de patients uniques, nombre d'actes, total facturé (`procedureAmount`), total perçu (`actualPaymentAmount`), et total attendu (`max(0, procedureAmount − actualPaymentAmount)` par ligne). Les lignes brouillon (actes dont le champ `isDraft` est vrai, correspondant aux actes en cours de saisie pour la période active) sont exclues de toutes les statistiques.

**R8 — Rafraîchissement sur événement** : Lorsque le backend émet un événement
`procedure_updated` (relayé par `useAppInit`), la liste des actes est rafraîchie
automatiquement. Les échecs de rechargement doivent être loggés et affichés à l'utilisateur
via un toast.

**R9 — Création d'entité inline** : Depuis le champ patient ou fonds **en mode création uniquement**, le praticien peut créer un nouveau patient ou un nouveau fonds sans fermer le modal. Le formulaire de création apparaît dans un modal imbriqué ; à la validation, la nouvelle entité est automatiquement sélectionnée. Cette fonctionnalité n'est pas disponible en mode édition.

**R10 — Badge de statut** : Le statut de paiement de chaque acte est affiché sous forme de
badge coloré. Correspondance avec les tokens M3 :

- `NONE` → `bg-m3-surface-container-high` / `text-m3-on-surface-variant`
- `CREATED` → `bg-m3-secondary-container` / `text-m3-on-secondary-container`
- `RECONCILIATED`, `PARTIALLY_RECONCILED` → `bg-m3-tertiary-container` / `text-m3-on-tertiary-container`
- `DIRECTLY_PAYED`, `FUND_PAYED`, `PARTIALLY_FUND_PAYED`, `IMPORT_DIRECTLY_PAYED`, `IMPORT_FUND_PAYED` →
  `bg-m3-primary-container` / `text-m3-on-primary-container`

> **Note sur `NONE`** : ce statut est la valeur initiale par défaut du modèle domaine Rust. Il n'est jamais assigné par cette feature à la création (cf. R16 — le minimum assigné est `Created`). Il peut apparaître sur des données héritées antérieures à la formalisation du cycle de statuts. Une acte `NONE` est traitée comme éligible à la suppression et à l'édition.

**R11 — Filtre par recherche** : Une recherche libre filtre les lignes de la période par nom de patient, nom de l'acte, nom du fonds ou numéro de sécurité sociale (SSN). Ce filtre et le filtre par statut (R25) sont appliqués cumulativement.

**R12 — FAB pour créer** : Un Floating Action Button (FAB, bas-droite, 56×56 px,
`rounded-full`) ouvre `ProcedureFormModal` en mode création. Le tableau occupe toute la
largeur du contenu.

**R27 — Validation du formulaire (frontend)** : Trois champs sont obligatoires dans le formulaire de création et d'édition : le patient (`patient_id`), le type d'acte (`procedure_type_id`) et la date de réalisation (`procedure_date`). Un message d'erreur est affiché par champ manquant et un toast d'erreur global est déclenché. Le montant (`procedure_amount`) et le fonds (`fund_id`) sont optionnels — une acte peut être enregistrée sans montant ni fonds.

---

## Règles backend

**R13 — Validation des champs obligatoires** : Un acte requiert un `patient_id`, un
`procedure_type_id` et une `procedure_date` non vides. Les deux champs date
(`procedure_date`, `confirmed_payment_date`) doivent être au format ISO 8601 (YYYY-MM-DD) ;
un format invalide est rejeté à la construction de l'objet domaine. `fund_id` est optionnel.

**R14 — Validation d'existence des FK à la création** : Avant persistance, l'orchestration
vérifie que `patient_id` et `procedure_type_id` référencent des entités existantes. Si
`fund_id` est fourni, le fonds doit également exister. Toute référence manquante interrompt
la création avec une erreur.

**R15 — Inférence du mode de paiement à la création** : À la création ou à l'import uniquement, `payment_method` est déterminé depuis les données brutes. En création via le formulaire frontend, la commande `add_procedure` n'expose pas les paramètres `payment_method` ni `confirmed_payment_date` — la méthode est donc toujours `None` et le statut initial est toujours `Created` (cf. R16). À l'import Excel, les codes de la colonne `T` sont traduits : code `"ES"` → `Cash` ; code `"CH"` → `Check` ; date présente + tout autre code ou absent → `BankTransfer`. Après création, `payment_method` est modifiable librement via le formulaire d'édition (R6, R18) ou atomiquement par les use cases de réconciliation (cf. specs dédiées).

**R16 — Détermination du statut initial** : Le statut est calculé par l'orchestration,
jamais accepté tel quel depuis l'appelant. Un acte est « payé » si (`confirmed_payment_date`
présente ET `actual_payment_amount > 0`) OU (`actual_payment_amount >= procedure_amount`).
Non payé → `Created`. Payé + (méthode ES/CH OU pas de fonds) → `ImportDirectlyPayed`. Payé

- méthode non ES/CH + fonds présent → `ImportFundPayed`. `None` n'est jamais assigné à la
  création.

**R17 — awaited_amount ignoré** : La valeur `awaited_amount` transmise par l'appelant est
toujours ignorée et jamais persistée.

**R18 — Mise à jour libre via le frontend** : La commande `update_procedure` accepte tous les champs d'un acte (`patient_id`, `fund_id`, `procedure_type_id`, `procedure_date`, `procedure_amount`, `payment_method`, `confirmed_payment_date`, `actual_payment_amount`, `payment_status`) sans ré-inférence. Aucune validation de FK n'est effectuée à la mise à jour — choix délibéré : la mise à jour via le frontend est une opération de correction directe, et le frontend est responsable des valeurs envoyées. Seuls les champs exposés par R6 sont modifiables depuis l'interface.

**R19 — Suivi patient à la création** : Après une création réussie (unitaire ou batch), si
`procedure_date > patient.latest_date` (ou `latest_date` est null), l'orchestration met à
jour les champs de suivi du patient : `latest_date`, `latest_procedure_type`, `latest_fund`,
`latest_procedure_amount`. En mode batch, la procédure la plus récente du lot est identifiée
par patient et une seule mise à jour est appliquée par patient. Si la nouvelle acte n'a pas
de fonds (`fund_id` absent — acte à paiement direct), `latest_fund` doit être effacé pour
refléter que le dernier acte connu n'est plus rattaché à un fonds.

> **Limitation connue** : l'implémentation actuelle ne met à jour `latest_fund` que si
> `fund_id` est présent — elle ne l'efface pas lorsque l'acte la plus récente n'a pas de
> fonds. Ce comportement est à corriger.

**R20 — Suivi patient à la suppression** : Après la suppression d'un acte, si le patient n'a plus aucune procédure et que `latest_date` est renseigné, les quatre champs de suivi sont effacés. Limitation connue : si l'acte supprimée était la plus récente mais que le patient a d'autres actes, les champs de suivi ne sont pas recalculés — ils conservent leurs anciennes valeurs jusqu'à la création d'un acte plus récent.

**R21 — Effacement en cascade à la suppression d'un type d'acte** : Lorsqu'un type d'acte
est supprimé, tout patient dont `latest_procedure_type` référence ce type voit
`latest_procedure_type` et `latest_date` effacés.

**R22 — Effacement en cascade à la suppression d'un fonds** : Lorsqu'un fonds est supprimé,
tout patient dont `latest_fund` référence ce fonds voit `latest_fund` effacé.

**R23 — Création en batch : transaction unique et un seul événement** : `create_batch`
persiste toutes les procédures dans une seule transaction et publie exactement un événement
`ProcedureUpdated`, quelle que soit la taille du lot.

**R24 — Tri de la liste** : La liste des actes ne possède pas de tri par défaut. L'utilisateur peut déclencher un tri sur les colonnes suivantes : nom du patient, date de l'acte, montant facturé, statut. Chaque colonne suit un cycle à trois états : croissant → décroissant → sans tri. Un seul tri est actif à la fois.

**R25 — Filtre par statut** : Un sélecteur dédié permet de restreindre l'affichage à un statut de paiement précis. Ce filtre est indépendant de la recherche textuelle (R11) ; les deux filtres sont appliqués cumulativement sur les lignes de la période.

**R26 — Consultation en lecture seule** : Les actes dont la suppression est bloquée (cf. R5 — statuts `Reconciliated`, `PartiallyReconciled`, `FundPayed`, `PartiallyFundPayed`, `DirectlyPayed`) doivent pouvoir être consultées dans un modal en lecture seule (mode="view"). Tous les champs sont affichés mais non modifiables. Le bouton de sauvegarde est absent ; le bouton de suppression est absent ou désactivé.

---

## Cycle de vie des statuts

Cette feature est responsable de la **création** des actes uniquement. Les transitions de statut ultérieures sont gérées par d'autres features.

### Statuts créés par cette feature

| Statut initial        | Condition                                         | Déclencheur                         |
| --------------------- | ------------------------------------------------- | ----------------------------------- |
| `Created`             | Acte sans paiement confirmé                       | Formulaire frontend ou import Excel |
| `ImportDirectlyPayed` | Paiement confirmé + méthode ES/CH ou sans fonds   | Import Excel uniquement             |
| `ImportFundPayed`     | Paiement confirmé + méthode autre + fonds présent | Import Excel uniquement             |

### Transitions gérées par d'autres features

| De                    | Vers                                    | Feature responsable                                                |
| --------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `Created`             | `Reconciliated` / `PartiallyReconciled` | fund-payment-auto-match, fund-payment-manual-match                 |
| `Created`             | `DirectlyPayed`                         | bank-statement-manual-match                                        |
| `Reconciliated`       | `FundPayed`                             | bank-statement-auto-match, bank-statement-manual-match             |
| `PartiallyReconciled` | `PartiallyFundPayed`                    | bank-statement-auto-match, bank-statement-manual-match             |
| `FundPayed`           | → `Reconciliated` (retour)              | Suppression du virement — bank-statement-manual-match (R8)         |
| `PartiallyFundPayed`  | → `PartiallyReconciled` (retour)        | Suppression du virement — bank-statement-manual-match (R8)         |
| `DirectlyPayed`       | → `Created` (retour)                    | Suppression du paiement direct — bank-statement-manual-match (R16) |

### Actions autorisées par statut (cette feature)

| Statut                | Suppression             | Édition                   |
| --------------------- | ----------------------- | ------------------------- |
| `None`                | oui (avec confirmation) | oui                       |
| `Created`             | oui (avec confirmation) | oui                       |
| `ImportDirectlyPayed` | oui (avec confirmation) | oui                       |
| `ImportFundPayed`     | oui (avec confirmation) | oui                       |
| `DirectlyPayed`       | non — bloquée           | non — lecture seule (R26) |
| `Reconciliated`       | non — bloquée           | non — lecture seule (R26) |
| `PartiallyReconciled` | non — bloquée           | non — lecture seule (R26) |
| `FundPayed`           | non — bloquée           | non — lecture seule (R26) |
| `PartiallyFundPayed`  | non — bloquée           | non — lecture seule (R26) |

---

## Structure des composants

```
procedure/
  api/
    gateway.ts                        — tous les appels Tauri de la feature
    procedureService.ts               — service de haut niveau (opérations multi-étapes)
  hooks/
    useProcedureData.ts               — charge patients/fonds/types ; expose deleteRow
    useProcedurePeriod.ts             — filtre par mois/année sélectionnés ; dérive yearRange
    useCreateEntityForm.ts            — hook générique pour les formulaires create-patient / create-fund
  model/
    procedure-row.types.ts            — interface ProcedureRow (représentation UI)
    procedure-row.mapper.ts           — Procedure → ProcedureRow (montants : millièmes → euros)
    date.logic.ts                     — getMonthName, formatDateDisplay, helpers de période
    index.ts                          — ré-exports
  ui/
    ProcedurePage.tsx                 — page principale (sélecteur de période, recherche, stats, liste, FAB, modal)
    PeriodSelector.tsx                — dropdowns CompactSelectField mois/année + flèches de navigation
    SummaryStats.tsx                  — barre de statistiques agrégées (patients, actes, facturé, perçu, attendu)
    ui.styles.ts                      — constantes partagées TABLE_STYLES / COL_WIDTHS
    procedure_list/
      ProcedureList.tsx               — tableau en lecture seule (toutes les lignes de la période filtrée)
      StatusBadge.tsx                 — badge de statut de paiement coloré
    procedure_form_modal/
      ProcedureFormModal.tsx          — modal unifié création/édition (prop mode)
      useProcedureFormModal.ts        — état du formulaire, validation, pré-remplissage (R4), appels gateway
    form/
      CreatePatientForm.tsx           — modal imbriqué pour la création inline de patient (R9)
      CreateFundForm.tsx              — modal imbriqué pour la création inline de fonds (R9)
```
