import { cannalibBase } from './endpoint';
/**
 * Katalog-Service: verbindet Provider-Adapter, höflichen HTTP-Client und
 * lokalen API-Cache (IndexedDB, Store `apiCache`).
 *
 * Cache-Strategie (laut StrainAPI-Bedingungen „angemessenes Caching“):
 * - frisch: Listen/Suche 30 Min., Details 6 Std. → keine erneute Anfrage
 * - veraltet, aber ≤ 7 Tage: nur als Offline-/Fehler-Fallback (gekennzeichnet)
 * - ältere Einträge werden entfernt; max. 400 Einträge
 * CannaLib-Daten werden nur im Arbeitsspeicher gehalten (Quelle sendet `no-store`).
 */
import { getAll, getOne, openDatabase, writeBatch } from '../db/database';
import * as CL from './cannalib';
import { PoliteClient } from './http';
import * as SA from './strainapi';
import { CatalogError, type CatalogPage, type CatalogStrain, type RateInfo, type ResearchMatch, type ResearchProfile } from './types';

const MIN = 60_000;
export const TTL = { list: 30 * MIN, detail: 6 * 60 * MIN, stale: 7 * 24 * 60 * MIN };
const MAX_ENTRIES = 400;

export interface CatalogDeps {
  strainapi?: PoliteClient;
  cannalib?: PoliteClient;
  now?: () => number;
  /** Online-Abrufe erlaubt? (Einstellung „Online-Sortendaten“) */
  online?: () => boolean;
}

interface Cached<T> {
  data: T;
  fetchedAt: string;
  fresh: boolean;
}

export class CatalogService {
  readonly sa: PoliteClient;
  readonly cl: PoliteClient;
  private now: () => number;
  private online: () => boolean;
  private memory = new Map<string, { at: number; data: unknown }>();
  cannalibRate: RateInfo = {};

  constructor(deps: CatalogDeps = {}) {
    this.sa = deps.strainapi ?? new PoliteClient({ maxConcurrent: 2, minIntervalMs: 200 });
    this.cl = deps.cannalib ?? new PoliteClient({ maxConcurrent: 1, minIntervalMs: 1500, timeoutMs: 30000 });
    this.now = deps.now ?? (() => Date.now());
    this.online = deps.online ?? (() => true);
  }

  setOnline(fn: () => boolean) {
    this.online = fn;
  }

  /* ───── Cache ───── */

  private async readCache<T>(key: string, ttl: number): Promise<Cached<T> | undefined> {
    try {
      const row = await getOne('apiCache', key);
      if (!row) return undefined;
      const age = this.now() - Date.parse(row.fetchedAt);
      if (!(age >= 0) || age > TTL.stale) return undefined;
      return { data: row.data as T, fetchedAt: row.fetchedAt, fresh: age <= ttl };
    } catch {
      return undefined;
    }
  }

  private async writeCache(key: string, data: unknown): Promise<string> {
    const fetchedAt = new Date(this.now()).toISOString();
    try {
      await writeBatch({ put: { apiCache: [{ key, fetchedAt, data }] } });
    } catch {
      /* Cache ist optional */
    }
    return fetchedAt;
  }

  /** Entfernt abgelaufene bzw. überzählige Cache-Einträge. */
  async pruneCache(): Promise<number> {
    try {
      await openDatabase();
      const rows = await getAll('apiCache');
      const cutoff = this.now() - TTL.stale;
      const sorted = [...rows].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
      const remove = sorted.filter((r, i) => Date.parse(r.fetchedAt) < cutoff || i >= MAX_ENTRIES).map((r) => r.key);
      if (remove.length) await writeBatch({ delete: { apiCache: remove } });
      return remove.length;
    } catch {
      return 0;
    }
  }

  async clearCache(): Promise<void> {
    this.memory.clear();
    await writeBatch({ clear: ['apiCache'] });
  }

  async cacheInfo(): Promise<{ entries: number; oldest?: string; newest?: string }> {
    const rows = await getAll('apiCache');
    const dates = rows.map((r) => r.fetchedAt).sort();
    return { entries: rows.length, oldest: dates[0], newest: dates.at(-1) };
  }

  /**
   * Generischer Abruf mit Cache: frischer Cache → sofort; sonst Netzwerk;
   * bei Netzwerkfehler (offline, Limit, Serverfehler) → veralteter Cache, falls vorhanden.
   */
  private async cachedFetch<Raw, T>(key: string, url: string, ttl: number, signal: AbortSignal | undefined, map: (raw: Raw, headers: Headers | undefined, fromCache: boolean, fetchedAt: string) => T): Promise<T> {
    const cached = await this.readCache<{ raw: Raw; headers?: Record<string, string> }>(key, ttl);
    const hdrs = (h?: Record<string, string>) => (h ? new Headers(h) : undefined);
    if (cached?.fresh) return map(cached.data.raw, hdrs(cached.data.headers), false, cached.fetchedAt);
    if (!this.online()) {
      if (cached) return map(cached.data.raw, hdrs(cached.data.headers), true, cached.fetchedAt);
      throw new CatalogError('Online-Sortendaten sind in den Einstellungen deaktiviert.', 'offline');
    }
    try {
      const { data, headers } = await this.sa.getJson<Raw>(url, { signal });
      const keep: Record<string, string> = {};
      for (const h of ['X-WP-Total', 'X-WP-TotalPages']) {
        const v = headers.get(h);
        if (v) keep[h] = v;
      }
      const result = map(data, headers, false, new Date(this.now()).toISOString());
      const fetchedAt = await this.writeCache(key, { raw: data, headers: keep });
      void fetchedAt;
      return result;
    } catch (e) {
      if (e instanceof CatalogError && e.kind === 'aborted') throw e;
      if (cached && e instanceof CatalogError && e.kind !== 'not_found' && e.kind !== 'bad_request') {
        return map(cached.data.raw, hdrs(cached.data.headers), true, cached.fetchedAt);
      }
      throw e;
    }
  }

  /* ───── StrainAPI ───── */

  list(page: number, perPage = 24, signal?: AbortSignal): Promise<CatalogPage> {
    return this.cachedFetch(`sa:list:${page}:${perPage}`, SA.listUrl(page, perPage), TTL.list, signal, (raw, h, fromCache, at) => SA.normalizeCollection(raw, h, fromCache, at));
  }

  search(q: string, page = 1, perPage = 24, signal?: AbortSignal): Promise<CatalogPage> {
    const query = q.trim();
    if (!query) return this.list(page, perPage, signal);
    return this.cachedFetch(`sa:search:${query.toLowerCase()}:${page}:${perPage}`, SA.searchUrl(query, page, perPage), TTL.list, signal, (raw, h, fromCache, at) =>
      SA.normalizeCollection(raw, h, fromCache, at),
    );
  }

  detail(slug: string, signal?: AbortSignal): Promise<{ strain: CatalogStrain; fromCache: boolean; fetchedAt: string }> {
    return this.cachedFetch(`sa:detail:${slug}`, SA.detailUrl(slug), TTL.detail, signal, (raw: { data?: SA.RawStrain }, _h, fromCache, fetchedAt) => {
      const s = raw && typeof raw === 'object' && raw.data ? SA.normalizeStrain(raw.data, true) : undefined;
      if (!s) throw new CatalogError('Unerwartete Antwort von StrainAPI.', 'invalid_response');
      return { strain: s, fromCache, fetchedAt };
    });
  }

  /**
   * Lädt den vollständigen Katalog seitenweise (100 je Anfrage, nacheinander),
   * damit Filter ohne API-Unterstützung auf der GESAMTEN Menge laufen können.
   * Nur auf ausdrücklichen Wunsch des Nutzers.
   */
  async loadAll(onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<{ items: CatalogStrain[]; total: number; fromCache: boolean; fetchedAt: string }> {
    const first = await this.list(1, 100, signal);
    const items = [...first.items];
    let fromCache = first.fromCache;
    let oldest = first.fetchedAt;
    onProgress?.(items.length, first.total);
    for (let p = 2; p <= first.totalPages; p++) {
      const page = await this.list(p, 100, signal);
      items.push(...page.items);
      fromCache ||= page.fromCache;
      if (page.fetchedAt < oldest) oldest = page.fetchedAt;
      onProgress?.(items.length, first.total);
    }
    const unique = [...new Map(items.map((i) => [i.key, i])).values()];
    return { items: unique, total: first.total, fromCache, fetchedAt: oldest };
  }

  /**
   * Exakte Namenssuche (für Abstammungsauflösung). Liefert alle Treffer mit
   * identischem normalisiertem Namen – gleichnamige Sorten verschiedener
   * Breeder werden NICHT zusammengeführt.
   */
  async findExact(name: string, signal?: AbortSignal): Promise<CatalogStrain[]> {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const page = await this.search(name, 1, 50, signal);
    return page.items.filter((i) => norm(i.name) === norm(name));
  }

  /* ───── CannaLib (nur Arbeitsspeicher) ───── */

  private mem<T>(key: string): T | undefined {
    const hit = this.memory.get(key);
    if (hit && this.now() - hit.at < TTL.detail) return hit.data as T;
    return undefined;
  }

  async researchSearch(name: string, signal?: AbortSignal): Promise<ResearchMatch[]> {
    if (!this.online()) throw new CatalogError('Online-Abrufe sind deaktiviert.', 'offline');
    const key = `cl:search:${name.toLowerCase()}`;
    const hit = this.mem<ResearchMatch[]>(key);
    if (hit) return hit;
    try {
      const { data } = await this.cl.getJson<unknown>(CL.searchUrl(name), { signal });
      const res = CL.normalizeSearch(data);
      this.memory.set(key, { at: this.now(), data: res });
      return res;
    } finally {
      this.cannalibRate = this.cl.lastRate;
    }
  }

  async researchDetail(id: string, signal?: AbortSignal): Promise<ResearchProfile> {
    if (!this.online()) throw new CatalogError('Online-Abrufe sind deaktiviert.', 'offline');
    const key = `cl:detail:${id}`;
    const hit = this.mem<ResearchProfile>(key);
    if (hit) return hit;
    try {
      const { data } = await this.cl.getJson<unknown>(CL.detailUrl(id), { signal });
      const res = CL.normalizeDetail(data, new Date(this.now()).toISOString());
      this.memory.set(key, { at: this.now(), data: res });
      return res;
    } finally {
      this.cannalibRate = this.cl.lastRate;
    }
  }

  cannalibBlockedFor(): number {
    return this.cl.blockedFor(cannalibBase());
  }
}

/** App-weite Instanz. */
export const catalog = new CatalogService();
