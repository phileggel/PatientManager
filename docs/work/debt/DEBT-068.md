# 2026-10-17 — DEBT-068 — The E2E invoke helper calls the Tauri bridge before a fresh app has loaded it

**Found by:** the release workflow of v0.24.6, Windows E2E gate (run 39013736595, 2026-10-17): 9 suites passed, `patient-duplicate` failed in its `before` hook

**Where:** `e2e/helpers/tauri-invoke.ts` (`tauriInvoke`), `e2e/patient-duplicate/patient-duplicate.test.ts` (`before`)

**Observation:** `tauriInvoke` runs `window.__TAURI_INTERNALS__.invoke` through `browser.execute` with no wait. The patient-duplicate suite seeds through it before touching the page, and on Windows, in a freshly started app, the bridge was not there yet: "add_patient failed: Cannot read properties of undefined (reading 'invoke')". Linux E2E passed; the same suite passed the v0.24.5 gate and its setup did not change, so WebdriverIO 10 (FLOW-019) starting the session sooner is the likely trigger (not checked). No release draft was built; the owner chose a fix and v0.24.7 (2026-10-17).

**Size:** S

**Waits on the owner:** no
