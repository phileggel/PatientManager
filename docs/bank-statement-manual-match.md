# Règles Métier — Rapprochement Bancaire Manuel (bank-statement-manual-match)

## Contexte

Un praticien peut enregistrer manuellement des encaissements, qu'ils proviennent de virements de caisses d'assurance maladie (`FUND`) ou de paiements directs de patients (chèque, carte bancaire, espèces). Cette feature permet de **créer et gérer** ces transactions et de mettre à jour les statuts des actes — et, pour les virements `FUND`, des groupes de paiement fond correspondants.

Ce document couvre exclusivement le **flux manuel** : saisie directe de transactions.

---

## Règles métier

### Cycle de statut des actes

**R1 — Cycles de statut (backend)** : Deux cycles distincts selon le type de transaction :

- **Cycle fond** (virement `FUND`) : l'acte passe par deux étapes — d'abord le rapprochement fond (`Created` → `Reconciliated` / `PartiallyReconciled`), puis le rapprochement bancaire (`Reconciliated` → `FundPayed`, `PartiallyReconciled` → `PartiallyFundPayed`). Ce document couvre l'Étape 2.
- **Cycle direct** (paiement direct `CHECK`, `CREDIT_CARD`, `CASH`) : l'acte passe directement de `Created` à `DirectlyPayed` en une seule étape — pas de rapprochement fond préalable. La méthode de paiement, la date et le montant réel de paiement sont renseignés.

Un groupe de paiement fond devient verrouillé dès qu'une de ses actes atteint l'Étape 2 du cycle fond — il ne peut plus être modifié ni supprimé. Le déverrouillage ne peut s'effectuer qu'en supprimant le virement associé (cf. R8).

### Règles communes aux transactions

**R2 — Types de transaction (backend)** : Quatre types sont supportés : `FUND` (virement caisse), `CHECK` (chèque), `CREDIT_CARD` (carte bancaire), `CASH` (espèces —).

**R3 — Champs d'une transaction (frontend + backend)** : Une transaction est définie par un compte bancaire, une date et un type. Le montant est calculé dynamiquement à partir des éléments sélectionnés (groupes ou actes) et ne peut pas être saisi manuellement.Ce calcul dynamique n'est pas encore implémenté. Exception pour le type `CASH` : cf. R13.

**R4 — Type immuable (frontend + backend)** : Le type d'une transaction ne peut pas être modifié une fois défini. Il est impossible de passer de `FUND` à un type direct (ou inversement), ni de changer de type au sein des types directs (`CHECK`, `CREDIT_CARD`, `CASH`).

**R5 — Suppression d'une transaction (frontend + backend)** : La suppression nécessite une confirmation explicite. Elle est irréversible — la transaction est définitivement effacée ainsi que ses liens avec les groupes de paiement fond ou les actes associées.La suppression définitive (hard delete) n'est pas encore implémentée — la suppression est actuellement réversible.

### Virements de type FUND

**R6 — Création : sélection des groupes (frontend + backend)** : L'utilisateur sélectionne un ou plusieurs groupes de paiement fond parmi ceux non encore rapprochés au niveau bancaire, dont la date de paiement est dans les 7 jours précédant la date du virement. L'interface de sélection est similaire à celle de la gestion des actes dans les groupes de paiement fond. Le montant du virement est la somme des montants totaux des groupes sélectionnés.

**R7 — Création : effets sur les statuts (backend)** : À la validation, les actes des groupes sélectionnés passent en statut final (`Reconciliated` → `FundPayed`, `PartiallyReconciled` → `PartiallyFundPayed`) et les groupes passent en statut `BankPayed`. Voir tableau « Champs impactés — à la création du virement ».

**R8 — Suppression : remise en état (backend)** : La suppression d'un virement `FUND` remet les actes des groupes associés dans leur état antérieur (`FundPayed` → `Reconciliated`, `PartiallyFundPayed` → `PartiallyReconciled`) et fait repasser les groupes en statut `Active`. La date de paiement confirmée des actes est restaurée à la date du groupe de paiement fond.

**R9 — Modification : champs modifiables (frontend + backend)** : La date du virement et la composition des groupes sélectionnés peuvent être modifiées. Les mêmes règles de sélection qu'à la création s'appliquent (fenêtre de 7 jours, recherche élargie via R12). Le montant est recalculé en conséquence.

**R10 — Modification : ajout d'un groupe (backend)** : L'ajout d'un groupe a les mêmes effets sur les statuts des actes et du groupe qu'à la création (cf. R7).

**R11 — Modification : retrait d'un groupe (backend)** : Le retrait d'un groupe a les mêmes effets sur les statuts des actes et du groupe qu'à la suppression (cf. R8).

**R12 — Recherche élargie (frontend)** : Lorsque le groupe recherché n'apparaît pas dans la sélection initiale (hors fenêtre de 7 jours), un bouton "Élargir la recherche" ouvre un modal affichant tous les groupes non encore rapprochés au niveau bancaire, sans contrainte de date. Filtrable par caisse (identifiant ou nom). Classés par date de paiement décroissante. Disponible à la création et à la modification.

**Champs impactés — à la création du virement**

| Entité | Champ | Valeur |
|---|---|---|
| Acte | `payment_status` | `Reconciliated` → `FundPayed` / `PartiallyReconciled` → `PartiallyFundPayed` |
| Acte | `payment_method` | `BankTransfer` |
| Acte | `confirmed_payment_date` | = date du virement |
| Acte | `actual_payment_amount` | conservé |
| Groupe | `status` | `Active` → `BankPayed` |
| Groupe | `is_locked` | → true |

**Champs impactés — à la suppression du virement**

| Entité | Champ | Valeur |
|---|---|---|
| Acte | `payment_status` | `FundPayed` → `Reconciliated` / `PartiallyFundPayed` → `PartiallyReconciled` |
| Acte | `payment_method` | effacé |
| Acte | `confirmed_payment_date` | = date du groupe |
| Acte | `actual_payment_amount` | conservé |
| Groupe | `status` | `BankPayed` → `Active` |
| Groupe | `is_locked` | → false |

### Paiements directs (CHECK / CREDIT_CARD / CASH)

**R13 — Compte automatique pour le type CASH (frontend + backend)** : Pour une transaction de type `CASH`, le compte est automatiquement celui du compte caisse par défaut — aucune sélection de compte n'est proposée à l'utilisateur.

**R14 — Création : sélection des actes (frontend + backend)** : L'utilisateur sélectionne une ou plusieurs actes en statut `Created` dont la date de réalisation (`procedure_date`) est dans les 7 jours précédant la date du paiement. L'interface de sélection est similaire à celle de la gestion des actes dans les groupes de paiement fond. Le montant du paiement est la somme des montants des actes sélectionnées.

**R15 — Création : effets sur les statuts (backend)** : À la validation, chaque acte reçoit la méthode de paiement correspondante, sa date et son montant réel de paiement sont renseignés, et son statut passe à `DirectlyPayed`. Voir tableau « Champs impactés — à la création du paiement ».

**R16 — Suppression : remise en état (backend)** : La suppression d'un paiement direct remet les actes associées en statut `Created` et efface leur méthode de paiement, leur date et leur montant réel de paiement.

**R17 — Modification : champs modifiables (frontend + backend)** : La date du paiement et la composition des actes sélectionnées peuvent être modifiées. Les mêmes règles de sélection qu'à la création s'appliquent (fenêtre de 7 jours, recherche élargie via R20). Le montant est recalculé en conséquence.

**R18 — Modification : ajout d'une acte (backend)** : L'ajout d'une acte a les mêmes effets sur ses statuts et champs qu'à la création (cf. R15).

**R19 — Modification : retrait d'une acte (backend)** : Le retrait d'une acte a les mêmes effets sur ses statuts et champs qu'à la suppression (cf. R16).

**R20 — Recherche élargie (frontend)** : Lorsque l'acte recherchée n'apparaît pas dans la sélection initiale (hors fenêtre de 7 jours), un bouton "Élargir la recherche" ouvre un modal affichant toutes les actes en statut `Created`, sans contrainte de date. Recherche par nom de patient, SSN ou date de réalisation. Classées par `procedure_date` décroissante. Disponible à la création et à la modification.

**Champs impactés — à la création du paiement**

| Entité | Champ | Valeur |
|---|---|---|
| Acte | `payment_status` | `Created` → `DirectlyPayed` |
| Acte | `payment_method` | `Check` / `BankCard` / `Cash` (selon le type `CHECK` / `CREDIT_CARD` / `CASH`) |
| Acte | `confirmed_payment_date` | = date du paiement |
| Acte | `actual_payment_amount` | = montant de l'acte |

**Champs impactés — à la suppression du paiement**

| Entité | Champ | Valeur |
|---|---|---|
| Acte | `payment_status` | `DirectlyPayed` → `Created` |
| Acte | `payment_method` | effacé |
| Acte | `confirmed_payment_date` | effacé |
| Acte | `actual_payment_amount` | effacé |

---

## Workflow

### Saisie d'un virement FUND

```
[Utilisateur choisit le type FUND, le compte et la date]
          │
          ▼
[Sélection des groupes de paiement fond]
  → Groupes non encore rapprochés au niveau bancaire
  → Dans les 7 jours précédant la date du virement
  → Montant total calculé en temps réel
  → [Élargir la recherche]→ modal : tous les groupes, filtre caisse, tri date desc
          │
          ▼
[Validation]
  → Groupes → BankPayed, actes → FundPayed / PartiallyFundPayed
```

### Saisie d'un paiement direct (CHECK / CREDIT_CARD / CASH)

```
[Utilisateur choisit le type, le compte et la date]
          │
          ▼
[Sélection des actes]
  → Actes en statut Created
  → Dans les 7 jours précédant la date du paiement
  → Montant total calculé en temps réel
  → [Élargir la recherche] → toutes les actes, recherche patient/SSN/date, tri procedure_date desc
          │
          ▼
[Validation]
  → Actes → DirectlyPayed
```

### Modification d'un virement FUND

```
[Utilisateur modifie la date et/ou la sélection des groupes]
  → Groupes non encore rapprochés au niveau bancaire
  → Dans les 7 jours précédant la date du virement
  → [Élargir la recherche] → tous les groupes, filtre caisse, tri date desc
  → Montant recalculé en temps réel
          │
          ▼
[Validation]
  → Anciens groupes → Active, nouveaux groupes → BankPayed
  → Statuts des actes mis à jour en conséquence
```

### Modification d'un paiement direct (CHECK / CREDIT_CARD / CASH)

```
[Utilisateur modifie la date et/ou la sélection des actes]
  → Actes en statut Created
  → Dans les 7 jours précédant la date du paiement
  → [Élargir la recherche] → toutes les actes, recherche patient/SSN/date, tri procedure_date desc
  → Montant recalculé en temps réel
          │
          ▼
[Validation]
  → Anciennes actes → Created, nouvelles actes → DirectlyPayed
```

### Suppression d'un virement FUND

```
[Utilisateur supprime un virement FUND]
  → Confirmation explicite requise
          │
          ▼
[Virement et liens supprimés définitivement]
  → Actes et groupes remis dans leur état antérieur (Active / Reconciliated)
```

### Suppression d'un paiement direct (CHECK / CREDIT_CARD / CASH)

```
[Utilisateur supprime un paiement direct]
  → Confirmation explicite requise
          │
          ▼
[Paiement et liens supprimés définitivement]
  → Actes remises en statut Created
```
