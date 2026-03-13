export const TABLE_STYLES = {
  container: "w-full h-full flex flex-col",
  tableWrapper: "overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm flex-1 pr-2",
  table: "min-w-full table-fixed divide-y divide-slate-200",
  thead: "bg-slate-50",
  th: "px-4 py-[7px] text-left text-[10px] font-bold uppercase tracking-wider text-slate-500",
  row: "transition-colors border-b border-slate-100",
  rowActive: "bg-blue-50/40",
  rowHover: "hover:bg-slate-50/80",
  cellBase: "px-4 py-[5px] text-xs text-slate-700",
  cellStatic: "bg-slate-50/50 text-slate-500 italic",
};

export const COL_WIDTHS = {
  patientName: "w-[18%]",
  ssn: "w-[12%]",
  fundId: "w-[10%]",
  fundName: "w-[15%]",
  procedureType: "w-[20%]",
  date: "w-[10%]",
  amount: "w-[10%]",
  actions: "w-[5%]",
};
