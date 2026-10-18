# 2026-10-18 — DEBT-074 — An unused locale key stays, since nothing reports one

**Found by:** the release sweep of the batch of 2026-10-18 (`reviewer-frontend`); confirmed by grep

**Where:** `src/i18n/locales/{en,fr}/common.json` (`error.required_fields`); the i18n checks (`docs/i18n-rules.md`)

**Observation:** `common:error.required_fields` has no caller, already at v0.24.8: the only `required_fields` lookup there was the procedure namespace's, renamed `invalid_fields` under TODO-026. Nothing reports a key no code reads, so removals like this one leave the other namespaces' copies behind. Remove the key; a check listing keys absent from `src/` (allowing the runtime-interpolated sets of DEBT-005) would catch the next one.

**Size:** S

**Waits on the owner:** no
