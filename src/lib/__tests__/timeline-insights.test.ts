import { describe, expect, it } from 'vitest';
import { computeInsights } from '../insights';
import { buildTimeline, groupByDay } from '../timeline';

const base = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const grow = (id: string, extra: object = {}) => ({ ...base, id, name: `Grow ${id}`, description: '', startDate: '2026-09-01', setting: 'indoor', notes: '', status: 'active', phaseDates: {}, ...extra }) as any;
const data = () => ({
  grows: [grow('g1', { phaseDates: { vegetative: '2026-09-10', flowering: '2026-10-15' } }), grow('g2', { status: 'completed', startDate: '2026-03-01', completedDate: '2026-06-09' })],
  plants: [{ ...base, id: 'p1', growId: 'g1', name: 'Nord', startDate: '2026-09-02', type: 'photoperiod', phaseDates: {}, notes: '' }] as any,
  activities: [
    { ...base, id: 'a1', growId: 'g1', plantId: 'p1', type: 'watering', date: '2026-11-20T09:00', title: '', notes: '' },
    { ...base, id: 'a2', growId: 'g1', type: 'measurement', date: '2026-11-21T09:00', title: 'Messung', notes: '', measurements: { ph: 6.2, ec: 1.4 } },
  ] as any,
  photos: [
    { ...base, id: 'f1', growId: 'g1', takenAt: '2026-11-01T10:00', note: '', width: 1, height: 1, size: 1, mime: 'image/jpeg' },
    { ...base, id: 'f2', growId: 'g1', takenAt: '2026-11-10T10:00', note: 'Blüte', width: 1, height: 1, size: 1, mime: 'image/jpeg' },
    { ...base, id: 'f3', growId: 'g1', takenAt: '2026-11-22T10:00', note: '', width: 1, height: 1, size: 1, mime: 'image/jpeg' },
  ] as any,
  journal: [{ ...base, id: 'j1', date: '2026-11-15T20:00', strainId: 's1', method: 'vape', notes: 'ruhig', moods: [], durationNote: '', rating: 4 }] as any,
  strains: [{ ...base, id: 's1', name: 'Blue Dream', favorite: true, external: { provider: 'strainapi', id: 'blue-dream' }, terpenes: [], aromas: [], flavorNotes: '', observations: '' }] as any,
  labReports: [{ ...base, id: 'l1', title: 'Charge 7', strainId: 's1', unit: 'percent', origin: 'lab', terpenes: [], notes: '', testDate: '2026-11-05' }] as any,
  reminders: [
    { ...base, id: 'r1', title: 'Düngen', date: '2026-11-18', category: 'feeding', repeat: { kind: 'none' }, completedDates: [], notes: '' },
    { ...base, id: 'r2', title: 'Zukunft', date: '2026-12-30', category: 'check', repeat: { kind: 'none' }, completedDates: [], notes: '' },
    { ...base, id: 'r3', title: 'Gießen', date: '2026-11-01', category: 'watering', repeat: { kind: 'daily', interval: 1 }, completedDates: ['2026-11-19'], notes: '' },
  ] as any,
  expenses: [{ ...base, id: 'e1', date: '2026-10-01', category: 'equipment', amount: 49.9, description: '' }] as any,
});

describe('Aktivitäts-Zeitachse', () => {
  it('leitet Ereignisse aus allen Bereichen ab, neueste zuerst, ohne Daten zu kopieren', () => {
    const d = data();
    const t = buildTimeline(d, { today: '2026-11-24' });
    expect(t[0]).toMatchObject({ kind: 'photo', id: 'ph-f3' });
    const kinds = new Set(t.map((e) => e.kind));
    for (const k of ['milestone', 'activity', 'measurement', 'photo', 'journal', 'strain', 'lab', 'reminder']) expect(kinds.has(k as never)).toBe(true);
    expect(t.find((e) => e.id === 'a-a2')?.kind).toBe('measurement');
    expect(t.find((e) => e.id === 'ph-f3')?.to).toBe('grows/g1?tab=photos');
    // Zukünftige Termine nicht, Wiederholungen nicht vervielfältigt – nur Erledigtes
    expect(t.some((e) => e.title === 'Zukunft')).toBe(false);
    expect(t.filter((e) => e.id.startsWith('r-r3')).map((e) => e.at)).toEqual(['2026-11-19']);
    for (let i = 1; i < t.length; i++) expect(t[i - 1]!.at >= t[i]!.at).toBe(true);
    expect(d.photos).toHaveLength(3); // Quelle unverändert
  });

  it('nimmt Einträge der Sammlung mit Deep Link auf (6.0.1) und bleibt ohne Sammlung kompatibel', () => {
    const d = { ...data(), inventory: [{ ...base, id: 'i 1', name: 'Grinder', category: 'accessory', unit: 'Stk', notes: '', purchaseDate: '2026-11-12' }] as any };
    const e = buildTimeline(d, { today: '2026-11-24' }).find((x) => x.kind === 'collection');
    expect(e).toMatchObject({ id: 'i-i 1', at: '2026-11-12', title: 'Sammlung: Grinder', subtitle: 'Zubehör', to: 'collection?item=i%201' });
    expect(buildTimeline(data(), { today: '2026-11-24' }).some((x) => x.kind === 'collection')).toBe(false);
  });

  it('gruppiert nach Tag', () => {
    const g = groupByDay(buildTimeline(data(), { today: '2026-11-24' }));
    expect(g[0]!.day).toBe('2026-11-22');
    expect(new Set(g.map((x) => x.day)).size).toBe(g.length);
  });
});

describe('Insights', () => {
  it('berechnet Kennzahlen nur aus eigenen Daten und nennt die Grundlage', () => {
    const i = computeInsights(data(), '2026-11-24');
    expect(i.activeGrows).toBe(1);
    expect(i.avgGrowDays).toEqual({ value: 100, n: 1 });
    expect(i.activePlants).toBe(1);
    expect(i.oldestPlantDays.value).toBe(83);
    expect(i.photos30d).toBe(3);
    // 3 Fotos zwischen 01.11. und 24.11. → 4 angefangene Wochen → 0,8 pro Woche
    expect(i.photosPerWeek12w.value).toBe(0.8);
    expect(i.measurements).toBe(1);
    expect(i.measurementKinds).toEqual(['ec', 'ph']);
    expect(i.strains).toMatchObject({ total: 1, favorites: 1, fromDiscover: 1, withLab: 1 });
    expect(i.expenses12m).toEqual({ value: 49.9, n: 1 });
  });

  it('erklärt fehlende Daten statt Werte zu erfinden', () => {
    const empty = { grows: [], plants: [], activities: [], photos: [], strains: [], journal: [], labReports: [], expenses: [] };
    const i = computeInsights(empty, '2026-11-24');
    expect(i.avgGrowDays.value).toBeNull();
    expect(i.avgGrowDays.missing).toMatch(/abgeschlossener Grow/);
    expect(i.photosPerWeek12w.missing).toBeTruthy();
    expect(i.journal.avgRating.missing).toMatch(/3 bewertete/);
    const i2 = computeInsights(data(), '2026-11-24');
    expect(i2.journal.avgRating.value).toBeNull(); // nur 1 Bewertung → kein Durchschnitt
  });
});
