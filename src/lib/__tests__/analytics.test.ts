import { describe, expect, it } from 'vitest';
import {
  GRAMS_PER_OUNCE,
  celsiusToFahrenheit,
  electricityCost,
  expenseTotal,
  expensesByCategory,
  expensesByGrow,
  fahrenheitToCelsius,
  growDurations,
  harvestOutcomes,
  photoActivity,
  strainRatings,
} from '../analytics';
import type { Expense, GrowProject, JournalEntry, Photo, Plant, Strain } from '../db/types';

const t = '2026-01-01T00:00:00.000Z';
const grow = (id: string, start: string, end?: string): GrowProject => ({ id, name: id, description: '', startDate: start, completedDate: end, setting: 'indoor', notes: '', status: end ? 'completed' : 'active', phaseDates: { vegetative: start }, createdAt: t, updatedAt: t });

describe('Analysen', () => {
  it('Grow-Dauern: abgeschlossen vs. laufend, zukünftige ausgeschlossen', () => {
    const rows = growDurations([grow('a', '2026-01-01', '2026-04-01'), grow('b', '2026-03-01'), grow('c', '2027-01-01')], '2026-03-11');
    expect(rows.map((r) => [r.id, r.days, r.completed])).toEqual([
      ['a', 90, true],
      ['b', 10, false],
    ]);
  });

  it('Ausgaben je Kategorie und Grow', () => {
    const e = (amount: number, category: Expense['category'], growId?: string): Expense => ({ id: String(Math.random()), amount, category, growId, date: '2026-01-01', description: '', createdAt: t, updatedAt: t });
    const list = [e(10.1, 'seeds', 'a'), e(5.2, 'seeds'), e(100, 'equipment', 'a')];
    expect(expensesByCategory(list)).toEqual([
      { category: 'equipment', total: 100, count: 1 },
      { category: 'seeds', total: 15.3, count: 2 },
    ]);
    expect(expensesByGrow(list, [grow('a', '2026-01-01')])).toEqual([
      { id: 'a', name: 'a', total: 110.1 },
      { id: '', name: 'Ohne Grow', total: 5.2 },
    ]);
  });

  it('Ernte nur mit erfasstem Ergebnis', () => {
    const p = (id: string, outcome?: Plant['outcome']): Plant => ({ id, growId: 'a', name: id, startDate: '2026-01-01', type: 'unknown', phaseDates: {}, notes: '', outcome, createdAt: t, updatedAt: t });
    const rows = harvestOutcomes([p('x'), p('y', { dryWeightG: 40 }), p('z', { notes: 'nur Notiz' })], []);
    expect(rows.map((r) => r.plantId)).toEqual(['y']);
  });

  it('Sorten-Bewertungen aus eigener Bewertung und Journal', () => {
    const s: Strain = { id: 's', name: 'S', terpenes: [], aromas: [], flavorNotes: '', observations: '', favorite: false, rating: 4, createdAt: t, updatedAt: t };
    const u: Strain = { ...s, id: 'u', name: 'U', rating: undefined };
    const j = (rating?: number): JournalEntry => ({ id: String(Math.random()), date: '2026-01-01T20:00', method: 'joint', strainId: 's', notes: '', moods: [], durationNote: '', rating, createdAt: t, updatedAt: t });
    const rows = strainRatings([s, u], [j(3), j(5), j()]);
    expect(rows).toEqual([{ id: 's', name: 'S', rating: 4, journalAvg: 4, journalCount: 2 }]);
  });

  it('Foto-Heatmap über ganze Wochen', () => {
    const ph = (d: string): Photo => ({ id: d + Math.random(), takenAt: `${d}T10:00`, note: '', width: 1, height: 1, size: 1, mime: 'image/jpeg', createdAt: t, updatedAt: t });
    const h = photoActivity([ph('2026-11-23'), ph('2026-11-23'), ph('2020-01-01')], '2026-11-25', 4);
    expect(h.days).toHaveLength(28);
    expect(h.max).toBe(2);
    expect(h.days.find((d) => d.date === '2026-11-23')?.count).toBe(2);
  });
});

describe('Zusatzrechner', () => {
  it('Stromkosten: 240 W × 18 h × 30 Tage × 0,35 €/kWh', () => {
    const r = electricityCost(240, 18, 30, 0.35);
    expect(r.kwh).toBeCloseTo(129.6, 10);
    expect(r.cost).toBeCloseTo(45.36, 10);
    expect(electricityCost(100, 30, 1, 1).kwh).toBeCloseTo(2.4, 10); // max. 24 h
  });
  it('Kostensumme und Kosten je Gramm', () => {
    expect(expenseTotal([{ label: 'Erde', amount: 10, quantity: 2 }, { label: 'Samen', amount: 30, quantity: 1 }], 100)).toEqual({ total: 50, perGram: 0.5 });
    expect(expenseTotal([], 0).perGram).toBeUndefined();
  });
  it('Einheiten', () => {
    expect(celsiusToFahrenheit(25)).toBe(77);
    expect(fahrenheitToCelsius(77)).toBeCloseTo(25, 10);
    expect(GRAMS_PER_OUNCE).toBeCloseTo(28.35, 2);
  });
});
