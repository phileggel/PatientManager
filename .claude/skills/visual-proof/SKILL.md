---
name: visual-proof
description: Captures and commits visual proof screenshots for any .tsx or .css change. Auto-discovers project config on first run. Generates a complete preview for every component state (idle/loading/results/empty/error) in both light and dark mode, captures with Playwright, and reports any console errors found. Run after frontend implementation, before /smart-commit. Also useful for bug discovery on existing components.
tools: Read, Glob, Grep, Write, Bash, AskUserQuestion
---

# Skill — `visual-proof`

Automate the visual proof workflow defined in `docs/frontend-visual-proof.md`.
Always captures both **light and dark mode** for every state. Console errors detected
during capture are reported automatically — making this skill useful for bug discovery as
well as visual proof.

---

## Step 0 — Load or initialize config

Read `.claude/visual-proof.json`.

**If present**: load `vite_preview_port`, `vite_preview_host`, `global_css_import`,
`i18n_import`. Proceed to Step 1.

**If absent**, discover from the project:

1. Read `vite.config.ts` — extract `server.port` if set; default to `1422` (avoids
   collision with Tauri on 1420).
2. `vite_preview_host` → default `127.0.0.1` (no discovery; user edits config manually
   for WSL2/VM if needed).
3. `global_css_import` → Glob `src/index.css`, `src/main.css`, `src/styles/global.css`.
   Use the single match. If multiple candidates: ask via `AskUserQuestion`.
4. `i18n_import` → Glob `src/i18n/i18n.ts`, `src/i18n/index.ts`, `src/lib/i18n.ts`.
   Use the single match. If multiple candidates: ask.

Write `.claude/visual-proof.json`:

```json
{
  "vite_preview_port": 1422,
  "vite_preview_host": "127.0.0.1",
  "global_css_import": "src/index.css",
  "i18n_import": "src/i18n/i18n.ts"
}
```

**Never overwrite** this file once written — it is project-owned.

---

## Step 1 — Identify the target component

```bash
bash scripts/branch-files.sh | grep -E '\.tsx$'
```

- **One result** → use it automatically.
- **Multiple results** → ask the user which component to capture via `AskUserQuestion`.
- **No results** → ask the user to provide a component path (useful for bug discovery on
  unmodified components).

Extract the component name from the filename
(e.g. `src/features/auth/LoginForm.tsx` → `LoginForm`).

---

## Step 2 — Determine states to capture

Read the component file in full. Grep for loading flags, error state props, empty/null
data handling, conditional renders. Infer which states the component exposes from its
props and logic. Idle is always included.

Ask the user via `AskUserQuestion`:

- Which states to capture — pre-populate with inferred states
- Whether any interaction needs a video clip (hover, modal open, animation)
- Any CSS selectors to mask in screenshots (e.g. timestamps, avatars, random IDs)

---

## Step 3 — Build the complete preview

Read the component file in full. Read `src/bindings.ts` for generated TypeScript types.
If a domain contract exists (`docs/contracts/{domain}-contract.md`, inferred from the
component path), read it for realistic data shapes. Read the `i18n_import` file (using
the converted relative path) to discover the exported initializer function name.

**Import path conversion**: Config paths are relative to the project root (e.g.
`src/i18n/i18n.ts`). When importing from `src/__preview__/main.tsx`, strip the leading
`src/` and prefix with `../` (e.g. `src/i18n/i18n.ts` → `../i18n/i18n.ts`,
`src/index.css` → `../index.css`).

**Write `preview.html`** at the project root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{ComponentName} — Visual Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/__preview__/main.tsx"></script>
  </body>
</html>
```

**Write `src/__preview__/main.tsx`** — a complete, working preview using converted import
paths:

- Import the real component from its actual path (relative from `src/__preview__/`).
- Import and initialise i18n from the converted `i18n_import` path.
- Import global CSS from the converted `global_css_import` path.
- For each requested state, render the component with **hardcoded, realistic mock data**
  derived from the contract and bindings — no invented types.
- Wrap each state in `<div id="state-{name}" style={{ padding: 24 }}>` for Playwright
  targeting.
- **No `invoke()` calls** — all data is hardcoded props or mocked Zustand stores.

Example (adapt to the real component interface):

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import { setupI18n } from "../i18n/i18n";
import { LoginForm } from "../features/auth/LoginForm";

if (new URLSearchParams(window.location.search).get("theme") === "dark") {
  document.documentElement.classList.add("dark");
}

setupI18n();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div id="state-idle" style={{ padding: 24 }}>
      <LoginForm isLoading={false} error={null} />
    </div>
    <div id="state-loading" style={{ padding: 24 }}>
      <LoginForm isLoading={true} error={null} />
    </div>
    <div id="state-error" style={{ padding: 24 }}>
      <LoginForm isLoading={false} error="Invalid credentials" />
    </div>
  </React.StrictMode>,
);
```

---

## Step 4 — Write the capture script and check Playwright

Write `.visual-proof-capture.mjs`:

```js
import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import { writeFileSync } from "fs";

const PORT = process.env.VP_PORT;
const HOST = process.env.VP_HOST;
const NAME = process.env.VP_NAME;
const STATES = (process.env.VP_STATES || "idle").split(",");
const MASK_SELECTORS = (process.env.VP_MASK || "").split(",").filter(Boolean);

const consoleErrors = [];
await mkdir("screenshots", { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });

for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1600, height: 900 },
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ scheme, text: msg.text() });
    }
  });

  const url = `http://${HOST}:${PORT}/preview.html${scheme === "dark" ? "?theme=dark" : ""}`;
  await page.goto(url, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(`#state-${STATES[0]}`, { timeout: 10000 });

  const masks = MASK_SELECTORS.map((sel) => page.locator(sel));

  for (const state of STATES) {
    const el = page.locator(`#state-${state}`);
    if ((await el.count()) > 0) {
      const path = `screenshots/${NAME}-${scheme}-${state}.png`;
      await el.screenshot({ path, mask: masks });
      console.log(`  → ${path}`);
    }
  }

  await context.close();
}

if (consoleErrors.length > 0) {
  console.log("\n⚠️  Console errors detected during capture:");
  for (const err of consoleErrors) {
    console.log(`  [${err.scheme}] ${err.text}`);
  }
  writeFileSync(
    "screenshots/.console-errors.json",
    JSON.stringify(consoleErrors, null, 2),
  );
}

await browser.close();
```

Check if `playwright` is installed:

```bash
ls node_modules/playwright 2>/dev/null
```

If it fails, install it:

```bash
npm install --save-dev playwright
```

---

## Step 5 — Capture

Run Vite in the background (use `run_in_background: true`):

```bash
npx vite --port {vite_preview_port} --host {vite_preview_host}
```

Wait for the server to start:

```bash
sleep 3
```

Run the capture (pass mask selectors via `VP_MASK` if the user provided any, comma-separated):

```bash
VP_PORT={vite_preview_port} VP_HOST={vite_preview_host} VP_NAME={ComponentName} VP_STATES={state1,state2,...} node .visual-proof-capture.mjs
```

Stop Vite:

```bash
lsof -ti tcp:{vite_preview_port} | xargs kill 2>/dev/null
```

Delete the capture script:

```bash
rm -f .visual-proof-capture.mjs
```

---

## Step 6 — Stage and report

```bash
git add screenshots/
```

```bash
git restore --staged screenshots/.console-errors.json 2>/dev/null
```

```bash
git status --short -- screenshots/
```

Report the outcome:

- List every screenshot staged.
- If `screenshots/.console-errors.json` was written, show the errors and flag them as
  potential bugs to investigate before merging. Delete the file after reporting.
- If video clips were produced (`.webm`), list them.

Then output:

```
⚠️  Before /smart-commit — delete the preview files (never committed):
    rm -f preview.html
    rm -rf src/__preview__/
```

---

## Critical Rules

1. **Never commit `preview.html` or `src/__preview__/`** — always deleted before the
   final commit.
2. **No `invoke()` in preview** — all data must be hardcoded props or mocked stores.
3. **`.claude/visual-proof.json` is project-owned** — never overwrite once written.
4. **Screenshots go to `screenshots/`** — intentionally git-tracked for visual history.
5. **Always capture both light and dark mode** — one set of screenshots per colour scheme.
6. **Real imports only** — real i18n, real CSS, real component. No stubs or placeholders.
7. **Convert config paths to relative imports** — strip leading `src/`, prefix with `../`.
