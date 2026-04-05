# Règles métier — Gestion des types d'actes

## Contexte

Un `ProcedureType` représente un modèle d'acte médical réutilisable (ex. « Consultation », « Bilan sanguin », « Radiographie »). Il sert de référence lors de la création d'actes (`Procedure`) : le type fournit un nom et un montant par défaut, que l'utilisateur peut ensuite ajuster sur chaque acte individuel.

La page de gestion des types d'actes est une vue CRUD autonome accessible depuis la navigation principale. Un point d'entrée alternatif de création existe via l'import Excel (`docs/excel-import-rules.md`) — les règles de validation backend R1 à R3 s'appliquent dans les deux cas.

---

## Définition des entités

### ProcedureType

Un modèle d'acte médical paramétrable par l'utilisateur.

| Champ            | Signification métier                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `name`           | Nom lisible du type d'acte défini par l'utilisateur (ex. « Consultation »). Requis. Unique parmi les types actifs. |
| `default_amount` | Montant par défaut de l'acte, exprimé en millièmes d'euro (`i64`). Doit être ≥ 0. Affiché en euros côté UI. |
| `category`       | Regroupement libre et optionnel défini par l'utilisateur (ex. « Biologie », « Imagerie »). Peut être absent. |

Tous les champs (`name`, `default_amount`, `category`) sont modifiables après création pour les types utilisateur. Le champ `id` est immuable une fois généré. Le type réservé `import-pdf` fait exception : aucun de ses champs n'est modifiable (voir R22).

---

## Règles métier

### Backend

**R1 — Validation du nom (backend)** : Le `name` est validé après suppression des espaces de début et fin (`trim`). Un nom vide ou ne contenant que des espaces est rejeté avec une erreur explicite.

**R2 — Validation du montant (backend)** : Le `default_amount` doit être ≥ 0. Un montant négatif est rejeté avec une erreur explicite. Il n'y a pas de montant maximum imposé.

**R3 — Catégorie optionnelle (backend)** : La `category` est optionnelle. Une chaîne vide transmise par le frontend est normalisée en `null` avant stockage.

**R4 — Unicité du nom (frontend + backend)** : Deux types d'actes actifs ne peuvent pas porter le même nom. La comparaison s'effectue sur le nom normalisé selon R1, en ignorant la casse (`case-insensitive`). Toute tentative de création ou de modification aboutissant à un doublon est rejetée par le backend avec une erreur explicite. Le frontend affiche cette erreur inline dans la modal concernée. Cette règle s'applique à la création comme à la modification.

**R5 — Événement après mutation (backend)** : Toute mutation d'un `ProcedureType` (création, modification ou suppression) publie l'événement `ProcedureTypeUpdated` sur l'event bus. Cet événement est un effet de bord systématique qui déclenche la mise à jour du store frontend sans rafraîchissement manuel.

**R6 — Suppression logique (backend)** : La suppression d'un `ProcedureType` est logique (soft-delete) : le type est marqué comme supprimé et n'apparaît plus dans la liste, mais les `Procedure` existantes qui le référencent conservent leur référence intacte. Aucune vérification d'usage n'est effectuée avant suppression. La suppression est irréversible depuis l'interface utilisateur. Le type réservé `import-pdf` est protégé contre la suppression (voir R22).

**R21 — Seed du type réservé (backend)** : Un `ProcedureType` avec l'identifiant fixe `import-pdf` est créé automatiquement par la migration initiale de la base de données (nom historique `"Import PDF"`). Une migration supplémentaire renomme ce type en `"Import"` dans le cadre de cette feature. L'identifiant `import-pdf` est conservé tel quel pour ne pas invalider les données existantes (actes et mappings). Le nom `"Import"` participe à la vérification d'unicité (R4) : toute tentative de créer un type portant ce nom (quelle que soit la casse) est rejetée comme doublon.

**R22 — Protection du type réservé (backend)** : Le backend inclut `import-pdf` dans les résultats de `read_all_procedure_types` (le filtrage est délégué au frontend, R23). Il rejette toute tentative de modification ou de suppression de ce type avec une erreur explicite.

**R23 — Exclusion du tableau (frontend)** : Le type réservé `import-pdf` est filtré du store avant affichage. Il n'apparaît jamais dans le tableau des types d'actes.

### Frontend

**R7 — Conversion du montant (frontend + backend)** : Le `default_amount` est stocké en millièmes d'euro (`i64`). La saisie utilisateur (en euros, format décimal) est multipliée par 1 000 avant envoi au backend. L'affichage suit le format `€{(default_amount / 1000).toFixed(2)}`. Cette convention de contrat est partagée entre le frontend et le backend.

**R8 — Validation du formulaire (frontend)** : La soumission est bloquée si le nom est vide ou ne contient que des espaces, ou si le montant est absent ou non numérique. Les erreurs sont affichées inline sous chaque champ concerné et effacées au fur et à mesure que l'utilisateur corrige sa saisie.

**R9 — Tableau des types d'actes (frontend)** : Le tableau affiche les colonnes suivantes, sans tri par défaut :

| Colonne   | Contenu                                    | Triable |
| --------- | ------------------------------------------ | ------- |
| Nom       | `name`                                     | Oui     |
| Montant   | `€{(default_amount / 1000).toFixed(2)}`   | Oui     |
| Catégorie | `category` (ou `–` si absent)             | Non     |
| Actions   | Bouton Éditer + Bouton Supprimer           | Non     |

**R10 — Comportement du tri (frontend)** : Cliquer sur l'en-tête d'une colonne triable fait cycler le tri : ascendant → descendant → aucun tri. Un indicateur visuel sur l'en-tête reflète le tri actif et son sens. L'état du tri n'est pas persisté entre navigations : la page s'ouvre toujours sans tri actif.

**R11 — Recherche et filtrage (frontend)** : Un champ de recherche filtre les lignes en temps réel sur le nom et la catégorie simultanément (correspondance partielle, insensible à la casse). L'en-tête affiche le nombre de types d'actes correspondant à la recherche active (hors type réservé) ; sans recherche active, il affiche le total.

**R12 — État vide (frontend)** : Si aucun `ProcedureType` n'existe, le tableau affiche un message invitant l'utilisateur à créer son premier type d'acte via le FAB.

**R13 — Aucun résultat de recherche (frontend)** : Si la recherche ne correspond à aucun type d'acte, le tableau affiche un message neutre distinct de l'état vide (R12). Ce message n'invite pas à créer un type d'acte.

**R14 — État de chargement (frontend)** : Le tableau affiche un état de chargement animé pendant la récupération initiale des données depuis le store.

**R15 — Erreur de chargement initial (frontend)** : Si le chargement initial des types d'actes échoue (erreur réseau ou backend), le tableau affiche un message d'erreur avec un bouton « Réessayer » permettant de relancer la requête.

**R16 — Ajout via modal de création (frontend)** : Un FAB flottant en bas à droite ouvre une modal de création avec les champs Nom (requis), Montant (requis) et Catégorie (optionnelle). Après création réussie, la modal se ferme et le formulaire est réinitialisé (champs vidés) pour une éventuelle nouvelle saisie. En cas d'erreur backend (doublon R4, montant invalide R2, ou erreur réseau), la modal reste ouverte et une snackbar d'erreur est affichée.

**R17 — Modification (frontend)** : Le bouton Éditer (icône crayon) sur une ligne ouvre une modal de modification pré-remplie avec les valeurs actuelles. Un double-clic sur une ligne produit le même effet ; le délai maximal entre les deux clics définissant un double-clic est de 300 ms. Après sauvegarde réussie, la modal se ferme et une snackbar de succès est affichée. En cas d'erreur backend (doublon R4 ou erreur réseau), la modal reste ouverte et une snackbar d'erreur est affichée.

**R18 — Réinitialisation du formulaire d'édition (frontend)** : Lorsque la modal d'édition s'ouvre sur un type d'acte différent du précédent, le formulaire est réinitialisé avec les valeurs du nouveau type d'acte. Les erreurs de validation éventuellement affichées lors de l'ouverture précédente sont effacées.

**R19 — Suppression (frontend)** : Le bouton Supprimer (icône corbeille) ouvre une dialog de confirmation `variant="danger"`. La confirmation déclenche la suppression (R6). Le succès est confirmé par une snackbar. En cas d'erreur, une snackbar d'erreur est affichée.

**R20 — Feedback succès (frontend)** : Toute opération de création (R16), de modification (R17) ou de suppression (R19) réussie affiche une snackbar de succès.

---

## Workflow

```
[Utilisateur ouvre « Types d'actes »]
  → Tableau (sans tri par défaut) + FAB
          │
          ├─ [Chargement] → État de chargement animé (R14)
          │              → Erreur → message + bouton Réessayer (R15)
          │
          ├─ [Recherche] → Filtre temps réel nom + catégorie (R11)
          │              → Aucun résultat → message neutre (R13)
          │
          ├─ [Clic en-tête] → Tri cyclique asc/desc/aucun + indicateur (R10)
          │
          ├─ [FAB] → Modal création (Nom + Montant + Catégorie optionnelle)
          │   → Validation inline si champ invalide (R8)
          │   → Création → modal fermée + formulaire réinitialisé → snackbar succès (R16, R20)
          │   → Erreur backend (doublon, réseau) → modal reste ouverte → snackbar erreur (R16)
          │
          ├─ [Double-clic ligne / Bouton Éditer] → Modal édition pré-remplie (R17, R18)
          │   → Validation inline si champ invalide (R8)
          │   → Modification → modal fermée → snackbar succès (R17, R20)
          │   → Erreur backend (doublon, réseau) → modal reste ouverte → snackbar erreur (R17)
          │
          └─ [Bouton Supprimer] → Dialog de confirmation (R19) → Confirmation → Suppression → snackbar succès (R20)
                                                                                            → Erreur backend → snackbar erreur (R19)
```

---

## Maquette UX

### Point d'entrée

**Types d'actes** — item de la navigation principale (rail latéral).

### Composant principal

Page avec tableau pleine largeur, en-tête (titre, compteur total, champ de recherche) et FAB flottant en bas à droite.

### États

- **Chargement** : ligne de chargement animée dans le tableau (R14)
- **Erreur de chargement** : message d'erreur + bouton Réessayer (R15)
- **Vide** : message invitant à créer le premier type via le FAB (R12)
- **Aucun résultat** : message neutre sans invitation à créer (R13)
- **Modal création** : Nom + Montant + Catégorie, validation inline, FAB comme déclencheur (R16)
- **Modal édition** : champs pré-remplis, double-clic ou bouton Éditer comme déclencheur (R17)
- **Dialog suppression** : confirmation `variant="danger"` (R19)
- **Snackbar succès / erreur** : après toute mutation (R20)

### Flux utilisateur

1. L'utilisateur ouvre la page Types d'actes.
2. Il clique sur le FAB → modal de création → saisit Nom + Montant (+ Catégorie optionnelle) → soumet → type créé → modal fermée, formulaire réinitialisé.
3. Il double-clique sur une ligne (ou clique Éditer) → modal d'édition pré-remplie → modifie → sauvegarde → modal fermée.
4. Il clique Supprimer → dialog de confirmation → confirme → type supprimé.

---

## Questions ouvertes

Aucune — toutes les questions ont été tranchées.
