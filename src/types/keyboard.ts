export const KEYS = {
  ENTER: "Enter",
  TAB: "Tab",
  ESCAPE: "Escape",
  ARROW_UP: "ArrowUp",
  ARROW_DOWN: "ArrowDown",
  BACKSPACE: "Backspace",
  SPACE: " ",
} as const;

export type Key = (typeof KEYS)[keyof typeof KEYS];
