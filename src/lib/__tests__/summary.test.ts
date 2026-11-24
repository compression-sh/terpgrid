import { describe, expect, it } from 'vitest';
import type { Activity, Expense, GrowProject, Photo, Plant } from '../db/types';
import { contextsUsed, growCompleteness, seriesByGrowDay, summarizeGrow } from '../grow/summary';

const T = '2026-10-01T00:00:00.000Z';
const grow: GrowProject = { id: 'g', name: 'G', description: '', startDate: '2026-10-01', setting: 'indoor', notes: '', status: 'active', phaseDates: { vegetative: '2026-10-05' }, createdAt: T, updatedAt: T };
const plant = (id: string, outcome?: Plant['outcome']): Plant => ({ id, growId: 'g', name: id, startDate: '2026-10-01', type: 'unknown', phaseDates: {}, notes: '', outcome, createdAt: T, updatedAt: T });
const act = (id: string, date: string, m: Activity['measurements']): Activity => ({ id, growId: 'g', type: 'measurement', date, title: '', notes: '', measurements: m, createdAt: T, updatedAt: T });
const photo = (id: string, takenAt: string): Photo => ({ id, growId: 'g', takenAt, note: '', width: 1, height: 1, size: 1, mime: 'image/jpeg', createdAt: T, updatedAt: T });
const exp = (amount: number): Expense => ({ id: String(amount), growId: 'g', date: '2026-10-02', category: 'equipment', amount, description: '', createdAt: T, updatedAt: T });

describe('Grow-Kennzahlen', () => {
  const d = {
    plants: [plant('a', { dryWeightG: 40 }), plant('b')],
    activities: [act('1', '2026-10-03T10:00', { heightCm: 10, ph: 6.2, phContext: 'water' }), act('2', '2026-10-20T10:00', { heightCm: 35, ph: 5.9, phContext: 'runoff' })],
    photos: [photo('p1', '2026-10-02T08:00')],
    expenses: [exp(19.99), exp(5.01)],
  };
  it('nur dokumentierte Werte, fehlende bleiben leer', () => {
    const s = summarizeGrow(grow, d, '2026-10-31');
    expect(s.durationDays).toBe(30);
    expect(s.running).toBe(true);
    expect(s.plants).toBe(2);
    expect(s.plantsWithOutcome).toBe(1);
    expect(s.dryWeightG).toBe(40);
    expect(s.wetWeightG).toBeUndefined();
    expect(s.maxHeightCm).toBe(35);
    expect(s.expenses).toBe(25);
    expect(summarizeGrow(grow, { plants: [], activities: [], photos: [], expenses: [] }).maxHeightCm).toBeUndefined();
  });
  it('Zeitachse in Grow-Tagen und Kontextfilter', () => {
    expect(seriesByGrowDay(grow, d.activities, 'heightCm').map((p) => p.day)).toEqual([2, 19]);
    expect(seriesByGrowDay(grow, d.activities, 'ph', 'runoff').map((p) => p.value)).toEqual([5.9]);
    expect(contextsUsed(d.activities, 'ph').sort()).toEqual(['runoff', 'water']);
  });
  it('Vollständigkeit ohne Punktwerte', () => {
    const c = growCompleteness(grow, d, '2026-10-31');
    expect(c.find((x) => x.id === 'measure')).toMatchObject({ state: 'partial', detail: '2 von 5 Wochen mit Messung' });
    expect(c.find((x) => x.id === 'expenses')!.state).toBe('ok');
    expect(c.find((x) => x.id === 'outcome')).toBeUndefined(); // laufender Grow
    const done = growCompleteness({ ...grow, status: 'completed', completedDate: '2026-10-31' }, d, '2026-11-15');
    expect(done.find((x) => x.id === 'outcome')).toMatchObject({ state: 'partial', detail: '1 von 2' });
  });
});
