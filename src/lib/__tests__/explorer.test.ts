import { describe, expect, it } from 'vitest';
import type { Activity, Expense, GrowProject, JournalEntry, LabReport, Photo, Plant, Strain } from '../db/types';
import { expenseCsv, labComparison, labCsv, measurementCsv, rangeStart, scopeData } from '../explorer';

const b = { createdAt: '', updatedAt: '' };
const grows = [{ ...b, id: 'g1', name: 'A' }, { ...b, id: 'g2', name: 'B' }] as GrowProject[];
const plants = [{ ...b, id: 'p1', growId: 'g1', name: 'P1', strainId: 's1' }, { ...b, id: 'p2', growId: 'g2', name: 'P2', strainId: 's2' }] as Plant[];
const strains = [{ ...b, id: 's1', name: 'Evercrisp' }, { ...b, id: 's2', name: 'NL' }] as Strain[];
const activities = [
  { ...b, id: 'a1', growId: 'g1', plantId: 'p1', type: 'measurement', date: '2026-11-20T10:00', measurements: { heightCm: 40, ph: 6.1, phContext: 'water' } },
  { ...b, id: 'a2', growId: 'g2', type: 'environment', date: '2026-06-01T10:00', measurements: { temperatureC: 24.5 } },
  { ...b, id: 'a3', growId: 'g1', type: 'observation', date: '2026-11-21T10:00', title: 'ohne Messung' },
] as Activity[];
const expenses = [{ ...b, id: 'e1', growId: 'g1', date: '2026-11-01', category: 'nutrients', amount: 32.5, description: 'Dünger; "A+B"' }, { ...b, id: 'e2', growId: 'g2', date: '2026-05-01', category: 'seeds', amount: 18, description: 'Samen' }] as Expense[];
const journal = [{ ...b, id: 'j1', date: '2026-11-10T20:00', strainId: 's1', method: 'vaporizer', moods: [], notes: '', durationNote: '' }, { ...b, id: 'j2', date: '2026-11-11T20:00', strainName: 'frei', method: 'joint', moods: [], notes: '', durationNote: '' }] as JournalEntry[];
const photos = [{ ...b, id: 'f1', growId: 'g1', takenAt: '2026-11-01T12:00' }] as Photo[];
const labReports = [
  { ...b, id: 'l1', title: 'Probe 1', strainId: 's1', unit: 'mg/g', origin: 'manual', testDate: '2026-11-10', thc: 182, terpenes: [{ name: 'beta-Myrcene', value: 5.1 }, { name: 'Linalool', value: 1.2 }], notes: '' },
  { ...b, id: 'l2', title: 'Probe 2', strainId: 's2', unit: '%', origin: 'manual', testDate: '2026-06-02', thc: 15.8, terpenes: [{ name: 'myrcene', value: 0.62 }], notes: '' },
] as LabReport[];
const data = { activities, expenses, journal, photos, plants, grows, labReports };

describe('Personal Data Explorer', () => {
  it('Zeitraum: Startdatum inklusive heute', () => {
    expect(rangeStart('all', '2026-11-24')).toBeUndefined();
    expect(rangeStart('30', '2026-11-24')).toBe('2026-10-26');
  });
  it('filtert nach Zeitraum und Grow; Journal/Labor nur über Sortenbezug', () => {
    const all = scopeData(data, { range: 'all', growId: '' }, '2026-11-24');
    expect(all.activities).toHaveLength(3);
    const recent = scopeData(data, { range: '30', growId: '' }, '2026-11-24');
    expect(recent.activities.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(recent.expenses.map((e) => e.id)).toEqual(['e1']);
    const g1 = scopeData(data, { range: 'all', growId: 'g1' }, '2026-11-24');
    expect(g1.journal.map((j) => j.id)).toEqual(['j1']);
    expect(g1.labReports.map((l) => l.id)).toEqual(['l1']);
    expect(g1.plants.map((p) => p.id)).toEqual(['p1']);
  });
  it('Laborvergleich: rechnet nur Einheiten um, führt Schreibweisen zusammen, ergänzt nichts', () => {
    const c = labComparison(labReports, strains);
    expect(c.rows[0]!.thc).toBeCloseTo(18.2);
    expect(c.rows[0]!.cbd).toBeUndefined();
    expect(c.rows[0]!.terpenes.myrcene).toBeCloseTo(0.51);
    expect(c.rows[1]!.terpenes.myrcene).toBeCloseTo(0.62);
    expect(c.terpenes[0]).toMatchObject({ id: 'myrcene', count: 2 });
    expect(c.rows[1]!.terpenes.linalool).toBeUndefined();
    expect(labCsv(c)).toContain('Probe 1;Evercrisp');
  });
  it('CSV: Semikolon, Dezimalkomma, Escaping, nur Einträge mit Messwerten', () => {
    const m = measurementCsv(activities, grows, plants);
    const lines = m.replace('﻿', '').split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('B;ganzer Grow');
    expect(lines[2]).toMatch(/^2026-11-20 10:00;A;P1;40;/);
    expect(lines[2]).toContain('6,1');
    expect(expenseCsv(expenses, grows, { nutrients: 'Dünger', seeds: 'Samen' })).toContain('"Dünger; ""A+B"""');
  });
});

describe('Sammlung: Mengenverlauf', () => {
  it('protokolliert nur echte Änderungen und begrenzt auf 50', async () => {
    const { withQuantityChange } = await import('../inventory');
    expect(withQuantityChange(undefined, 2, 2, 't')).toBeUndefined();
    expect(withQuantityChange(undefined, undefined, 3, 't')).toBeUndefined();
    expect(withQuantityChange(undefined, 2, 1, 't1')).toEqual([{ at: 't1', from: 2, to: 1 }]);
    let log: ReturnType<typeof withQuantityChange> = undefined;
    for (let i = 0; i < 60; i++) log = withQuantityChange(log, i, i + 1, `t${i}`);
    expect(log).toHaveLength(50);
    expect(log![0]!.at).toBe('t10');
  });
});
