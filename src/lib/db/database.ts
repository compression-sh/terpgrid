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
];

/** Stores, die in einem Backup als JSON landen (photoData wird separat als Dateien exportiert). */
export const RECORD_STORES = STORE_NAMES.filter((s) => s !== 'photoData' && s !== 'settings' && s !== 'labDocs' && s !== 'apiCache') as Exclude<
  StoreName,
  'photoData' | 'settings' | 'labDocs' | 'apiCache'
>[];

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
];

export const DB_VERSION = SCHEMA_MIGRATIONS.length;

/* ───────────── Verbindung ───────────── */

let dbPromise: Promise<IDBDatabase> | null = null;
let dbName = DB_NAME;

/** Nur für Tests: andere Datenbank verwenden. */
export function useDatabaseName(name: string): void {
  dbName = name;
  dbPromise = null;
}

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
  const db = await openDatabase();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
  notify(store);
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

export async function writeBatch(batch: WriteBatch): Promise<void> {
  const stores = new Set<StoreName>([
    ...((Object.keys(batch.put ?? {}) as StoreName[]) ?? []),
    ...((Object.keys(batch.delete ?? {}) as StoreName[]) ?? []),
    ...(batch.clear ?? []),
  ]);
  if (stores.size === 0) return;
  const db = await openDatabase();
  const tx = db.transaction([...stores], 'readwrite');
  for (const s of batch.clear ?? []) tx.objectStore(s).clear();
  for (const [s, keys] of Object.entries(batch.delete ?? {}) as [StoreName, string[]][]) {
    const os = tx.objectStore(s);
    for (const k of keys) os.delete(k);
  }
  for (const [s, values] of Object.entries(batch.put ?? {}) as [StoreName, unknown[]][]) {
    const os = tx.objectStore(s);
    for (const v of values) os.put(v);
  }
  await txDone(tx);
  notify(...stores);
}

export async function deleteOne(store: StoreName, key: string): Promise<void> {
  await writeBatch({ delete: { [store]: [key] } });
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
