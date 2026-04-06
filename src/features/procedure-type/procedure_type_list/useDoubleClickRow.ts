import { useCallback, useRef, useState } from "react";

const DOUBLE_CLICK_MS = 300;

/**
 * Detects double-click on table rows by tracking last clicked ID and timestamp.
 * Calls onDoubleClick(id) when the same row is clicked twice within DOUBLE_CLICK_MS.
 */
export function useDoubleClickRow(onDoubleClick: (id: string) => void) {
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const lastClickTime = useRef<number>(0);

  const handleRowClick = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      const now = Date.now();
      const isDoubleClick = lastClickedId === id && now - lastClickTime.current < DOUBLE_CLICK_MS;
      setLastClickedId(id);
      lastClickTime.current = now;
      if (isDoubleClick) {
        onDoubleClick(id);
      }
    },
    [lastClickedId, onDoubleClick],
  );

  return { handleRowClick };
}
