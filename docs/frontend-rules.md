# Frontend Rules

⚠️ **AI AGENT MUST NEVER UPDATE THIS DOCUMENT**

> Rule numbers (F1, F2, …) are stable IDs — once assigned, they never change. New rules are appended; deprecated rules keep their number with a note.

## Top-level `src/` structure

**F28** — The frontend source tree MUST follow this top-level layout. Each bucket has both an inclusion rule (what lives there) AND an exclusion rule (what does NOT) — a folder with only an inclusion rule grows weeds, and the catch-all framing actively hides mislocated code.

```
src/
├── features/   # UI surfaces, may own a gateway
├── shell/      # router + global layout (one instance, not reusable)
├── ui/         # reusable UI: widgets, formatters, hooks, widget runtime state
│   ├── components/   # widgets (button, field, modal, snackbar, …)
│   │                  # widget runtime state colocates with the widget
│   ├── format/       # cross-feature formatters (currency, date, percent, …)
│   └── hooks/        # generic UI hooks (useFuzzySearch, …)
├── infra/      # platform adapters ONLY (logger, storage, i18n runtime, …)
├── bindings.ts # generated — DO NOT EDIT
└── main.tsx
```

Each bucket's mandate:

- **`features/`** — User-facing surfaces, organised per F1. A feature MAY own a gateway. **REJECTS:** anything reusable across features (promote to `ui/`) or any cross-cutting platform adapter (promote to `infra/`). A feature folder appearing anywhere else in the tree (e.g. inside `infra/` or `ui/`) is a misclassification.
- **`shell/`** — Router, global layout, header/sidebar — single instance per app, not reusable. **REJECTS:** anything reusable (`ui/`), anything feature-scoped (`features/`).
- **`ui/`** — Reusable UI primitives: widgets in `ui/components/`, cross-feature formatters in `ui/format/`, generic React hooks in `ui/hooks/`. Widget runtime state colocates with the widget (e.g. `ui/components/snackbar/snackbarStore.ts`). **REJECTS:** any domain term, any Tauri call (no `commands.*` from `ui/`), any platform adapter (`infra/`).
- **`infra/`** — Platform adapters ONLY: code that talks to a runtime outside our control (logger sink, browser storage, i18n runtime, native bridges). **REJECTS:** pure helpers and formatters (promote to `ui/format/`), generic UI hooks (promote to `ui/hooks/`), stateful UI runtime (colocate with the widget in `ui/components/`), anything feature-scoped (`features/`).

The diagnostic value is the rejection half. When a file lands in the wrong bucket, the exclusion rule of the destination bucket is what flags it.

**Framework-resource exception.** Static resources owned by the framework (not by application code) sit outside the 4-bucket discipline because the industry-standard Vite convention is well-established and tools (build, bundler, dev server) expect those paths:

- `src/assets/` — images, fonts, SVGs imported by application code
- `src/styles/` — global CSS, theme tokens, CSS variables
- `public/` — static files served verbatim (favicon, robots.txt)

These directories MAY exist alongside the 4 buckets and are not subject to the reject-each-other rules. They contain resources, not code.

> **Rename note:** projects pre-v4.5 used `src/lib/` as a catch-all. `lib/` is a JS tradition with no semantic content; `infra/` carries a clear meaning (_talks to a platform we depend on_) that lets a reader decide at a glance whether a file belongs. Migration is a one-time rename per project — sort the existing `lib/` contents into the four buckets above, then delete `lib/`. The kit ships forward with `infra/`.

This is the FE counterpart to the backend `B0` gold layout, adapted for FE realities: there is no per-feature `application/domain/infrastructure` layering and no Shared Kernel, because FE features are UI surfaces, not bounded contexts (see F23, F26).

## Feature Structure

**F1** — SHOULD follow the gold layout:

```
feature/
  {sub_feature}/        <== SubFeature.tsx + useSubFeature.ts + useSubFeature.test.ts
  shared/               <== shared utilities, types, presenter, validation
  gateway.ts            <== ONLY file that calls commands.* (Tauri)
  store.ts              <== feature-scoped Zustand store (if needed)
  index.ts              <== public re-exports
```

**F2** — Each sub-feature MUST live in its own subfolder named in snake_case.

- Component file, its hook, and its tests are colocated in that folder.
- Example: `add_item_panel/AddItemPanel.tsx` + `useAddItemPanel.ts` + `useAddItemPanel.test.ts`

**F3** — `gateway.ts` or `store.ts` are the ONLY files allowed to call `commands.*`. Sub-features with a dedicated use case may have their own `gateway.ts` (e.g. `manual_match/gateway.ts`).

**F4** — Shared utilities, types, and sub-components used by multiple sub-features MUST live in `shared/`.

**F5** — SHOULD use a presenter (`shared/presenter.ts`) to transform domain data into view models.

- Maps raw backend types to display-ready structures (labels, formatted amounts, etc.)
- Keeps hooks and components free of formatting/transformation logic
- MUST be pure functions — easy to unit test independently

## Component

**F6** — SHOULD be as smart as possible:

- Get state from store if available
- Get values directly from gateway otherwise and listen to backend events if updates are needed

**F7** — MUST NOT emit window events (those are emitted by the backend).

**F8** — SHOULD have minimal props:

- Smart components: only callbacks (`onSelect`, `onCancel`) + open/close state
- Dumb components: props needed to render/behave

**F9** — MUST cleanup event listeners and subscriptions:

- Remove listeners in the `useEffect` cleanup function
- Prevents memory leaks when component unmounts

**F10** — Logic MUST be in a dedicated hook colocated with the component:

- state, useMemo, callbacks

**F11** — MUST respect M3 design and use generic `ui/components` when possible.

**F12** — MUST NOT update a generic component for its own usage. Create a specific component if generic components are not appropriate.

**F25** — Primary interactive elements MUST render a stable `id` attribute. Stable ids serve two purposes: (a) screen-reader and `aria-labelledby` references rely on stable anchors, (b) E2E tests (WebdriverIO / Playwright) keyed off ids stay stable across UI refactors, while selectors based on class names or text content break.

Scope (mandatory):

- Buttons, inputs, selects, textareas, switches, checkboxes
- Dialogs and modal containers
- List items in a navigable list (e.g. account row, transaction row)

Convention: `{feature}-{component}-{role}` in kebab-case — e.g. `account-list-item-edit`, `add-transaction-dialog`, `search-input`. The `{role}` segment disambiguates multiple interactive elements within a component (e.g. `account-list-item-edit` vs `account-list-item-delete`).

Page-level / shell-level containers (single instance per route) MAY skip the rule — there's no ambiguity for a singleton. The mandate kicks in once a component is instantiated more than once or has multiple interactive children.

The reviewer-frontend lane flags primary interactive elements without an `id` prop.

## Logging

**F13** — MUST log `info` when mounted.

**F14** — MUST log `error` when a critical error happens (not a validation — a real, specific frontend error).

**F15** — MUST NOT use `console.log`. Always use `logger` from `@/infra/logger` (per F28's `infra/` bucket — the logger sink talks to a platform we depend on).

## i18n

**F16** — MUST use i18n translation (`useTranslation`) for all user-visible text. No hardcoded strings.

**F24** — Accessibility labels MUST flow through i18n. Hard-coded a11y strings are silent translation holes — they pass visual review and TypeScript checks, but ship untranslated to non-default-locale users. The rule covers any string passed to: `aria-label`, `aria-labelledby`, `aria-describedby`, `title`, and `placeholder` props.

```tsx
// ✅ correct
<button aria-label={t("account.delete")} onClick={onDelete} />
<input placeholder={t("search.placeholder")} />

// ❌ wrong — literal strings won't translate
<button aria-label="Delete account" onClick={onDelete} />
<input placeholder="Search..." />
```

The reviewer-frontend lane flags any literal string passed to those props.

## Error Handling

**F17** — SHOULD handle errors appropriately:

- Log critical errors with context (component, action, data)
- Show user-friendly feedback (snackbar)
- Display inline validation errors in forms
- Distinguish between user errors (validation) and system errors

**F27** — Typed backend errors MUST flow through a 4-layer pipeline. Each layer has one job; silently dropping the error branch is forbidden at every layer. This is the FE consuming side of the backend rejection-layer rule (`ddd-reference.md` § Errors).

1. **Gateway** returns `Result<T, *CommandError>` unchanged — no translation, no swallow. (Already enforced by Specta-generated bindings.)
2. **Hook** branches on `result.status`. For `error`, it MUST either (a) return the typed error as state for the component to render, OR (b) dispatch to a snackbar/toast store. Silently dropping the error branch — or coercing it to a stringified message — is forbidden.
3. **Presenter** owns the typed-error → i18n-key mapping. The presenter (`shared/presenter.ts`) is a pure function that returns a key string (e.g. `"record_price.error.duplicate_date"`) — no `useTranslation`, no React, no runtime concerns. Trivially unit-testable. Components never inspect `error.code` directly.
4. **Component** owns the runtime translation. It calls `t(key)` via `useTranslation` to render the string, surfaced inline (form context) or via snackbar (action context). The component knows nothing about the error's domain shape.

The presenter / component split mirrors the selector / view split in modern React: selectors return data, views handle runtime presentation. Mixing the two would couple the presenter to React's runtime and force tests to mock `useTranslation`.

```ts
// 1. Gateway — Specta-generated, unchanged
commands.recordPrice(input); // Result<RecordPriceOk, RecordPriceError>

// 2. Hook — branches, returns typed error as state
function useRecordPrice() {
  const [error, setError] = useState<RecordPriceError | null>(null);
  const submit = async (input: RecordPriceInput) => {
    const result = await gateway.recordPrice(input);
    if (result.status === "error") {
      setError(result.error); // typed, NOT stringified
      return;
    }
    setError(null);
    // ...
  };
  return { submit, error };
}

// 3. Presenter — pure mapping, lives in shared/presenter.ts
export function presentRecordPriceError(e: RecordPriceError): string {
  switch (e.code) {
    case "DUPLICATE_DATE":
      return "record_price.error.duplicate_date";
    case "AMOUNT_NOT_POSITIVE":
      return "record_price.error.amount_not_positive";
  }
}

// 4. Component — renders the i18n key, knows nothing about error shape
const { submit, error } = useRecordPrice();
return (
  <form onSubmit={submit}>
    {error && <p role="alert">{t(presentRecordPriceError(error))}</p>}
  </form>
);
```

Client-side validation (no backend round-trip) follows the same pipeline: validation produces typed errors with `code` fields, presenter maps to i18n keys, component renders. The snackbar store interface is left to projects — F27 prescribes only the layering.

## Tests

**F18** — MUST have tests for non-trivial logic worth protecting:

- State transitions triggered by user actions (auto-fill, reset after submit, etc.)
- API call arguments and success/error handling
- Do NOT write tests that only verify rendering or DOM structure

**F19** — When using `renderHook`, NEVER create objects or functions inside the render callback. The callback runs on every render; inline factories produce new references each render. If used as a `useEffect` dependency, this causes an infinite loop → OOM crash. Always extract stable references before calling `renderHook`.

**F20** — NEVER use a shared `useRef` to track mounted state across effects. Use a local `let isMounted = true` variable per effect with `return () => { isMounted = false; }` as cleanup instead.

React StrictMode (active in dev) double-invokes effects: mount → cleanup → mount again. A shared ref set to `false` in the first cleanup is never reset to `true` for the second run, so all async guards in the second run see `false` and abort silently. A local variable is scoped to each invocation and starts `true` every time.

```ts
// ✅ correct
useEffect(() => {
  let isMounted = true;
  fetchData().then((data) => {
    if (!isMounted) return;
    setState(data);
  });
  return () => {
    isMounted = false;
  };
}, []);

// ❌ wrong — shared ref killed by StrictMode cleanup, never reset
const isMountedRef = useRef(true);
useEffect(() => {
  return () => {
    isMountedRef.current = false;
  };
}, []);
useEffect(() => {
  fetchData().then((data) => {
    if (!isMountedRef.current) return; // always false in dev after first cleanup
    setState(data);
  });
}, []);
```

## Comments

**F21** — SHOULD have concise English comments explaining usage and the sources a component listens to.

## Backend/Frontend common ground

**F22** — MUST never redeclare Specta enum values in the frontend.

## Navigation

**F23** — Inter-feature navigation MUST go through the router. Cross-feature navigation is handled exclusively via `useNavigate` / route paths — never by rendering another feature's page-level component directly from a sibling feature.

The only authorised cross-feature navigation wiring points are:

- `router.tsx` — registers page-level components (single wiring point)
- Shell features (`shell/`) — may import modal components they own and host

> Frontend "features" are UI surfaces organised for co-location of code edited together — they are NOT bounded contexts in the DDD sense. The structural BC enforcement lives server-side (Rust); on the FE, all features share `bindings.ts` and read/write through the same Tauri layer. See **F26** for the cross-feature import rule that replaces the old "feature = BC" framing.

## Cross-feature imports

**F26** — Cross-feature imports are evaluated by what is imported, not by the fact of crossing:

- **Primitive imports are fine.** Types, pure functions, and presentational components MAY be imported across feature boundaries. They are not behaviour coupling — they are shared primitives. Example: `features/account_details/.../X.tsx` importing `TransactionFormData` (type), `validateTransactionForm` (pure), or `RecordPriceCheckbox` (presentational) from `features/transactions/shared/` is acceptable.
- **Behaviour imports are a code smell.** A hook or store imported from another feature couples the two features behaviourally and typically signals one of: wrong feature boundary, missing shared layer, or a piece of behaviour that should be promoted to `ui/hooks/` or `shell/`. Treat the import as SHOULD-NOT and prefer promotion when it appears twice.

Promotion destinations (see F28): generic UI hooks → `ui/hooks/`; app-wide stores → `shell/`; cross-cutting platform adapters → `infra/`.
