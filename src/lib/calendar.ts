import { addDays, daysBetween } from './dates';
import type { Reminder } from './db/types';

export interface Occurrence {
  reminder: Reminder;
  date: string;
  done: boolean;
}

/** Sicherheitsgrenze gegen Endlosschleifen bei großen Zeiträumen. */
const MAX_OCCURRENCES = 2000;

/** Alle Vorkommen einer Erinnerung im Bereich [from, to] (inklusive). */
export function occurrences(reminder: Reminder, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const done = new Set(reminder.completedDates);
  const push = (d: string) => out.push({ reminder, date: d, done: done.has(d) });
  const r = reminder.repeat;
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

/** Überfällige, nicht erledigte Vorkommen der letzten `days` Tage. */
export function overdue(reminders: Reminder[], todayStr: string, days = 14): Occurrence[] {
  return occurrencesInRange(reminders, addDays(todayStr, -days), addDays(todayStr, -1)).filter((o) => !o.done);
}

/* ───────────── ICS-Export (RFC 5545) ───────────── */

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
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
    if (r.repeat.kind !== 'none') {
      const freq = r.repeat.kind === 'daily' ? 'DAILY' : 'WEEKLY';
      const until = r.repeat.until ? `;UNTIL=${compactDate(r.repeat.until)}` : '';
      lines.push(`RRULE:FREQ=${freq};INTERVAL=${Math.max(1, Math.round(r.repeat.interval))}${until}`);
    }
    lines.push(`SUMMARY:${icsEscape(r.title)}`);
    if (r.notes) lines.push(`DESCRIPTION:${icsEscape(r.notes)}`);
    lines.push(`CATEGORIES:${icsEscape(r.category)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
