/**
 * Rendering tests for the terminal/transient step components extracted from
 * BankStatementModal. The create-account step keeps its DOM-event coverage in
 * BankStatementModal.test.tsx (BAS-011..017); these cover the pure
 * presentational steps the modal test does not reach.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DoneStep } from "./DoneStep";
import { ErrorStep } from "./ErrorStep";
import { LoadingStep } from "./LoadingStep";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

describe("LoadingStep", () => {
  it("renders the provided message", () => {
    render(<LoadingStep message="loading message" />);
    expect(screen.getByText("loading message")).toBeInTheDocument();
  });
});

describe("DoneStep", () => {
  it("renders the done message with the created count", () => {
    render(<DoneStep createdCount={3} />);
    expect(screen.getByText('statement.modal.done:{"count":3}')).toBeInTheDocument();
    expect(screen.getByText("statement.modal.doneDescription")).toBeInTheDocument();
  });
});

describe("ErrorStep", () => {
  it("renders the error title and the error text as an alert", () => {
    render(<ErrorStep error="something broke" />);
    expect(screen.getByText("statement.modal.error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("something broke");
  });
});
