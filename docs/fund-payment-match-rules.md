# Règles Métier — Rapprochement Fond/Paiement (fund-payment-match)

## Contexte

Un praticien reçoit des relevés de paiement (PDF) de caisses d'assurance maladie (CPAM, etc.).
Ces relevés listent les actes remboursés. Cette feature permet de rapprocher ces lignes PDF avec les procédures enregistrées en base.

---

## Règles métier

### Éligibilité des procédures au rapprochement

**R1 — Procédures éligibles (backend)** : Seules les procédures dans un statut non finalisé sont candidates au rapprochement (`None`, `Created`, `PartiallyReconciled`, `Reconciliated`). Les procédures déjà payées (`DirectlyPayed`, `FundPayed`, `ImportDirectlyPayed`, `ImportFundPayed`) sont exclues du pool de matching.

**R2 — Validation du total PDF (backend + frontend)** : Lors du parsing, la somme des montants de toutes les lignes d'un groupe PDF est comparée au montant total déclaré par la caisse. Si les deux ne correspondent pas, un avertissement visuel est affiché (`is_total_valid = false`). Cette validation est informative — elle n'empêche pas la poursuite du rapprochement.

**R28 — Lignes non parsées (backend + frontend)** : Certaines lignes du PDF peuvent ne pas être reconnues par le parser (format inattendu, lignes de commentaire, etc.). Elles sont silencieusement exclues du rapprochement. Le nombre de lignes non parsées et les 5 premières en exemple sont affichés en avertissement à l'utilisateur.

**R3 — Détection de doublon PDF (backend)** : Au moment de la création des groupes de paiement fond, le système vérifie si un groupe avec le même (fonds, date, montant total) existe déjà. Si tous les candidats sont des doublons, le traitement est rejeté entièrement — le PDF a vraisemblablement déjà été importé.

### Algorithme de matching

**R4 — Algorithme en 8 passes (backend)** : Le rapprochement s'effectue en 8 passes séquentielles, chacune avec des critères différents. Une ligne PDF non résolue à la passe N est retentée à la passe N+1 :

| Passes | Type de ligne | Montant | Tolérance de date |
|--------|--------------|---------|-------------------|
| 1–2    | Acte simple / Période | Exact | Exacte |
| 3–4    | Acte simple / Période | Le plus proche | Exacte |
| 5–6    | Acte simple / Période | Exact | -1 jour sur la date de début |
| 7–8    | Acte simple / Période | Le plus proche | -1 jour sur la date de début |

Les passes impaires traitent les actes à date unique, les passes paires traitent les périodes (date début ≠ date fin).

**R5 — Définition d'une anomalie (backend)** : Une anomalie est un écart constaté entre une donnée du PDF et la donnée correspondante en base. Trois types d'anomalies sont détectés :

- **AmountMismatch** : `procedure_amount` en base ≠ montant de la ligne PDF (comparaison exacte, en millièmes d'euro)
- **FundMismatch** : le libellé du fonds dans le PDF ne contient ni le nom ni l'identifiant du fonds associé à la procédure en base
- **DateMismatch** : la procédure a été trouvée uniquement grâce à la tolérance de -1 jour (passes 5–8) — la date de la procédure est donc différente de la date PDF

Une procédure sans aucune de ces anomalies est considérée comme parfaitement correspondante.

**R6 — Correspondance parfaite (backend)** : Une ligne PDF est en correspondance parfaite (`PerfectSingleMatch`, `PerfectGroupMatch`) si : (1) la somme des montants des procédures égale exactement le montant PDF, (2) aucune anomalie n'est détectée (cf. R5), et (3) **toutes** les procédures du patient dans la période concernée sont couvertes par le match. Aucune action utilisateur n'est requise.

**R7 — Correspondance unique avec anomalie (backend)** : Une ligne PDF correspond à exactement une procédure mais présente une ou plusieurs anomalies (`SingleMatchIssue`, cf. R5).

**R8 — Correspondance de groupe avec anomalie (backend)** : Une ligne PDF correspond à plusieurs procédures (actes groupés) mais présente des anomalies (`GroupMatchIssue`, cf. R5).

**R9 — Trop de correspondances (backend)** : Si plus de 8 procédures candidates sont trouvées sans qu'une correspondance claire puisse être établie, le cas est marqué `TooManyMatchIssue`. Ce cas est bloquant — aucune correction automatique n'est possible, il faut intervenir manuellement en base.

**R10 — Introuvable (backend)** : Aucune procédure correspondante trouvée après les 8 passes (`NotFoundIssue`). Des candidats proches sont recherchés et proposés à l'utilisateur pour liaison manuelle. La recherche se base uniquement sur une **fenêtre de ±1 jour** autour de la date de la ligne PDF (sans filtre sur le patient ni le SSN), en excluant les procédures déjà rapprochées ou supprimées (statut `CREATED` uniquement, non déjà liées à un paiement fond, non déjà matchées dans la passe courante).

### Corrections

**R11 — Correction de montant (backend)** : Le montant de la procédure en base est mis à jour avec le montant PDF (`AmountMismatch` → `AutoCorrection::AmountMismatch`).

**R12 — Contestation de montant (frontend + backend)** : Quand le fond paie moins que le montant facturé, le praticien peut "contester" : le montant réel de paiement est enregistré séparément sans modifier le montant de l'acte (`AutoCorrection::ContestAmount`, statut → `PartiallyReconciled`).

**R13 — Correction de fonds (backend)** : Le fonds associé à la procédure est mis à jour avec le fonds PDF (`FundMismatch` → `AutoCorrection::FundMismatch`).

**R14 — Correction de date (backend)** : Le backend détecte un écart de date entre la procédure et la ligne PDF uniquement sur une tolérance de -1 jour (passes 5–8 du matching). Un bouton "Corriger la date" est affiché dans la `SingleMatchCard` parmi les autres anomalies, sans card dédiée.

**R15 — Liaison manuelle (frontend + backend)** : Pour un `NotFoundIssue`, l'utilisateur peut lier la ligne PDF à une procédure existante suggérée (`AutoCorrection::LinkProcedure`). Une procédure ne peut être liée qu'une seule fois. Lors de la liaison, le SSN du patient est mis à jour avec le SSN du PDF — le PDF fait autorité sur le SSN.

**R16 — Création de procédure manquante (backend)** : Pour un `NotFoundIssue`, si aucune procédure existante ne peut être liée, l'utilisateur peut déclencher la création d'une nouvelle procédure à partir des données PDF (`AutoCorrection::CreateProcedure`). Si le patient n'existe pas (SSN inconnu), il est créé automatiquement. La procédure créée reçoit le type `import-pdf`.

**R17 — Résolution automatique du fonds (backend)** : Le libellé du fonds dans le PDF (ex. "CPAM n° 931") est résolu automatiquement vers un fonds existant par extraction du numéro identifiant. Si le fonds n'existe pas en base, il est créé automatiquement.

### Statuts de procédure

**R18 — Cycle de statut (backend)** : Le statut final d'une procédure s'obtient en deux étapes issues de deux features distinctes :

- **Étape 1 — Rapprochement PDF** (cette feature) : la procédure passe en statut intermédiaire `Reconciliated`, sauf si le montant a été contesté → `PartiallyReconciled`. Dans les deux cas, `actual_payment_amount` est renseigné.
- **Étape 2 — Rapprochement bancaire** (feature séparée) : quand le virement du fond est détecté sur le relevé bancaire, la procédure passe en statut final :
  - `Reconciliated` → `FundPayed`
  - `PartiallyReconciled` → `PartiallyFundPayed` (l'`actual_payment_amount` issu de la contestation est conservé)

**R19 — Vérification de cohérence post-persistance (backend)** : Après création du groupe de paiement fond, la somme des `actual_payment_amount` de toutes les procédures du groupe doit être strictement égale au `total_amount` du groupe. Cette vérification est non-bloquante (avertissement en log uniquement).

### Navigation et UX

**R20 — Ordre de présentation (frontend)** : Les anomalies sont présentées dans l'ordre du document PDF (par `line_index` croissant), sauf les `TooManyMatchIssue` qui sont remontées en tête de liste (voir R21).

**R21 — Cas bloquants (frontend)** : Les `TooManyMatchIssue` sont bloquants — ils ne peuvent pas être résolus dans l'interface et empêchent la validation. Ils doivent être affichés en premier, avant les autres anomalies, afin que l'utilisateur soit informé immédiatement de l'impossibilité de valider sans intervention manuelle en base.

**R22 — Résolution requise avant validation (frontend)** : La validation est bloquée tant que toutes les anomalies ne sont pas résolues. Une anomalie est résolue si une correction ou une contestation a été acceptée.

**R23 — Avancement automatique (frontend)** : Dès qu'une anomalie est résolue, l'interface avance automatiquement vers la prochaine anomalie non résolue (après un délai de 500 ms).

**R24 — Touche Entrée = action principale (frontend)** : Sur une carte SingleMatch, la touche Entrée applique la première correction disponible. Sur une carte déjà résolue ou TooManyMatch, elle passe à l'anomalie suivante.

**R25 — Auto-correction globale (frontend)** : Un bouton permet d'appliquer automatiquement toutes les corrections possibles. Il est masqué si des `TooManyMatchIssue` sont présents ou si des `GroupMatchIssue` sont non résolus — dans ces cas, une intervention manuelle est requise.

Action appliquée par type d'anomalie :

| Type | Action auto-correction |
|------|------------------------|
| `NotFoundIssue` | Déclenche une `CreateProcedure` — sauf si la ligne est déjà acceptée ou si un candidat proche a déjà été lié manuellement |
| `SingleMatchIssue` — `AmountMismatch` | Applique `AutoCorrection::AmountMismatch` avec le montant PDF |
| `SingleMatchIssue` — `FundMismatch` | Applique `AutoCorrection::FundMismatch` avec le libellé de fonds PDF |
| `SingleMatchIssue` — `DateMismatch` | Applique `AutoCorrection::DateMismatch` avec la date PDF |
| `GroupMatchIssue` | Non traité — bouton masqué tant que des groupes sont non résolus |
| `TooManyMatchIssue` | Non traité — bouton masqué |

**R26 — Auto-validation (frontend)** : Dès que toutes les anomalies sont résolues, la validation est déclenchée automatiquement sans action utilisateur. En cas d'échec, le cycle ne se relance pas.

### Rapport post-validation

**R27 — Rapport d'actes non rapprochés (backend + frontend)** : Après validation, un rapport des procédures non rapprochées dans la plage de dates du PDF est affiché, permettant au praticien de détecter les actes oubliés ou non remboursés.

---

## Workflow

```
[Utilisateur sélectionne un fichier PDF]
          │
          ▼
[Extraction du texte PDF] (backend)
          │
          ▼
[Parsing du PDF en lignes structurées] (backend)
  → Groupe par caisse / date de paiement / total
  → Validation du total (somme des lignes = total déclaré)
          │
          ▼
[Rapprochement lignes PDF ↔ procédures DB] (backend)
  → 8 passes séquentielles par SSN / date / montant
  → Classification : PerfectMatch / SingleIssue / GroupIssue / TooMany / NotFound
          │
          ▼
[Affichage des anomalies à résoudre] (frontend)
  → TooManyMatchIssue affichées en premier (bloquantes)
  → Puis anomalies dans l'ordre du document PDF
  → Pour chaque anomalie : boutons de correction / contestation / liaison
  → Barre de progression + avancement automatique
          │
          ▼
[Toutes les anomalies résolues ?]
  → Non : l'utilisateur continue à corriger
  → Oui : auto-validation déclenchée
          │
          ▼
[Application des corrections + création du paiement fond] (backend)
  → Vérification doublon : rejet si le même PDF a déjà été importé
  → Mise à jour des procédures selon AutoCorrections
  → Résolution des libellés de fonds (avec création si nécessaire)
  → Création des procédures manquantes / patients manquants
  → Création du groupe de paiement fond
  → Mise à jour des statuts de procédure → Reconciliated / PartiallyReconciled
  → Vérification de cohérence post-persistance (non-bloquante)
          │
          ▼
[Rapport des procédures non rapprochées] (backend + frontend)
  → Plage de dates extraite du PDF
  → Liste des procédures sans paiement fond dans cette plage
          │
          ▼
[Fin — fermeture du modal ou consultation du rapport]
```
