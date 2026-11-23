import { catalogCredentials } from './endpoint';
import { CatalogError, type RateInfo } from './types';

/**
 * Höflicher HTTP-Client für öffentliche APIs:
 * - begrenzte Parallelität und Mindestabstand je Host
 * - Abbruch über AbortSignal (veraltete Suchanfragen)
 * - 429/Retry-After wird respektiert (Host wird bis dahin gesperrt)
 * - keine Cookies, kein Referrer
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface HostState {
  active: number;
  queue: (() => void)[];
  lastStart: number;
  blockedUntil: number;
}

export interface HttpOptions {
  maxConcurrent?: number;
  minIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
}

export class PoliteClient {
  private hosts = new Map<string, HostState>();
  private readonly maxConcurrent: number;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  lastRate: RateInfo = {};

  constructor(opts: HttpOptions = {}) {
    this.maxConcurrent = opts.maxConcurrent ?? 2;
    this.minIntervalMs = opts.minIntervalMs ?? 250;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.fetchImpl = opts.fetchImpl ?? ((i, init) => fetch(i, init));
    this.now = opts.now ?? (() => Date.now());
  }

  private host(url: string): HostState {
    const h = new URL(url).host;
    let s = this.hosts.get(h);
    if (!s) {
      s = { active: 0, queue: [], lastStart: 0, blockedUntil: 0 };
      this.hosts.set(h, s);
    }
    return s;
  }

  blockedFor(url: string): number {
    return Math.max(0, Math.ceil((this.host(url).blockedUntil - this.now()) / 1000));
  }

  private async acquire(s: HostState, signal?: AbortSignal): Promise<void> {
    if (s.active >= this.maxConcurrent) {
      await new Promise<void>((resolve, reject) => {
        const go = () => resolve();
        s.queue.push(go);
        signal?.addEventListener('abort', () => {
          s.queue = s.queue.filter((q) => q !== go);
          reject(new CatalogError('Anfrage abgebrochen', 'aborted'));
        });
      });
    }
    s.active++;
    const wait = s.lastStart + this.minIntervalMs - this.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    s.lastStart = this.now();
  }

  private release(s: HostState) {
    s.active--;
    s.queue.shift()?.();
  }

  async getJson<T>(url: string, opts: { signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<{ data: T; headers: Headers }> {
    const s = this.host(url);
    const blocked = this.blockedFor(url);
    if (blocked > 0) throw new CatalogError(`Anfragelimit erreicht – bitte in ${blocked} s erneut versuchen.`, 'rate_limited', blocked);
    if (opts.signal?.aborted) throw new CatalogError('Anfrage abgebrochen', 'aborted');
    await this.acquire(s, opts.signal);
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json', ...opts.headers },
          credentials: catalogCredentials(),
          referrerPolicy: 'no-referrer',
          mode: 'cors',
          signal: ctrl.signal,
        });
      } catch (e) {
        if (opts.signal?.aborted) throw new CatalogError('Anfrage abgebrochen', 'aborted');
        if (ctrl.signal.aborted) throw new CatalogError('Zeitüberschreitung – die Quelle antwortet nicht.', 'offline');
        throw new CatalogError('Keine Verbindung zur Datenquelle (offline oder blockiert).', 'offline');
      }
      this.lastRate = readRate(res.headers);
      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After')) || this.lastRate.resetSeconds || 60;
        s.blockedUntil = this.now() + retry * 1000;
        throw new CatalogError(`Anfragelimit der Quelle erreicht – bitte in ${retry} s erneut versuchen.`, 'rate_limited', retry);
      }
      if (res.status === 404) throw new CatalogError('Eintrag nicht gefunden.', 'not_found');
      if (res.status === 400) throw new CatalogError('Ungültige Anfrage.', 'bad_request');
      if (!res.ok) throw new CatalogError(`Die Quelle meldet einen Fehler (HTTP ${res.status}).`, 'server');
      let data: T;
      try {
        data = (await res.json()) as T;
      } catch {
        throw new CatalogError('Unerwartete Antwort der Quelle.', 'invalid_response');
      }
      if (this.lastRate.remaining === 0 && this.lastRate.resetSeconds) s.blockedUntil = this.now() + this.lastRate.resetSeconds * 1000;
      return { data, headers: res.headers };
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      this.release(s);
    }
  }
}

function num(h: Headers, k: string): number | undefined {
  const v = h.get(k);
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function readRate(h: Headers): RateInfo {
  return {
    limit: num(h, 'X-RateLimit-Limit'),
    remaining: num(h, 'X-RateLimit-Remaining'),
    dailyRemaining: num(h, 'X-RateLimit-Daily-Remaining'),
    resetSeconds: num(h, 'X-RateLimit-Reset'),
  };
}
