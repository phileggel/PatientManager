# i18n Rules

## Translation file structure

Translation files live in `src/i18n/locales/{en,fr}/` (F0's gold layout moves them under `infra/i18n/`), one JSON file per domain (`common.json`, `bank.json`).

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

Dot notation with **snake_case for every segment**: `{domain}.{component}.{element}` — `auth.login_form.submit_button`; never a camelCase or kebab-case segment.

## Cross-locale requirement

All locale files must carry the same key set. A key present in one locale but missing from another is a Critical finding.
