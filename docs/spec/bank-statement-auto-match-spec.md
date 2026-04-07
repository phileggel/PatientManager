# Règles Métier — Rapprochement Bancaire Automatique via Import PDF (bank-statement-auto-match)

## Contexte

Un praticien reçoit des relevés bancaires (PDF) émis par sa banque, listant les virements reçus de caisses d'assurance maladie. Cette feature permet de **rapprocher automatiquement** ces virements avec les groupes de paiement fond existants, finalisant ainsi le cycle de paiement des actes (Étape 2).

Ce document couvre exclusivement le **flux automatique** : parsing PDF, résolution des labels de fonds, révision obligatoire des mappings par l'utilisateur, algorithme de matching, révision utilisateur et création des virements bancaires.

---

## Règles métier

### Identification du compte bancaire

**R1 — Résolution du compte via IBAN (backend)** : L'IBAN extrait du PDF est utilisé pour identifier le compte bancaire. Si aucun compte ne correspond, le workflow s'arrête — le compte doit être créé manuellement au préalable.

### Parsing du relevé

**R2 — Données extraites (backend)** : Le parser extrait du relevé : l'IBAN, la période couverte, et les lignes de crédit de type VIR SEPA.

**R3 — Lignes VIR SEPA uniquement (backend)** : Seuls les virements SEPA sont traités. Les autres opérations du relevé (remboursements, virements non-SEPA, frais, etc.) sont ignorées.

**R4 — Lignes non parsées (backend + frontend)** : Le nombre de lignes non reconnues par le parser est affiché en avertissement.

### Résolution des labels de fonds

**R8 — Rejet d'un label (frontend + backend)** : Un label peut être marqué comme rejeté — il identifie un virement qui n'est pas un paiement de caisse. Un label rejeté est exclu du matching. Le rejet est une affectation valide au même titre qu'un fonds.

**R5 — Mapping label → fonds (backend)** : Chaque label de virement (ex. `CPAM93`) est mis en correspondance avec un fonds. Si un mapping existant est trouvé pour ce compte et ce label, la valeur sauvegardée (fonds ou rejeté, cf. R8) est transmise au frontend pour pré-remplissage.

**R6 — Suggestion heuristique (backend)** : Pour un label sans mapping connu, le système tente d'identifier un fonds candidat en deux étapes, dans cet ordre de priorité :

1. **Extraction préfixée** : le système recherche dans le label une séquence de chiffres immédiatement précédée du préfixe `CPAM` ou `CAISSE` (insensible à la casse). Si cette séquence correspond exactement au `fund_identifier` d'un fonds connu, ce fonds est retenu.
2. **Correspondance de noms** (fallback) : le label (en majuscules) est comparé au nom de chaque fonds connu (en majuscules, espaces supprimés). Le score de correspondance est : longueur du nom du fonds si le label le contient entièrement, longueur du label si le nom du fonds le contient entièrement, ou longueur du préfixe commun sinon. Le fonds avec le meilleur score est retenu si ce score atteint au moins 3 caractères.

La suggestion, si elle existe, est transmise au frontend à titre indicatif (cf. R28).

**R28 — Affichage de la suggestion heuristique (frontend)** : Lorsqu'une suggestion existe pour un label inconnu (cf. R6), elle est affichée comme texte d'aide sous le champ de sélection. Elle n'est jamais pré-sélectionnée dans le champ. Si aucune suggestion n'existe pour un label inconnu, rien n'est affiché sous le champ.

**R7 — Étape de mapping toujours obligatoire (frontend)** : L'étape de mapping est toujours affichée pour l'ensemble des labels extraits du relevé — y compris les labels dont le mapping est déjà connu (pré-remplis avec leur valeur sauvegardée) et les labels inconnus (champ vide). L'utilisateur peut modifier n'importe quelle affectation avant de valider.

**R9 — Persistence des mappings (frontend + backend)** : À la validation de l'étape de mapping, le frontend transmet l'ensemble des affectations affichées (tous les labels, modifiés ou non). Le backend sauvegarde chaque affectation (fonds ou rejeté, cf. R8) par un upsert, la clé d'unicité étant la combinaison `(compte bancaire, label)`. Les valeurs sauvegardées servent de pré-remplissage lors des prochains imports du même compte.

**R23 — Champ vide pour label inconnu (frontend)** : Pour un label n'ayant aucun mapping sauvegardé, le champ de sélection est affiché vide — aucune valeur par défaut ni suggestion n'est pré-sélectionnée. L'utilisateur doit effectuer un choix explicite (fonds ou rejet).

**R24 — Bouton "Accepter" — position fixe (frontend)** : L'étape de mapping affiche un bouton "Accepter" positionné en haut du modal, en position fixe afin de rester visible pendant le défilement de la liste des labels.

**R25 — Bouton "Accepter" — condition d'activation (frontend)** : Le bouton "Accepter" est désactivé tant qu'au moins un label n'a pas de sélection — ni via un mapping sauvegardé pré-rempli, ni via un choix manuel effectué dans la session courante. Il devient actif dès que tous les labels ont une affectation (fonds ou rejeté, cf. R8).

**R26 — Absence de lignes VIR SEPA (backend + frontend)** : Si le relevé ne contient aucune ligne VIR SEPA après filtrage (cf. R3), le backend retourne une erreur structurée distincte d'un résultat vide. Le frontend affiche un message d'erreur explicite et interrompt le workflow — aucune étape suivante n'est accessible.

**R27 — Ordre d'affichage des labels dans l'étape de mapping (frontend)** : Les labels sont affichés en deux blocs :

1. Labels sans mapping sauvegardé (inconnus), triés par ordre alphabétique du label.
2. Labels avec mapping sauvegardé (fonds ou rejeté, cf. R8), triés par ordre alphabétique du label.

Au sein de chaque bloc, le tri est strictement alphabétique sur le label tel qu'il apparaît dans le relevé.

### Algorithme de matching

**R10 — Critères de correspondance (backend)** : Un groupe de paiement fond est candidat pour une ligne de crédit si les trois conditions suivantes sont réunies :

1. Le fonds du groupe correspond au fonds résolu de la ligne
2. Le montant total du groupe est strictement égal au montant de la ligne
3. La date bancaire est dans la tolérance de date (cf. R11)

**R11 — Tolérance de date (backend)** : La date de la ligne bancaire peut être postérieure de 0 à 7 jours à la date du groupe de paiement (délai habituel entre la date comptable de la caisse et la réception du virement).

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
| Acte   | `actual_payment_amount`  | conservé                                                                     |
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
  → Application des mappings existants (pré-remplissage)
  → Suggestion heuristique pour les labels inconnus (indicatif)
          │
          ▼
[Mapping des labels — toujours obligatoire] (frontend)
  → Tous les labels affichés : confirmés pré-remplis, inconnus vides
  → Suggestion visible mais non pré-sélectionnée pour les inconnus
  → L'utilisateur valide, corrige ou complète chaque label
  → Sauvegarde des mappings (y compris les modifications)
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

---

## Questions ouvertes

- [x] **ADR-001 — `BankFundLabelMapping`** : Les décisions de persistance (clé composite `(bank_account_id, bank_label)`, upsert check-then-update, rejet = `fund_id NULL`, soft-delete + index partiel) sont documentées dans [docs/adr/001-bank-fund-label-mapping-persistence.md](../adr/001-bank-fund-label-mapping-persistence.md).

Aucune question ouverte bloquante — toutes les décisions ont été tranchées.
