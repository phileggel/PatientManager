// wdio.conf.ts
// Following the official tauri-apps/webdriver-example v2 pattern.
//
// Prerequisites (one-time setup — run /setup-e2e):
//   npm install --save-dev @wdio/cli @wdio/local-runner @wdio/mocha-framework \
//               @wdio/spec-reporter webdriverio @wdio/globals
//   cargo install tauri-driver
//   sudo apt-get install -y webkit2gtk-driver   # Linux: provides WebKitWebDriver
//
// Run:
//   npm run test:e2e          # local (headed window)
//   npm run test:e2e:ci       # Linux CI (xvfb virtual display)
import os from "os";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import type { Options } from "@wdio/types";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Binary name from [[bin]] in src-tauri/Cargo.toml where path = "src/main.rs".
// Must use `tauri build --debug --no-bundle`, NOT plain `cargo build`:
// plain cargo build produces a binary that connects to the Vite dev server (devUrl).
// Only the Tauri CLI build embeds the frontend dist into the binary.
const BINARY_NAME = "patient_manager_app";
// Anchor on `__dirname` (this file's location) rather than the Node process
// cwd so the path stays correct if `npm run test:e2e` is invoked from a
// non-default cwd (e.g. a CI step with `working-directory: src-tauri`).
const BINARY_PATH = resolve(__dirname, "src-tauri", "target", "debug", BINARY_NAME);

// Ephemeral database used exclusively by the E2E test suite.
// The binary reads PATIENT_MANAGER_E2E_DB and, when set, uses that path instead
// of the normal app-data-dir location. This keeps test data fully isolated from
// the developer's real application data and guarantees a clean state each run.
const E2E_DB_PATH = resolve(os.tmpdir(), "patient_manager_e2e.db");

// Failure-screenshot output. The `afterTest` hook below writes a PNG for every
// failed test so CI runs can be diagnosed without re-running locally. The
// directory is git-ignored; the E2E workflow uploads it as an artifact on
// failure (.github/workflows/e2e.yml).
const SCREENSHOT_DIR = resolve(__dirname, "screenshots/e2e-failures");

let tauriDriver: ChildProcess;
let exit = false;

export const config: Options.Testrunner = {
  // tauri-driver port — use 4446/4447 to avoid collision with other projects on the default 4444/4445.
  host: "127.0.0.1",
  port: 4446,

  // Suppress WebDriver protocol logs (COMMAND/POST/RESULT chatter) — keep warnings and errors only.
  logLevel: "warn",

  framework: "mocha",
  specs: ["./e2e/**/*.test.ts"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      // Prevent WebdriverIO v9 from injecting webSocketUrl:true (BiDi) —
      // WebKitWebDriver on Linux does not support BiDi and rejects the session.
      "wdio:enforceWebDriverClassic": true,
      // @ts-expect-error tauri-specific capability not in @wdio/types
      "tauri:options": { application: BINARY_PATH },
    },
  ],
  reporters: ["spec"],
  mochaOpts: { timeout: 60000 },

  // Capture a screenshot on every failed test for post-mortem diagnosis.
  // File: screenshots/e2e-failures/{suite}-{test}-{timestamp}.png
  afterTest: async (test, _context, result) => {
    if (result.passed) return;
    try {
      if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 80);
      const suite = sanitize(test.parent ?? "unknown-suite");
      const title = sanitize(test.title);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      // @ts-expect-error browser is injected by @wdio/globals into the runner scope
      await browser.saveScreenshot(resolve(SCREENSHOT_DIR, `${suite}-${title}-${ts}.png`));
    } catch (err) {
      // oxlint-disable-next-line no-console
      console.error("[afterTest] screenshot capture failed:", err);
    }
  },

  // Build the binary once before any session starts.
  // --no-bundle: skip installer packaging, just produce the binary.
  // --debug: debug profile (faster compile, includes debug symbols).
  onPrepare: () => {
    // `--config tauri.e2e.conf.json` overrides `beforeBuildCommand` so
    // the frontend builds with `vite --mode e2e` instead of the default
    // `mode='production'`. That keeps the `e2eOverride` branch (gated
    // by the dev/test/e2e mode allowlist) alive in the binary WebDriver
    // drives. See ADR-007.
    const tauriConfPath = resolve(__dirname, "src-tauri", "tauri.e2e.conf.json");
    if (!existsSync(tauriConfPath)) {
      throw new Error(
        `tauri.e2e.conf.json not found at ${tauriConfPath}. ` +
          `The E2E build needs this overlay to keep the e2eOverride branch alive — see ADR-007.`,
      );
    }
    const result = spawnSync(
      "npx",
      ["tauri", "build", "--debug", "--no-bundle", "--config", "tauri.e2e.conf.json"],
      {
        cwd: resolve(__dirname, "src-tauri"),
        stdio: "inherit",
        shell: true,
      },
    );
    if (result.status !== 0) {
      throw new Error(`tauri build failed with exit code ${result.status}`);
    }
  },

  // Start tauri-driver just before the WebDriver session is created.
  // beforeSession (not onPrepare) is correct: tauri-driver is a per-session
  // intermediary and must be alive when the worker creates the session.
  beforeSession: () => {
    // Delete any leftover ephemeral DB from a previous interrupted run.
    if (existsSync(E2E_DB_PATH)) {
      rmSync(E2E_DB_PATH);
    }
    // Expose the ephemeral DB path to the binary via env var. tauri-driver
    // inherits this process environment and passes it to the launched binary.
    process.env.PATIENT_MANAGER_E2E_DB = E2E_DB_PATH;
    // Suppress verbose Rust/frontend tracing — only show warnings and errors.
    process.env.RUST_LOG = "warn";

    // tauri-driver is expected at ~/.cargo/bin/tauri-driver (installed via `cargo install tauri-driver`).
    // In CI, ensure Rust toolchain installs to the default cargo home or adjust this path.
    tauriDriver = spawn(
      resolve(os.homedir(), ".cargo", "bin", "tauri-driver"),
      ["--port", "4446", "--native-port", "4447"],
      { stdio: [null, process.stdout, process.stderr] },
    );
    tauriDriver.on("error", (error) => {
      // oxlint-disable-next-line no-console
      console.error("tauri-driver error:", error);
      process.exit(1);
    });
    tauriDriver.on("exit", (code) => {
      if (!exit) {
        // oxlint-disable-next-line no-console
        console.error("tauri-driver exited unexpectedly with code:", code);
        process.exit(1);
      }
    });
  },

  // Kill tauri-driver cleanly after the session ends and remove the ephemeral DB.
  afterSession: () => {
    exit = true;
    tauriDriver?.kill();
    if (existsSync(E2E_DB_PATH)) {
      rmSync(E2E_DB_PATH);
    }
  },
};

// Ensure tauri-driver is killed even on unexpected process exit (Ctrl+C, SIGTERM, etc.)
function onShutdown(fn: () => void) {
  const cleanup = () => {
    try {
      fn();
    } finally {
      process.exit();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
}

onShutdown(() => {
  exit = true;
  tauriDriver?.kill();
  if (existsSync(E2E_DB_PATH)) {
    rmSync(E2E_DB_PATH);
  }
});
