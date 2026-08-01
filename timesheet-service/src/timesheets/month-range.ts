/** Helpers to turn a (year, month) pair into the `YYYY-MM-DD` bounds stored in `timesheets.date`. */

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

/** `2026-08-01` (or a Date-ish string) → `{ year: 2026, month: 8 }`. */
export function periodOfDate(date: string | Date): { year: number; month: number } {
  const iso = typeof date === 'string' ? date : date.toISOString();
  const [yearStr, monthStr] = iso.split('T')[0].split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`Invalid timesheet date: ${String(date)}`);
  }
  return { year, month };
}

export function isValidPeriod(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 2000 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12
  );
}

export const MONTH_LABELS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS_FR[month - 1] ?? month} ${year}`;
}
