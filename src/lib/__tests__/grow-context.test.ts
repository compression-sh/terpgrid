import { describe, expect, it } from 'vitest';
import type { InventoryItem, Plant, Strain } from '../db/types';
import { growContext } from '../grow/context';

const T = '2026-11-01T00:00:00.000Z';
const plant = (id: string, x: Partial<Plant>): Plant => ({ id, createdAt: T, updatedAt: T, growId: 'g1', name: id, startDate: '2026-09-01', type: 'photoperiod', phaseDates: {}, notes: '', ...x }) as Plant;
const strain = (id: string, x: Partial<Strain>): Strain => ({ id, createdAt: T, updatedAt: T, name: id, terpenes: [], aromas: [], flavorNotes: '', observations: '', favorite: false, ...x }) as Strain;
const inv = (id: string, x: Partial<InventoryItem>): InventoryItem => ({ id, createdAt: T, updatedAt: T, name: id, category: 'equipment', unit: 'Stück', notes: '', ...x }) as InventoryItem;

describe('growContext', () => {
  it('fasst Sorten aus Pflanzen-Verknüpfungen zusammen und übernimmt nur echte Katalogverknüpfungen', () => {
    const strains = [
      strain('s1', { name: 'Evercrisp', breeder: 'Sin City Seeds', external: { provider: 'cisp', id: 'sincityseeds--evercrisp', name: 'Evercrisp', linkedAt: T } }),
      strain('s2', { name: 'Lemon Haze', external: { provider: 'strainapi', id: '42', name: 'Lemon Haze', linkedAt: T } }),
    ];
    const r = growContext([plant('p1', { strainId: 's1' }), plant('p2', { strainId: 's1' }), plant('p3', { strainId: 's2' }), plant('p4', { strainName: 'Freund-Steckling' }), plant('p5', {})], strains, []);
    expect(r.strains.map((x) => [x.name, x.plants, x.catalogId ?? null, x.breeder ?? null])).toEqual([
      ['Evercrisp', 2, 'sincityseeds--evercrisp', 'Sin City Seeds'],
      ['Freund-Steckling', 1, null, null],
      ['Lemon Haze', 1, null, null],
    ]);
  });

  it('ordnet Geräte nur über den Bereich der Pflanzen zu und schätzt Strom nur aus vollständigen Angaben', () => {
    const inventory = [
      inv('tent', { category: 'space', name: 'Zelt' }),
      inv('led', { spaceId: 'tent', powerW: 480, hoursPerDay: 12 }),
      inv('fan', { spaceId: 'tent', powerW: 40 }),
      inv('old', { spaceId: 'tent', powerW: 100, hoursPerDay: 24, archived: true }),
      inv('other', { spaceId: 'elsewhere', powerW: 1000, hoursPerDay: 24 }),
    ];
    const r = growContext([plant('p1', { spaceId: 'tent' }), plant('p2', { spaceId: 'tent' }), plant('p3', { spaceId: 'missing' })], [], inventory);
    expect(r.spaces).toHaveLength(1);
    expect(r.spaces[0]!.plants).toBe(2);
    expect(r.spaces[0]!.equipment.map((e) => e.id)).toEqual(['led', 'fan']);
    expect(r.spaces[0]!.kWhPerDay).toBe(5.76);
    expect(r.spaces[0]!.missing).toBe(1);
  });
});
