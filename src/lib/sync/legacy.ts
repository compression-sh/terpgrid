/**
 * Übernahme der bisherigen Einzelnutzer-Datenbank (`terpgrid`) in ein Server-Konto.
 *
 * Ablauf (nie automatisch):
 *  1. Erkennen und Vorschau (Anzahl je Bereich, Verknüpfungsprüfung)
 *  2. Optional: ZIP-Sicherung der alten Daten herunterladen
 *  3. Ausdrückliche Bestätigung mit Anzeige des Zielkontos
 *  4. Upload mit mode:'import' (idempotent: gleicher Inhalt → „unverändert“;
 *     abweichender Serverstand → Konflikt, nichts wird überschrieben)
 *  5. Prüfung der Anzahl auf dem Server
 *  6. Alte Datenbank bleibt erhalten, bis der Nutzer sie ausdrücklich löscht
 */
import { buildManifest, checkIntegrity, zipBackup, type BackupData } from '../backup';
import { DB_NAME, RECORD_STORES, type StoreName, type SyncConflict, transact } from '../db/database';
import type { AppSettings, LabDocument, PhotoData, SettingRow } from '../db/types';
import { type ChangeResult, api } from '../server/api';
import { t } from '../../i18n';

const MARK_KEY = 'terpgrid.legacyImport';

export interface LegacySnapshot {
  data: BackupData;
  settings: SettingRow[];
  photoData: PhotoData[];
  labDocs: LabDocument[];
  counts: Record<string, number>;
  total: number;
  issues: string[];
}

export interface ImportReport {
  created: number;
  unchanged: number;
  conflicts: number;
  rejected: { store: string; id: string; error: string }[];
  files: number;
  fileErrors: string[];
  verified: boolean;
  mismatches: string[];
}

export interface ImportMark {
  accountKey: string;
  loginName: string;
  at: string;
  verified: boolean;
}

export function readImportMark(): ImportMark | null {
  try {
    const v = localStorage.getItem(MARK_KEY);
    return v ? (JSON.parse(v) as ImportMark) : null;
  } catch {
    return null;
  }
}
function writeImportMark(m: ImportMark | null) {
  try {
    if (m) localStorage.setItem(MARK_KEY, JSON.stringify(m));
    else localStorage.removeItem(MARK_KEY);
  } catch {
    /* ignorieren */
  }
}

/** Existiert die alte Datenbank? Öffnet sie nie schreibend und legt sie nicht an. */
export async function legacyExists(): Promise<boolean> {
  try {
    if (typeof indexedDB.databases === 'function') {
      const list = await indexedDB.databases();
      return list.some((d) => d.name === DB_NAME);
    }
  } catch {
    /* Fallback unten */
  }
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      // Existierte nicht → Anlage abbrechen
      req.transaction?.abort();
    };
    req.onsuccess = () => {
      req.result.close();
      resolve(true);
    };
    req.onerror = () => resolve(false);
  });
}

function openLegacy(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => req.transaction?.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(t('account.lg.unreadable')));
  });
}

export async function readLegacy(): Promise<LegacySnapshot> {
  const db = await openLegacy();
  try {
    const names = new Set([...db.objectStoreNames]);
    const read = <T,>(store: string) =>
      names.has(store)
        ? new Promise<T[]>((resolve, reject) => {
            const r = db.transaction(store, 'readonly').objectStore(store).getAll();
            r.onsuccess = () => resolve(r.result as T[]);
            r.onerror = () => reject(r.error);
          })
        : Promise.resolve([] as T[]);
    const data = Object.fromEntries(await Promise.all(RECORD_STORES.map(async (s) => [s, await read(s)] as const))) as unknown as BackupData;
    const [settings, photoData, labDocs] = await Promise.all([read<SettingRow>('settings'), read<PhotoData>('photoData'), read<LabDocument>('labDocs')]);
    const counts: Record<string, number> = Object.fromEntries(RECORD_STORES.map((s) => [s, data[s].length]));
    counts.settings = settings.length;
    const total = RECORD_STORES.reduce((n, s) => n + data[s].length, 0) + photoData.length + labDocs.length;
    const issues = checkIntegrity(data, new Set(photoData.map((p) => p.id)));
    return { data, settings, photoData, labDocs, counts, total, issues };
  } finally {
    db.close();
  }
}

/** Sicherung der alten Daten im bekannten Backup-Format (vor dem Import empfohlen). */
export function legacyBackupZip(s: LegacySnapshot): Uint8Array {
  const app = s.settings.find((r) => r.key === 'app')?.value as AppSettings | undefined;
  return zipBackup(buildManifest(s.data, s.photoData, app, new Date(), s.labDocs), s.photoData, s.labDocs);
}

export async function importLegacy(s: LegacySnapshot, target: { accountKey: string; loginName: string }, onProgress: (done: number, total: number, label: string) => void): Promise<ImportReport> {
  const report: ImportReport = { created: 0, unchanged: 0, conflicts: 0, rejected: [], files: 0, fileErrors: [], verified: false, mismatches: [] };
  const items: { store: StoreName; id: string; data: unknown }[] = [];
  for (const store of RECORD_STORES) for (const row of s.data[store] as { id: string }[]) items.push({ store, id: row.id, data: row });
  for (const row of s.settings) items.push({ store: 'settings', id: row.key, data: row });
  const total = items.length + s.photoData.length + s.labDocs.length;
  let done = 0;

  for (let i = 0; i < items.length; i += 100) {
    const batch = items.slice(i, i + 100);
    const { results } = await api<{ results: ChangeResult[] }>('POST', '/api/sync/push', {
      changes: batch.map((b) => ({ store: b.store, id: b.id, baseVersion: 0, data: b.data, mode: 'import' })),
    });
    const byKey = new Map(batch.map((b) => [`${b.store}:${b.id}`, b]));
    const stores = new Set<StoreName>(['syncState', 'syncConflicts']);
    for (const b of batch) stores.add(b.store);
    await transact([...stores], (tx) => {
      for (const r of results) {
        const key = `${r.store}:${r.id}`;
        const item = byKey.get(key);
        if (!item) continue;
        if (r.status === 'ok' || r.status === 'unchanged') {
          tx.objectStore(item.store).put(item.data);
          tx.objectStore('syncState').put({ key, version: r.version, base: item.data });
          if (r.status === 'ok') report.created++;
          else report.unchanged++;
        } else if (r.status === 'conflict') {
          // Server hat bereits einen anderen Stand → beide Versionen aufbewahren, Nutzer entscheidet
          report.conflicts++;
          if (r.server && !r.server.deleted) tx.objectStore(item.store).put(r.server.data);
          tx.objectStore('syncState').put({ key, version: r.server.version, base: r.server.data });
          tx.objectStore('syncConflicts').put({ key, store: item.store, id: item.id, kind: 'conflict', local: item.data, server: r.server, detectedAt: Date.now() } satisfies SyncConflict);
        } else {
          report.rejected.push({ store: r.store, id: r.id, error: r.error });
        }
      }
    });
    done += batch.length;
    onProgress(done, total, t('account.lg.records'));
  }

  for (const p of s.photoData) {
    try {
      await api('PUT', `/api/files/photo/${encodeURIComponent(p.id)}/full`, undefined, { raw: p.full, contentType: p.mime });
      await api('PUT', `/api/files/photo/${encodeURIComponent(p.id)}/thumb`, undefined, { raw: p.thumb, contentType: p.mime });
      await transact(['photoData'], (tx) => tx.objectStore('photoData').put(p));
      report.files++;
    } catch (e) {
      report.fileErrors.push(`Foto ${p.id}: ${(e as Error).message}`);
    }
    onProgress(++done, total, 'Fotos');
  }
  for (const d of s.labDocs) {
    try {
      await api('PUT', `/api/files/labdoc/${encodeURIComponent(d.id)}/doc`, undefined, { raw: d.data, contentType: d.mime });
      await transact(['labDocs'], (tx) => tx.objectStore('labDocs').put(d));
      report.files++;
    } catch (e) {
      report.fileErrors.push(`Dokument ${d.name}: ${(e as Error).message}`);
    }
    onProgress(++done, total, 'Dokumente');
  }

  // Prüfung: Hat der Server mindestens so viele Datensätze/Dateien wie importiert?
  const summary = await api<{ records: Record<string, number>; files: { kind: string; variant: string; n: number }[] }>('GET', '/api/sync/summary');
  for (const [store, n] of Object.entries(s.counts)) {
    const rejected = report.rejected.filter((r) => r.store === store).length;
    const have = summary.records[store] ?? 0;
    if (have < n - rejected) report.mismatches.push(t('account.lg.mismatch', { what: store, have, want: n - rejected }));
  }
  const photos = summary.files.find((f) => f.kind === 'photo' && f.variant === 'full')?.n ?? 0;
  const docs = summary.files.find((f) => f.kind === 'labdoc')?.n ?? 0;
  const expPhotos = s.photoData.length - report.fileErrors.filter((e) => e.startsWith('Foto')).length;
  const expDocs = s.labDocs.length - report.fileErrors.filter((e) => e.startsWith('Dokument')).length;
  if (photos < expPhotos) report.mismatches.push(t('account.lg.mismatch', { what: t('account.lg.photos'), have: photos, want: expPhotos }));
  if (docs < expDocs) report.mismatches.push(t('account.lg.mismatch', { what: t('account.lg.docs'), have: docs, want: expDocs }));
  report.verified = report.mismatches.length === 0 && report.rejected.length === 0 && report.fileErrors.length === 0;
  writeImportMark({ accountKey: target.accountKey, loginName: target.loginName, at: new Date().toISOString(), verified: report.verified });
  return report;
}

/** Löscht die alte lokale Datenbank – nur nach erfolgreicher Prüfung und ausdrücklicher Bestätigung. */
export async function deleteLegacy(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  writeImportMark(null);
  try {
    localStorage.setItem('terpgrid.legacyDismissed', '1');
  } catch {
    /* ignorieren */
  }
}

export function legacyDismissed(): boolean {
  try {
    return localStorage.getItem('terpgrid.legacyDismissed') === '1';
  } catch {
    return false;
  }
}
export function dismissLegacy(): void {
  try {
    localStorage.setItem('terpgrid.legacyDismissed', '1');
  } catch {
    /* ignorieren */
  }
}
