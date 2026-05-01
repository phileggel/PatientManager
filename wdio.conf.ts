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
const BINARY_PATH = resolve(`./src-tauri/target/debug/${BINARY_NAME}`);

let tauriDriver: ChildProcess;
let exit = false;

export const config: Options.Testrunner = {
  // tauri-driver port — use 4446/4447 to avoid collision with other projects on the default 4444/4445.
  host: "127.0.0.1",
  port: 4446,

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

  // Build the binary once before any session starts.
  // --no-bundle: skip installer packaging, just produce the binary.
  // --debug: debug profile (faster compile, includes debug symbols).
  onPrepare: () => {
    const result = spawnSync("npx", ["tauri", "build", "--debug", "--no-bundle"], {
      cwd: resolve(__dirname),
      stdio: "inherit",
      shell: true,
    });
    if (result.status !== 0) {
      throw new Error(`tauri build failed with exit code ${result.status}`);
    }
  },

  // Start tauri-driver just before the WebDriver session is created.
  // beforeSession (not onPrepare) is correct: tauri-driver is a per-session
  // intermediary and must be alive when the worker creates the session.
  beforeSession: () => {
    // tauri-driver is expected at ~/.cargo/bin/tauri-driver (installed via `cargo install tauri-driver`).
    // In CI, ensure Rust toolchain installs to the default cargo home or adjust this path.
    tauriDriver = spawn(
      resolve(os.homedir(), ".cargo", "bin", "tauri-driver"),
      ["--port", "4446", "--native-port", "4447"],
      { stdio: [null, process.stdout, process.stderr] },
    );
    tauriDriver.on("error", (error) => {
      console.error("tauri-driver error:", error);
      process.exit(1);
    });
    tauriDriver.on("exit", (code) => {
      if (!exit) {
        console.error("tauri-driver exited unexpectedly with code:", code);
        process.exit(1);
      }
    });
  },

  // Kill tauri-driver cleanly after the session ends.
  afterSession: () => {
    exit = true;
    tauriDriver?.kill();
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
});
