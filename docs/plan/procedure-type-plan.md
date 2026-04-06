# Plan d'implémentation — Gestion des types d'actes

> Spec : `docs/spec/procedure-type-spec.md`
> Règles couvertes : R1 → R23

---

## TODO — Ordre d'exécution

- [x] **1. Migration SQL** — renommer `"Import PDF"` → `"Import"`
- [x] **2. Backend repository** — `find_by_name` case-insensitive (R4)
- [x] **3. Backend service** — guard `import-pdf` + doublon + normalisation catégorie (R3, R4, R22)
- [x] **4. Tests backend** — service.rs (R3, R4, R22)
- [x] **5. generate-types** — `just generate-types`
- [x] **6. Frontend shared** — constante `RESERVED_PROCEDURE_TYPE_ID`
- [x] **7. Frontend useProcedureTypeList** — filtre `import-pdf` + erreur + retry (R23, R15)
- [x] **8. Frontend useProcedureTypeManager** — compteur filtré (R11, R23)
- [x] **9. Frontend ProcedureTypeList** — états vide / aucun résultat / erreur (R12, R13, R15)
- [x] **10. Frontend create_procedure_type_modal** — hook + composant FAB + modal (R16)
- [x] **11. Frontend ProcedureTypeManager** — layout pleine largeur + FAB + nouvelle modal (R16)
- [x] **12. Supprimer add_procedure_type_panel/**
- [x] **13. i18n** — fr + en (R12, R13, R15, R16)
- [x] **14. Tests frontend** — useCreateProcedureTypeModal + ProcedureTypeManager + ProcedureTypeList
- [x] **15. Quality checks** — `python3 scripts/check.py`
- [x] **16. reviewer** — 0 critique avant de continuer
- [x] **17. ux-reviewer** — 0 critique avant de continuer (.tsx modifiés)
- [x] **18. i18n-checker** — clés manquantes / hardcodées
- [x] **19. Docs** — ARCHITECTURE.md + docs/todo.md
- [x] **20. spec-checker** — R1→R23 tous couverts

---

## Plan détaillé

### Étape 1 — Migration base de données (R21)

Créer `src-tauri/migrations/20260406_rename_import_pdf.sql` :
```sql
UPDATE procedure_type SET name = 'Import' WHERE id = 'import-pdf';
```
Puis :
```bash
just clean-db
just prepare-sqlx
```

---

### Étape 2 — Backend : repository (R4)

**`src-tauri/src/context/procedure/repository/procedure_type.rs`**

- Méthode `find_by_name` : remplacer `WHERE name = $1` par `WHERE LOWER(name) = LOWER($1) AND is_deleted = 0`
- Signature du trait inchangée : `async fn find_by_name(&self, name: &str) -> anyhow::Result<Option<ProcedureType>>`

---

### Étape 3 — Backend : service (R3, R4, R22)

**`src-tauri/src/context/procedure/service.rs`**

**`add_procedure_type`** :
- Normaliser catégorie vide → `None` : `let category = category.filter(|s| !s.trim().is_empty());`
- Avant création, appeler `self.repository.find_by_name(name.trim())` → si trouvé : `anyhow::bail!("Un type d'acte portant ce nom existe déjà")`

**`update_procedure_type`** :
- Guard en premier : `if procedure_type.id == "import-pdf" { anyhow::bail!("Le type réservé import-pdf ne peut pas être modifié") }`
- Vérification doublon : `find_by_name(name.trim())` → si trouvé et `found.id != procedure_type.id` → bail doublon

**`delete_procedure_type`** :
- Guard en premier : `if id == "import-pdf" { anyhow::bail!("Le type réservé import-pdf ne peut pas être supprimé") }`

---

### Étape 4 — Tests backend (R3, R4, R22)

**`src-tauri/src/context/procedure/service.rs`** — module `#[cfg(test)]`

Tests à ajouter :
- `test_add_procedure_type_rejects_duplicate_name`
- `test_add_procedure_type_normalizes_empty_category`
- `test_update_procedure_type_rejects_import_pdf`
- `test_delete_procedure_type_rejects_import_pdf`
- `test_update_procedure_type_rejects_duplicate_name`
- `test_update_procedure_type_allows_same_name_same_id`

---

### Étape 5 — Synchronisation des types

```bash
just generate-types
```

---

### Étape 6 — Frontend : constante réservée (R23)

**`src/features/procedure-type/shared/types.ts`**
```ts
export const RESERVED_PROCEDURE_TYPE_ID = 'import-pdf';
```

---

### Étape 7 — Frontend : filtre + erreur + retry (R23, R15)

**`src/features/procedure-type/procedure_type_list/useProcedureTypeList.ts`**
- Filtrer avant map : `.filter(pt => pt.id !== RESERVED_PROCEDURE_TYPE_ID)`
- Ajouter `error: string | null` et `retry: () => void` (appel gateway direct)

---

### Étape 8 — Frontend : compteur filtré (R11, R23)

**`src/features/procedure-type/useProcedureTypeManager.ts`** (ou fichier équivalent)
- Compteur : `procedureTypes.filter(pt => pt.id !== RESERVED_PROCEDURE_TYPE_ID).length`

---

### Étape 9 — Frontend : 5 états du tableau (R12, R13, R15)

**`src/features/procedure-type/procedure_type_list/ProcedureTypeList.tsx`**

5 états `tbody` distincts :
1. `loading` → ligne animée (existant)
2. `error` → message + bouton "Réessayer" (**nouveau** — R15)
3. `rows.length === 0 && !searchTerm` → message vide avec invite FAB (R12)
4. `sortedAndFiltered.length === 0 && searchTerm` → message neutre sans invite (R13)
5. Lignes de données (existant)

---

### Étape 10 — Frontend : modal de création (R16)

**Créer `src/features/procedure-type/create_procedure_type_modal/useCreateProcedureTypeModal.ts`**
- Migrer logique depuis `useAddProcedureTypePanel.ts`
- Reset formulaire à la fermeture (`useEffect` sur `isOpen`)
- Exposer : `formData`, `errors`, `loading`, `handleChange`, `handleSubmit`

**Créer `src/features/procedure-type/create_procedure_type_modal/CreateProcedureTypeModal.tsx`**
- Utiliser `FormModal` (de `ui/components`)
- Réutiliser `ProcedureTypeForm` depuis `shared/`
- Props : `isOpen: boolean`, `onClose: () => void`
- Erreur backend → snackbar erreur, modal reste ouverte (R16)
- Succès → modal fermée + formulaire réinitialisé (R16)

---

### Étape 11 — Frontend : ProcedureTypeManager (R16)

**`src/features/procedure-type/ProcedureTypeManager.tsx`**
- Remplacer `ManagerLayout` par layout `div` pleine largeur :
  - `ManagerHeader` (titre, compteur filtré, champ recherche)
  - `div` scrollable contenant `ProcedureTypeList`
  - `FAB` (`ui/components`) positionné `fixed bottom-12 right-12`
  - `CreateProcedureTypeModal` (état local `isCreateModalOpen`)
- Supprimer imports `AddProcedureTypePanel` et `ManagerLayout`

---

### Étape 12 — Suppression add_procedure_type_panel/

Supprimer :
- `src/features/procedure-type/add_procedure_type_panel/AddProcedureTypePanel.tsx`
- `src/features/procedure-type/add_procedure_type_panel/useAddProcedureTypePanel.ts`
- `src/features/procedure-type/add_procedure_type_panel/AddProcedureTypePanel.test.tsx`

---

### Étape 13 — i18n (R12, R13, R15, R16)

**`src/i18n/locales/fr/procedure-type.json`** et **`src/i18n/locales/en/procedure-type.json`**

Ajouter sous `list` :

| Clé | FR | EN |
|---|---|---|
| `list.noResults` | `"Aucun type d'acte ne correspond à votre recherche."` | `"No procedure types match your search."` |
| `list.empty` | `"Aucun type d'acte. Utilisez le bouton + pour en créer un."` | `"No procedure types yet. Use the + button to create one."` |
| `list.loadError` | `"Impossible de charger les types d'actes."` | `"Failed to load procedure types."` |
| `list.retry` | `"Réessayer"` | `"Retry"` |

Supprimer clés obsolètes liées au side-panel (`page.addDescription`, `action.adding` si inutilisées).

---

### Étape 14 — Tests frontend

**Créer `src/features/procedure-type/create_procedure_type_modal/useCreateProcedureTypeModal.test.ts`**
- Soumission valide → `addProcedureType` appelé + formulaire réinitialisé
- Nom vide → erreur inline, pas d'appel gateway
- Erreur backend (doublon) → snackbar erreur, modal reste ouverte

**Modifier `src/features/procedure-type/ProcedureTypeManager.test.tsx`**
- Clic FAB → modal de création s'ouvre
- Compteur exclut `import-pdf`

**Modifier `src/features/procedure-type/procedure_type_list/ProcedureTypeList.test.tsx`**
- État vide (0 types, pas de recherche) → message avec invite FAB
- Aucun résultat (recherche sans match) → message neutre sans invite
- État erreur → message + bouton "Réessayer"

---

### Étape 15 — Quality checks

```bash
python3 scripts/check.py
```

---

### Étape 16 — Code review (agent `reviewer`)

Lancer l'agent `reviewer` sur les fichiers modifiés. Afficher le rapport complet. Corriger les critiques. Re-lancer jusqu'à 0 critique.

---

### Étape 17 — UX review (agent `ux-reviewer`)

Des fichiers `.tsx` ont été modifiés → lancer l'agent `ux-reviewer`. Afficher le rapport complet. Corriger les critiques. Re-lancer jusqu'à 0 critique.

---

### Étape 18 — i18n check (agent `i18n-checker`)

Du texte frontend a été ajouté/modifié → lancer l'agent `i18n-checker`. Corriger les clés manquantes ou hardcodées.

---

### Étape 19 — Documentation

- `ARCHITECTURE.md` — section `procedure-type/` : noter `create_procedure_type_modal/` (remplace `add_procedure_type_panel/`)
- `docs/todo.md` — retirer les items résolus liés à `procedure-type`

---

### Étape 20 — Spec checker (agent `spec-checker`)

Lancer l'agent `spec-checker` sur `docs/spec/procedure-type-spec.md` pour vérifier que toutes les règles R1→R23 sont implémentées et couvertes par des tests.
