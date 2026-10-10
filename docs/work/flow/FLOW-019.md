# FLOW-019 — The E2E tooling pulls advisories with no patched release (DEBT-019)

- Kind: quality
- Observed: `npm audit` reports 19 high advisories, all through `basic-ftp`, `braces` and
  `extract-zip` under `@wdio/*` 9.32. None ships in the app: `npm audit --omit=dev`, the
  weekly Security Audit gate, is clean. `braces` and `extract-zip` have no patched
  release; the only fix npm offers is a downgrade to WebdriverIO 5.
- Watch (owner, 2026-10-04): nothing to do until a fixed release exists; each `/dep-audit`
  before a release re-checks it and the agent reports when one does.
- Re-checked 2026-10-06 (`/dep-audit`, 0.24.1): a fixed release exists. WebdriverIO 10.0.0,
  published 2026-10-05, clears 18 of the 20 high advisories; `npm audit fix` clears the
  other two (`source-map-js`, and `esbuild`, low) without a major upgrade. What ships is
  still clean (`npm audit --omit=dev`, `cargo audit`).
- Proposal: owner's call for the next batch — `npm audit fix` now, WebdriverIO 10 once the
  major has a few weeks behind it; the E2E suites are its only user.
