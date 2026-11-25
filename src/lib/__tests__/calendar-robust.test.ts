import { describe, expect, it } from 'vitest';
import { occurrences, remindersToIcs, safeRepeat } from '../calendar';
import type { Reminder } from '../db/types';

const base = { id: 'r', createdAt: '', updatedAt: '', title: 'T', category: 'other', completedDates: [], notes: '' } as unknown as Reminder;

describe('Kalender: robuste Wiederholungsregeln', () => {
  it('unbekannte oder unvollständige Regeln werden als einmaliger Termin behandelt', () => {
    expect(safeRepeat({ every: 3, unit: 'day' })).toEqual({ kind: 'none' });
    expect(safeRepeat(undefined)).toEqual({ kind: 'none' });
    expect(safeRepeat({ kind: 'daily' })).toEqual({ kind: 'daily', interval: 1 });
    expect(safeRepeat({ kind: 'weekly', interval: 2, until: 'kaputt' })).toEqual({ kind: 'weekly', interval: 2 });
  });
  it('erzeugt keine ungültigen Daten bei fremdem Format', () => {
    const r = { ...base, date: '2026-11-01', repeat: { every: 3, unit: 'day' } } as unknown as Reminder;
    expect(occurrences(r, '2026-10-01', '2026-12-31').map((o) => o.date)).toEqual(['2026-11-01']);
    expect(occurrences({ ...r, date: 'kein-datum' } as Reminder, '2026-10-01', '2026-12-31')).toEqual([]);
    expect(() => remindersToIcs([r])).not.toThrow();
  });
});

describe('Übersicht: eine Zeile je Erinnerung', () => {
  it('fasst Serien zusammen, überfällige zuerst', async () => {
    const { nextPerReminder, repeatLabel } = await import('../calendar');
    const daily = { ...base, id: 'd', date: '2026-11-20', repeat: { kind: 'daily', interval: 3 } } as unknown as Reminder;
    const once = { ...base, id: 'o', date: '2026-11-26', repeat: { kind: 'none' } } as unknown as Reminder;
    const r = nextPerReminder([daily, once], '2026-11-24', 14);
    expect(r.map((x) => [x.reminder.id, x.date, x.late, x.more])).toEqual([
      ['d', '2026-11-20', true, 6],
      ['o', '2026-11-26', false, 0],
    ]);
    expect(repeatLabel(daily.repeat)).toBe('alle 3 Tage');
    expect(repeatLabel({ kind: 'weekly', interval: 1 })).toBe('wöchentlich');
    expect(repeatLabel(once.repeat)).toBeUndefined();
  });
});
