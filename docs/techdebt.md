# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns. Not commitments — tech-debt entries describe _what's odd_, not _what to do_. For action items see `docs/todo.md`.

`whats-next` reads from this file; entries surface as work candidates labelled with their date.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->


## 2026-05-16 — RTL coverage gap on currency-display components

**Where:** Components with `formatCurrency` calls but no RTL test:
`SelectProceduresPanel`, `SelectFundGroupsPanel`, `BankTransferList`,
`EditBankTransferModal`, `AddBankTransferForm`, `MatchResultsStep`,
`ProcedureTypeMappingStep`, `EditFundPaymentModal`, `PdfDataTable`,
`NotFoundCard`, `UnreconciledReport`, `GroupMatchCard`.

**Observation:** Surfaced by PR #33's codecov flag (~16 of 18 missing lines on
the currency-i18n sweep). None had RTL tests before the PR — the migration to
`formatCurrency` routed existing display through a different helper, exposing
the pre-existing gap. Functional regression risk is low (mechanical display
swap; the formatter is unit-tested in `src/lib/formatters.test.ts` and the
integration is covered by `SingleMatchCard.test.tsx` AmountMismatch and
`FundPaymentList.test.tsx` locale-aware regressions). Add RTL coverage
**bit-by-bit when these components are next touched for behavioral changes**,
not as a sweep.

---

## 2026-05-13 — `rsa 0.9.10` (Marvin timing side-channel) compiled in via `sqlx-mysql` even though we use SQLite only

**Where:** `Cargo.lock` — `rsa 0.9.10` pulled in by `sqlx-macros → sqlx-mysql 0.8.6`. `Cargo.toml` declares `sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "sqlite"] }` — no `mysql` feature.

**Observation:** [RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071) flags `rsa <= 0.9.x` as vulnerable to the Marvin attack (RSA key recovery via timing sidechannel). The crate ends up in our compiled binary because `sqlx-macros` resolves dependencies for every sqlx backend at proc-macro time, even features we don't enable at runtime. **No runtime path in this app calls MySQL or invokes `rsa`** — the code is dead in execution. Upstream advisory currently shows _"No fixed upgrade is available!"_; track via `sqlx` ≥ 0.9 (whenever it lands) or a `sqlx-mysql` feature exclusion. Pre-existing — surfaced by the pre-release `cargo audit` run.

---

## 2026-05-13 — `serialize-javascript` RCE/DoS in mocha via `@wdio/mocha-framework` (E2E dev dep only)

**Where:** `package-lock.json` — `@wdio/mocha-framework@9.27.1 → mocha → serialize-javascript ≤ 7.0.4`. Two advisories: [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) (RCE via `RegExp.flags`) and [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) (DoS via crafted array-likes).

**Observation:** `npm audit fix` cannot reach this without `--force`, which would downgrade `@wdio/mocha-framework` to 6.1.17 (major breaking change in our WebDriver E2E setup). Exposure is dev-only (test runner serialization), not in production. Track until `@wdio/mocha-framework` (or upstream mocha) ships a non-vulnerable `serialize-javascript`.
