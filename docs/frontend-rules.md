# Frontend Rules

⚠️ **AI AGENT MUST NEVER UPDATE THIS DOCUMENT**

## Feature Structure

**F1** — SHOULD follow the gold layout (bank-transfer):

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
- Example: `add_fund_panel/AddFundPanel.tsx` + `useAddFundPanel.ts` + `useAddFundPanel.test.ts`

**F3** — `gateway.ts` is the ONLY file allowed to call `commands.*`. Sub-features with a dedicated use case may have their own `gateway.ts` (e.g. `manual_match/gateway.ts`).

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

## Logging

**F13** — MUST log `info` when mounted.

**F14** — MUST log `error` when a critical error happens (not a validation — a real, specific frontend error).

**F15** — MUST NOT use `console.log`. Always use `logger` from `@/lib/logger`.

## i18n

**F16** — MUST use i18n translation (`useTranslation`) for all user-visible text. No hardcoded strings.

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

## Comments

**F20** — SHOULD have concise English comments explaining usage and the sources a component listens to.
