/**
 * Anwendungs-Datenmigrationen (zusätzlich zu den IndexedDB-Schema-Migrationen).
 * Jede Migration läuft genau einmal; erledigte IDs werden in `settings` gespeichert.
 */
import { type KeyValueStore, STORAGE_KEY as LEGACY_SAVED_KEY, loadSaved } from '../storage';
import { getOne, isSyncTracking, notify, putOne, writeBatch } from './database';
import type { CalculationRecord } from './types';

export interface DataMigration {
  id: string;
  description: string;
  run: (ctx: { legacyStore: KeyValueStore | null }) => Promise<number>;
}

export const DATA_MIGRATIONS: DataMigration[] = [
  {
    id: '2026-11-legacy-saved-calculations',
    description: 'Gespeicherte Berechnungen aus dem THC-Rechner (localStorage) übernehmen',
    async run({ legacyStore }) {
      const legacy = loadSaved(legacyStore);
      if (legacy.length === 0) return 0;
      const records: CalculationRecord[] = legacy.map((l) => ({
        id: l.id,
        kind: l.kind,
        name: l.name,
        input: l.input,
        summary: l.summary,
        createdAt: l.createdAt,
        updatedAt: l.createdAt,
      }));
      // put() ist idempotent (gleiche IDs) – der alte Schlüssel bleibt als Sicherung erhalten.
      await writeBatch({ put: { calculations: records } });
      return records.length;
    },
  },
];

function defaultLegacyStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function runDataMigrations(legacyStore: KeyValueStore | null = defaultLegacyStore()): Promise<string[]> {
  // Servermodus: Gerätegebundene Altdaten (localStorage) nie still in ein Konto übernehmen –
  // die Übernahme erfolgt ausschließlich über den bestätigten Import-Assistenten.
  if (isSyncTracking()) return [];
  const row = await getOne('settings', 'migrations');
  const done = new Set(Array.isArray(row?.value) ? (row.value as string[]) : []);
  const ran: string[] = [];
  for (const m of DATA_MIGRATIONS) {
    if (done.has(m.id)) continue;
    await m.run({ legacyStore });
    done.add(m.id);
    ran.push(m.id);
  }
  if (ran.length) {
    await putOne('settings', { key: 'migrations', value: [...done] });
    notify('calculations');
  }
  return ran;
}

export { LEGACY_SAVED_KEY };
