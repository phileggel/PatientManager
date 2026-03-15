# Règles Métier — Import Excel (excel-import)

## Contexte

Un praticien dispose d'un fichier Excel historique contenant ses patients, ses caisses et ses actes mensuels. Cette feature permet d'importer ce fichier pour initialiser ou mettre à jour la base de données, en résolvant les doublons, en mappant les types d'actes et en protégeant les données déjà rapprochées.

---

## Règles métier

### Structure du fichier Excel

**R1 — Feuilles attendues (backend)** : Le parser reconnaît trois types de feuilles dans le fichier Excel :

- **Feuille `Patiente`** (optionnelle) : liste des patients avec nom (col A), SSN (col C). La colonne D (identifiant du dernier fonds) est lue mais non persistée lors de l'import. Si la feuille est absente, les patients sont déduits des feuilles mensuelles.
- **Feuille `Secu`** (optionnelle) : liste des caisses avec identifiant (col A), nom (col B). L'adresse (col C) est lue mais non persistée — seuls l'identifiant et le nom sont stockés en base.
- **Feuilles mensuelles** (optionnelles) : nommées `Jan`, `Fév`, `Mars`, `Avr`, `Mai`, `Juin`, `Juil`, `Août`, `Sep`, `Oct`, `Nov`, `Déc` (ou noms complets). Chaque feuille représente un mois. Les colonnes sont détectées dynamiquement à partir d'une ligne d'en-tête (ligne 2) : `CAISSE`, `TARIF`, `DATE` sont obligatoires ; `T` (mode de paiement), `REMBSE` (date de paiement confirmée), `Versé` (montant réel payé) et `En attente` sont optionnels.

**R2 — Lignes ignorées au parsing (backend)** : Une ligne d'une feuille mensuelle est ignorée (sans erreur bloquante) dans les cas suivants :
- Nom du patient vide, `#N/A` ou introuvable dans la liste des patients parsés
- Montant absent, non numérique ou ≤ 0
- Date absente ou dans un format non reconnu (`DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, ou numéro de série Excel)
- Fonds référencé mais introuvable dans la liste des fonds parsés
- Nombre de colonnes insuffisant

Toutes les lignes ignorées sont collectées dans un rapport de parsing affiché à l'utilisateur en fin d'import.

### Validation des données

**R3 — Validation du SSN patient (backend)** : Le SSN est optionnel. S'il est fourni, il doit contenir exactement 13 chiffres ASCII. Trois cas :
- SSN valide (13 chiffres) : clé de déduplication principale.
- SSN absent ou vide : déduplication par nom en minuscule.
- SSN fourni mais invalide : stocké dans le nom sous la forme `"{nom} (code: {ssn})"` pour traçabilité, et la déduplication se fait par nom.

**R4 — Validation des fonds (backend)** : L'identifiant et le nom du fonds sont obligatoires (non vides). L'adresse est optionnelle. La clé de déduplication est l'identifiant exact du fonds.

### Identification temporaire

**R5 — Identifiants temporaires (backend)** : Au moment du parsing, chaque entité (patient, fonds, acte) reçoit un identifiant temporaire (`temp_id`) sous forme d'UUID. Ces identifiants permettent de relier les actes à leurs patients et fonds sans ID réels en base. Les `temp_id` sont valables uniquement pour la session de parsing courante.

**R6 — Identifiant de type d'acte temporaire (backend)** : Un `procedure_type_tmp_id` (UUID) est assigné à chaque acte en fonction de son montant. Toutes les actes avec le même montant partagent le même `procedure_type_tmp_id`. Ce regroupement par montant permet à l'utilisateur de mapper chaque montant unique vers un type d'acte réel.

**R7 — Interdiction de re-parser (backend + frontend)** : Les `procedure_type_tmp_id` sont générés aléatoirement au moment du parsing. Re-parser le même fichier produirait des UUIDs différents, rendant invalide tout mapping de types déjà établi par l'utilisateur. Le frontend conserve donc la réponse de parsing en mémoire et ne relance jamais le parsing une seconde fois.

### Déduplication

**R8 — Déduplication des patients (backend)** : Pendant le parsing, les patients sont dédupliqués en mémoire par SSN (si valide) ou par nom en minuscule. Lors de l'exécution de l'import, la recherche en base se fait **uniquement par SSN** :
- Si le SSN est présent et qu'un patient avec ce SSN existe en base → réutilisation (aucune création).
- Si le SSN est présent mais introuvable en base → création.
- Si le SSN est absent → aucune recherche en base, le patient est toujours créé (la déduplication par nom ne s'applique qu'en mémoire pendant le parsing).

**R9 — Déduplication des fonds (backend)** : Pendant le parsing, les fonds sont dédupliqués par identifiant exact. Lors de l'exécution, chaque fonds est recherché en base par identifiant :
- Si un fonds avec le même identifiant existe → réutilisation (aucune création).
- Sinon → création.

**R10 — Déduplication des actes par mois (backend)** : Les actes ne sont pas dédupliquées individuellement. La gestion des doublons se fait au niveau du mois entier (cf. R16 et R17).

### Sélection des mois

**R11 — Sélection des mois à importer (frontend)** : Après le parsing, l'utilisateur choisit quels mois importer via une liste de cases à cocher. Tous les mois détectés dans les actes parsées sont proposés. Par défaut, tous sont sélectionnés. Seuls les mois sélectionnés sont transmis à la commande d'exécution. Le bouton « Continuer » est désactivé si aucun mois n'est sélectionné. **Cas particulier** : si aucune acte n'a été parsée (fichier sans feuilles mensuelles ou toutes lignes ignorées), les étapes de sélection des mois et de mapping des types sont ignorées — l'import s'exécute sans étapes supplémentaires.

### Mapping des types d'actes

**R12 — Pré-remplissage du mapping (frontend)** : Pour chaque montant unique détecté dans les actes parsées, l'utilisateur associe un type d'acte. Le frontend pré-remplit automatiquement chaque montant avec le premier type disponible (ou `imported-from-excel` si aucun type n'existe). Tous les montants ont donc toujours une valeur dans le mapping envoyé.

**R13 — Type par défaut (frontend)** : L'utilisateur peut choisir le type spécial `imported-from-excel` pour un montant. Les actes correspondantes sont créées mais associées à ce type générique sans dénomination précise.

**R14 — Création inline de type d'acte (frontend)** : L'utilisateur peut créer un nouveau type d'acte directement depuis l'écran de mapping, via une modale. Le montant par défaut est pré-rempli avec la valeur correspondante. Le type créé est immédiatement disponible dans la liste de mapping.

**R25 — Actes ignorées si montant absent du mapping (backend)** : Si un montant est absent du mapping reçu lors de l'exécution, toutes les actes correspondant à ce montant sont ignorées.

### Protection des données rapprochées

**R15 — Mois bloqué (backend)** : Avant d'importer un mois sélectionné, le système vérifie s'il existe des actes avec un statut de rapprochement avancé (`RECONCILIATED` ou `FUND_PAYED`) pour ce mois. Si c'est le cas, le mois entier est **bloqué** : aucune acte de ce mois n'est supprimée ni recréée. Les mois bloqués sont signalés dans le résultat.

**R16 — Suppression avant ré-import (backend)** : Si un mois n'est pas bloqué (cf. R15), **toutes** les actes existantes de ce mois sont supprimées définitivement avant l'import des nouvelles données. Ce mécanisme permet de ré-importer un mois corrigé sans accumulation de doublons.

### Orchestration de l'import

**R17 — Ordre d'exécution (backend)** : L'exécution de l'import suit un ordre strict :
1. Résolution et création des patients (patients existants réutilisés, nouveaux créés)
2. Résolution et création des fonds (fonds existants réutilisés, nouveaux créés)
3. Validation des mois : identification des mois bloqués et suppression des actes des mois autorisés
4. Création des actes : pour chaque acte dont le mois est autorisé, le patient résolu et le type mappé

**R18 — Mise à jour des champs de suivi patient (backend)** : Après la création des actes, les champs de suivi du patient (dernier mois, dernier fonds, dernière date d'acte) sont mis à jour pour refléter l'acte la plus récente importée.

**R19 — Statut initial des actes importées (backend)** : Toutes les actes créées par l'import reçoivent le statut `NONE` (non rapprochée). Elles sont ensuite éligibles au rapprochement caisse (cf. R1 du document fund-payment-auto-match.md).

### Résultat et rapport

**R20 — Rapport de résultat (backend + frontend)** : À l'issue de l'import, un résumé est affiché contenant :
- Patients créés / réutilisés
- Fonds créés / réutilisés
- Actes créées / ignorées / supprimées
- Liste des mois bloqués (si applicable)

**R21 — Rapport de parsing (backend + frontend)** : À l'issue du parsing, un rapport détaillé est accessible depuis l'écran de résultat. Il contient deux sections :
- **Feuilles absentes** : liste des feuilles mensuelles attendues mais introuvables dans le fichier Excel.
- **Lignes ignorées** : lignes rejetées (cf. R2), organisées par feuille mensuelle sous forme d'onglets. Les lignes ignorées pour cause de nom `#N/A` ou ligne vide sont masquées dans l'affichage (trop nombreuses et peu informatives).

Ce rapport est informatif et non bloquant.

### Mémorisation du mapping

**R22 — Persistance du mapping (frontend)** : À la confirmation de l'étape de mapping, les choix de l'utilisateur (montant → type d'acte) sont persistés en base.

**R23 — Rechargement comme valeurs par défaut (frontend)** : Lors d'un import ultérieur, les préférences sauvegardées sont proposées comme valeurs par défaut dans l'écran de mapping. L'utilisateur peut modifier n'importe quelle valeur — il n'y a pas d'auto-validation.

**R24 — Filtrage des types supprimés (backend)** : Les préférences de mapping sont filtrées avant d'être transmises au frontend : seuls les mappings dont le type d'acte existe encore (non supprimé) ou dont la valeur est `imported-from-excel` sont retournés. Si un type a été supprimé depuis le dernier import, son mapping est exclu — l'interface revient alors au type par défaut (cf. R12).

---

## Workflow

```
[Utilisateur sélectionne un fichier Excel]
          │
          ▼
[Parsing du fichier Excel] (backend)
  → Lecture feuille Patiente / Secu / feuilles mensuelles
  → Assignation des temp_id (patients, fonds, actes)
  → Groupement par montant → procedure_type_tmp_id
  → Collecte des lignes ignorées
          │
          ▼
[Sélection des mois] (frontend)
  → Liste des mois détectés, tous cochés par défaut
  → Utilisateur décoche les mois à exclure
          │
          ▼
[Mapping des types d'actes] (frontend)
  → Chargement des préférences sauvegardées (backend filtre les types supprimés)
  → Table : montant → type d'acte (pré-rempli avec préférences ou premier type disponible)
  → Options : type existant / créer nouveau / type générique
  → Création inline possible via modale
  → Sauvegarde des choix à la confirmation
          │
          ▼
[Exécution de l'import] (backend)
  → Résolution patients (réutilisation ou création)
  → Résolution fonds (réutilisation ou création)
  → Validation mois : bloqués (RECONCILIATED/FUND_PAYED) vs autorisés
  → Suppression définitive des actes des mois autorisés
  → Création des actes avec statut NONE
  → Mise à jour des champs de suivi patient
          │
          ▼
[Rapport de résultat] (frontend)
  → Compteurs : patients / fonds / actes (créés / réutilisés / ignorés / supprimés)
  → Avertissement : mois bloqués
  → Accès au rapport de parsing (lignes ignorées)
          │
          ▼
[Fin — retour à l'accueil ou nouvel import]
```
