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

/**
 * What a container lays out past its right edge: the ids of its descendants
 * that end beyond it (a descendant without an id is seen through `wider`
 * only), whether its content is wider than its box, and its width (#752).
 * `null` when the container is missing.
 */
export async function overflowPastRight(
  containerId: string,
): Promise<{ beyond: string[]; wider: boolean; width: number } | null> {
  return browser.execute((id) => {
    const container = document.getElementById(id);
    if (!container) return null;
    const right = container.getBoundingClientRect().right;
    // Half a pixel absorbs WebKit's sub-pixel rounding of an edge that fits.
    const beyond = Array.from(container.querySelectorAll("[id]"))
      .filter((el) => el.getBoundingClientRect().right > right + 0.5)
      .map((el) => el.id);
    return {
      beyond,
      wider: container.scrollWidth > container.clientWidth,
      width: container.clientWidth,
    };
  }, containerId);
}
