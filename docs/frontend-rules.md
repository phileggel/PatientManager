# Frontend Rules

⚠️ **AI AGENT MUST NEVER UPDATE THIS DOCUMENT**

> Rule numbers (F1, F2, …) are stable IDs — once assigned, they never change. New rules are appended; deprecated rules keep their number with a note.

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

**F15** — MUST NOT use `console.log`. Always use `logger` from `@/lib/logger`.

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

**F23** — Inter-feature navigation MUST go through the router.

Features are bounded contexts: a feature MUST NOT import components, hooks, or utilities directly from another
feature. Cross-feature navigation is handled exclusively via useNavigate / route paths.

The only authorised cross-feature imports are:

- router.tsx — registers page-level components (single wiring point)
- Shell features (shell/) — may import modal components they own and host
