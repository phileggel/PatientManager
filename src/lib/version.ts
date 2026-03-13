// Application version and name management
// Automatically synchronized with package.json at build time

import packageJson from "../../package.json";

export const APP_NAME = "PatientManager";
export const APP_VERSION = packageJson.version;
