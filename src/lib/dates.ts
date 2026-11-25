/**
 * Datumshilfen für Kalendertage. Gerechnet wird in UTC mit "YYYY-MM-DD",
 * damit Sommerzeitwechsel keine Tageszählungen verfälschen.
 */

const DAY_MS = 86_400_000;

export function parseDay(d: string): number {
  return Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
}

export function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Heutiges Datum (lokale Zeit) als YYYY-MM-DD. */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Aktuelle lokale Zeit als "YYYY-MM-DDTHH:mm" (für datetime-local). */
export function nowLocal(now: Date = new Date()): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${today(now)}T${hh}:${mm}`;
}

/** Ganze Tage von a nach b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
}

export function addDays(d: string, n: number): string {
  return formatDay(parseDay(d) + n * DAY_MS);
}

export function addMonths(d: string, n: number): string {
  const [y, m] = d.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  return formatDay(date.getTime());
}

/** Wochentag 0 = Montag … 6 = Sonntag. */
export function weekdayMon(d: string): number {
  return (new Date(parseDay(d)).getUTCDay() + 6) % 7;
}

export function startOfWeek(d: string): string {
  return addDays(d, -weekdayMon(d));
}

export function startOfMonth(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

/** 6×7-Raster (Mo–So) für eine Monatsansicht. */
export function monthGrid(d: string): string[] {
  const first = startOfMonth(d);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekDays(d: string): string[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dateLongFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function fmtDate(d?: string): string {
  if (!d) return '–';
  const ms = parseDay(d);
  return Number.isNaN(ms) ? '–' : dateFmt.format(ms);
}
export function fmtDateLong(d?: string): string {
  if (!d) return '–';
  const ms = parseDay(d);
  return Number.isNaN(ms) ? '–' : dateLongFmt.format(ms);
}
export function fmtDateShort(d?: string): string {
  if (!d) return '–';
  const ms = parseDay(d);
  return Number.isNaN(ms) ? '–' : shortFmt.format(ms);
}
export function fmtMonth(d: string): string {
  return monthFmt.format(parseDay(d));
}

/** "YYYY-MM-DDTHH:mm" → "12.03.2026, 14:05" */
export function fmtDateTime(dt?: string): string {
  if (!dt) return '–';
  const time = dt.length >= 16 ? dt.slice(11, 16) : '';
  return time ? `${fmtDate(dt.slice(0, 10))}, ${time}` : fmtDate(dt.slice(0, 10));
}

/** Relative Angabe: "heute", "gestern", "vor 3 Tagen", "in 2 Tagen". */
export function relativeDay(d: string, ref: string = today()): string {
  const diff = daysBetween(ref, d.slice(0, 10));
  if (diff === 0) return 'heute';
  if (diff === -1) return 'gestern';
  if (diff === 1) return 'morgen';
  if (diff < 0) return `vor ${-diff} Tagen`;
  return `in ${diff} Tagen`;
}
