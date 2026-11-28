/**
 * Synchronisation gemeinsamer Bereiche im Browser (Phase 5.5).
 *
 * Gleiche Grundsätze wie die private Sync-Engine (lib/sync/engine.ts):
 * - Optimistische Versionen; der Server schreibt nur bei passender Basisversion.
 * - Konflikte werden per Drei-Wege-Merge (merge3) automatisch gelöst, wenn verschiedene
 *   Felder betroffen sind – sonst entscheidet der Nutzer bewusst. Nichts wird still überschrieben.
 * - Lokale Änderungen landen in einer Warteschlange je Konto und Bereich (offline nutzbar).
 *
 * Zusätzlich für geteilte Daten:
 * - Rechte prüft ausschließlich der Server – bei jedem Abruf und jeder Änderung neu.
 * - Wurde der Zugriff entzogen (404), werden die zwischengespeicherten Inhalte sofort
 *   verworfen; nicht übertragene eigene Änderungen bleiben nur zum Herunterladen erhalten
 *   und werden NIE erneut gesendet (kein „Wiedergewinnen“ des Zugriffs).
 * - Ändert sich die eigene Rolle, wird der Zwischenspeicher vollständig neu geladen.
 * - Der Zwischenspeicher liegt nur im Arbeitsspeicher; die Warteschlange im
 *   kontobezogenen localStorage (wird im Modus „Geteiltes Gerät“ beim Abmelden gelöscht).
 */
import { ApiError } from '../server/api';
import { merge3 } from '../sync/merge';
import { type Access, type Role, type SpaceRemoteChange, type SpaceStore, collab } from './api';
import { t } from '../../i18n';

export interface SpaceEntry {
  store: SpaceStore;
  id: string;
  version: number;
  data: Record<string, unknown>;
  access: Access;
  origin: 'created' | 'copy' | 'move';
  updatedAt?: string;
  updatedBy?: string | null;
  /** Lokal geändert, noch nicht bestätigt */
  pending?: boolean;
}
interface OutboxItem {
  store: SpaceStore;
  id: string;
  baseVersion: number;
  deleted?: boolean;
  data?: Record<string, unknown>;
  queuedAt: number;
}
export interface SpaceConflict {
  key: string;
  store: SpaceStore;
  id: string;
  local: Record<string, unknown> | null;
  server: { version: number; deleted: boolean; data: Record<string, unknown> | null };
  fields: string[];
}
export type SpacePhase = 'loading' | 'idle' | 'syncing' | 'offline' | 'error' | 'revoked';
export interface SpaceSyncState {
  phase: SpacePhase;
  role: Role | null;
  pending: number;
  conflicts: SpaceConflict[];
  rejected: { store: string; id: string; error: string }[];
  /** Nach Entzug: nicht übertragene eigene Änderungen (nur zum Herunterladen) */
  orphaned: OutboxItem[];
  message?: string;
  revision: number;
  /** Nach Entzug: In dieser Sitzung bestand vorher Zugriff (sonst war das Konto nie Mitglied). */
  hadAccess?: boolean;
}

const k = (store: string, id: string) => `${store}:${id}`;

export class SpaceSession {
  private records = new Map<string, SpaceEntry>();
  /** Zuletzt vom Server bestätigter Inhalt (Basis für den Drei-Wege-Merge) */
  private base = new Map<string, Record<string, unknown> | null>();
  private cursor = '0';
  private outbox = new Map<string, OutboxItem>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private again = false;
  private users = 0;
  state: SpaceSyncState = { phase: 'loading', role: null, pending: 0, conflicts: [], rejected: [], orphaned: [], revision: 0 };

  constructor(
    readonly spaceId: string,
    private readonly accountKey: string,
  ) {
    this.loadOutbox();
  }

  /* ───────────── Lebenszyklus ───────────── */

  retain(): () => void {
    this.users++;
    if (this.users === 1) {
      this.poll = setInterval(() => this.schedule(0), 20_000);
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.wake);
        document.addEventListener('visibilitychange', this.wake);
      }
      this.schedule(0);
    }
    return () => {
      this.users--;
      if (this.users === 0) {
        clearInterval(this.poll);
        clearTimeout(this.timer);
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', this.wake);
          document.removeEventListener('visibilitychange', this.wake);
        }
      }
    };
  }
  private wake = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') this.schedule(0);
  };
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private emit(patch: Partial<SpaceSyncState> = {}) {
    this.state = { ...this.state, ...patch, pending: this.outbox.size, revision: this.state.revision + 1 };
    for (const l of this.listeners) l();
  }
  getState = () => this.state;

  /* ───────────── Lesen ───────────── */

  list(store: SpaceStore): SpaceEntry[] {
    return [...this.records.values()].filter((e) => e.store === store);
  }
  get(store: SpaceStore, id: string): SpaceEntry | undefined {
    return this.records.get(k(store, id));
  }

  /* ───────────── Schreiben (lokal + Warteschlange) ───────────── */

  save(store: SpaceStore, data: Record<string, unknown> & { id: string }): void {
    if (this.state.phase === 'revoked') throw new Error(t('collab.ss.noAccess'));
    const key = k(store, data.id);
    const cur = this.records.get(key);
    const existing = this.outbox.get(key);
    const now = new Date().toISOString();
    const value = { ...data, updatedAt: now, createdAt: (data.createdAt as string) ?? (cur?.data.createdAt as string) ?? now };
    this.outbox.set(key, { store, id: data.id, baseVersion: existing?.baseVersion ?? cur?.version ?? 0, data: value, queuedAt: Date.now() });
    this.records.set(key, { store, id: data.id, version: cur?.version ?? 0, data: value, access: cur?.access ?? 'members', origin: cur?.origin ?? 'created', pending: true, updatedAt: now });
    this.persistOutbox();
    this.emit();
    this.schedule(600);
  }

  remove(store: SpaceStore, id: string): void {
    if (this.state.phase === 'revoked') throw new Error(t('collab.ss.noAccess'));
    const key = k(store, id);
    const cur = this.records.get(key);
    const existing = this.outbox.get(key);
    if (!cur && !existing) return;
    this.outbox.set(key, { store, id, baseVersion: existing?.baseVersion ?? cur?.version ?? 0, deleted: true, queuedAt: Date.now() });
    this.records.delete(key);
    this.persistOutbox();
    this.emit();
    this.schedule(300);
  }

  /** Konflikt bewusst lösen: eigene Version (auf Basis der Serverversion) oder Serverversion. */
  resolve(key: string, choice: 'mine' | 'server'): void {
    const c = this.state.conflicts.find((x) => x.key === key);
    if (!c) return;
    if (choice === 'mine' && c.local) {
      this.outbox.set(key, { store: c.store, id: c.id, baseVersion: c.server.version, data: c.local, queuedAt: Date.now() });
      this.records.set(key, { ...(this.records.get(key) ?? { store: c.store, id: c.id, access: 'members', origin: 'created' }), version: c.server.version, data: c.local, pending: true });
    } else {
      this.outbox.delete(key);
      if (c.server.deleted || !c.server.data) this.records.delete(key);
      else this.records.set(key, { ...(this.records.get(key) ?? { store: c.store, id: c.id, access: 'members', origin: 'created' }), version: c.server.version, data: c.server.data, pending: false });
      this.base.set(key, c.server.data);
    }
    this.persistOutbox();
    this.emit({ conflicts: this.state.conflicts.filter((x) => x.key !== key) });
    this.schedule(0);
  }

  dismissRejected(): void {
    this.emit({ rejected: [] });
  }

  /* ───────────── Synchronisation ───────────── */

  schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), delay);
  }

  async syncNow(): Promise<void> {
    if (this.state.phase === 'revoked') return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    if (this.state.phase !== 'loading') this.emit({ phase: 'syncing' });
    try {
      await this.push();
      await this.pull();
      this.emit({ phase: 'idle', message: undefined });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) this.revoke();
      else if (e instanceof ApiError && e.status === 0) this.emit({ phase: 'offline', message: e.message });
      else this.emit({ phase: 'error', message: e instanceof Error ? e.message : t('collab.ss.failed') });
    } finally {
      this.running = false;
      if (this.again && (this.state.phase as SpacePhase) !== 'revoked') {
        this.again = false;
        this.schedule(200);
      }
    }
  }

  /** Zugriff entzogen: alles verwerfen, eigene unbestätigte Änderungen nur zum Herunterladen behalten. */
  private revoke() {
    const orphaned = [...this.outbox.values()];
    const hadAccess = this.state.role !== null || this.records.size > 0 || orphaned.length > 0;
    this.records.clear();
    this.base.clear();
    this.outbox.clear();
    this.cursor = '0';
    this.persistOutbox();
    this.emit({ phase: 'revoked', role: null, conflicts: [], orphaned, hadAccess, get message() { return t('collab.ss.noAccess2'); } });
  }

  private async pull(): Promise<void> {
    for (let guard = 0; guard < 200; guard++) {
      const page = await collab.changes(this.spaceId, this.cursor);
      if (this.state.role && page.role !== this.state.role) {
        // Rolle geändert → sichtbare Menge kann sich verändert haben: vollständig neu laden
        this.records.clear();
        this.base.clear();
        this.cursor = '0';
        this.emit({ role: page.role });
        continue;
      }
      for (const c of page.changes) this.apply(c);
      this.cursor = page.cursor;
      if (this.state.role !== page.role) this.emit({ role: page.role });
      if (!page.more) break;
    }
  }

  private apply(c: SpaceRemoteChange) {
    const key = k(c.store, c.id);
    if (this.outbox.has(key)) return; // lokale Änderung ausstehend → Push klärt Konflikte
    if (c.deleted || c.hidden || !c.data) {
      this.records.delete(key);
      this.base.delete(key);
      return;
    }
    this.records.set(key, { store: c.store, id: c.id, version: c.version, data: c.data, access: c.access, origin: c.origin, updatedAt: c.updatedAt, updatedBy: c.updatedBy });
    this.base.set(key, c.data);
  }

  private async push(): Promise<void> {
    const items = [...this.outbox.values()].sort((a, b) => a.queuedAt - b.queuedAt);
    if (!items.length) return;
    // Eltern vor Kindern (z. B. Grow vor Pflanze), damit der Server Bezüge prüfen kann
    const order: SpaceStore[] = ['grows', 'strains', 'journal', 'inventory', 'labReports', 'plants', 'activities', 'photos', 'tasks', 'notes'];
    items.sort((a, b) => (a.deleted === b.deleted ? order.indexOf(a.store) - order.indexOf(b.store) : a.deleted ? 1 : -1));
    for (let i = 0; i < items.length; i += 100) {
      const batch = items.slice(i, i + 100);
      let res;
      try {
        res = await collab.push(
          this.spaceId,
          batch.map((x) => ({ store: x.store, id: x.id, baseVersion: x.baseVersion, ...(x.deleted ? { deleted: true } : { data: x.data }) })),
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          // Rolle ohne Schreibrecht (z. B. gerade auf „Ansehen“ gesetzt): nicht endlos wiederholen
          for (const x of batch) this.outbox.delete(k(x.store, x.id));
          this.persistOutbox();
          this.emit({ rejected: [...this.state.rejected, ...batch.map((x) => ({ store: x.store, id: x.id, error: e.message }))], message: e.message });
          this.records.clear();
          this.base.clear();
          this.cursor = '0';
          return;
        }
        throw e;
      }
      const conflicts = [...this.state.conflicts];
      const rejected = [...this.state.rejected];
      for (const r of res.results) {
        const key = k(r.store, r.id);
        const sent = this.outbox.get(key);
        if (!sent) continue;
        const stillSame = batch.find((b) => k(b.store, b.id) === key)?.queuedAt === sent.queuedAt;
        if (r.status === 'ok' || r.status === 'unchanged') {
          const cur = this.records.get(key);
          if (stillSame) {
            this.outbox.delete(key);
            if (cur) this.records.set(key, { ...cur, version: r.version, pending: false });
            this.base.set(key, sent.deleted ? null : (sent.data ?? null));
          } else {
            sent.baseVersion = r.version;
            if (cur) this.records.set(key, { ...cur, version: r.version });
          }
        } else if (r.status === 'conflict') {
          const m = !sent.deleted && !r.server.deleted ? merge3(this.base.get(key) ?? undefined, sent.data, r.server.data) : { ok: false, conflicts: ['(gesamt)'] };
          if (m.ok && m.merged) {
            this.outbox.set(key, { ...sent, baseVersion: r.server.version, data: m.merged as Record<string, unknown>, queuedAt: Date.now() });
            const cur = this.records.get(key);
            if (cur) this.records.set(key, { ...cur, version: r.server.version, data: m.merged as Record<string, unknown> });
            this.base.set(key, r.server.data);
            this.again = true;
          } else {
            this.outbox.delete(key);
            conflicts.push({ key, store: sent.store, id: sent.id, local: sent.deleted ? null : (sent.data ?? null), server: r.server, fields: m.conflicts });
          }
        } else {
          this.outbox.delete(key);
          rejected.push({ store: r.store, id: r.id, error: r.error });
          // Lokale Vorschau verwerfen – der Serverstand gilt
          this.records.delete(key);
          this.base.delete(key);
          this.cursor = '0';
        }
      }
      this.persistOutbox();
      this.emit({ conflicts, rejected });
    }
  }

  /* ───────────── Warteschlange (kontobezogen) ───────────── */

  private get storageKey() {
    return `terpgrid.u.${this.accountKey}.spaceOutbox.${this.spaceId}`;
  }
  private loadOutbox() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      for (const x of JSON.parse(raw) as OutboxItem[]) this.outbox.set(k(x.store, x.id), x);
    } catch {
      /* ignorieren */
    }
  }
  private persistOutbox() {
    try {
      if (this.outbox.size) localStorage.setItem(this.storageKey, JSON.stringify([...this.outbox.values()]));
      else localStorage.removeItem(this.storageKey);
    } catch {
      /* Speicher voll/gesperrt: Änderungen bleiben im Arbeitsspeicher */
    }
  }
}

const sessions = new Map<string, SpaceSession>();
export function spaceSession(accountKey: string, spaceId: string): SpaceSession {
  const key = `${accountKey}:${spaceId}`;
  let s = sessions.get(key);
  if (!s) {
    s = new SpaceSession(spaceId, accountKey);
    sessions.set(key, s);
  }
  return s;
}
/** Sitzung eines Bereichs verwerfen (z. B. nach erneuter Aufnahme) – nächster Zugriff lädt neu. */
export function forgetSpaceSession(accountKey: string, spaceId: string): void {
  sessions.delete(`${accountKey}:${spaceId}`);
}
/** Beim Abmelden/Kontowechsel alle Bereichssitzungen verwerfen. */
export function resetSpaceSessions(): void {
  sessions.clear();
}

/** Neue, kollisionsfreie ID für Einträge in Bereichen. */
export const newSpaceId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
