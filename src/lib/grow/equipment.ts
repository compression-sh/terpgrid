import type { InventoryItem, Plant } from '../db/types';

/**
 * Geschätzter Stromverbrauch eines Grow-Bereichs – nur aus eigenen Angaben:
 * kWh/Tag = Σ (Leistung W × Betriebsstunden/Tag) / 1000. Keine Messung, keine Live-Werte.
 */
export function spaceEnergy(spaceId: string, inventory: InventoryItem[]): { kWhPerDay: number; devices: number; missing: number } {
  const devices = inventory.filter((i) => i.spaceId === spaceId && i.category === 'equipment' && !i.archived);
  let wh = 0;
  let missing = 0;
  for (const d of devices) {
    if (d.powerW === undefined || d.hoursPerDay === undefined) {
      missing++;
      continue;
    }
    wh += d.powerW * d.hoursPerDay;
  }
  return { kWhPerDay: Math.round((wh / 1000) * 100) / 100, devices: devices.length, missing };
}

export function spacePlants(spaceId: string, plants: Plant[]): Plant[] {
  return plants.filter((p) => p.spaceId === spaceId);
}

/** Garantie läuft in ≤ 30 Tagen ab bzw. ist abgelaufen. */
export function warrantyState(until: string | undefined, today: string): 'expired' | 'soon' | 'ok' | undefined {
  if (!until) return undefined;
  if (until < today) return 'expired';
  const d = (Date.parse(until) - Date.parse(today)) / 86_400_000;
  return d <= 30 ? 'soon' : 'ok';
}

export const parseTags = (s: string): string[] =>
  [...new Set(s.split(/[,;]/).map((t) => t.trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 12);
