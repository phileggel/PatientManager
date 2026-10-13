# FLOW-019 — The E2E tooling pulls advisories with no patched release (DEBT-019)

- Kind: quality
- Size: S
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
- Re-checked 2026-10-10 (`/dep-audit`, the batch of that day): unchanged in kind. `npm audit` reports 21
  advisories (20 high, 1 low), all under the E2E tooling; `npm audit --omit=dev` and `cargo audit` report no
  vulnerability in what ships (14 allowed warnings: 10 unmaintained crates, 4 unsound, all transitive).
  WebdriverIO 10.0.2 is out. Minor updates wait on most direct dependencies (Tauri 2.10 to 2.12 and its
  plugins, tokio, serde, uuid), read from the registries; the web search did not confirm the latest Rust
  and Tauri versions.
- Re-checked 2026-10-11 (`/dep-audit`, the batch of that day): unchanged. 21 advisories (20 high, 1
  low), all under the E2E and build tooling; `npm audit --omit=dev` reports none and `cargo audit` no
  vulnerability (14 allowed warnings; one of the four unsound crates, `event-listener` 5.4.1, has a fixed
  5.4.2). WebdriverIO 10.0.2 still clears 19; `npm audit fix` clears `source-map-js` and `esbuild`.
- Proposal: owner's call for the next batch — `npm audit fix` now, WebdriverIO 10 once the
  major has a few weeks behind it; the E2E suites are its only user.
- Re-checked 2026-10-11 (audit of the 0.24.3 batch, `flow-auditor`): its condition, a fixed release, has held since 2026-10-06, across three
  re-checks with no decision.
- Re-checked 2026-10-12 (`/dep-audit`, before the release after 0.24.4): unchanged. 21 advisories (20
  high, 1 low), all under the E2E tooling; `npm audit --omit=dev` reports none and `cargo audit` no
  vulnerability (3 unsound warnings, all transitive). WebdriverIO 10.0.2 clears 19; `npm audit fix`
  clears `source-map-js` and `esbuild`. The registries put Tauri at 2.12.3 (2.10.3 in use) and Rust at
  1.99.0 installed; the web search confirmed neither.
- Decision (owner, 2026-10-12): queued for the next batch — WebdriverIO 10 (the major of the E2E
  tooling, 10.0.2 at the time) with `npm audit fix` (banked the same day), one chore pull request;
  the E2E suites are the proof.
- Re-checked 2026-10-13 (audit of the 0.24.5 batch, `flow-auditor`): decided 2026-10-12 for the next batch; `/dep-audit` of 2026-10-12 unchanged. Left.
