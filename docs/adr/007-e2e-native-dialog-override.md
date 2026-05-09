# ADR 007 — E2E native-dialog override pattern

**Date**: 2026-05-09
**Status**: Accepted

## Context

End-to-end tests (Tauri WebDriver / `wdio.conf.ts`) cannot drive native OS
dialogs. Every gateway method that wraps `@tauri-apps/plugin-dialog`'s
`open()` or `save()` therefore needs a way for tests to substitute a
deterministic return value without invoking the OS picker. As of this PR
the project has four such call sites:

- `src/features/shell/gateway.ts` — `pickExcelFilePath`, `pickPdfFilePath`
- `src/features/db-backup/gateway.ts` — `pickExportPath`, `pickImportPath`

A fifth gateway method, `src/features/fund-payment-match/gateway.ts::saveReportPdf`,
also opens a native save dialog — but its filesystem write step moved to a
backend Tauri command in PR #16, leaving the dialog-only step deliberately
out of scope for this pattern. The downstream FPR E2E test mocks the backend
save command via the existing IPC stubbing path; only the dialog return value
would need overriding here, and that can be added in a follow-up if the FPR
E2E test is later extended to cover the save click.

A consistent pattern was needed before the FPR E2E test could be written,
and before further native-API gateway methods are added (save dialogs,
native menus, OS notifications, OS clipboard, etc.).

Three alternatives were considered:

1. **Window-attached test sandbox** — gateway methods consult a typed
   `window.__e2e` object; tests set entries on that object via WebDriver
   `executeScript` (or the Playwright equivalent `addInitScript`) before
   exercising the UI. Override branch is gated by
   `import.meta.env.MODE !== "production"` so it tree-shakes out of true
   release builds (`vite build`, default mode='production') but stays
   present in any non-production Vite mode — `development`, `test`
   (vitest), and a custom `e2e` mode used for the WebDriver build.
2. **Build flavor split (Vite mode `e2e`)** — a separate Vite mode swaps
   real gateway implementations for stubs at bundle time. Override code
   never ships to prod by construction.
3. **Dependency injection (React context or constructor injection)** —
   each gateway method takes its dependencies as arguments; tests pass
   mocks through the React tree.

Option 1 is the de facto standard for desktop apps with WebDriver-style
E2E in 2026 — it is what Playwright's `addInitScript` is designed for, what
Storybook's preview hook does, what React DevTools' global hook does, and
what most of the public Tauri E2E examples use.

Option 2 has zero runtime cost in prod (the override code does not exist
in the bundle) but introduces a parallel build mode that must be kept in
sync with the production mode forever. Drift between the two modes would
silently change observable behavior in tests vs. prod.

Option 3 is the academically pure option. Applied to a gateway layer it
would force every consumer (component, hook) to know about and pass
gateway implementations through the React tree, doubling indirection
without observability gain — gateways already exist precisely to be the
abstraction boundary that components do not need to think about.

## Decision

Adopt **option 1**: a single typed `window.__e2e` namespace and a generic
`e2eOverride()` helper that every native-API gateway method routes
through.

The helper lives at `src/lib/e2e.ts`. The shape below is illustrative —
the live source is the authority; consult `src/lib/e2e.ts` for the
current code.

```ts
declare global {
  interface Window {
    __e2e?: {
      pickExcelFilePath?: string | null;
      pickPdfFilePath?: string | null;
      pickExportPath?: string | null;
      pickImportPath?: string | null;
      // one entry per native-API call as the surface grows
    };
  }
}

type E2eOverrides = NonNullable<Window["__e2e"]>;
type OverrideValue<K extends keyof E2eOverrides> = Exclude<
  E2eOverrides[K],
  undefined
>;

export async function e2eOverride<K extends keyof E2eOverrides>(
  key: K,
  real: () => Promise<OverrideValue<K>>,
): Promise<OverrideValue<K>> {
  // `!== undefined` (not `key in`) so a stub of `null` (= cancel) fires
  // the override but a stub of `undefined` falls through to `real()`.
  // The mode allowlist (vs. denylist `!== "production"`) prevents future
  // custom modes (`staging`, `qa`, ...) from inheriting the override
  // silently — new modes that need the override must be added here.
  if (
    (import.meta.env.MODE === "development" ||
      import.meta.env.MODE === "test" ||
      import.meta.env.MODE === "e2e") &&
    window.__e2e &&
    window.__e2e[key] !== undefined
  ) {
    return window.__e2e[key] as OverrideValue<K>;
  }
  return real();
}
```

Every gateway site that wraps a native API becomes a one-liner:

```ts
export async function pickPdfFilePath(title: string): Promise<string | null> {
  return e2eOverride("pickPdfFilePath", () => realPickPdfFilePath(title));
}
```

The test side exposes a thin helper at `e2e/helpers/e2e.ts`:

```ts
export async function setE2eOverrides(overrides: Window["__e2e"]) {
  await browser.execute((o) => {
    window.__e2e = o;
  }, overrides);
}
```

Tests call `setE2eOverrides({ pickPdfFilePath: "/path/to/fixture.pdf" })`
before clicking the import button; the gateway returns the stubbed path
without showing an OS dialog.

### Prod isolation and build modes

The `import.meta.env.MODE !== "production"` guard tree-shakes the
override branch out of `vite build` (mode='production'), but keeps it
present in:

- `vite dev` / `tauri dev` — mode='development'
- `vitest` — mode='test'
- the E2E build (see below) — mode='e2e'

For E2E specifically, the WebDriver binary is produced via
`npm run build:e2e` (= `vite build --mode e2e`). Tauri's
`beforeBuildCommand` is overridden for the E2E run via a dedicated
`src-tauri/tauri.e2e.conf.json` that the WebDriver harness passes to
`tauri build` via `--config tauri.e2e.conf.json`. The base
`tauri.conf.json` is unchanged — `tauri build --release` (the user-
facing release path) still calls `npm run build` (mode='production'),
so the override branch remains tree-shaken from shipped binaries.

The `window.__e2e` declaration is a `declare global` — types only, no
runtime code emitted. Net cost in production: zero.

Why mode-based gating rather than a simple env-var flag (e.g.
`VITE_E2E=true`)? Mode is the Vite-idiomatic seam for environment-
specific builds, composes with `.env.<mode>` files for future E2E-only
config (test API endpoints, locale forcing, telemetry off), shows up
verbatim in the build invocation rather than lurking in environment
state, and stays consistent with how vitest already runs (mode='test').
A single env-var flag would have worked for today's one knob; modes
scale.

### Rules

1. **Every new native-API gateway method MUST route through `e2eOverride()`**
   if it is reachable from a UI action that an E2E test will exercise.
   Native-API methods that are unreachable from UI (e.g. dev-only
   tooling) are exempt.
2. **One entry per call site** in the `Window["__e2e"]` interface. Keys
   match the gateway method name — keeps the test code self-documenting.
3. **No `as any` at the override declaration site.** The typed namespace
   is the contract; if a new key is missing from the interface, TypeScript
   should fail to compile the gateway.
4. **Test cleanup is the test's responsibility**, not the helper's. Tests
   set overrides in their `before` hook and rely on the WebDriver session
   resetting between specs (each spec gets a fresh `window`).

## Consequences

**Positive**:

- One pattern for every native-API gateway. Mechanical to read, mechanical
  to write, mechanical to extend.
- Type-safe end-to-end. Adding a new override entry requires a type
  declaration; misspelled keys fail at compile time.
- Tree-shaken out of release builds via the `MODE !== "production"`
  guard — no runtime cost in prod. The custom `e2e` Vite mode is the
  one extra knob this introduces (see `package.json::build:e2e` and
  `src-tauri/tauri.e2e.conf.json`); it composes with `.env.<mode>` for
  future E2E-only config.
- Compatible with the existing WebDriver setup (no Playwright migration
  required); `browser.execute` directly populates `window.__e2e`.
- Compatible with future Playwright migration (`addInitScript` populates
  the same window key).

**Neutral**:

- Adds a single point that every gateway call passes through. The
  indirection is one function call per native-API access; negligible
  perf cost in dev, zero in prod (tree-shaken).
- Keeps `window` non-empty in dev, but no library or browser feature
  inspects unknown `window` keys. Storybook, React DevTools, and the
  Tauri runtime all pollute `window` similarly without conflict.

**Negative**:

- The test-side `E2eOverrides` interface in `e2e/helpers/e2e.ts` is a
  manual mirror of `Window["__e2e"]` — `e2e/` is excluded from the main
  `tsconfig.json` `include`, so a type-only re-export from
  `src/lib/e2e.ts` would not be type-checked anyway. The duplication is
  the safest pragmatic choice. Drift detection relies on the JSDoc
  pointer to `src/lib/e2e.ts` plus the runtime symptom (a stale or
  mistyped key produces a no-op override that fails the E2E test
  visibly). Future: lift e2e/ into a project-reference tsconfig and
  collapse the interface.
- **`.env.e2e` secret hygiene** — Vite auto-loads `.env.<mode>` files
  when building with `--mode <mode>`. If a future contributor adds an
  `.env.e2e` file at the project root, any value in it gets embedded
  in the E2E binary's bundle (treated as a build-time constant). Only
  non-secret config (test API endpoints, locale flags, feature toggles)
  belongs there. Real secrets — credentials, keys, tokens — must never
  go in `.env.<mode>` files; they belong in OS-level env vars passed to
  the WebDriver process at run time.
- The override code is _technically_ present in dev builds (just gated by
  a constant). A determined attacker with renderer access in a dev build
  could call gateway methods with attacker-supplied window keys to bypass
  dialogs. Acceptable because (a) dev builds are not shipped to users,
  and (b) prod tree-shaking removes the branch entirely.
- Unlike option 2 (build flavor split), this pattern relies on Vite
  constant folding for prod isolation. If a future bundler or Vite
  configuration disables the dead-code elimination, the override branch
  could ship. Mitigation: `import.meta.env.MODE` is Vite's first-class
  build-mode replacement (stable since Vite 1.x); bundle inspection in
  CI (already done for IFC fixtures) would catch any regression.

## Alternatives reconsidered

- **Build flavor split** remains the right choice if the override
  surface ever crosses into security-sensitive territory (e.g. gating an
  authentication step). For UI plumbing like file pickers, the runtime
  cost of option 1 is functionally zero and the build complexity of
  option 2 is real maintenance.
- **DI** is correct for unit-test isolation at the component level
  (Vitest mocks the gateway module wholesale). For E2E, where the gateway
  _runs_ but its OS interactions must be substituted, DI doesn't help.
