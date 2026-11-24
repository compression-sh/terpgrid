import { describe, expect, it } from 'vitest';
import { merge3 } from '../sync/merge';

const base = { id: 'g', name: 'Zelt', notes: 'a', phaseDates: { veg: '2026-01-01' }, tags: ['x'], updatedAt: '2026-11-01T10:00' };

describe('Drei-Wege-Merge', () => {
  it('führt Änderungen an verschiedenen Feldern zusammen', () => {
    const local = { ...base, name: 'Zelt 80', updatedAt: '2026-11-02T10:00' };
    const server = { ...base, notes: 'b', updatedAt: '2026-11-03T10:00' };
    expect(merge3(base, local, server)).toEqual({ ok: true, conflicts: [], merged: { ...base, name: 'Zelt 80', notes: 'b', updatedAt: '2026-11-03T10:00' } });
  });

  it('erkennt echte Konflikte am selben Feld und verwirft nichts still', () => {
    const r = merge3(base, { ...base, notes: 'lokal' }, { ...base, notes: 'server' });
    expect(r.ok).toBe(false);
    expect(r.conflicts).toEqual(['notes']);
  });

  it('führt verschachtelte Objekte feldweise zusammen, Arrays als Ganzes', () => {
    const local = { ...base, phaseDates: { veg: '2026-01-01', bloom: '2026-03-01' } };
    const server = { ...base, phaseDates: { veg: '2026-01-02' } };
    expect(merge3(base, local, server).merged?.phaseDates).toEqual({ veg: '2026-01-02', bloom: '2026-03-01' });
    const arr = merge3(base, { ...base, tags: ['x', 'y'] }, { ...base, tags: ['z'] });
    expect(arr).toMatchObject({ ok: false, conflicts: ['tags'] });
  });

  it('gleiche Änderung auf beiden Seiten ist kein Konflikt; Löschung eines Feldes wird übernommen', () => {
    expect(merge3(base, { ...base, notes: 'z' }, { ...base, notes: 'z' }).ok).toBe(true);
    const { notes: _n, ...withoutNotes } = base;
    const r = merge3(base, withoutNotes, { ...base, name: 'Neu' });
    expect(r.ok).toBe(true);
    expect(r.merged).not.toHaveProperty('notes');
    expect(r.merged?.name).toBe('Neu');
  });

  it('THC-Lab-Entwürfe: verschiedene Rechner zusammenführen, beim selben Rechner gewinnt der neuere', () => {
    const b = { key: 'labDrafts', value: { edibles: { v: { thc: 10 }, at: 1 }, smoking: { v: { g: 0.5 }, at: 1 } } };
    const l = { key: 'labDrafts', value: { edibles: { v: { thc: 20 }, at: 5 }, smoking: b.value.smoking } };
    const s = { key: 'labDrafts', value: { edibles: b.value.edibles, smoking: { v: { g: 0.3 }, at: 6 } } };
    expect(merge3(b, l, s).merged).toEqual({ key: 'labDrafts', value: { edibles: { v: { thc: 20 }, at: 5 }, smoking: { v: { g: 0.3 }, at: 6 } } });
    const l2 = { key: 'labDrafts', value: { ...b.value, edibles: { v: { thc: 30 }, at: 9 } } };
    const s2 = { key: 'labDrafts', value: { ...b.value, edibles: { v: { thc: 40 }, at: 7 } } };
    expect(merge3(b, l2, s2).merged?.value).toMatchObject({ edibles: { v: { thc: 30 }, at: 9 } });
  });

  it('ohne bekannte Basis wird nicht automatisch zusammengeführt', () => {
    expect(merge3(undefined, { a: 1 }, { a: 2 })).toMatchObject({ ok: false });
  });
});
