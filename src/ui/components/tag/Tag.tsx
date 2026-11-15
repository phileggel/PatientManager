import type { ReactNode } from "react";

/** #692 — one colour meaning across screens: done green, needs action orange,
 *  set aside grey; a new link purple. */
export type TagTone = "done" | "action" | "aside" | "new";

const TONE_CLASSES: Record<TagTone, string> = {
  done: "bg-[var(--color-snackbar-success-bg)] text-[var(--color-snackbar-success-text)]",
  action: "bg-m3-warning-container text-m3-on-warning-container",
  aside: "bg-m3-surface-variant text-m3-on-surface-variant",
  new: "bg-m3-primary-container text-m3-on-primary-container",
};

interface TagProps {
  /** Stable id; F25. */
  id?: string;
  tone: TagTone;
  children: ReactNode;
  /** Extra classes, a fixed width so a column of tags lines up. */
  className?: string;
}

/** Tag — a status pill whose colour says what the status means (#692). */
export function Tag({ id, tone, children, className = "" }: TagProps) {
  return (
    <span
      id={id}
      className={`inline-block rounded-full px-2 py-1 text-center text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
