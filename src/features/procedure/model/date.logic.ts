export const getDayFromIso = (dateStr: string | null | undefined): number => {
  const parts: string[] = (dateStr ?? "").split("-");
  if (parts.length !== 3) return 0;

  const day = parseInt(parts[2] ?? "0", 10);
  return Number.isNaN(day) ? 0 : day;
};

export const formatDayToIso = (day: number, isoPrefix: string): string => {
  const dayStr = day.toString().padStart(2, "0");
  return `${isoPrefix}${dayStr}`;
};

export const getMonthName = (month: number, locale: string): string => {
  return new Date(2026, month - 1).toLocaleString(locale, { month: "long" });
};
