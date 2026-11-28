/// <reference types="vitest/globals" />

import { render, screen } from "@testing-library/react";
import { PeriodSelector } from "./PeriodSelector";

describe("PeriodSelector", () => {
  // #752 (owner, 2026-11-28): the previous / next month buttons were unused.
  it("test_752_offers_the_month_and_the_year_fields_and_no_button", () => {
    render(
      <PeriodSelector
        selectedMonth={11}
        selectedYear={2026}
        yearRange={{ min: 2024, max: 2026 }}
        onMonthChange={() => {}}
        onYearChange={() => {}}
      />,
    );

    expect(screen.getAllByRole("combobox").map((field) => field.id)).toEqual([
      "month-selector",
      "year-selector",
    ]);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
