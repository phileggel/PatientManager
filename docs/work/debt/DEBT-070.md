# 2026-10-17 — DEBT-070 — Dependency drift at the audit of the batch after 0.24.7

**Found by:** `/dep-audit`, 2026-10-17 (`npm outdated`, `cargo outdated -R`, `npm audit`: 0, `cargo audit`: DEBT-067's three `zip` advisories, unreached)

**Where:** `package.json`, `src-tauri/Cargo.toml`

**Observation:** major drift, npm: `@testing-library/jest-dom` 7, `@types/node` 26, `@vitejs/plugin-react` 6, `@vitest/coverage-v8` 5, `happy-dom` 21, `i18next` 26, `lucide-react` 1.x, `react-i18next` 17; Cargo: `lopdf` 0.45, `mockall` 0.15, `rust_xlsxwriter` 0.100, `sha2` 0.11, `specta` / `tauri-specta` rc.25. Minor drift: Tauri 2.10 → 2.12 (core and plugins), React 19.3, Tailwind 4.3, Biome 2.5, Playwright 1.64, tokio 1.53 and others. Unmaintained transitive crates: `bincode`, `fxhash`, `paste`, `proc-macro-error`. The skill never upgrades.

**Size:** M

**Waits on the owner:** no
