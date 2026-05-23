# Tauri Lessons

> Cross-project lessons learned while building Tauri 2 + React 19 + Rust apps with this kit. Each entry distils a pattern that bit us in practice and the fix that's now the default. Project-local for now; promotion target is `tauri-claude-kit` (so `just sync-kit` ships it to every downstream project) once entries have proven themselves across more than one project.
>
> Format per entry: **Problem** (when it bites), **Lesson** (the rule), **Reference** (where the pattern lives in code, when applicable). Numbered TL-NNN; numbers are stable once assigned.

---

## React + Tauri Runtime

### TL-001 — Cancelled-flag pattern for `listen()` under StrictMode

**Problem.** `listen()` from `@tauri-apps/api/event` returns `Promise<UnlistenFn>`. React 19 StrictMode invokes effects twice in dev; the cleanup function runs synchronously, but the `await listen(...)` may not have resolved yet. Without protection, the first invocation's unlisten is dropped on the floor and the subscription leaks. In production the leak is silent — events fire against zombie handlers — and in dev it manifests as duplicated event handling that's brutal to debug.

**Lesson.** Race-guard every `listen()` with a `cancelled` flag captured by the effect closure. If cleanup runs before the listen promise resolves, invoke the freshly-resolved unlistenFn immediately and bail.

```ts
useEffect(() => {
  let unlistenFn: (() => void) | undefined;
  let cancelled = false;

  (async () => {
    const fn = await listen("x_updated", handler);
    if (cancelled) {
      fn();
      return;
    }
    unlistenFn = fn;
  })();

  return () => {
    cancelled = true;
    unlistenFn?.();
  };
}, []);
```

**Reference.** Not yet practiced in PatientManager — recommended for any new Tauri `listen()` consumer.

### TL-002 — Wrap `commands.*` and `listen()` in try/catch inside bootstrap hooks

**Problem.** Unit tests that render `<App />` (e.g. `App.test.tsx`) mount bootstrap hooks that call `commands.*` and `listen()` without the Tauri runtime present. The calls reject with `__TAURI_INTERNALS__ is not defined`, the rejection escapes as an unhandled promise rejection, and the pre-push hook flags it as a test failure. Mocking every Tauri symbol at every test entry point is brittle (one missed mock = noisy CI); making the runtime optional inside the hook is robust.

**Lesson.** In any bootstrap hook wrap the initial `commands.*` fetches and the `listen()` subscription in try/catch. The catch arm logs via `@/infra/logger` so production failures still surface, but the test environment no longer leaks unhandled rejections.

**Reference.** `src/infra/cache/sync.ts:useCacheSync` — `initializeAppData()` and `setupEventListeners()` each wrap their body in try/catch.

---

## Tauri Command Bindings

### TL-003 — `commands.*` arguments are positional, never object-wrapped

**Problem.** Specta generates `bindings.ts` with each Tauri command as a function whose parameters match the Rust signature positionally (`commands.addPatient(name, ssn, fundPatientName)`). It's tempting to call them with an object-wrap (`commands.addPatient({ name, ssn, fundPatientName })`) because that's the React / TypeScript idiom for "lots of optional fields". The object-wrap compiles (TS infers the object as the first parameter) but every field arrives as `undefined` on the Rust side and the command silently fails or rejects with a parse error. The bug is invisible at the call site — the type checker is happy because `string | undefined` matches the first parameter's type when only one is present.

**Lesson.** Always match the parameter count, order, and names exactly as declared in `bindings.ts`. Never object-wrap. If a command has many optional parameters and the call site is unreadable, the fix is to restructure the Rust signature (or wrap on the Rust side with a `#[derive(Type)]` struct that Specta serialises as a discrete TS interface), not to invent an object-wrap on the call site.

**Reference.** CLAUDE.md § Tauri Service Layer - Gateway Pattern; `src/bindings.ts` is the authoritative reference for any command signature.
