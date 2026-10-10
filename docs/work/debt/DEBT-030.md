# 2026-10-04 — DEBT-030 — The import entry-point E2E test timed out once on Windows

**Found by:** CI (Windows E2E on gh#188, run 37228153025; green on the re-run of the same commit)

**Where:** `e2e/fund-payment-report/entry-point.test.ts`

**Observation:** `#nav-import` did not exist 10 seconds after the app started, right after the diagnostic-report suite; the six suites before it passed, and the pull request changed one comment in `wdio.conf.ts`. One occurrence. If it comes back, look at what the window shows at that moment (the failure screenshot) before raising the timeout: the test waits for the first render of a freshly started app.
