# Règles Métier — Thème de l'interface (theme)

## Contexte

L'interface propose trois modes d'affichage : clair, sombre, et automatique. Le mode est contrôlé par un bouton dans l'en-tête, persisté localement, et restauré à chaque démarrage.

---

## Règles métier

**R1 — Modes disponibles** : Trois modes sont disponibles : `day` (toujours clair), `night` (toujours sombre), `auto` (suit la préférence système de l'OS).

**R2 — Cycle de basculement** : Le bouton dans l'en-tête fait tourner les modes dans l'ordre `day → night → auto → day`. L'icône reflète le mode courant : soleil (`day`), lune (`night`), moniteur (`auto`).

**R3 — Persistance** : Le mode sélectionné est persisté dans `localStorage` sous la clé `theme-mode`. Il est restauré au démarrage de l'application. En l'absence de valeur stockée, le mode `auto` est utilisé par défaut.

**R4 — Mode auto** : En mode `auto`, le thème est déterminé par `prefers-color-scheme: dark`. L'interface réagit en temps réel aux changements de préférence système (ex. macOS qui bascule automatiquement au coucher du soleil), sans rechargement.

**R5 — Application du thème** : Le thème clair est l'état par défaut (tokens `@theme` de base dans `tailwind.css`). La classe `.dark` est posée sur `<html>` uniquement en mode `night`, ou en mode `auto` si l'OS est en sombre. En mode `day`, la classe `.dark` est retirée de `<html>`.

**R6 — En-tête exempt du mode nuit** : L'en-tête utilise des tokens de dégradé fixes (`--color-header-from` / `--color-header-to`, indigo profond `#4F378A → #6750A4`) qui ne sont pas redéfinis dans le bloc `.dark`. L'en-tête conserve ainsi son identité visuelle de marque dans tous les modes.

---

## Workflow

```
[Utilisateur clique sur le bouton de thème]
  → Mode suivant dans le cycle (day → night → auto → day)
  → Persisté dans localStorage
          │
          ▼
[Classe .dark ajoutée/retirée sur <html>]
  → Tous les tokens M3 basculent via tailwind.css
  → L'en-tête reste inchangé (tokens fixes)
```

```
[Démarrage de l'application]
  → Lecture de localStorage["theme-mode"]
  → Fallback : auto
          │
          ▼ (si auto)
[Lecture de prefers-color-scheme]
  → Écoute des changements OS en temps réel
```
