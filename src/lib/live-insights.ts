/**
 * Pure helpers for the live Insights page. No database or browser APIs here,
 * so the rules can be tested on their own.
 */

export const INSIGHT_RANGES = [7, 30, 90] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

/** Largest custom range the page or the CSV download accepts, in days. */
export const MAX_CUSTOM_DAYS = 400;

export type InsightWindow = { from: string; to: string };

/** Wording for a change between two periods. Says so plainly when there is no earlier data. */
export function changeLabel(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? "No change" : "No earlier data to compare";
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "No change";
  return pct > 0 ? `Up ${pct}%` : `Down ${Math.abs(pct)}%`;
}

/** Checks a from/to pair (YYYY-MM-DD, inclusive). Returns an error message or null. */
export function checkWindow(from: string, to: string): string | null {
  const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!dayPattern.test(from) || !dayPattern.test(to)) return "Dates must look like 2026-11-01.";
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  // JS rolls 2026-02-30 over to March, so check the date writes back the same way.
  const roundTrips = (text: string, time: number) => new Date(time).toISOString().slice(0, 10) === text;
  if (Number.isNaN(start) || Number.isNaN(end) || !roundTrips(from, start) || !roundTrips(to, end)) {
    return "Dates must be real calendar dates.";
  }
  if (end < start) return "The end date must be on or after the start date.";
  const days = Math.round((end - start) / 86400000) + 1;
  if (days > MAX_CUSTOM_DAYS) return `Pick a range of ${MAX_CUSTOM_DAYS} days or less.`;
  return null;
}

/** Today's date in Johannesburg, YYYY-MM-DD. */
export function todayInSast(now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(now));
}

/** Window ending on `today` (SAST date, YYYY-MM-DD) that covers `days` days. */
export function windowFor(today: string, days: number): InsightWindow {
  const end = Date.parse(`${today}T00:00:00Z`);
  const start = end - (days - 1) * 86400000;
  return { from: new Date(start).toISOString().slice(0, 10), to: today };
}

export type CsvRow = Record<string, string | number>;

function cell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Builds a CSV with a fixed header. Callers pass counts and dates only, so no
 * guest names, phone numbers or other personal details can reach the file.
 */
export function buildCsv(columns: readonly string[], rows: CsvRow[]): string {
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c] ?? "")).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
