# FLOW-041 — The screenshot tooling has no browser for this machine's system

- Kind: effort
- Observed: on the new development machine (Ubuntu 26.04), `scripts/visual-proof-capture.mjs`
  failed: the project's Playwright has no Chromium build for that system, and
  `npx playwright install chromium` refuses it. The capture worked with
  `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`, for the install and for each run.
  `/visual-proof` and the README say nothing of it.
- Proposal: the capture script sets the override itself when the system is newer than
  what Playwright knows, or Playwright is raised in the next `/dep-audit`; the README's
  setup names the browser install.
- Costs: a few lines, or a dependency bump. Protects: twenty minutes on every new machine.
