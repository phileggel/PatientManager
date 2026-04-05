# Règles Métier — Rapprochement Bancaire Automatique via Import PDF (bank-statement-auto-match)

## Contexte

Un praticien reçoit des relevés bancaires (PDF) émis par sa banque, listant les virements reçus de caisses d'assurance maladie. Cette feature permet de **rapprocher automatiquement** ces virements avec les groupes de paiement fond existants, finalisant ainsi le cycle de paiement des actes (Étape 2).

Ce document couvre exclusivement le **flux automatique** : parsing PDF, résolution des labels de fonds, algorithme de matching, révision utilisateur et création des virements bancaires.

---

## Règles métier

### Identification du compte bancaire

**R1 — Résolution du compte via IBAN (backend)** : L'IBAN extrait du PDF est utilisé pour identifier le compte bancaire. Si aucun compte ne correspond, le workflow s'arrête — le compte doit être créé manuellement au préalable.

### Parsing du relevé

**R2 — Données extraites (backend)** : Le parser extrait du relevé : l'IBAN, la période couverte, et les lignes de crédit de type VIR SEPA.

**R3 — Lignes VIR SEPA uniquement (backend)** : Seuls les virements SEPA sont traités. Les autres opérations du relevé (remboursements, virements non-SEPA, frais, etc.) sont ignorées.

**R4 — Lignes non parsées (backend + frontend)** : Le nombre de lignes non reconnues par le parser est affiché en avertissement.

### Résolution des labels de fonds

**R5 — Mapping label → fonds (backend)** : Chaque label de virement (ex. `CPAM93`) est mis en correspondance avec un fonds. Si un mapping confirmé existe pour ce compte et ce label, aucune action utilisateur n'est requise.

**R6 — Suggestion heuristique (backend)** : Pour un label sans mapping connu, le système propose un fonds candidat en extrayant le numéro de caisse du label ou en comparant le label aux noms de fonds connus.

**R7 — Validation des labels inconnus (frontend)** : Si des labels sans mapping confirmé sont détectés, l'utilisateur doit affecter chaque label à un fonds — ou le marquer comme rejeté — avant de poursuivre.

**R8 — Rejet d'un label (frontend + backend)** : Un label rejeté est exclu du matching. Il identifie un virement qui n'est pas un paiement de caisse.

**R9 — Persistence des mappings (backend)** : Tous les choix de l'utilisateur (affectation ou rejet) sont sauvegardés par compte bancaire. Ils sont automatiquement appliqués lors des prochains imports du même compte.

### Algorithme de matching

**R10 — Critères de correspondance (backend)** : Un groupe de paiement fond est candidat pour une ligne de crédit si les trois conditions suivantes sont réunies :

1. Le fonds du groupe correspond au fonds résolu de la ligne
2. Le montant total du groupe est strictement égal au montant de la ligne
3. La date bancaire est dans la tolérance de date (cf. R11)

**R11 — Tolérance de date (backend)** : La date de la ligne bancaire peut être postérieure de 0 à 7 jours à la date du groupe de paiement (délai habituel entre la date comptable de la caisse et la réception du virement). ⚠️ La valeur actuellement implémentée est 6 jours (`MAX_DATE_OFFSET_DAYS = 6`) — à mettre à jour.

**R12 — Priorité aux lignes les plus anciennes (backend)** : Les lignes sont triées par date croissante avant le matching. En cas de conflit (plusieurs lignes candidates pour le même groupe), la ligne la plus ancienne est traitée en priorité.

**R13 — Groupes déjà rapprochés exclus (backend)** : Un groupe déjà associé à un virement bancaire est exclu du pool de matching.

**R14 — Matching exclusif (backend)** : Un groupe et une ligne ne peuvent être associés qu'une seule fois. Dès qu'un match est établi, les deux sont verrouillés pour le reste du traitement.

### Révision et correction manuelle

**R15 — Révision utilisateur (frontend)** : Les résultats du matching automatique sont soumis à validation. L'utilisateur visualise les lignes matchées et non matchées.

**R16 — Surcharge manuelle (frontend)** : L'utilisateur peut modifier une affectation proposée : réaffecter une ligne à un groupe différent ou la désaffecter.

**R17 — Recherche élargie (frontend)** : Un bouton « Élargir la recherche » affiche tous les groupes candidats au-delà du filtre sur le fonds, tout en conservant la tolérance de date. Les groupes sont présentés par ordre de correspondance (montant exact en premier, puis par proximité de date).

**R18 — Lignes non matchées non bloquantes (frontend)** : Une ligne non matchée ne bloque pas la validation. Seules les lignes avec un groupe affecté donnent lieu à la création d'un virement.

### Création des virements et mise à jour des statuts

**R19 — Création du virement bancaire (backend)** : Pour chaque match validé, un virement bancaire est créé et lié au groupe de paiement fond correspondant.

**R20 — Mise à jour des statuts des actes (backend)** : Toutes les actes du groupe passent en statut final :

- `Reconciliated` → `FundPayed` (`actual_payment_amount` = montant de l'acte)
- `PartiallyReconciled` → `PartiallyFundPayed` (`actual_payment_amount` conservé)

**R21 — Verrouillage du groupe (backend)** : Dès qu'un groupe est rapproché au niveau bancaire, il devient verrouillé — il ne peut plus être modifié ni supprimé depuis le flux de rapprochement fond.

**R22 — Mise à jour du statut du groupe (backend)** : Lors de la création du virement bancaire, le groupe de paiement fond associé passe en statut `BankPayed`.

**Champs impactés — à la création des virements**

| Entité | Champ                    | Valeur                                                                       |
| ------ | ------------------------ | ---------------------------------------------------------------------------- |
| Acte   | `payment_status`         | `Reconciliated` → `FundPayed` / `PartiallyReconciled` → `PartiallyFundPayed` |
| Acte   | `payment_method`         | `BankTransfer`                                                               |
| Acte   | `confirmed_payment_date` | = date du virement bancaire                                                  |
| Acte   | `actual_payment_amount`  | = montant de l'acte (`Reconciliated`) / conservé (`PartiallyReconciled`)     |
| Groupe | `status`                 | `Active` → `BankPayed`                                                       |
| Groupe | `is_locked`              | → true                                                                       |

---

## Workflow

```
[Utilisateur sélectionne un fichier PDF]
          │
          ▼
[Parsing du relevé] (backend)
  → Extraction IBAN, période, lignes VIR SEPA
          │
          ▼
[Résolution du compte bancaire] (backend)
  → Recherche par IBAN
  → Si introuvable : arrêt + message utilisateur
          │
          ▼
[Résolution des labels de fonds] (backend)
  → Application des mappings existants
  → Suggestion pour les labels inconnus
          │
          ▼
[Labels inconnus ?]
  → Oui : étape de mapping manuel (frontend)
    → Affectation ou rejet de chaque label
    → Sauvegarde des mappings
  → Non : étape suivante directement
          │
          ▼
[Matching automatique] (backend)
  → Lignes triées par date croissante
  → Matching fonds + montant + tolérance de date
  → Résultat : matchées / non matchées
          │
          ▼
[Révision utilisateur] (frontend)
  → Visualisation des matches proposés
  → Corrections manuelles possibles
          │
          ▼
[Validation] (backend)
  → Création des virements bancaires
  → Actes → FundPayed / PartiallyFundPayed
  → Groupes rapprochés verrouillés
          │
          ▼
[Résumé : nombre de virements créés]
```
