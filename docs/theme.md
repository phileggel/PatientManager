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

**R6 — En-tête adapté au mode nuit** : L'en-tête utilise des tokens de dégradé (`--color-header-from` / `--color-header-to`) qui s'adaptent au mode sombre avec un indigo plus profond (`#21005D → #381E72` en mode sombre, `#4F378A → #6750A4` en mode clair). L'identité visuelle de marque est préservée dans les deux modes, le texte blanc restant accessible (contraste > 7:1 WCAG AA).

> **Waiver — pas de test automatisé pour R6** : Vérifier des valeurs hex CSS statiques dans un test automatisé serait trivial et fragile (dépendance au tooling de build). R6 est vérifiable visuellement en mode clair/sombre. Aucun test n'est requis pour cette règle.

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
  → L'en-tête bascule vers un indigo plus profond (tokens dark)
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
