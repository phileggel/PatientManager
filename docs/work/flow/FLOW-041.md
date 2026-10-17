# FLOW-041 — The screenshot tooling has no browser for this machine's system

- Kind: effort
- Size: S
- Observed: on the new development machine (Ubuntu 26.04), `scripts/visual-proof-capture.mjs`
  failed: the project's Playwright has no Chromium build for that system, and
  `npx playwright install chromium` refuses it. The capture worked with
  `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`, for the install and for each run.
  `/visual-proof` and the README say nothing of it.
- Proposal: the capture script sets the override itself when the system is newer than
  what Playwright knows, or Playwright is raised in the next `/dep-audit`; the README's
  setup names the browser install.
- Costs: a few lines, or a dependency bump. Protects: twenty minutes on every new machine.
- Re-measured 2026-10-11 (audit of the 0.24.3 batch, `flow-auditor`): `visual-proof-capture.mjs` never run in the batch.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): `visual-proof-capture.mjs` not run again. Left.
- Re-checked 2026-10-17 (audit of the 0.24.7 batch, `flow-auditor`): 2 captures ran without the override (by the session agent); Playwright is unchanged in `package-lock.json` since 2026-05-03, so nothing in the batch explains it. The README gap for a new machine stands. Left.
