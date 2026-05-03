# Frontend Visual Proof Rules

> ⚠️ **AI AGENT MUST NEVER UPDATE THIS DOCUMENT**

Any change that touches a `.tsx`, `.css`, or visual asset file **MUST** include a committed
screenshot in `screenshots/` before merging — whether the branch is merged directly or via a PR.
If a PR is opened, also embed the screenshot in the description. If you cannot produce a
screenshot, explain why in the chat instead.

---

## When visual proof is not required

State it explicitly at the top of the PR description or commit message:

> No visual impact — internal refactor / Rust-only change.

Then screenshot at least one screen that _consumes_ the modified code as a non-regression proof.

---

## What to capture

| Change type                                                          | Required artefact                      |
| -------------------------------------------------------------------- | -------------------------------------- |
| New component or layout change                                       | Screenshot of every affected state     |
| Interaction (hover, animation, modal open/close, loading transition) | Playwright video clip saved as `.webm` |
| Shared / design-system component                                     | Screenshot of 2–3 distinct call sites  |
| Dark mode (if supported)                                             | Both modes side by side                |

**States to cover for every component panel:** idle · loading · results/content · empty · error.

---

## Process

### 1 — Capture "before" at task start

Before writing any code, screenshot the current state of the affected component or screen.
Skip if the component is new (no "before" exists).

Start the Vite dev server on a port that doesn't conflict with the Tauri dev port (1420):

```bash
npx vite --port 1422 --host 127.0.0.1
```

Then run the Playwright screenshot script against the unmodified code.

### 2 — Create a preview entry

Create two temporary files (delete them before the final commit):

**`preview.html`** at the project root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/__preview__/main.tsx"></script>
  </body>
</html>
```

**`src/__preview__/main.tsx`** — renders the component in every relevant state with hardcoded
mocked data. No Tauri `invoke()` calls needed; the gateway pattern keeps components decoupled from
the IPC layer.

Import the real i18n config and global CSS so the screenshot matches the actual app styles:

```tsx
import "../i18n/config";
import "../ui/global.css";
```

### 3 — Take the screenshot with Playwright

Playwright's Chromium binary is available via the cached `ms-playwright` install. Run against the
Vite dev server:

```js
import { chromium } from "playwright";
// launch({ executablePath: chromium.executablePath() })
// setViewportSize({ width: 1600, height: 900 })
// page.goto("http://127.0.0.1:1422/preview.html", { waitUntil: "networkidle" })
// page.screenshot({ path: "screenshots/<ComponentName>-preview.png", fullPage: true })
```

For interaction clips, use Playwright's video recording:

```js
const context = await browser.newContext({
  recordVideo: { dir: "screenshots/" },
});
```

### 4 — Commit the artefact

Save screenshots to `screenshots/<ComponentName>-preview.png` and commit on the feature branch.

`screenshots/` is intentionally tracked in git — each commit is a point-in-time record of what the
component looked like. Browse the visual history with:

```bash
git log --oneline -- screenshots/<ComponentName>-preview.png
git show <sha>:screenshots/<ComponentName>-preview.png > /tmp/old.png
```

If a PR is opened, embed the screenshot using the raw GitHub URL:

```markdown
![ComponentName preview](https://raw.githubusercontent.com/<owner>/<repo>/<branch>/screenshots/<ComponentName>-preview.png)
```

### 5 — Clean up the preview files

Delete `preview.html` and `src/__preview__/` before the final commit on the branch.

---

## Preview fidelity

Because the preview page imports the same source files as the real app, design parity is high:

| Design element              | In preview?                                           |
| --------------------------- | ----------------------------------------------------- |
| Design-system color tokens  | ✅ same CSS import                                    |
| Custom fonts (npm packages) | ✅ resolved by Vite                                   |
| Tailwind utilities          | ✅ same Vite plugin                                   |
| Component code              | ✅ direct import                                      |
| i18n translations           | ✅ same config import                                 |
| Modal backdrop / app shell  | ⚠️ absent — preview is standalone                     |
| Platform WebView rendering  | ⚠️ preview uses Chromium — minor subpixel differences |

The two caveats are cosmetic. If a change specifically touches modal chrome or backdrop blur, note
it in the PR description.

---

## PR description template (frontend changes)

```markdown
## What

<1–2 sentence summary>

## Visual proof

### Before

![before](raw-github-url)

### After

![after](raw-github-url)

### States covered

- Idle · Loading · Results · Empty · Error: <screenshot or note>

## How to test

1. <step>
2. <step>

## Checklist

- [ ] Screenshots for every modified component
- [ ] Edge states captured (empty, loading, error)
- [ ] No `invoke()` calls in presentational components
- [ ] `just check-full` passes
```

---

## Never do

- Merge a frontend change without a committed screenshot
- Call `invoke()` directly inside a presentational component (prevents mocked rendering)
- Leave `preview.html` or `src/__preview__/` committed on the branch
