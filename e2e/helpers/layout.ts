/**
 * Layout probes shared by the E2E suites: what the real WebView lays out, which
 * the Chromium previews cannot show (#738).
 */
import { browser } from "@wdio/globals";

/** How tall a scrolling area is shown, and how tall its content, in pixels. */
export async function formArea(elementId: string): Promise<{ shown: number; content: number }> {
  return browser.execute((id) => {
    const area = document.getElementById(id);
    if (!area) return { shown: -1, content: -1 };
    return { shown: area.clientHeight, content: area.scrollHeight };
  }, elementId);
}
