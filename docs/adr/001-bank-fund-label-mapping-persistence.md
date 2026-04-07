# ADR 001 — Persistance des mappings label→fonds (BankFundLabelMapping)

**Date**: 2026-04-07
**Status**: Accepted

## Context

Le rapprochement bancaire automatique (spec `bank-statement-auto-match`) nécessite de mémoriser par compte bancaire l'association entre un label de virement (ex. `CPAM93`) et un fonds de la base, ou son rejet explicite (label non-caisse). Ces mappings sont saisis par l'utilisateur lors du premier import d'un relevé et doivent être pré-remplis lors des imports suivants.

Trois décisions de conception ont été prises lors de l'implémentation initiale (R1–R22) :

1. Comment représenter l'état "rejeté" en base.
2. Quelle stratégie d'upsert adopter pour éviter la duplication des enregistrements.
3. Comment garantir l'unicité fonctionnelle `(compte, label)` tout en restant cohérent avec le pattern soft-delete du projet.

## Décision

### 1. Rejet représenté par `fund_id = NULL`

L'état "rejeté" (label identifié comme non-caisse) est stocké comme `fund_id = NULL` dans la table `bank_fund_label_mapping`. Pas de colonne `is_rejected` booléenne séparée.

L'API Rust accepte la valeur sentinelle `"REJECTED"` en entrée (cohérence avec le frontend) et la convertit en `None` avant persistance. Le type de domaine `BankFundLabelMapping` expose `fund_id: Option<String>` — `None` = rejeté, `Some(id)` = fonds affecté.

**Alternatives considérées :**

- Colonne `is_rejected BOOLEAN` séparée : redondante avec la nullabilité de `fund_id`, introduit un état incohérent possible (`fund_id` renseigné ET `is_rejected = true`).
- Valeur sentinelle persistée en base (`"REJECTED"`) : viole l'intégrité référentielle (FK sur `fund_id`).

### 2. Upsert par check-then-update

La sauvegarde d'un mapping effectue d'abord une recherche de l'enregistrement actif `(bank_account_id, bank_label)`, puis une mise à jour `UPDATE SET fund_id` si trouvé, ou un `INSERT` sinon.

Cette approche préserve l'`id` UUID de l'enregistrement à travers les mises à jour, contrairement à `INSERT OR REPLACE` qui génèrerait un nouvel UUID à chaque upsert et casserait toute référence externe potentielle.

### 3. Soft-delete avec index partiel d'unicité

La table utilise `is_deleted INTEGER NOT NULL DEFAULT 0` (cohérent avec toutes les autres entités du projet). L'unicité fonctionnelle est garantie par un index partiel :

```sql
CREATE UNIQUE INDEX idx_bank_fund_label_active
    ON bank_fund_label_mapping(bank_account_id, bank_label)
    WHERE is_deleted = 0;
```

Cela permet à un enregistrement soft-deleted de coexister avec un nouvel enregistrement actif pour le même `(compte, label)`, sans contrainte d'unicité globale.

La clé fonctionnelle est donc `(bank_account_id, bank_label)` parmi les enregistrements actifs.

## Consequences

- **Pros** :
  - Cohérence totale avec le pattern soft-delete du projet (pas d'exception).
  - `fund_id: Option<String>` est idiomatique en Rust — le compilateur force la gestion du cas `None`.
  - L'`id` UUID est stable à travers les mises à jour, compatible avec d'éventuelles références futures.
  - FK sur `fund_id` garantie par SQLite (NULL exclu de la vérification FK).

- **Cons** :
  - Si un fonds est supprimé (soft-delete), ses mappings actifs pointent vers un `fund_id` valide en base mais vers une entité invisible dans l'UI — orphelins fonctionnels non détectés au niveau SQL. Comportement accepté : la cascade soft-delete sur les mappings n'est pas implémentée.
  - La valeur sentinelle `"REJECTED"` dans l'API de commande Tauri (`save_bank_fund_label_mappings`) est une convention implicite non typée côté frontend — un type discriminant explicite serait plus robuste.
