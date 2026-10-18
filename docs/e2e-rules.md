# E2E Testability Rules

What makes a component reliably driveable from the Tauri WebDriver E2E suite.

> Rule numbers (E1, E2, …) are stable IDs — once assigned, they never change. New rules are appended; deprecated rules keep their number with a note.

---

## E1 — Forms MUST have a stable `id` attribute

```tsx
<form id="price-modal-form" ...>
```

E2E tests locate forms by `id` — the most stable selector.
Naming convention: `{feature}-{action}-form` (e.g. `price-modal-form`, `edit-price-form`).

## E2 — Form fields MUST have a stable `id` attribute

```tsx
<input id="price-modal-date" ... />
<input id="price-modal-price" ... />
```

Convention: `{form-prefix}-{field}` (e.g. `price-modal-date`, `edit-price-price`).
The `id` MUST be forwarded to the underlying DOM `<input>` — never stop at the wrapper component.

## E3 — Submit buttons MUST use `type="submit"` and `form="{form-id}"`

```tsx
<Button type="submit" form="price-modal-form" disabled={isSubmitting}>
  Save
</Button>
```

That is the Submit of a form F30 lists as moved; another also gates it on its own checks.

E2E selector: `button[type="submit"][form="price-modal-form"]`.
Never rely on an `onClick`-only submit path — there is no stable selector for it.

## E4 — Navigation and action buttons SHOULD have a stable `id` attribute

```tsx
<IconButton id="nav-management" aria-label={t("nav.management")} ... />
<FAB id="fab-create-procedure-type" aria-label={t("procedure_type.create")} ... />
```

E2E selector: `#nav-management` / `#fab-create-procedure-type`.

Convention: `{area}-{action}` — e.g. `nav-management`, `mgmt-card-patients`, `fab-create-procedure-type`, `bank-account-edit-{id}`. Components like `FAB`, `IconButton`, `Button` MUST accept an optional `id` prop and forward it to the DOM element.

`id` is locale-invariant and refactor-safe; `aria-label` is not — it renders the translated
value and changes with its i18n key, so it is never the selector. It still flows through
`t()` (F24).

## E5 — Error messages MUST have `role="alert"`

```tsx
<p role="alert" className="...">
  {t(error)}
</p>
```

E2E selector: `[role="alert"]` scoped to the form.
This is already required by accessibility rules — it is also what E2E tests assert.

## E6 — React controlled inputs require `setReactInputValue` in E2E tests

Standard `setValue()` from WebdriverIO does **not** reliably trigger React's synthetic
`onChange` in WebKitGTK. The DOM value is set but React state never updates.
A form F30 lists as moved is then sent with its fields empty and refused; any other form keeps its submit disabled.

Use `setReactInputValue` from `e2e/helpers/seed.ts`: it sets the value through the native
prototype setter, bypassing React's value tracker, then dispatches `input` and `change`,
which React turns into its synthetic `onChange`.

After calling `setReactInputValue`, React re-renders synchronously within the same
event-loop tick. The next `waitForEnabled` poll will see the updated disabled state.

## E7 — Custom date pickers require locale-formatted input

`DateField` renders `<input type="text">` and displays `DD/MM/YYYY`. `setReactInputValue`
must receive that display format, not ISO:

```typescript
function isoToDisplayDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`; // "2020-01-15" → "15/01/2020"
}

await setReactInputValue("price-modal-date", isoToDisplayDate("2020-01-15"));
```

`DateField.handleInputChange` then parses the display value back to ISO and calls
the parent `onChange` with the ISO date — React state updates correctly.

## E8 — Tests MUST NOT call `browser.url()`

The Tauri WebView uses a custom protocol (`tauri://` or `http://tauri.localhost/`)
and is already loaded at the app's initial route when the session starts.
`browser.url()` breaks the WebView — navigate only through UI clicks.

## E9 — Tests MUST use deterministic, unique values per write operation

Use fixed past dates (not today's date) to avoid `DuplicateDate` errors from prior runs:

```typescript
// One constant per test that writes data — never share dates between seeding ops.
// The DateField display format (E7).
const DATES = {
  record: isoToDisplayDate("2020-01-15"),
  update_original: isoToDisplayDate("2020-02-10"),
  delete: isoToDisplayDate("2020-03-05"),
} as const;
```

Today's date is pre-filled by default; always override it with a fixed past date.

## E10 — `waitForEnabled` / `waitForExist` MUST always specify `{ timeout: N }`

```typescript
await submitBtn.waitForEnabled({ timeout: 5000 });
await modal.waitForExist({ timeout: 8000, reverse: true });
```

Never rely on the WebdriverIO default timeout — always be explicit.
