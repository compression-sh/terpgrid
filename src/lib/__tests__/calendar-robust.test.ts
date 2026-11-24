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
