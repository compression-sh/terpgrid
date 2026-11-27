/**
 * Synchronisation zwischen der Konto-Datenbank im Browser und dem Server.
 *
 * Grundsätze:
 * - Jede lokale Änderung landet in der Outbox (gleiche IndexedDB-Transaktion).
 * - „Synchronisiert“ erst, wenn der Server bestätigt hat (Outbox leer, letzter Push ok).
 * - Optimistische Versionen: Der Server schreibt nur bei passender Basisversion,
 *   sonst entsteht ein Konflikt, den der Nutzer bewusst auflöst. Nichts wird still überschrieben.
 * - Eingehende Änderungen überschreiben keine lokal noch ausstehenden Änderungen.
 */
import {
  type OutboxEntry,
  type StoreName,
  type SyncConflict,
  SYNC_FILE_STORES,
  SYNC_RECORD_STORES,
  getAll,
  getOne,
  keyOf,
  notify,
  subscribe,
  transact,
  writeBatch,
} from '../db/database';
import type { LabDocument, LabReport, Photo, PhotoData } from '../db/types';
import { ApiError, type ChangeResult, type RemoteChange, api } from '../server/api';
import { merge3 } from './merge';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error' | 'stopped';
/** Im Leerlauf ausführen (spätestens nach 3 s); ohne requestIdleCallback (Safari) nach 1,5 s. */
function whenIdle(fn: () => void): void {
  if (typeof window === 'undefined') return fn(); // Tests/Node: sofort
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(fn, { timeout: 3000 });
  else setTimeout(fn, 1500);
}

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  conflicts: number;
  lastSyncAt?: number;
  message?: string;
}

const CURSOR_KEY = '~cursor';
const BATCH = 100;
const isRecordStore = (s: string): s is StoreName => (SYNC_RECORD_STORES as string[]).includes(s);

export class SyncEngine {
  private status: SyncStatus = { phase: 'idle', pending: 0, conflicts: 0 };
  private listeners = new Set<(s: SyncStatus) => void>();
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private unsub: (() => void) | undefined;
  private stopped = false;
  private downloads = new Set<string>();
  /** Aufeinanderfolgende Fehlschläge (für exponentielles Backoff bei instabiler Verbindung) */
  private failures = 0;

  start(): void {
    this.stopped = false;
    this.unsub = subscribe((stores) => {
      if (stores.has('outbox')) this.schedule(1200);
    });
    this.interval = setInterval(() => this.schedule(0), 60_000);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onWake);
      document.addEventListener('visibilitychange', this.onWake);
    }
    void this.refreshCounts();
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.interval);
    this.unsub?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onWake);
      document.removeEventListener('visibilitychange', this.onWake);
    }
    this.set({ phase: 'stopped' });
  }

  private onWake = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') this.schedule(0);
  };

  subscribe(l: (s: SyncStatus) => void): () => void {
    this.listeners.add(l);
    l(this.status);
    return () => this.listeners.delete(l);
  }
  getStatus(): SyncStatus {
    return this.status;
  }

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  schedule(delay: number): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), delay);
  }

  async refreshCounts(): Promise<void> {
    const [outbox, conflicts] = await Promise.all([getAll('outbox'), getAll('syncConflicts')]);
    this.set({ pending: outbox.length, conflicts: conflicts.length });
  }

  /** Ein vollständiger Durchlauf: erst hochladen, dann herunterladen. */
  async syncNow(): Promise<void> {
    if (this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.set({ phase: 'syncing', message: undefined });
    try {
      await this.push();
      await this.pull();
      await this.refreshCounts();
      this.failures = 0;
      this.set({ phase: 'idle', lastSyncAt: Date.now() });
    } catch (e) {
      await this.refreshCounts().catch(() => {});
      if (e instanceof ApiError && e.status === 0) this.set({ phase: 'offline', message: e.message });
      else this.set({ phase: 'error', message: e instanceof Error ? e.message : 'Synchronisation fehlgeschlagen' });
      // Erneuter Versuch mit wachsendem Abstand (5 s, 10 s, 20 s … max. 5 Min.); Outbox bleibt erhalten
      this.failures++;
      if (!(e instanceof ApiError && e.status === 401)) this.schedule(Math.min(300_000, 5000 * 2 ** (this.failures - 1)));
    } finally {
      this.running = false;
      if (this.again && !this.stopped) {
        this.again = false;
        this.schedule(300);
      }
    }
  }

  /* ───────────── Push ───────────── */

  private async push(): Promise<void> {
    const entries = (await getAll('outbox')).sort((a, b) => a.queuedAt - b.queuedAt);
    const recs = entries.filter((e) => isRecordStore(e.store));
    for (let i = 0; i < recs.length; i += BATCH) await this.pushRecords(recs.slice(i, i + BATCH));
    for (const e of entries.filter((x) => (SYNC_FILE_STORES as string[]).includes(x.store))) await this.pushFile(e);
  }

  private async pushRecords(entries: OutboxEntry[]): Promise<void> {
    const states = new Map<string, { base?: unknown }>();
    const changes = await Promise.all(
      entries.map(async (e) => {
        const [value, state] = await Promise.all([getOne(e.store, e.id), getOne('syncState', e.key)]);
        states.set(e.key, { base: state?.base });
        const baseVersion = state?.version ?? 0;
        return value === undefined ? { store: e.store, id: e.id, baseVersion, deleted: true } : { store: e.store, id: e.id, baseVersion, data: value };
      }),
    );
    const { results } = await api<{ results: ChangeResult[] }>('POST', '/api/sync/push', { changes });
    const byKey = new Map(entries.map((e) => [e.key, e]));
    const local = new Map(changes.map((c) => [`${c.store}:${c.id}`, 'data' in c ? c.data : null]));
    const stores = new Set<StoreName>(['outbox', 'syncState', 'syncConflicts']);
    for (const e of entries) stores.add(e.store);
    let merged = 0;
    await transact([...stores], (tx) => {
      const ob = tx.objectStore('outbox');
      const st = tx.objectStore('syncState');
      const cf = tx.objectStore('syncConflicts');
      for (const r of results) {
        const key = `${r.store}:${r.id}`;
        const sent = byKey.get(key);
        if (!sent) continue;
        // Outbox-Eintrag nur entfernen, wenn er während des Uploads nicht erneut geändert wurde
        const removeIfUnchanged = () => {
          const g = ob.get(key);
          g.onsuccess = () => {
            if ((g.result as OutboxEntry | undefined)?.queuedAt === sent.queuedAt) ob.delete(key);
          };
        };
        if (r.status === 'ok' || r.status === 'unchanged') {
          st.put({ key, version: r.version, base: local.get(key) ?? null });
          cf.delete(key);
          removeIfUnchanged();
        } else if (r.status === 'conflict' && !r.server.deleted && local.get(key) != null) {
          // Drei-Wege-Merge: verschiedene Felder geändert → automatisch zusammenführen
          const m = merge3(states.get(key)?.base ?? undefined, local.get(key), r.server.data);
          if (m.ok && m.merged) {
            tx.objectStore(sent.store).put(m.merged);
            st.put({ key, version: r.server.version, base: r.server.data });
            ob.put({ key, store: sent.store, id: sent.id, queuedAt: Date.now() } satisfies OutboxEntry);
            cf.delete(key);
            merged++;
          } else {
            cf.put({ key, store: sent.store, id: sent.id, kind: 'conflict', local: local.get(key) ?? null, server: r.server, fields: m.conflicts, detectedAt: Date.now() } satisfies SyncConflict);
            removeIfUnchanged();
          }
        } else {
          const conflict: SyncConflict = {
            key,
            store: sent.store,
            id: sent.id,
            kind: r.status,
            local: local.get(key) ?? null,
            server: r.status === 'conflict' ? r.server : null,
            error: r.status === 'rejected' ? r.error : undefined,
            detectedAt: Date.now(),
          };
          cf.put(conflict);
          removeIfUnchanged();
        }
      }
    }, merged ? [...stores] : ['outbox', 'syncConflicts']);
    // Zusammengeführte Datensätze sofort erneut hochladen
    if (merged) this.again = true;
  }

  private async pushFile(e: OutboxEntry): Promise<void> {
    const kind = e.store === 'photoData' ? 'photo' : 'labdoc';
    const id = encodeURIComponent(e.id);
    const value = await getOne(e.store, e.id);
    try {
      if (e.store === 'photoData') {
        const p = value as PhotoData | undefined;
        if (p) {
          await api('PUT', `/api/files/photo/${id}/full`, undefined, { raw: p.full, contentType: p.mime });
          await api('PUT', `/api/files/photo/${id}/thumb`, undefined, { raw: p.thumb, contentType: p.mime });
        } else {
          await api('DELETE', `/api/files/photo/${id}/full`);
          await api('DELETE', `/api/files/photo/${id}/thumb`);
        }
      } else {
        const d = value as LabDocument | undefined;
        if (d) await api('PUT', `/api/files/labdoc/${id}/doc`, undefined, { raw: d.data, contentType: d.mime });
        else await api('DELETE', `/api/files/labdoc/${id}/doc`);
      }
    } catch (err) {
      // Dauerhaft abgelehnte Dateien (Typ, Größe, Kontingent) als Problem melden statt endlos zu wiederholen
      if (err instanceof ApiError && [413, 415, 404].includes(err.status)) {
        await transact(['outbox', 'syncConflicts'], (tx) => {
          tx.objectStore('syncConflicts').put({ key: e.key, store: e.store, id: e.id, kind: 'rejected', local: null, server: null, error: `${kind === 'photo' ? 'Foto' : 'Dokument'}: ${err.message}`, detectedAt: Date.now() } satisfies SyncConflict);
          tx.objectStore('outbox').delete(e.key);
        });
        return;
      }
      throw err;
    }
    await transact(['outbox'], (tx) => {
      const ob = tx.objectStore('outbox');
      const g = ob.get(e.key);
      g.onsuccess = () => {
        if ((g.result as OutboxEntry | undefined)?.queuedAt === e.queuedAt) ob.delete(e.key);
      };
    });
  }

  /* ───────────── Pull ───────────── */

  private async pull(): Promise<void> {
    let cursor = String((await getOne('syncState', CURSOR_KEY))?.value ?? '0');
    const needPhotos = new Set<string>();
    const needDocs = new Set<string>();
    // Benachrichtigungen bündeln: Jede Benachrichtigung lässt die Oberfläche alle Datensätze neu lesen. Nach jeder
    // Seite wäre das bei großen Beständen quadratisch (gemessen: 20.000 Messungen → 106 Seiten, 17 s Erstabgleich).
    const touched = new Set<StoreName>();
    let lastNotify = Date.now();
    const flush = () => {
      if (touched.size) notify(...touched, 'photoData');
      touched.clear();
      lastNotify = Date.now();
    };
    try {
      for (let guard = 0; guard < 1000; guard++) {
        const page = await api<{ changes: RemoteChange[]; cursor: string; more: boolean }>('GET', `/api/sync/changes?since=${encodeURIComponent(cursor)}&limit=500`);
        if (page.changes.length) for (const t of await this.applyRemote(page.changes, page.cursor, needPhotos, needDocs)) touched.add(t);
        else await transact(['syncState'], (tx) => tx.objectStore('syncState').put({ key: CURSOR_KEY, value: page.cursor }), []);
        cursor = page.cursor;
        if (!page.more) break;
        if (Date.now() - lastNotify > 1500) flush(); // Fortschritt bleibt bei langen Abgleichen sichtbar
      }
    } finally {
      flush();
    }
    // Binärdaten erst nach dem ersten Rendern laden (Leerlauf): sonst konkurrieren Foto-Downloads
    // beim Start mit den Anfragen der gerade geöffneten Seite um die Bandbreite.
    // Nach dem Abmelden (stop) nicht mehr starten – sonst würde eine gerade gelöschte Arbeitskopie erneut geöffnet
    whenIdle(() => {
      if (!this.stopped) this.fetchMissingFiles(needPhotos, needDocs).catch(() => {});
    });
  }

  /** Wendet eine Seite an; Rückgabe: tatsächlich geänderte Stores (Benachrichtigung übernimmt `pull`). */
  private async applyRemote(changes: RemoteChange[], cursor: string, needPhotos: Set<string>, needDocs: Set<string>): Promise<Set<StoreName>> {
    const stores = new Set<StoreName>(['syncState', 'outbox', 'syncConflicts', 'photoData', 'labDocs']);
    for (const c of changes) if (isRecordStore(c.store)) stores.add(c.store);
    const touched = new Set<StoreName>();
    await transact([...stores], (tx) => {
      const ob = tx.objectStore('outbox');
      const st = tx.objectStore('syncState');
      const cf = tx.objectStore('syncConflicts');
      for (const c of changes) {
        if (!isRecordStore(c.store)) continue;
        const key = `${c.store}:${c.id}`;
        const g = ob.get(key);
        g.onsuccess = () => {
          if (g.result) return; // lokale Änderung ausstehend → nicht überschreiben (Push meldet ggf. Konflikt)
          const gc = cf.get(key);
          gc.onsuccess = () => {
            const existing = gc.result as SyncConflict | undefined;
            if (existing) {
              cf.put({ ...existing, server: { version: c.version, deleted: c.deleted, data: c.data } });
              return;
            }
            const os = tx.objectStore(c.store);
            if (c.deleted) {
              os.delete(c.id);
              if (c.store === 'photos') tx.objectStore('photoData').delete(c.id);
            } else {
              if (keyOf(c.store as StoreName, c.data) !== c.id) return;
              os.put(c.data);
              if (c.store === 'photos') needPhotos.add(c.id);
              if (c.store === 'labReports') {
                const docId = (c.data as LabReport).documentId;
                if (docId) needDocs.add(docId);
              }
            }
            st.put({ key, version: c.version, base: c.deleted ? null : c.data });
            touched.add(c.store as StoreName);
          };
        };
      }
      st.put({ key: CURSOR_KEY, value: cursor });
    }, []);
    return touched;
  }

  /** Fotos und Dokumente werden bei Bedarf nachgeladen (begrenzte Parallelität). */
  private async fetchMissingFiles(photoIds: Set<string>, docIds: Set<string>): Promise<void> {
    if (!photoIds.size && !docIds.size) {
      // Auch nach Neuanmeldung auf einem Gerät fehlende Binärdaten ergänzen
      const [photos, have] = await Promise.all([getAll('photos'), getAll('photoData')]);
      const present = new Set(have.map((p) => p.id));
      for (const p of photos as Photo[]) if (!present.has(p.id)) photoIds.add(p.id);
      const [reports, docs] = await Promise.all([getAll('labReports'), getAll('labDocs')]);
      const presentDocs = new Set(docs.map((d) => d.id));
      for (const r of reports as LabReport[]) if (r.documentId && !presentDocs.has(r.documentId)) docIds.add(r.documentId);
    }
    // Neueste zuerst: Galerie und Übersicht zeigen die jüngsten Fotos oben – sonst erscheinen sie bei großen
    // Beständen auf einem neuen Gerät erst nach allen älteren (gemessen: 63 s bei 1.000 Fotos).
    const taken = new Map((photoIds.size ? ((await getAll('photos')) as Photo[]) : []).map((p) => [p.id, p.takenAt ?? '']));
    const orderedPhotos = [...photoIds].sort((a, b) => (taken.get(b) ?? '').localeCompare(taken.get(a) ?? ''));
    const tasks: (() => Promise<void>)[] = [];
    for (const id of orderedPhotos) tasks.push(() => this.downloadPhoto(id));
    for (const id of docIds) tasks.push(() => this.downloadDoc(id));
    const workers = Array.from({ length: 3 }, async () => {
      for (let t = tasks.shift(); t && !this.stopped; t = tasks.shift()) await t().catch(() => {});
    });
    await Promise.all(workers);
  }

  private async downloadPhoto(id: string): Promise<void> {
    if (this.downloads.has(id) || (await getOne('photoData', id))) return;
    this.downloads.add(id);
    try {
      const photo = (await getOne('photos', id)) as Photo | undefined;
      const full = await api<ArrayBuffer>('GET', `/api/files/photo/${encodeURIComponent(id)}/full`, undefined, { binary: true });
      const thumb = await api<ArrayBuffer>('GET', `/api/files/photo/${encodeURIComponent(id)}/thumb`, undefined, { binary: true }).catch(() => full);
      if (await getOne('photos', id)) await writeBatch({ put: { photoData: [{ id, full, thumb, mime: photo?.mime ?? 'image/jpeg' }] } }, { fromSync: true });
    } finally {
      this.downloads.delete(id);
    }
  }

  private async downloadDoc(id: string): Promise<void> {
    if (this.downloads.has(`d:${id}`) || (await getOne('labDocs', id))) return;
    this.downloads.add(`d:${id}`);
    try {
      const report = ((await getAll('labReports')) as LabReport[]).find((r) => r.documentId === id);
      const data = await api<ArrayBuffer>('GET', `/api/files/labdoc/${encodeURIComponent(id)}/doc`, undefined, { binary: true });
      const head = new Uint8Array(data.slice(0, 5));
      const mime = head[0] === 0x25 ? 'application/pdf' : head[0] === 0x89 ? 'image/png' : 'image/jpeg';
      await writeBatch({ put: { labDocs: [{ id, data, mime, name: report?.documentName ?? id, size: data.byteLength }] } }, { fromSync: true });
    } finally {
      this.downloads.delete(`d:${id}`);
    }
  }

  /* ───────────── Konflikte ───────────── */

  /** „Meine Version behalten“: lokale Version auf Basis der Serverversion erneut hochladen. */
  async keepMine(key: string): Promise<void> {
    const c = await getOne('syncConflicts', key);
    if (!c) return;
    await transact(['syncState', 'syncConflicts', 'outbox'], (tx) => {
      if (c.server) tx.objectStore('syncState').put({ key, version: c.server.version, base: c.server.data });
      tx.objectStore('syncConflicts').delete(key);
      tx.objectStore('outbox').put({ key, store: c.store, id: c.id, queuedAt: Date.now() } satisfies OutboxEntry);
    });
    await this.refreshCounts();
    this.schedule(0);
  }

  /** Hinweis zu einem abgelehnten Datensatz schließen (lokale Daten bleiben unverändert). */
  async dismiss(key: string): Promise<void> {
    await transact(['syncConflicts'], (tx) => tx.objectStore('syncConflicts').delete(key));
    await this.refreshCounts();
  }

  /** „Server-Version übernehmen“: lokale Version wird durch den Serverstand ersetzt. */
  async takeServer(key: string): Promise<void> {
    const c = await getOne('syncConflicts', key);
    if (!c) return;
    await transact([c.store, 'syncState', 'syncConflicts', 'outbox'], (tx) => {
      const os = tx.objectStore(c.store);
      if (!c.server || c.server.deleted) os.delete(c.id);
      else os.put(c.server.data);
      if (c.server) tx.objectStore('syncState').put({ key, version: c.server.version, base: c.server.data });
      tx.objectStore('syncConflicts').delete(key);
      tx.objectStore('outbox').delete(key);
    });
    await this.refreshCounts();
  }
}
