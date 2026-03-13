import { ChevronLeft, ChevronRight } from "lucide-react";
import { type InputHTMLAttributes, useRef, useState } from "react";

interface DatePickerLegacyProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> {
  id: string;
  label?: string;
  error?: string;
  locale?: string;
}

/**
 * DatePickerLegacy - Deprecated Component
 *
 * DEPRECATED: This component uses hybrid styling - M3 tokens in calendar but outdated border-based input styling.
 *
 * TODO: Review usage and refactor to use fully M3-aligned input styling (similar to TextField pattern).
 * Consumers:
 * - src/features/bank-transfer/presentation/BankTransferForm.tsx
 * - src/features/bank-transfer/presentation/BankTransferEditModal.tsx
 * - src/features/fund-payment/edit_fund_payment_modal/EditFundPaymentModal.tsx
 * - src/features/fund-payment/add_fund_payment_panel/AddFundPaymentPanel.tsx
 *
 * This component exists only for backward compatibility during refactoring.
 */
export function DatePickerLegacy({
  id,
  label,
  required = false,
  error,
  locale = "fr-FR",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  value,
  onChange,
  disabled = false,
  ...props
}: DatePickerLegacyProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [displayValue, setDisplayValue] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Format ISO date (YYYY-MM-DD) to locale string (e.g., DD/MM/YYYY for fr-FR)
  const formatDateForDisplay = (isoDate: string): string => {
    if (!isoDate) return "";
    const date = new Date(`${isoDate}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale).format(date);
  };

  // Parse locale string (e.g., DD/MM/YYYY) to ISO date (YYYY-MM-DD)
  const formatDateForStorage = (displayDate: string): string => {
    if (!displayDate) return "";
    const locale_obj = new Intl.DateTimeFormat(locale);
    const parts = locale_obj.formatToParts(new Date());

    const dateParts = displayDate.split(/[/-]/);
    if (dateParts.length !== 3) return "";

    // Create ISO date based on locale pattern
    const pattern = parts
      .filter((p) => ["day", "month", "year"].includes(p.type))
      .map((p) => p.type);

    const isoYear = dateParts[pattern.indexOf("year")] ?? "";
    const isoMonth = (dateParts[pattern.indexOf("month")] ?? "").padStart(2, "0");
    const isoDay = (dateParts[pattern.indexOf("day")] ?? "").padStart(2, "0");

    return `${isoYear}-${isoMonth}-${isoDay}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDisplayValue = e.target.value;
    setDisplayValue(newDisplayValue);

    const isoDate = formatDateForStorage(newDisplayValue);
    if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      onChange?.({ ...e, target: { ...e.target, value: isoDate } });
    }
  };

  const handleDateSelect = (date: Date) => {
    // Format date in local time, not UTC, to avoid timezone offset issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const isoDate = `${year}-${month}-${day}`;
    const displayDate = formatDateForDisplay(isoDate);
    setDisplayValue(displayDate);
    setShowCalendar(false);
    onChange?.({
      target: { value: isoDate },
    } as React.ChangeEvent<HTMLInputElement>);
    // Blur input so next click triggers onFocus and opens calendar again
    inputRef.current?.blur();
  };

  const handleCalendarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8" />);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const isToday = new Date().toDateString() === date.toDateString();
      days.push(
        <button
          key={day}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleDateSelect(date);
          }}
          className={`h-8 rounded text-sm font-medium transition-colors cursor-pointer ${
            isToday
              ? "bg-m3-primary text-m3-on-primary"
              : "hover:bg-m3-surface-container-high text-m3-on-surface"
          }`}
        >
          {day}
        </button>,
      );
    }

    return days;
  };

  const monthYear = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(currentMonth);

  const fieldClasses = `
    w-full h-11 px-4 py-3
    border rounded
    text-sm font-medium leading-5
    text-m3-on-surface bg-m3-surface
    transition-colors duration-150 ease-out
    focus:outline-none focus:border-m3-primary focus:ring-[3px] focus:ring-m3-primary/10
    disabled:bg-m3-surface-container-low disabled:text-m3-on-surface/50 disabled:cursor-not-allowed
    ${error ? "border-m3-error focus:ring-m3-error/10" : "border-m3-outline"}
  `;

  return (
    <div className="flex flex-col gap-2 relative">
      {label && (
        <label htmlFor={id} className="text-sm font-medium tracking-wide text-m3-on-surface">
          {label}
          {required && <span className="text-m3-error ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          required={required}
          className={fieldClasses}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => setShowCalendar(true)}
          onBlur={() => setTimeout(() => setShowCalendar(false), 200)}
          disabled={disabled}
          placeholder={locale === "fr-FR" ? "DD/MM/YYYY" : "MM/DD/YYYY"}
          {...props}
        />
        {showCalendar && !disabled && (
          <div
            ref={calendarRef}
            onMouseDown={handleCalendarMouseDown}
            role="dialog"
            className="absolute top-12 left-0 bg-m3-surface border border-m3-outline rounded shadow-lg p-4 z-50 w-64"
          >
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() =>
                  setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
                }
                className="p-1 hover:bg-m3-surface-container-low rounded"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-medium text-m3-on-surface">{monthYear}</span>
              <button
                type="button"
                onClick={() =>
                  setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
                }
                className="p-1 hover:bg-m3-surface-container-low rounded"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="h-8 flex items-center justify-center text-xs font-medium text-m3-on-surface-variant"
                >
                  {day.substring(0, 2)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
          </div>
        )}
      </div>
      {error && <span className="text-m3-error text-xs font-medium tracking-wide">{error}</span>}
    </div>
  );
}
