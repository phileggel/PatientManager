// cell/StaticCell.tsx
import { TABLE_STYLES } from "../ui.styles";

interface StaticCellProps {
  value: string | number | null | undefined;
  widthClass: string; // Pour passer COL_WIDTHS.ssn par exemple
}

export function StaticCell({ value, widthClass }: StaticCellProps) {
  return (
    <td className={`${TABLE_STYLES.cellBase} ${TABLE_STYLES.cellStatic} ${widthClass}`}>
      {value || "—"}
    </td>
  );
}
