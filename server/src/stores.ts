/** Feste Allowlist der synchronisierten Datensatz-Bereiche (entspricht der DB-CHECK-Bedingung). */
export const SYNC_STORES = ['grows', 'plants', 'activities', 'photos', 'reminders', 'strains', 'journal', 'inventory', 'expenses', 'calculations', 'labReports', 'settings'] as const;
export type SyncStore = (typeof SYNC_STORES)[number];
export const isSyncStore = (s: unknown): s is SyncStore => typeof s === 'string' && (SYNC_STORES as readonly string[]).includes(s);
export const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
/** Maximale Größe eines einzelnen Datensatzes (JSON, unverschlüsselt) */
export const MAX_RECORD_BYTES = 256 * 1024;
