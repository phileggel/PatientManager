import React from "react";
import ReactDOM from "react-dom/client";

import { logger } from "@/lib/logger";
import "./i18n/config"; // must be imported before any component that uses t()
import App from "./App";

const TAG = "[Main]";

// Import Tailwind CSS v4 (includes base, components, utilities)
import "./ui/tailwind.css";

logger.info(TAG, "starting application");

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
