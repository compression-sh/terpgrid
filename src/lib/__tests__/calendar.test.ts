import { describe, expect, it } from 'vitest';
import { occurrences, overdue, remindersToIcs, upcoming } from '../calendar';
import type { Reminder } from '../db/types';

const r = (over: Partial<Reminder>): Reminder => ({
  id: 'r1',
  title: 'Gießen',
  date: '2026-11-01',
  category: 'watering',
  repeat: { kind: 'none' },
  completedDates: [],
  notes: '',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('Erinnerungen', () => {
  it('einmalig', () => {
    expect(occurrences(r({}), '2026-11-01', '2026-11-30')).toHaveLength(1);
    expect(occurrences(r({}), '2026-11-02', '2026-11-30')).toHaveLength(0);
  });
  it('alle 3 Tage, beginnend mitten im Bereich', () => {
    const o = occurrences(r({ repeat: { kind: 'daily', interval: 3 } }), '2026-11-05', '2026-11-15');
    expect(o.map((x) => x.date)).toEqual(['2026-11-07', '2026-11-10', '2026-11-13']);
  });
  it('wöchentlich mit Enddatum', () => {
    const o = occurrences(r({ repeat: { kind: 'weekly', interval: 1, until: '2026-11-20' } }), '2026-11-01', '2026-12-31');
    expect(o.map((x) => x.date)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15']);
  });
  it('erledigte Vorkommen', () => {
    const rem = r({ repeat: { kind: 'daily', interval: 1 }, completedDates: ['2026-11-02'] });
    const o = occurrences(rem, '2026-11-01', '2026-11-03');
    expect(o.map((x) => x.done)).toEqual([false, true, false]);
    expect(upcoming([rem], '2026-11-02', 1).map((x) => x.date)).toEqual(['2026-11-03']);
    expect(overdue([rem], '2026-11-03').map((x) => x.date)).toEqual(['2026-11-01']);
  });
  it('ICS-Export mit RRULE, Escaping und Zeilenfaltung', () => {
    const ics = remindersToIcs(
      [r({ title: 'Düngen; Blüte, Teil 2', notes: 'x'.repeat(120), repeat: { kind: 'weekly', interval: 2, until: '2026-12-31' }, time: '09:30' })],
      new Date('2026-11-23T10:00:00Z'),
    );
    expect(ics).toContain('BEGIN:VCALENDAR');
    // Regression: Semikolon muss als \; maskiert werden (vorher fälschlich unmaskiert)
    expect(ics).toContain('SUMMARY:Düngen\\; Blüte\\, Teil 2');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231');
    expect(ics).toContain('DTSTART:20261101T093000');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
