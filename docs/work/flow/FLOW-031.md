# FLOW-031 — A release never waits for a manual check: a doubt is a gap in the harness

- Kind: quality
- Observed: DEBT-027 (the permissions narrowed) left three checks for a person on an
  installed build: the open dialog, the save dialog, the restart after a restore. The
  agent first placed them before the release, where they would have tested the old
  build, then asked to hold the 0.24.1 draft until they were done. The owner published
  without them (2026-10-06): "normally you should be confident that it works. Otherwise
  what is the purpose of the harness? If you're not confident, you should improve the
  harness."
- What the harness proves today: `scripts/tests/test_capabilities.py` reads every call the
  frontend makes to the dialog and process plugins and fails if one is not granted, or if
  a grant has no caller. What it does not prove: that a granted call goes through on a
  real build. E2E replaces the native dialogs (ADR-007) and never restarts the
  application, on Linux or on the Windows gate.
- Decision (owner, 2026-10-06): no manual check gates a release; the agent publishes the
  draft when the release workflow and `main` are green. An entry that would ask a person
  to check something adds the check to the harness instead, or says in its Done when why
  it cannot. For DEBT-027: an E2E test on the built application that makes the real plugin
  calls — open, save, restart — and fails on a permission refusal, the dialogs' windows
  themselves staying out of reach of the driver.
- Costs: one E2E suite that talks to the plugins without the override. Protects: a
  release that ships a permission the screens need and no test noticed.
