import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fmtDate, monthGrid, relativeDay, startOfWeek, weekdayMon } from '../dates';
import { currentPhase, growDay, phaseAt, phaseOrderIssues, phaseSpans, totalDuration } from '../grow/phases';
import { customSeries, metricSeries, seriesStats } from '../grow/series';
import type { Activity } from '../db/types';

describe('Datumsrechnung', () => {
  it('zählt Tage unabhängig von Sommerzeit', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
  it('Wochen beginnen am Montag', () => {
    expect(weekdayMon('2026-11-23')).toBe(0); // Montag
    expect(startOfWeek('2026-11-29')).toBe('2026-11-23');
  });
  it('Monatsraster hat 42 Tage und beginnt montags', () => {
    const g = monthGrid('2026-11-15');
    expect(g).toHaveLength(42);
    expect(weekdayMon(g[0]!)).toBe(0);
    expect(g).toContain('2026-11-01');
    expect(g).toContain('2026-11-30');
  });
  it('Formatierung', () => {
    expect(fmtDate('2026-03-05')).toBe('05.03.2026');
    expect(relativeDay('2026-11-22', '2026-11-23')).toBe('gestern');
    expect(relativeDay('2026-11-26', '2026-11-23')).toBe('in 3 Tagen');
  });
});

describe('Grow-Phasen', () => {
  const dates = { germination: '2026-01-01', seedling: '2026-01-05', vegetative: '2026-01-20', flowering: '2026-03-01' };

  it('aktuelle Phase = letzter erreichter Meilenstein', () => {
    expect(currentPhase(dates, '2026-02-10')).toBe('vegetative');
    expect(currentPhase(dates, '2026-03-01')).toBe('flowering');
    expect(currentPhase(dates, '2025-12-31')).toBeUndefined();
  });

  it('Dauern aus erfassten Daten, letzte Phase laufend', () => {
    const spans = phaseSpans(dates, '2026-03-11');
    expect(spans.map((s) => [s.phase, s.days, s.ongoing])).toEqual([
      ['germination', 4, false],
      ['seedling', 15, false],
      ['vegetative', 40, false],
      ['flowering', 10, true],
    ]);
  });

  it('zukünftige Meilensteine werden nicht als Dauer gezählt', () => {
    expect(phaseSpans(dates, '2026-02-01').map((s) => s.phase)).toEqual(['germination', 'seedling', 'vegetative']);
  });

  it('mit Abschlussdatum endet die letzte Phase dort', () => {
    const spans = phaseSpans({ vegetative: '2026-01-01', flowering: '2026-02-01' }, '2026-12-01', '2026-04-01');
    expect(spans.at(-1)).toMatchObject({ phase: 'flowering', days: 59, ongoing: false });
  });

  it('"Abgeschlossen" erzeugt keine eigene Dauer', () => {
    const spans = phaseSpans({ curing: '2026-05-01', completed: '2026-05-20' }, '2026-06-01');
    expect(spans).toEqual([{ phase: 'curing', start: '2026-05-01', end: '2026-05-20', days: 19, ongoing: false }]);
  });

  it('erkennt unlogische Reihenfolge', () => {
    expect(phaseOrderIssues({ vegetative: '2026-02-01', flowering: '2026-01-01' })).toHaveLength(1);
    expect(phaseOrderIssues(dates)).toEqual([]);
  });

  it('Tageszähler: Starttag = Tag 1, Ende beim Abschluss', () => {
    expect(growDay('2026-01-01', '2026-01-01')).toBe(1);
    expect(growDay('2026-01-01', '2026-01-10')).toBe(10);
    expect(growDay('2026-01-01', '2026-12-31', '2026-04-10')).toBe(100);
    expect(growDay('2026-02-01', '2026-01-01')).toBeUndefined();
    expect(totalDuration('2026-01-01', '2026-04-10')).toBe(99);
    expect(totalDuration('2026-01-01')).toBeUndefined();
  });

  it('Phase zu einem Fotodatum', () => {
    expect(phaseAt(dates, '2026-01-07T12:00')).toBe('seedling');
  });
});

describe('Messreihen', () => {
  const base = { growId: 'g', type: 'measurement' as const, title: '', notes: '', createdAt: '', updatedAt: '' };
  const acts: Activity[] = [
    { ...base, id: 'a2', date: '2026-01-10T10:00', measurements: { heightCm: 12, temperatureC: 24 } },
    { ...base, id: 'a1', date: '2026-01-01T10:00', measurements: { heightCm: 5 }, plantId: 'p1' },
    { ...base, id: 'a3', date: '2026-01-20T10:00', measurements: { temperatureC: 25, custom: [{ label: 'VPD', value: 1.1, unit: 'kPa' }] } },
    { ...base, id: 'a4', date: '2026-01-21T10:00', type: 'watering', volumeMl: 500 },
  ];
  it('nur tatsächlich erfasste Werte, sortiert, ohne Interpolation', () => {
    const s = metricSeries(acts, 'heightCm');
    expect(s.map((p) => p.value)).toEqual([5, 12]);
    expect(metricSeries(acts, 'heightCm', { plantId: 'p1' })).toHaveLength(1);
    expect(metricSeries(acts, 'ph')).toEqual([]);
  });
  it('Statistik inkl. größter Lücke', () => {
    const st = seriesStats(metricSeries(acts, 'temperatureC'));
    expect(st).toMatchObject({ count: 2, min: 24, max: 25, maxGapDays: 10 });
    expect(seriesStats([])).toEqual({ count: 0 });
  });
  it('eigene Messgrößen', () => {
    expect(customSeries(acts, 'VPD', 'kPa').map((p) => p.value)).toEqual([1.1]);
  });
});
