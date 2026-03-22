export const TABLE_STYLES = {
  container: "w-full h-full flex flex-col",
  tableWrapper: "overflow-y-auto rounded-xl bg-m3-surface shadow-elevation-1 flex-1 pr-2",
  table: "min-w-full table-fixed",
  thead: "bg-m3-surface-container-low",
  th: "px-4 py-[7px] text-left text-[10px] font-bold uppercase tracking-wider text-m3-on-surface-variant",
  row: "transition-colors",
  rowActive: "bg-m3-secondary-container/20",
  rowHover: "hover:bg-m3-surface-container/50",
  cellBase: "px-4 py-[5px] text-xs text-m3-on-surface",
  cellStatic: "bg-m3-surface-container/40 text-m3-on-surface-variant italic",
};

export const COL_WIDTHS = {
  patientName: "w-[18%]",
  ssn: "w-[12%]",
  fundId: "w-[10%]",
  fundName: "w-[15%]",
  procedureType: "w-[20%]",
  date: "w-[10%]",
  amount: "w-[10%]",
};
