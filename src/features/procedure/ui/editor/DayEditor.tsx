import { type ChangeEvent, type KeyboardEvent, useEffect, useRef } from "react";
import { KEYS } from "@/types";

interface DayEditorProps {
  day: number;
  initialDay: number;
  maxDays: number;
  onChange: (newDay: number) => void;
  onCommit: (finalDay: number) => void;
  onCancel: (originalDay: number) => void;
}

export const DayEditor = ({
  day,
  initialDay,
  maxDays,
  onChange,
  onCommit,
  onCancel,
}: DayEditorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusAndSelect = () => {
      if (inputRef.current) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    // Use requestAnimationFrame to ensure layout completion
    const frameId = requestAnimationFrame(focusAndSelect);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newDay = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
    if (newDay >= 0 && newDay <= 31) onChange(newDay);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === KEYS.ESCAPE) {
      e.preventDefault();
      onCancel(initialDay);
      return;
    }

    if (e.key === KEYS.ENTER || e.key === KEYS.TAB) {
      e.preventDefault();
      onCommit(clampDay(day, maxDays));
    }
  };

  const handleBlur = () => {
    onCommit(clampDay(day, maxDays));
  };

  const isInvalid = day < 1 || day > maxDays;

  return (
    <input
      ref={inputRef}
      type="number"
      className={`w-full h-full bg-transparent outline-none px-2 text-center font-mono ${
        isInvalid ? "text-m3-error font-bold" : ""
      }`}
      min={1}
      max={maxDays}
      value={day || ""}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
};

/**
 * Helper: Clamps a day value within the valid range [1, maxDays]
 */
const clampDay = (day: number, max: number): number => {
  if (day < 1) return 1;
  if (day > max) return max;
  return day;
};
