# i18n Rules

Convention doc read by `reviewer-frontend` when present. Defines translation file structure, what must and must not be translated, and key naming conventions.

## Translation file structure

Translation files live in `src/i18n/locales/{locale}/`. Each locale directory contains JSON files organized by domain (e.g. `common.json`, `auth.json`). Locale names are discovered at review time — do not hardcode them.

## What must be translated

All user-visible text in `.tsx` files must use `t("key")` from the i18n library. This includes:

- Button labels and action text
- Placeholder text in inputs
- Error messages and validation feedback
- Column headers and table labels
- Page titles and section headings
- Tooltip content

## What does NOT need translation

- Variable names, comments
- Logger and console calls
- `className` strings
- `id` and `data-*` attributes
- Date/time format strings (`"yyyy-MM-dd"`, etc.)
- URLs and file paths

## Key naming convention

Dot notation: `{domain}.{component}.{element}` — e.g. `auth.loginForm.submitButton`, `invoice.table.amountHeader`.

## Cross-locale requirement

All locale files must carry the same key set. A key present in one locale but missing from another is a Critical finding.
