/**
 * Offline-Freigabe je Konto und Gerät (Phase 5.6).
 *
 * Grundsatz: Private Daten bleiben nur dann über die Sitzung hinaus in diesem Browser,
 * wenn die Offline-Nutzung für dieses Konto auf diesem Gerät ausdrücklich eingeschaltet ist.
 *
 * - Aus (Standard): Die IndexedDB-Arbeitskopie dient nur der laufenden Sitzung. Beim Abmelden
 *   und bei einem Kontowechsel wird sie gelöscht – außer es gibt noch nicht übertragene
 *   Änderungen (dann bleibt sie, bis diese bestätigt sind). Kein Offline-Start.
 * - Ein: Die Arbeitskopie bleibt erhalten; der Browser wird um dauerhaften Speicher gebeten.
 * - „Geteiltes Gerät“ erzwingt Aus.
 *
 * IndexedDB ist NICHT verschlüsselt (Schutz nur durch Betriebssystem/Gerätesperre). Schlüssel
 * (Master-Key, Kontoschlüssel) werden nie im Browser gespeichert – sie existieren nur auf dem Server.
 */
import { isSharedDevice } from './device';

const ENABLED_KEY = 'terpgrid.device.offlineDbs';
const ASKED_KEY = 'terpgrid.device.offlineAsked';
export const ACCOUNT_DB_PREFIX = 'terpgrid-u-';

const readList = (k: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const writeList = (k: string, list: string[]) => {
  try {
    if (list.length) localStorage.setItem(k, JSON.stringify([...new Set(list)]));
    else localStorage.removeItem(k);
  } catch {
    /* ignorieren */
  }
};

export function isOfflineEnabled(dbName: string): boolean {
  if (isSharedDevice()) return false;
  return readList(ENABLED_KEY).includes(dbName);
}

export function setOfflineEnabled(dbName: string, on: boolean): void {
  const list = readList(ENABLED_KEY).filter((n) => n !== dbName);
  writeList(ENABLED_KEY, on ? [...list, dbName] : list);
  markOfflineAsked(dbName);
}

/** Wurde die einmalige Frage nach der Offline-Nutzung für dieses Konto schon beantwortet? */
export function offlineAsked(dbName: string): boolean {
  return readList(ASKED_KEY).includes(dbName);
}
export function markOfflineAsked(dbName: string): void {
  writeList(ASKED_KEY, [...readList(ASKED_KEY), dbName]);
}

/** Alle Offline-Freigaben dieses Geräts vergessen (z. B. beim Einschalten von „Geteiltes Gerät“). */
export function clearOfflineChoices(): void {
  writeList(ENABLED_KEY, []);
}

/** Kontoschlüssel aus dem Datenbanknamen (für kontobezogene localStorage-Einträge). */
export function accountKeyFromDb(name: string): string | null {
  const k = name.startsWith(ACCOUNT_DB_PREFIX) ? name.slice(ACCOUNT_DB_PREFIX.length) : '';
  return /^[a-f0-9]{8,32}$/.test(k) ? k : null;
}

export interface PurgeCandidate {
  name: string;
  /** Nicht übertragene Änderungen (private Outbox + Bereichs-Warteschlangen) */
  pending: number;
}

/**
 * Reine Entscheidungslogik: Welche Konto-Datenbanken dürfen entfernt werden?
 * Nie: die aktive Datenbank, freigegebene Konten (außer auf geteilten Geräten),
 * Datenbanken mit ausstehenden Änderungen und die Datenbank des Lokalmodus.
 */
export function selectPurgeable(cands: PurgeCandidate[], opts: { current: string | null; enabled: string[]; shared: boolean }): string[] {
  return cands
    .filter((c) => c.name.startsWith(ACCOUNT_DB_PREFIX))
    .filter((c) => c.name !== opts.current)
    .filter((c) => opts.shared || !opts.enabled.includes(c.name))
    .filter((c) => c.pending === 0)
    .map((c) => c.name);
}

/** Ausstehende Bereichsänderungen eines Kontos im localStorage. */
export function pendingSpaceOps(accountKey: string): number {
  let n = 0;
  try {
    const prefix = `terpgrid.u.${accountKey}.spaceOutbox.`;
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(prefix)) continue;
      const v = JSON.parse(localStorage.getItem(k) ?? '[]');
      n += Array.isArray(v) ? v.length : 0;
    }
  } catch {
    /* ignorieren */
  }
  return n;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Anzahl Outbox-Einträge einer (nicht aktiven) Konto-Datenbank, ohne sie zu verändern. */
async function outboxCount(name: string): Promise<number> {
  const open = indexedDB.open(name);
  // Existiert die Datenbank nicht (mehr), nichts anlegen
  open.onupgradeneeded = () => open.transaction?.abort();
  let db: IDBDatabase;
  try {
    db = await idbRequest(open);
  } catch {
    return 0;
  }
  try {
    if (!db.objectStoreNames.contains('outbox')) return 0;
    return await idbRequest(db.transaction('outbox', 'readonly').objectStore('outbox').count());
  } catch {
    // Im Zweifel behalten
    return 1;
  } finally {
    db.close();
  }
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = () => resolve();
    // Blockiert (in einem anderen Tab offen): nicht warten, beim nächsten Start erneut
    req.onblocked = () => resolve();
  });
}

/**
 * Entfernt Arbeitskopien anderer Konten ohne Offline-Freigabe und ohne ausstehende Änderungen.
 * Gibt die Namen der entfernten Datenbanken zurück. Ohne `indexedDB.databases()` (ältere
 * Browser) wird nichts entfernt – dokumentierte Einschränkung.
 */
export async function purgeStaleAccountData(current: string | null): Promise<string[]> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return [];
  let dbs: IDBDatabaseInfo[];
  try {
    dbs = await indexedDB.databases();
  } catch {
    return [];
  }
  const cands: PurgeCandidate[] = [];
  for (const d of dbs) {
    if (!d.name?.startsWith(ACCOUNT_DB_PREFIX) || d.name === current) continue;
    const key = accountKeyFromDb(d.name);
    cands.push({ name: d.name, pending: (await outboxCount(d.name)) + (key ? pendingSpaceOps(key) : 0) });
  }
  const purge = selectPurgeable(cands, { current, enabled: readList(ENABLED_KEY), shared: isSharedDevice() });
  for (const name of purge) {
    await deleteDb(name);
    const key = accountKeyFromDb(name);
    if (key) {
      try {
        const prefix = `terpgrid.u.${key}.`;
        for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
      } catch {
        /* ignorieren */
      }
    }
  }
  return purge;
}
