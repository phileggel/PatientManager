# Règles Métier — Gestion des Comptes Bancaires (bank-account)

## Contexte

Les comptes bancaires représentent les comptes du praticien depuis lesquels les virements sont suivis. Ils permettent d'identifier le compte lors de l'import d'un relevé PDF et d'associer les virements manuels.

---

## Règles métier

**R1 — Champs d'un compte (frontend + backend)** : Un compte bancaire est identifié par un nom et un IBAN. L'IBAN est optionnel mais nécessaire pour que le flux d'import automatique de relevé PDF puisse identifier le compte correspondant.

**R2 — Modification (frontend + backend)** : Le nom et l'IBAN peuvent être modifiés à tout moment.

**R3 — Suppression (frontend + backend)** : La suppression est un soft-delete — le compte est marqué supprimé mais reste en base. Il n'y a pas de contrainte bloquante si le compte est lié à des virements existants.

**R4 — Compte caisse par défaut (backend)** : Un compte caisse est précréé par migration avec l'id fixe `cash-account-default`. Il n'a pas d'IBAN, ne peut pas être modifié ni supprimé. Il sert exclusivement à enregistrer les paiements reçus en espèces. Son nom affiché provient de l'i18n, pas de la base de données.

---

## Workflow

```
[Utilisateur crée / modifie un compte]
  → Saisie du nom et de l'IBAN (optionnel)
  → Validation
          │
          ▼
[Compte enregistré]
```
