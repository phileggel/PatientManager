/**
 * @file api.ts
 * @description Global API type definitions and service response wrappers.
 * * This file centralizes the ServiceResult pattern used across all features
 * to ensure consistent error handling and type-safe communication between
 * the Tauri (Rust) backend and the React frontend.
 * * @author 2026 Project Team
 */

// Service result types
export type ServiceResult<T = void> =
  | {
      success: true;
      data: T;
      error?: never;
    }
  | {
      success: false;
      data?: never;
      error: string;
    };
