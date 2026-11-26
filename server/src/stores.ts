/** Feste Allowlist der synchronisierten Datensatz-Bereiche (entspricht der DB-CHECK-Bedingung). */
export const SYNC_STORES = ['grows', 'plants', 'activities', 'photos', 'reminders', 'strains', 'journal', 'inventory', 'expenses', 'calculations', 'labReports', 'settings'] as const;
export type SyncStore = (typeof SYNC_STORES)[number];
export const isSyncStore = (s: unknown): s is SyncStore => typeof s === 'string' && (SYNC_STORES as readonly string[]).includes(s);
export const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
/** Maximale Größe eines einzelnen Datensatzes (JSON, unverschlüsselt) */
export const MAX_RECORD_BYTES = 256 * 1024;

/**
 * Bereiche in gemeinsamen Bereichen (Phase 5.5). „notes“ (Projektnotizen) und „tasks“
 * (Aufgaben) gibt es nur in gemeinsamen Bereichen; Einstellungen, Ausgaben und
 * Berechnungen werden nie geteilt.
 */
export const SPACE_STORES = ['grows', 'plants', 'activities', 'photos', 'strains', 'journal', 'inventory', 'labReports', 'notes', 'tasks'] as const;
export type SpaceStore = (typeof SPACE_STORES)[number];
export const isSpaceStore = (s: unknown): s is SpaceStore => typeof s === 'string' && (SPACE_STORES as readonly string[]).includes(s);

/**
 * Elternbezug je Bereich (Feld im Inhalt → Eltern-Bereich), in Prioritätsreihenfolge.
 * Kinder erben die Zugriffsstufe ihrer Wurzel; der Elternbezug wird serverseitig aus dem
 * Inhalt abgeleitet und geprüft, nie vom Client übernommen.
 */
export const SPACE_PARENTS: Record<SpaceStore, readonly (readonly [field: string, store: SpaceStore])[]> = {
  grows: [],
  plants: [['growId', 'grows']],
  activities: [
    ['plantId', 'plants'],
    ['growId', 'grows'],
  ],
  photos: [
    ['growId', 'grows'],
    ['plantId', 'plants'],
    ['journalId', 'journal'],
    ['strainId', 'strains'],
    ['inventoryId', 'inventory'],
  ],
  strains: [],
  journal: [],
  inventory: [],
  labReports: [],
  notes: [['growId', 'grows']],
  tasks: [['growId', 'grows']],
};
/** Bereiche, deren Elternbezug Pflicht ist */
export const SPACE_PARENT_REQUIRED: readonly SpaceStore[] = ['activities'];
