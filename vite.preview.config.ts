import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

// Stubs @tauri-apps/api/core so components render in a plain Chromium preview
// without the Tauri runtime. Add entries to the responses map as needed.
const tauriMock: Plugin = {
  name: "tauri-mock",
  resolveId(id) {
    if (id === "@tauri-apps/api/core") return "\0tauri-core-mock";
  },
  load(id) {
    if (id !== "\0tauri-core-mock") return;
    return `
      export const invoke = async (cmd, _args) => {
        const responses = {
          get_cash_bank_account_id: "cash-preview-001",
        };
        if (!(cmd in responses)) console.warn("[tauri-mock] unhandled:", cmd);
        return responses[cmd] ?? null;
      };
      export class Channel {}
      export class Resource {}
      export const SERIALIZE_TO_IPC_FN = Symbol("serialize");
      export const convertFileSrc = (src) => src;
      export const transformCallback = (cb) => cb;
      export const isTauri = () => false;
    `;
  },
};

export default defineConfig({
  clearScreen: false,
  plugins: [tailwindcss(), react(), tauriMock],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/docs/**",
        "**/.claude/**",
        "**/.githooks/**",
        "**/.github/**",
        "**/scripts/**",
      ],
    },
  },
});
