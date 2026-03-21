# Règles Métier — Rapprochement Manuel (fund-payment)

## Contexte

Un praticien reçoit des virements de caisses d'assurance maladie (CPAM, etc.) en paiement des actes remboursés. Cette feature permet de **regrouper manuellement** des actes dans un groupe de paiement fond, afin de tracer le lien entre les actes réalisés et les paiements reçus de la caisse.

Ce document couvre exclusivement le **flux manuel** : création, modification et suppression de groupes depuis l'interface utilisateur.

---

## Règles métier

### Cycle de statut des actes

**R0 — Cycle de statut (backend)** : Le statut d'une acte évolue en deux étapes issues de deux features distinctes :

- **Étape 1 — Rapprochement fond** (manuel ou automatique) : l'acte passe de `Created` à `Reconciliated` (paiement intégral accepté) ou `PartiallyReconciled` (montant contesté). Dans les deux cas, `confirmed_payment_date` et `actual_payment_amount` sont renseignés.
- **Étape 2 — Rapprochement bancaire** (feature `bank-statement-match`) : lorsque le virement est détecté sur le relevé bancaire, l'acte passe en statut final : `Reconciliated` → `FundPayed`, `PartiallyReconciled` → `PartiallyFundPayed`.

Un groupe devient verrouillé dès qu'une de ses actes atteint l'Étape 2 (cf. R9).

### Éligibilité des actes

**R1 — Actes éligibles à la sélection (backend)** : Seules les actes en statut `Created` peuvent être ajoutées à un groupe, que ce soit à la création ou en modification. Lors de la modification, le sélecteur présente deux sections distinctes : les actes déjà dans le groupe (`Reconciliated` ou `PartiallyReconciled`, retirables) et les actes disponibles (`Created`, ajoutables). Les actes dans tout autre statut (`FundPayed`, `PartiallyFundPayed`, etc.) sont exclues.

**R2 — Appartenance à la caisse (backend)** : Les actes proposées à la sélection sont filtrées par caisse. Seules les actes associées à la caisse choisie pour le groupe sont proposées.

### Création d'un groupe

**R3 — Champs obligatoires (frontend + backend)** : La création d'un groupe nécessite : une caisse, une date de paiement valide, et au moins une acte sélectionnée. Ces trois conditions sont vérifiées avant soumission.

**R4 — Montant total calculé (backend)** : Le montant total du groupe est toujours égal à la somme des `procedure_amount` des actes associées. Il n'est pas saisi manuellement et est recalculé à chaque modification de la liste des actes. Dans le flux manuel, `actual_payment_amount` étant renseigné avec `procedure_amount` à l'ajout (cf. R8), l'invariant `total_amount = Σ actual_payment_amount` est également garanti.

**R5 — Unicité par groupe (backend)** : Un groupe de paiement fond regroupe une ou plusieurs actes d'une même caisse, payées à une même date. Il n'y a pas de contrainte d'unicité stricte au niveau de la date et de la caisse — plusieurs groupes peuvent coexister pour la même combinaison (ex. deux virements reçus le même jour de la même CPAM).

### Modification d'un groupe

**R6 — Champs modifiables (frontend + backend)** : La date de paiement et la liste des actes peuvent être modifiées. La caisse associée au groupe ne peut pas être changée. Le montant total n'est pas éditable — il est toujours recalculé automatiquement (cf. R4).

**R7 — Retrait d'une acte (backend)** : Lorsqu'une acte est retirée du groupe à la validation, son statut repasse à `Created`, son montant réel de paiement (`actual_payment_amount`) et sa date de paiement confirmée sont effacés, et le montant total du groupe est recalculé en conséquence.

**R8 — Ajout d'une acte (backend)** : Lorsqu'une acte `Created` est ajoutée au groupe à la validation, son statut passe à `Reconciliated` (par défaut), sa date de paiement confirmée est renseignée avec la date de paiement du groupe, son `actual_payment_amount` est renseigné avec son montant d'acte, et le montant total du groupe est recalculé en conséquence. ⚠️ Le choix du statut cible (`Reconciliated` ou `PartiallyReconciled`) par l'utilisateur est une amélioration future non implémentée.

**R9 — Verrouillage après rapprochement bancaire (backend)** : Un groupe ne peut pas être modifié ni supprimé si l'une de ses actes a été rapprochée au niveau bancaire (statut `FundPayed` ou `PartiallyFundPayed`). Ces statuts sont posés par la feature `bank-statement-match` (Étape 2 du cycle, cf. R0). Le verrouillage est déduit du statut `BankPayed` du groupe (cf. R10).

**R10 — Statut du groupe (backend)** : Le groupe porte un statut propre : `Active` (modifiable) ou `BankPayed` (verrouillé). La feature `bank-statement-match` passe le groupe en `BankPayed` lors du rapprochement bancaire, et le repasse en `Active` en cas d'annulation. La lecture des groupes (`read_all_fund_payment_groups`) recalcule également `is_locked` à partir des statuts des actes pour garantir la cohérence.

**R18 — Retour visuel sur le verrouillage (frontend)** : Un groupe verrouillé est signalé dans la liste par une icône 🔒 à côté du nom de la caisse et une opacité réduite sur la ligne. Les boutons d'édition et de suppression sont désactivés visuellement (opacité réduite, curseur interdit).

### Suppression d'un groupe

**R11 — Suppression avec remise à zéro (backend)** : La suppression d'un groupe entraîne la remise en état initial de toutes les actes associées : leur statut repasse à `Created`, la date de paiement confirmée et le montant réel de paiement sont effacés. La suppression est bloquée si le groupe est verrouillé (cf. R9).

**R12 — Confirmation requise (frontend)** : La suppression d'un groupe de paiement nécessite une confirmation explicite de l'utilisateur avant d'être exécutée.

### Navigation et UX

**R13 — Filtrage mensuel (frontend)** : Dans le sélecteur de procédures, les actes sont filtrables par mois et par année pour faciliter la sélection dans de longues listes.

**R14 — Présentation du sélecteur de procédures (frontend)** : À la création, les actes sélectionnées sont affichées en tête de liste. En modification, le sélecteur présente deux sections distinctes : les actes en cours (déjà dans le groupe, `Reconciliated` ou `PartiallyReconciled`, retirables, présélectionnées) et les actes disponibles (`Created`, ajoutables).

**R15 — Récapitulatif de sélection (frontend)** : Lors de la sélection des actes, un récapitulatif affiche en temps réel le nombre d'actes sélectionnées et le montant total correspondant.

**R16 — Double-clic pour modifier (frontend)** : Un double-clic sur une ligne de la liste des groupes ouvre le formulaire de modification du groupe correspondant.

**R17 — Recherche dans la liste (frontend)** : La liste des groupes de paiement est filtrable par nom de caisse ou par date de paiement.

---

## Workflow

### Création

```
[Utilisateur sélectionne une caisse et une date]
          │
          ▼
[Ouverture du sélecteur de procédures]
  → Chargement des actes disponibles (statut Created, même caisse)
  → Filtrage par mois/année si besoin
  → Sélection par l'utilisateur (avec récapitulatif en temps réel)
          │
          ▼
[Validation du formulaire]
  → Vérification : caisse, date, au moins une acte sélectionnée
          │
          ▼
[Création du groupe (backend)]
  → Calcul du montant total (somme des actes)
  → Persistance du groupe et des lignes
  → Actes ajoutées → statut Reconciliated + date de paiement confirmée + actual_payment_amount
          │
          ▼
[Mise à jour de la liste des groupes]
```

### Modification

```
[Utilisateur ouvre le formulaire (double-clic ou bouton)]
  → Vérification verrouillage : si acte FundPayed/PartiallyFundPayed → inaccessible
          │
          ▼
[Chargement du sélecteur]
  → Actes en cours (Reconciliated/PartiallyReconciled) — présélectionnées, retirables
  → Actes disponibles (Created, même caisse) — ajoutables
          │
          ▼
[Utilisateur modifie la date et/ou la liste des actes]
          │
          ▼
[Validation (backend)]
  → Actes retirées → statut Created, actual_payment_amount et date confirmée effacés
  → Actes ajoutées → statut Reconciliated (cf. R8), date confirmée et actual_payment_amount renseignés
  → Montant total recalculé (somme des actes restantes + ajoutées)
          │
          ▼
[Mise à jour de la liste des groupes]
```

### Suppression

```
[Utilisateur clique sur supprimer]
  → Vérification verrouillage : si acte FundPayed/PartiallyFundPayed → inaccessible
          │
          ▼
[Confirmation explicite requise]
          │
          ▼
[Suppression (backend)]
  → Toutes les actes du groupe → statut Created, actual_payment_amount et date confirmée effacés
  → Suppression du groupe et de ses lignes
          │
          ▼
[Mise à jour de la liste des groupes]
```
