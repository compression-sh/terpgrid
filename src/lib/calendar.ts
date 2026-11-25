import { addDays, daysBetween } from './dates';
import type { Reminder } from './db/types';

export interface Occurrence {
  reminder: Reminder;
  date: string;
  done: boolean;
}

/** Sicherheitsgrenze gegen Endlosschleifen bei großen Zeiträumen. */
const MAX_OCCURRENCES = 2000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Wiederholungsregel defensiv lesen: Datensätze aus Importen oder älteren Versionen können unvollständig
 * oder in einem anderen Format vorliegen. Unbekanntes wird als „keine Wiederholung“ behandelt, statt
 * die Ansicht mit ungültigen Datumswerten abstürzen zu lassen.
 */
export function safeRepeat(repeat: unknown): Reminder['repeat'] {
  const r = repeat as { kind?: unknown; interval?: unknown; until?: unknown } | null | undefined;
  if (!r || (r.kind !== 'daily' && r.kind !== 'weekly')) return { kind: 'none' };
  const interval = typeof r.interval === 'number' && Number.isFinite(r.interval) && r.interval >= 1 ? r.interval : 1;
  const until = typeof r.until === 'string' && DATE_RE.test(r.until) ? r.until : undefined;
  return { kind: r.kind, interval, ...(until ? { until } : {}) };
}

/** Alle Vorkommen einer Erinnerung im Bereich [from, to] (inklusive). */
export function occurrences(reminder: Reminder, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  if (typeof reminder.date !== 'string' || !DATE_RE.test(reminder.date)) return out;
  const done = new Set(Array.isArray(reminder.completedDates) ? reminder.completedDates : []);
  const push = (d: string) => out.push({ reminder, date: d, done: done.has(d) });
  const r = safeRepeat(reminder.repeat);
  if (r.kind === 'none') {
    if (daysBetween(from, reminder.date) >= 0 && daysBetween(reminder.date, to) >= 0) push(reminder.date);
    return out;
  }
  const stepDays = Math.max(1, Math.round(r.interval)) * (r.kind === 'weekly' ? 7 : 1);
  const end = r.until && daysBetween(r.until, to) > 0 ? r.until : to;
  // Erstes Vorkommen ≥ from direkt berechnen statt iterieren.
  let d = reminder.date;
  const gap = daysBetween(reminder.date, from);
  if (gap > 0) d = addDays(reminder.date, Math.ceil(gap / stepDays) * stepDays);
  while (daysBetween(d, end) >= 0 && out.length < MAX_OCCURRENCES) {
    push(d);
    d = addDays(d, stepDays);
  }
  return out;
}

export function occurrencesInRange(reminders: Reminder[], from: string, to: string): Occurrence[] {
  return reminders
    .flatMap((r) => occurrences(r, from, to))
    .sort((a, b) => (a.date === b.date ? (a.reminder.time ?? '').localeCompare(b.reminder.time ?? '') : a.date.localeCompare(b.date)));
}

/** Nächste offene Vorkommen ab `from` (für Dashboard). */
export function upcoming(reminders: Reminder[], from: string, days = 30, limit = 6): Occurrence[] {
  return occurrencesInRange(reminders, from, addDays(from, days))
    .filter((o) => !o.done)
    .slice(0, limit);
}

export interface NextReminder {
  reminder: Reminder;
  /** Ältestes überfälliges, sonst nächstes offenes Vorkommen */
  date: string;
  late: boolean;
  /** Weitere offene Vorkommen derselben Erinnerung im Zeitfenster (überfällig + anstehend) */
  more: number;
}

/**
 * Je Erinnerung nur ein Eintrag (statt jedes Vorkommen einer Serie): überfällige zuerst, dann nach Datum.
 * Verhindert, dass eine tägliche Erinnerung die ganze Liste füllt.
 */
export function nextPerReminder(reminders: Reminder[], todayStr: string, days = 14): NextReminder[] {
  const all = [...overdue(reminders, todayStr, days).map((o) => ({ ...o, late: true })), ...occurrencesInRange(reminders, todayStr, addDays(todayStr, days)).filter((o) => !o.done).map((o) => ({ ...o, late: false }))];
  const by = new Map<string, NextReminder>();
  for (const o of all) {
    const cur = by.get(o.reminder.id);
    if (!cur) by.set(o.reminder.id, { reminder: o.reminder, date: o.date, late: o.late, more: 0 });
    else cur.more++;
  }
  return [...by.values()].sort((a, b) => Number(b.late) - Number(a.late) || a.date.localeCompare(b.date));
}

/** Lesbarer Rhythmus einer Serie, z. B. „alle 3 Tage“ – undefined bei einmaligen Terminen. */
export function repeatLabel(repeat: unknown): string | undefined {
  const r = safeRepeat(repeat);
  if (r.kind === 'none') return undefined;
  if (r.kind === 'daily') return r.interval === 1 ? 'täglich' : `alle ${r.interval} Tage`;
  return r.interval === 1 ? 'wöchentlich' : `alle ${r.interval} Wochen`;
}

/** Überfällige, nicht erledigte Vorkommen der letzten `days` Tage. */
export function overdue(reminders: Reminder[], todayStr: string, days = 14): Occurrence[] {
  return occurrencesInRange(reminders, addDays(todayStr, -days), addDays(todayStr, -1)).filter((o) => !o.done);
}

/* ───────────── ICS-Export (RFC 5545) ───────────── */

function icsEscape(s: string): string {
  // RFC 5545: Backslash, Semikolon und Komma maskieren, Zeilenumbrüche als \n
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zeilen > 75 Oktette falten (RFC 5545, 3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + b > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += b;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (d: string) => d.replace(/-/g, '');

export function remindersToIcs(reminders: Reminder[], stamp: Date = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TERPGRID//Grow-Kalender//DE', 'CALSCALE:GREGORIAN'];
  for (const r of reminders) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${r.id}@terpgrid.local`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (r.time && /^\d{2}:\d{2}$/.test(r.time)) {
      // Lokale "floating" Zeit – wird in der Zeitzone des Kalenders angezeigt.
      lines.push(`DTSTART:${compactDate(r.date)}T${r.time.replace(':', '')}00`);
      lines.push('DURATION:PT30M');
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(r.date)}`);
      lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(r.date, 1))}`);
    }
    const rep = safeRepeat(r.repeat);
    if (rep.kind !== 'none') {
      const freq = rep.kind === 'daily' ? 'DAILY' : 'WEEKLY';
      const until = rep.until ? `;UNTIL=${compactDate(rep.until)}` : '';
      lines.push(`RRULE:FREQ=${freq};INTERVAL=${Math.max(1, Math.round(rep.interval))}${until}`);
    }
    lines.push(`SUMMARY:${icsEscape(r.title)}`);
    if (r.notes) lines.push(`DESCRIPTION:${icsEscape(r.notes)}`);
    lines.push(`CATEGORIES:${icsEscape(r.category)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
