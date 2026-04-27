# Business Rules — Interface Theme (theme)

## Context

The interface offers three display modes: light, dark, and automatic. The mode is toggled by a button in the header, persisted locally, and restored on every startup.

---

## Business Rules

**R1 — Available modes**: Three modes are available: `day` (always light), `night` (always dark), `auto` (follows the OS system preference).

**R2 — Toggle cycle**: The header button cycles through the modes in the order `day → night → auto → day`. The icon reflects the current mode: sun (`day`), moon (`night`), monitor (`auto`).

**R3 — Persistence**: The selected mode is persisted in `localStorage` under the key `theme-mode`. It is restored on application startup. When no value is stored, `auto` is used by default.

**R4 — Auto mode**: In `auto` mode, the theme is determined by `prefers-color-scheme: dark`. The interface reacts in real time to system preference changes (e.g. macOS switching automatically at sunset), with no reload required.

**R5 — Theme application**: Light theme is the default state (base `@theme` tokens in `tailwind.css`). The `.dark` class is applied to `<html>` only in `night` mode, or in `auto` mode when the OS is set to dark. In `day` mode, the `.dark` class is removed from `<html>`.

**R6 — Header adapted to night mode**: The header uses gradient tokens (`--color-header-from` / `--color-header-to`) that adapt to dark mode with a deeper indigo (`#21005D → #381E72` in dark mode, `#4F378A → #6750A4` in light mode). The brand visual identity is preserved in both modes, white text remaining accessible (contrast > 7:1, WCAG AA).

> **Waiver — no automated test for R6**: Verifying static CSS hex values in an automated test would be trivial and fragile (build-tooling dependent). R6 is verifiable visually in light/dark mode. No test is required for this rule.

---

## Workflow

```
[User clicks the theme button]
  → Next mode in the cycle (day → night → auto → day)
  → Persisted in localStorage
          │
          ▼
[.dark class added/removed on <html>]
  → All M3 tokens switch via tailwind.css
  → Header switches to a deeper indigo (dark tokens)
```

```
[Application startup]
  → Read localStorage["theme-mode"]
  → Fallback: auto
          │
          ▼ (if auto)
[Read prefers-color-scheme]
  → Listen to OS changes in real time
```
