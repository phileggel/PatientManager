# Frontend Visual Proof Rules

> Required by F18 in [`frontend-rules.md`](frontend-rules.md) § Tests. `/app:visual-proof` runs
> the capture; this document owns what it must produce.

Any change that touches a `.tsx`, `.css` or visual asset file **MUST** include committed
screenshots in `screenshots/` before merging, in **light and dark mode** both.

## When nothing should look different

A `.tsx` or `.css` change a user cannot see (an internal refactor) still carries proof: the
PR body states "No visual impact — internal refactor", and at least one screen that
_consumes_ the modified code is captured, light and dark. Nothing goes in a commit message
(`commit-rules.md`: a title only).

## What to capture

| Change type                      | Required artefact                     |
| -------------------------------- | ------------------------------------- |
| New component or layout change   | Every affected state, light + dark    |
| Interaction (hover, modal, load) | A video clip, `.webm` (below)         |
| Shared / design-system component | 2–3 distinct call sites, light + dark |

**States to cover for every component:** idle · loading · results/content · empty · error.

**Naming:** `screenshots/{ComponentName}-{light|dark}-{state}.png`. `screenshots/` is
tracked in git: each commit is a point-in-time record
(`git log --oneline -- "screenshots/{ComponentName}-*.png"`).

## The preview

The capture renders `preview.html` and `src/__preview__/main.tsx` — scaffolding, never
committed — with the real component, the real i18n initializer and the real global CSS,
whose paths come from `.claude/daneel.json` (`visual-proof`, project-owned; the preview port must not
be the Tauri dev port, 1420; host `127.0.0.1`, `0.0.0.0` under WSL2). A video clip is recorded by
hand with Playwright's `recordVideo: { dir: "screenshots/" }`: the capture script takes stills. Each state is hard-coded data in a `<div id="state-{name}">`;
no `invoke()` — props or mocked stores. Console errors seen during the capture are written
to `screenshots/.console-errors.json` (never committed) and reported: a run on an unchanged
component finds render errors, missing translations and broken data shapes.

**A modal renders its panel only** (the panel-only pattern). Its scrim (`bg-m3-scrim/50 backdrop-blur-[2px]`) covers
an empty wrapper in a standalone preview and, in dark mode, turns the image near-black. So
the preview copies the panel's chrome (rounded corners, surface tier, shadow elevation,
header / scrollable content / footer) without the modal container, inside a
`min-h-screen bg-{surface-container}` wrapper so the dark tone matches the production card:

```tsx
function PreviewModalPanel({ title, children, footer }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="relative bg-{surface-container-lowest} rounded-[28px] shadow-elevation-4 w-full max-w-2xl overflow-hidden flex flex-col"
    >
      {/* same header / content / footer chrome as the real modal */}
    </div>
  );
}
```

**Fidelity**: tokens, fonts, Tailwind, the component and i18n are the app's own; dark
mode is the `dark` class the preview sets from `?theme=dark`. Two cosmetic gaps: no modal backdrop or app shell (the
panel-only pattern), and Chromium instead of the platform WebView (subpixel differences).
A change to modal chrome or backdrop blur says so in the PR body.

## Never do

- Merge a frontend change without committed screenshots, light and dark.
- Call `invoke()` in a preview — hard-coded props or mocked stores.
- Leave `preview.html` or `src/__preview__/` committed.
- Hard-code the preview port or import paths — `.claude/daneel.json` has them.
