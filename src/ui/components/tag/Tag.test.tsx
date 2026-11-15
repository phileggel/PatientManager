import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag } from "./Tag";

describe("Tag (#697)", () => {
  it("colours a tag by what its status means", () => {
    render(
      <>
        <Tag id="t-done" tone="done">
          Done
        </Tag>
        <Tag id="t-action" tone="action">
          To link
        </Tag>
        <Tag id="t-aside" tone="aside">
          Ignored
        </Tag>
      </>,
    );

    expect(document.getElementById("t-done")?.className).toContain("--color-snackbar-success-bg");
    expect(document.getElementById("t-action")?.className).toContain("bg-m3-warning-container");
    expect(document.getElementById("t-aside")?.className).toContain("bg-m3-surface-variant");
  });
});
