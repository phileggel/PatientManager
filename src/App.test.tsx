import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Initial Rendering", () => {
  it("should render without crashing (no white screen)", () => {
    const { container } = render(<App />);
    expect(container.innerHTML).not.toBe("");
    expect(container.firstChild).toBeInTheDocument();
  });
});
