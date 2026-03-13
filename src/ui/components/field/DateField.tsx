import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

import { useDateField } from "./useDateField";

interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  id: string;
  label: string;
  error?: string;
  locale?: string;
}

/**
 * DateField - M3 Design System Date Input Component
 *
 * Modern date input field with custom calendar popup, label and optional error message.
 * Uses ISO format (YYYY-MM-DD) internally, displays in locale format (DD/MM/YYYY for fr-FR).
 * Calendar uses fixed positioning calculated from input bounding rect to avoid viewport overflow.
 *
 * @example
 * <DateField
 *   id="paymentDate"
 *   label="Payment Date *"
 *   value="2026-02-20"
 *   onChange={(e) => setDate(e.target.value)}
 *   error={errors.date}
 * />
 */
export function DateField({
  id,
  label,
  error,
  value,
  onChange,
  locale = "fr-FR",
  className = "",
  disabled = false,
  ...props
}: DateFieldProps) {
  const { t } = useTranslation("common");
  const {
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
  } = useDateField(value, onChange, locale);

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-9" />);
    }

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
          className={`h-9 rounded text-xs font-medium transition-colors cursor-pointer ${
            isToday
              ? "bg-m3-primary text-m3-on-primary"
              : "hover:bg-m3-surface-container text-m3-on-surface"
          }`}
        >
          {day}
        </button>,
      );
    }

    return days;
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="m3-input-label">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className={`m3-input w-full pr-8 ${error ? "border-m3-error" : ""} ${className}`}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={openCalendar}
          onBlur={closeCalendar}
          disabled={disabled}
          placeholder={t("field.datePlaceholder")}
          {...props}
        />
        {displayValue && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              clearDate();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-m3-on-surface-variant hover:text-m3-on-surface transition-colors"
          >
            <X size={14} />
          </button>
        )}
        {showCalendar && !disabled && (
          <div
            ref={calendarRef}
            onMouseDown={(e) => e.preventDefault()}
            role="dialog"
            style={{ top: calendarPos.top, left: calendarPos.left }}
            className="fixed bg-m3-surface border border-m3-outline rounded-lg shadow-lg p-3 z-50 w-64"
          >
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() =>
                  setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
                }
                className="p-1.5 hover:bg-m3-surface-variant rounded-lg transition-colors"
              >
                <ChevronLeft size={18} className="text-m3-on-surface" />
              </button>
              <span className="text-xs font-medium text-m3-on-surface flex-1 text-center">
                {monthYear}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
                }
                className="p-1.5 hover:bg-m3-surface-variant rounded-lg transition-colors"
              >
                <ChevronRight size={18} className="text-m3-on-surface" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="h-9 flex items-center justify-center text-xs font-medium text-m3-on-surface-variant"
                >
                  {day.substring(0, 2).toUpperCase()}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">{renderCalendar()}</div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-m3-error mt-1 ml-1">{error}</p>}
    </div>
  );
}
