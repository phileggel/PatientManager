# Frontend Rules

⚠️ **AI AGENT MUST NEVER UPDATE THIS DOCUMENT**

## Feature

- SHOULD follow this folder convention
```
feature/
  component_one/      <== ComponentOne.tsx + useComponentOne.ts + ComponentOne.test.tsx
  component_two/      <== (same pattern)
  shared/             <== shared utilities, types, presenter, sub-components used by multiple components
  gateway.ts          <== access to backend
  index.ts            <== public re-exports
  FeaturePage.tsx     <== feature component entry (no logic, render only)
  useFeaturePage.ts   <== FeaturePage logic if needed (multiple hooks allowed per component)
```

## Component

- SHOULD be as smart as possible 
  - get state from store if available
  - get values directly from gateway otherwise and listen to backend events if update needed

- DON'T emit events (those are emitted by the backend)

- SHOULD have minimal props
  - Smart components: only callbacks (onSelect, onCancel) + open/close state
  - Dumb components: props needed to render/behave

- MUST cleanup event listeners and subscriptions
  - Remove listeners in useEffect cleanup function
  - Prevent memory leaks when component unmounts
  - Example: window.removeEventListener in return () => { ... }

- its logic MUST be in a dedicated hook colocalized with it
  - state
  - useMemo
  - callback

- MUST live in its own subfolder named after it (snake_case)
  - Component file, its hook, and its tests are colocalized in that folder
  - Example: `add_fund_panel/AddFundPanel.tsx` + `useAddFundPanel.ts` + `AddFundPanel.test.tsx`

- Shared utilities, types, and sub-components used by multiple components
  MUST live in a shared/ subfolder

- SHOULD use a presenter (shared/presenter.ts) to transform domain data into view models
  - Maps raw backend types to display-ready structures (labels, formatted amounts, etc.)
  - Keeps hooks and components free of formatting/transformation logic
  - SHOULD be pure functions — easy to unit test independently

- MUST respect M3 design and use generics ui/components when possible.
  
- MUST NOT update a generic component for its own usage. Create a specific component if generic components are not appropriate.

- MUST have tests for non-trivial logic worth protecting:
  - state transitions triggered by user actions (auto-fill, reset after submit, etc.)
  - API call arguments and success/error handling
  - Do NOT write tests that only verify rendering or DOM structure

- SHOULD handle errors appropriately
  - Log critical errors with context (component, action, data)
  - Show user-friendly feedback (snackbar)
  - Display inline validation errors in forms
  - Distinguish between user errors (validation) and system errors

- MUST log
  - info when mounted
  - log an error when a critical error happens (not a validation, a real specific frontend error)

- SHOULD have concise english comments explaining its usage and the sources it listen to

- MUST use i18n translation for all text
