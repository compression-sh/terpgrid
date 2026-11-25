import { describe, expect, it } from 'vitest';
import { normalize, searchRecords, type SearchData } from '../search';

const data = {
  grows: [{ id: 'g1', name: 'Balkon Sommer', notes: 'Südseite' }],
  plants: [{ id: 'p1', growId: 'g1', name: 'Pflanze Nord', strainId: 's1', notes: '' }],
  strains: [{ id: 's1', name: 'Blue Dream' }, { id: 's2', name: 'Dreamland Kush' }],
  journal: [{ id: 'j1', date: '2026-11-01T20:00', strainId: 's1', notes: 'Sehr entspannt, süßlich' }],
  inventory: [{ id: 'i1', name: 'Grinder', notes: '' }],
  labReports: [{ id: 'l1', title: 'Analyse Charge 7', labName: 'Labor Süd', notes: '' }],
  reminders: [{ id: 'r1', title: 'Gießen', date: '2026-11-24', notes: '' }],
} as unknown as SearchData;

describe('Lokale Suche (Befehlspalette)', () => {
  it('normalisiert Umlaute und ß', () => {
    expect(normalize('Süßlich ÄRGER')).toBe('susslich arger');
  });
  it('findet über alle Bereiche und gewichtet Titeltreffer', () => {
    const r = searchRecords(data, 'dream');
    expect(r.map((h) => h.id).slice(0, 2).sort()).toEqual(['s1', 's2']);
    expect(searchRecords(data, 'sud').map((h) => h.id)).toEqual(expect.arrayContaining(['g1', 'l1']));
    expect(searchRecords(data, 'susslich')[0]).toMatchObject({ kind: 'journal', to: 'journal?entry=j1' });
    expect(searchRecords(data, 'nord')[0]).toMatchObject({ kind: 'plant', to: 'grows/g1/plants/p1' });
  });
  it('verlangt alle Suchwörter und liefert bei leerer Eingabe nichts', () => {
    expect(searchRecords(data, 'blue kush')).toHaveLength(0);
    expect(searchRecords(data, '   ')).toHaveLength(0);
    expect(searchRecords(data, 'gie')[0]?.kind).toBe('reminder');
  });
  it('behandelt Regex-Sonderzeichen sicher', () => {
    expect(() => searchRecords(data, '(([')).not.toThrow();
  });
});

describe('Suche: Deeplinks', () => {
  it('Journal-, Sammlungs- und Labortreffer öffnen den konkreten Eintrag', () => {
    const T = '2026-11-01T00:00:00.000Z';
    const d = {
      grows: [],
      plants: [],
      strains: [],
      journal: [{ id: 'j 1', createdAt: T, updatedAt: T, date: '2026-11-01T20:00', method: 'joint', notes: 'Abendspaziergang', strainName: '' }],
      inventory: [{ id: 'i1', createdAt: T, updatedAt: T, name: 'Abendlampe', category: 'equipment', unit: 'Stück', notes: '' }],
      labReports: [{ id: 'l1', createdAt: T, updatedAt: T, title: 'Abendprobe', notes: '' }],
      reminders: [],
    } as unknown as SearchData;
    const to = Object.fromEntries(searchRecords(d, 'abend').map((h) => [h.kind, h.to]));
    expect(to).toEqual({ journal: 'journal?entry=j%201', inventory: 'collection?item=i1', labReport: 'lab-reports?report=l1' });
  });
});
