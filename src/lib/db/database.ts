/**
 * Kleine, abhängigkeitsfreie IndexedDB-Schicht.
 *
 * - Versionierte Schema-Migrationen (`SCHEMA_MIGRATIONS`)
 * - Generische CRUD-Helfer mit Promise-API
 * - Änderungsbenachrichtigungen pro Store für reaktive UI-Hooks
 */
import type {
  Activity,
  ApiCacheEntry,
  LabDocument,
  LabReport,
  CalculationRecord,
  Expense,
  GrowProject,
  InventoryItem,
  JournalEntry,
  Photo,
  PhotoData,
  Plant,
  Reminder,
  SettingRow,
  Strain,
} from './types';

/** Ausstehende Änderung (Sync-Outbox). Inhalt wird beim Hochladen frisch gelesen. */
export interface OutboxEntry {
  key: string;
  store: StoreName;
  id: string;
  queuedAt: number;
}
/** Zuletzt vom Server bestätigte Version je Datensatz. */
export interface SyncStateRow {
  key: string;
  version?: number;
  value?: unknown;
  /** Zuletzt vom Server bestätigter Inhalt (Basis für den Drei-Wege-Merge) */
  base?: unknown;
}
/** Konflikt: lokale und Server-Version liegen beide vor, bis der Nutzer entscheidet. */
export interface SyncConflict {
  key: string;
  store: StoreName;
  id: string;
  kind: 'conflict' | 'rejected';
  local: unknown | null;
  server: { version: number; deleted: boolean; data: unknown | null } | null;
  error?: string;
  /** Felder mit echtem Konflikt (aus dem Drei-Wege-Merge) */
  fields?: string[];
  detectedAt: number;
}

export const DB_NAME = 'terpgrid';

export interface StoreMap {
  grows: GrowProject;
  plants: Plant;
  activities: Activity;
  photos: Photo;
  photoData: PhotoData;
  reminders: Reminder;
  strains: Strain;
  journal: JournalEntry;
  inventory: InventoryItem;
  expenses: Expense;
  calculations: CalculationRecord;
  settings: SettingRow;
  labReports: LabReport;
  labDocs: LabDocument;
  apiCache: ApiCacheEntry;
  outbox: OutboxEntry;
  syncState: SyncStateRow;
  syncConflicts: SyncConflict;
}
export type StoreName = keyof StoreMap;

export const STORE_NAMES: StoreName[] = [
  'grows',
  'plants',
  'activities',
  'photos',
  'photoData',
  'reminders',
  'strains',
  'journal',
  'inventory',
  'expenses',
  'calculations',
  'settings',
  'labReports',
  'labDocs',
  'apiCache',
  'outbox',
  'syncState',
  'syncConflicts',
];

/** Stores, die in einem Backup als JSON landen (photoData wird separat als Dateien exportiert). */
const NON_RECORD = new Set<StoreName>(['photoData', 'settings', 'labDocs', 'apiCache', 'outbox', 'syncState', 'syncConflicts']);
export const RECORD_STORES = STORE_NAMES.filter((s) => !NON_RECORD.has(s)) as Exclude<
  StoreName,
  'photoData' | 'settings' | 'labDocs' | 'apiCache' | 'outbox' | 'syncState' | 'syncConflicts'
>[];

/** Mit dem Server synchronisierte Bereiche: Datensätze inkl. Einstellungen sowie Binärdaten. */
export const SYNC_RECORD_STORES: StoreName[] = [...RECORD_STORES, 'settings'];
export const SYNC_FILE_STORES: StoreName[] = ['photoData', 'labDocs'];
const TRACKED = new Set<StoreName>([...SYNC_RECORD_STORES, ...SYNC_FILE_STORES]);
export const keyOf = (store: StoreName, value: unknown): string => String((value as Record<string, unknown>)[store === 'settings' ? 'key' : 'id']);

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

/**
 * Schema-Migrationen. Index i migriert von Version i auf i+1.
 * Neue Versionen werden ausschließlich angehängt – nie bestehende ändern.
 */
export const SCHEMA_MIGRATIONS: Migration[] = [
  // v0 → v1: Grundschema
  (db) => {
    const make = (name: StoreName, indexes: string[] = [], keyPath = 'id') => {
      const store = db.createObjectStore(name, { keyPath });
      for (const idx of indexes) store.createIndex(idx, idx, { unique: false });
    };
    make('grows', ['status']);
    make('plants', ['growId', 'strainId']);
    make('activities', ['growId', 'plantId', 'date']);
    make('photos', ['growId', 'plantId', 'strainId', 'takenAt']);
    make('photoData');
    make('reminders', ['growId', 'date']);
    make('strains', ['name']);
    make('journal', ['date', 'strainId']);
    make('inventory', ['category', 'growId']);
    make('expenses', ['growId', 'date']);
    make('calculations', ['kind']);
    make('settings', [], 'key');
  },
  // v1 → v2: Online-Katalog (externe Sortenverknüpfung, API-Cache) und Laborberichte
  (db, tx) => {
    tx.objectStore('strains').createIndex('externalKey', 'externalKey', { unique: false });
    db.createObjectStore('apiCache', { keyPath: 'key' }).createIndex('fetchedAt', 'fetchedAt', { unique: false });
    const lab = db.createObjectStore('labReports', { keyPath: 'id' });
    lab.createIndex('strainId', 'strainId', { unique: false });
    db.createObjectStore('labDocs', { keyPath: 'id' });
  },
  // v2 → v3: Synchronisation (Outbox, bestätigte Versionen, Konflikte) – additiv
  (db) => {
    db.createObjectStore('outbox', { keyPath: 'key' });
    db.createObjectStore('syncState', { keyPath: 'key' });
    db.createObjectStore('syncConflicts', { keyPath: 'key' });
  },
];

export const DB_VERSION = SCHEMA_MIGRATIONS.length;

/* ───────────── Verbindung ───────────── */

let dbPromise: Promise<IDBDatabase> | null = null;
let dbName = DB_NAME;
/** Im Servermodus aktiv: jede lokale Änderung landet zusätzlich in der Outbox. */
let tracking = false;

/** Wählt die Datenbank (Lokalmodus: `terpgrid`, Servermodus: eine Datenbank je Konto). */
export function selectDatabase(name: string): void {
  if (name !== dbName) {
    dbPromise?.then((d) => d.close()).catch(() => {});
    dbPromise = null;
  }
  dbName = name;
}
export const currentDatabaseName = () => dbName;
export function setSyncTracking(on: boolean): void {
  tracking = on;
}
export const isSyncTracking = () => tracking;

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar (z. B. privater Modus).'));
      return;
    }
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction!;
      for (let v = event.oldVersion; v < DB_VERSION; v++) SCHEMA_MIGRATIONS[v]!(db, tx);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('Datenbank konnte nicht geöffnet werden.'));
    req.onblocked = () => reject(new Error('Die Datenbank wird in einem anderen Tab verwendet. Bitte andere TERPGRID-Tabs schließen.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export async function closeDatabase(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}

export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transaktion fehlgeschlagen'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaktion abgebrochen (evtl. Speicher voll)'));
  });
}

/* ───────────── Änderungs-Events ───────────── */

type Listener = (stores: Set<StoreName>) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify(...stores: StoreName[]): void {
  const set = new Set(stores);
  for (const l of listeners) l(set);
}

/* ───────────── CRUD ───────────── */

export async function getAll<S extends StoreName>(store: S): Promise<StoreMap[S][]> {
  const db = await openDatabase();
  return promisify(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<StoreMap[S][]>;
}

export async function getAllByIndex<S extends StoreName>(store: S, index: string, value: IDBValidKey): Promise<StoreMap[S][]> {
  const db = await openDatabase();
  return promisify(db.transaction(store, 'readonly').objectStore(store).index(index).getAll(value)) as Promise<StoreMap[S][]>;
}

export async function getOne<S extends StoreName>(store: S, key: string): Promise<StoreMap[S] | undefined> {
  const db = await openDatabase();
  return promisify(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<StoreMap[S] | undefined>;
}

export async function count(store: StoreName): Promise<number> {
  const db = await openDatabase();
  return promisify(db.transaction(store, 'readonly').objectStore(store).count());
}

export async function putOne<S extends StoreName>(store: S, value: StoreMap[S]): Promise<StoreMap[S]> {
  await writeBatch({ put: { [store]: [value] } as WriteBatch['put'] });
  return value;
}

/**
 * Mehrere Schreib-/Löschoperationen atomar in einer Transaktion.
 * Schlägt eine Operation fehl, wird nichts geschrieben.
 */
export interface WriteBatch {
  put?: Partial<{ [S in StoreName]: StoreMap[S][] }>;
  delete?: Partial<Record<StoreName, string[]>>;
  clear?: StoreName[];
}

export async function writeBatch(batch: WriteBatch, opts: { fromSync?: boolean } = {}): Promise<void> {
  const stores = new Set<StoreName>([
    ...((Object.keys(batch.put ?? {}) as StoreName[]) ?? []),
    ...((Object.keys(batch.delete ?? {}) as StoreName[]) ?? []),
    ...(batch.clear ?? []),
  ]);
  if (stores.size === 0) return;
  // Änderungen aus der Synchronisation selbst erzeugen keine neuen Outbox-Einträge
  const track = tracking && !opts.fromSync && [...stores].some((s) => TRACKED.has(s));
  if (track) stores.add('outbox');
  const db = await openDatabase();
  const tx = db.transaction([...stores], 'readwrite');
  const queuedAt = Date.now();
  const outbox = track ? tx.objectStore('outbox') : null;
  const queue = (store: StoreName, id: string) => outbox?.put({ key: `${store}:${id}`, store, id, queuedAt } satisfies OutboxEntry);
  for (const s of batch.clear ?? []) {
    if (outbox && TRACKED.has(s)) {
      // Vor dem Leeren alle Schlüssel als Löschung vormerken (Reihenfolge innerhalb der Transaktion ist garantiert)
      const req = tx.objectStore(s).getAllKeys();
      req.onsuccess = () => {
        for (const k of req.result) queue(s, String(k));
      };
    }
    tx.objectStore(s).clear();
  }
  for (const [s, keys] of Object.entries(batch.delete ?? {}) as [StoreName, string[]][]) {
    const os = tx.objectStore(s);
    for (const k of keys) {
      os.delete(k);
      if (TRACKED.has(s)) queue(s, k);
    }
  }
  for (const [s, values] of Object.entries(batch.put ?? {}) as [StoreName, unknown[]][]) {
    const os = tx.objectStore(s);
    for (const v of values) {
      os.put(v);
      if (TRACKED.has(s)) queue(s, keyOf(s, v));
    }
  }
  await txDone(tx);
  notify(...stores);
}

/* ───────────── Hilfen ───────────── */

export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fallback */
  }
  const rnd = () => Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${rnd()}-${rnd()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Schätzung des belegten/verfügbaren Speichers (sofern vom Browser unterstützt). */
export async function storageEstimate(): Promise<{ usage?: number; quota?: number; persisted?: boolean }> {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return { usage: est?.usage, quota: est?.quota, persisted };
  } catch {
    return {};
  }
}

/** Bittet den Browser, den Speicher nicht automatisch zu leeren (keine Garantie). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Rohe Transaktion für die Sync-Engine (z. B. „Outbox-Eintrag nur entfernen,
 * wenn er seit dem Hochladen nicht erneut geändert wurde“). Löst keine Outbox-Einträge aus.
 */
export async function transact(stores: StoreName[], fn: (tx: IDBTransaction) => void, notifyStores: StoreName[] = stores): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(stores, 'readwrite');
  fn(tx);
  await txDone(tx);
  if (notifyStores.length) notify(...notifyStores);
}
