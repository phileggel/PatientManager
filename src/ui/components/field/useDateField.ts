import { useCallback, useEffect, useRef, useState } from "react";

// Calendar popup dimensions for viewport clamping (w-64 = 256px, approx height 290px)
const CALENDAR_WIDTH = 256;
const CALENDAR_HEIGHT = 290;

/**
 * useDateField - Logic for the DateField component.
 *
 * Manages display/storage date format conversion, calendar visibility,
 * fixed-position calculation to avoid viewport overflow, and day selection.
 */
export function useDateField(
  value: string | number | readonly string[] | undefined,
  onChange: ((e: React.ChangeEvent<HTMLInputElement>) => void) | undefined,
  locale: string,
) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarPos, setCalendarPos] = useState({ top: 0, left: 0 });
  const [displayValue, setDisplayValue] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Format ISO date (YYYY-MM-DD) to locale string (e.g., DD/MM/YYYY for fr-FR)
  const formatDateForDisplay = useCallback(
    (isoDate: string | number | readonly string[] | undefined): string => {
      if (!isoDate) return "";
      const dateStr = String(isoDate);
      const date = new Date(`${dateStr}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return dateStr;
      return new Intl.DateTimeFormat(locale).format(date);
    },
    [locale],
  );

  // Parse locale string (e.g., DD/MM/YYYY) to ISO date (YYYY-MM-DD)
  const formatDateForStorage = useCallback(
    (displayDate: string): string => {
      if (!displayDate) return "";
      const localeObj = new Intl.DateTimeFormat(locale);
      const parts = localeObj.formatToParts(new Date());
      const dateParts = displayDate.split(/[/-]/);
      if (dateParts.length !== 3) return "";

      const pattern = parts
        .filter((p) => ["day", "month", "year"].includes(p.type))
        .map((p) => p.type);

      const isoYear = dateParts[pattern.indexOf("year")] ?? "";
      const isoMonth = (dateParts[pattern.indexOf("month")] ?? "").padStart(2, "0");
      const isoDay = (dateParts[pattern.indexOf("day")] ?? "").padStart(2, "0");

      return `${isoYear}-${isoMonth}-${isoDay}`;
    },
    [locale],
  );

  // Sync display value when ISO value changes from outside (controlled component)
  useEffect(() => {
    if (value !== undefined) {
      setDisplayValue(formatDateForDisplay(value));
      if (value && String(value).match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month] = String(value).split("-") as [string, string];
        setCurrentMonth(new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1));
      }
    }
  }, [value, formatDateForDisplay]);

  // Open calendar and compute fixed position based on input bounding rect
  const openCalendar = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const gap = 4;

      let top = rect.bottom + gap;
      let left = rect.left;

      if (left + CALENDAR_WIDTH > window.innerWidth - 8) {
        left = window.innerWidth - CALENDAR_WIDTH - 8;
      }
      if (top + CALENDAR_HEIGHT > window.innerHeight - 8) {
        top = rect.top - CALENDAR_HEIGHT - gap;
      }

      setCalendarPos({ top, left });
    }
    setShowCalendar(true);
  };

  const closeCalendar = () => setTimeout(() => setShowCalendar(false), 200);

  const clearDate = () => {
    setDisplayValue("");
    setShowCalendar(false);
    onChange?.({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDisplayValue = e.target.value;
    setDisplayValue(newDisplayValue);

    const isoDate = formatDateForStorage(newDisplayValue);
    if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      onChange?.({
        ...e,
        target: { ...e.target, value: isoDate },
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleDateSelect = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const isoDate = `${year}-${month}-${day}`;
    setDisplayValue(formatDateForDisplay(isoDate));
    setShowCalendar(false);
    onChange?.({ target: { value: isoDate } } as React.ChangeEvent<HTMLInputElement>);
    inputRef.current?.blur();
  };

  const getDaysInMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  const getFirstDayOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const monthYear = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(currentMonth);

  return {
    displayValue,
    showCalendar,
    calendarPos,
    currentMonth,
    setCurrentMonth,
    inputRef,
    calendarRef,
    monthYear,
    openCalendar,
    closeCalendar,
    clearDate,
    handleInputChange,
    handleDateSelect,
    getDaysInMonth,
    getFirstDayOfMonth,
  };
}
