#!/usr/bin/env node
// Usage: node scripts/preview-screenshot.mjs <ComponentName>
//   (or via just: just preview-screenshot <ComponentName>)
// Starts Vite with vite.preview.config.ts on port 1422, screenshots preview.html,
// saves to screenshots/<ComponentName>-preview.png, then shuts down.
// Requires: preview.html + src/__preview__/main.tsx to exist (gitignored, created per task).
// One-time setup: npx playwright install chromium

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const COMPONENT = process.argv[2] ?? "preview";

if (!/^[A-Za-z0-9_-]+$/.test(COMPONENT)) {
  // oxlint-disable-next-line no-console
  console.error(`Invalid component name: "${COMPONENT}". Use only letters, digits, hyphens, underscores.`);
  process.exit(1);
}

const OUT = `screenshots/${COMPONENT}-preview.png`;

mkdirSync("screenshots", { recursive: true });

// oxlint-disable-next-line no-console
console.log("Starting Vite preview server…");

const vite = spawn(
  "node_modules/.bin/vite",
  ["--config", "vite.preview.config.ts", "--port", "1422", "--host", "127.0.0.1"],
  { stdio: ["pipe", "pipe", "pipe"] },
);

vite.stderr.on("data", (d) => process.stderr.write(d));

let serverUrl;
try {
  serverUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Vite did not start within 30s")), 30_000);
    let buf = "";
    vite.stdout.on("data", (data) => {
      buf += data.toString();
      process.stdout.write(data);
      const match = buf.match(/Local:\s+(http:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1].replace(/\/$/, ""));
      }
    });
    vite.on("error", (e) => { clearTimeout(timer); reject(e); });
    vite.on("exit", (code) => {
      if (code !== 0) { clearTimeout(timer); reject(new Error(`Vite exited with code ${code}`)); }
    });
  });
} catch (e) {
  vite.kill();
  throw e;
}

const previewUrl = `${serverUrl}/preview.html`;
// oxlint-disable-next-line no-console
console.log(`\nOpening ${previewUrl}…`);

// Extra time for initial compile
await sleep(1_500);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(previewUrl, { waitUntil: "networkidle", timeout: 15_000 });
  await sleep(500);
  await page.screenshot({ path: OUT, fullPage: true });
  // oxlint-disable-next-line no-console
  console.log(`\n✓ Screenshot saved: ${OUT}`);
} finally {
  await browser.close();
  vite.kill();
}
