# Règles Métier — Gestion des Comptes Bancaires (bank-account)

## Contexte

Les comptes bancaires représentent les comptes du praticien depuis lesquels les virements sont suivis. Ils permettent d'identifier le compte lors de l'import d'un relevé PDF et d'associer les virements manuels.

---

## Règles métier

**R1 — Champs d'un compte (frontend + backend)** : Un compte bancaire est identifié par un nom et un IBAN. L'IBAN est optionnel mais nécessaire pour que le flux d'import automatique de relevé PDF puisse identifier le compte correspondant.

**R2 — Modification (frontend + backend)** : Le nom et l'IBAN peuvent être modifiés à tout moment.

**R3 — Suppression (frontend + backend)** : La suppression est réversible.

**R4 — Compte caisse par défaut ⚠️ non implémenté (backend)** : Un compte caisse est précréé par défaut dans le système. Il n'a pas d'IBAN, ne peut pas être modifié ni supprimé. Il sert exclusivement à enregistrer les paiements reçus en espèces.

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
