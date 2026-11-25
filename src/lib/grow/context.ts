import type { InventoryItem, Plant, Strain } from '../db/types';
import { spaceEnergy } from './equipment';

export interface GrowStrainRow {
  /** Eigene Sorte (falls verknüpft) */
  strainId?: string;
  name: string;
  breeder?: string;
  /** Katalog-ID, wenn die eigene Sorte mit dem lokalen Sortenkatalog verknüpft ist */
  catalogId?: string;
  plants: number;
}

export interface GrowSpaceRow {
  space: InventoryItem;
  plants: number;
  equipment: InventoryItem[];
  kWhPerDay: number;
  /** Geräte ohne Leistung oder Betriebsstunden – fließen nicht in die Schätzung ein */
  missing: number;
}

/**
 * Sorten und Grow-Bereiche eines Grows – ausschließlich aus eigenen Verknüpfungen
 * (Pflanze → Sorte, Pflanze → Bereich, Gerät → Bereich). Nichts wird erraten.
 */
export function growContext(plants: Plant[], strains: Strain[], inventory: InventoryItem[]): { strains: GrowStrainRow[]; spaces: GrowSpaceRow[] } {
  const byId = new Map(strains.map((s) => [s.id, s]));
  const rows = new Map<string, GrowStrainRow>();
  for (const p of plants) {
    const s = p.strainId ? byId.get(p.strainId) : undefined;
    const name = s?.name ?? p.strainName?.trim();
    if (!name) continue;
    const key = s ? `id:${s.id}` : `name:${name.toLowerCase()}`;
    const cur = rows.get(key);
    if (cur) cur.plants++;
    else
      rows.set(key, {
        strainId: s?.id,
        name,
        breeder: s?.breeder?.trim() || undefined,
        catalogId: s?.external?.provider === 'cisp' ? s.external.id : undefined,
        plants: 1,
      });
  }
  const spaceIds = [...new Set(plants.map((p) => p.spaceId).filter((x): x is string => !!x))];
  const spaces: GrowSpaceRow[] = [];
  for (const id of spaceIds) {
    const space = inventory.find((i) => i.id === id && i.category === 'space');
    if (!space) continue;
    const e = spaceEnergy(id, inventory);
    spaces.push({
      space,
      plants: plants.filter((p) => p.spaceId === id).length,
      equipment: inventory.filter((i) => i.spaceId === id && i.category === 'equipment' && !i.archived),
      kWhPerDay: e.kWhPerDay,
      missing: e.missing,
    });
  }
  return {
    strains: [...rows.values()].sort((a, b) => b.plants - a.plants || a.name.localeCompare(b.name, 'de')),
    spaces: spaces.sort((a, b) => a.space.name.localeCompare(b.space.name, 'de')),
  };
}
