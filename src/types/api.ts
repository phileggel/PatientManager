/**
 * @file api.ts
 * @description Global API type definitions and service response wrappers.
 * * This file centralizes the ServiceResult pattern used across all features
 * to ensure consistent error handling and type-safe communication between
 * the Tauri (Rust) backend and the React frontend.
 * * @author 2026 Project Team
 */

// Service result types.
//
// `E` defaults to `string` so gateways that still return raw anyhow-formatted
// strings keep working unchanged. Gateways for BCs migrated to the typed-error
// gold (PatientError, ProcedureError, …) parameterise `E` and pass the typed
// error through verbatim — the consumer (hook/component) translates via the
// feature's presenter + `useTranslation`. Per F27: gateways are pure
// pass-throughs; translation is Layer 4 (the render site).
export type ServiceResult<T = void, E = string> =
  | {
      success: true;
      data: T;
      error?: never;
    }
  | {
      success: false;
      data?: never;
      error: E;
    };
