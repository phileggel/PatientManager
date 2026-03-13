import { type KeyboardEvent, useEffect, useRef } from "react";
import { KEYS } from "@/types";

interface AmountEditorProps {
  amount: number;
  initialAmount: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  onCancel: (originalAmount: number) => void;
}

export const AmountEditor = ({
  amount,
  initialAmount,
  onChange,
  onCommit,
  onCancel,
}: AmountEditorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus management upon mounting
  useEffect(() => {
    const focusAndSelect = () => {
      if (inputRef.current) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    // We use requestAnimationFrame to ensure the browser has finished
    // the layout before we attempt to select the text.
    requestAnimationFrame(focusAndSelect);
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === KEYS.ESCAPE) {
      e.preventDefault();
      onCancel(initialAmount);
      return;
    }

    if (e.key === KEYS.ENTER || e.key === KEYS.TAB) {
      e.preventDefault();
      onCommit(amount);
    }
  };

  return (
    <input
      ref={inputRef}
      type="number"
      step="0.01"
      className="w-full h-full bg-transparent outline-none px-2"
      value={amount ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      onKeyDown={handleKeyDown}
      onBlur={() => onCommit(amount)}
    />
  );
};
