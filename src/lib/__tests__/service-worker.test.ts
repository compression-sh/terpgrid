import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

const sw = readFileSync(resolve(__dirname, '../../../public/sw.js'), 'utf8');
const vite = readFileSync(resolve(__dirname, '../../../vite.config.ts'), 'utf8');

describe('Service Worker', () => {
  it('speichert die gehashten Assets vorab (Platzhalter wird beim Build ersetzt)', () => {
    expect(sw).toContain('[/*__TERPGRID_PRECACHE__*/]');
    expect(vite).toContain("'/*__TERPGRID_PRECACHE__*/'");
  });
  it('cacht nie private Pfade und ignoriert Vary nur für öffentliche Dateien', () => {
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)/);
    expect(sw).toMatch(/if \(isPrivate\(url\)\) return;/);
    expect(sw.match(/ignoreVary: true/g)?.length).toBe(2);
  });
  it('der Platzhalter ist auch unersetzt gültiges JavaScript (nur kompiliert, nicht ausgeführt)', () => {
    expect(() => new Script(sw)).not.toThrow();
  });
});

/** Führt den Service Worker in einer Sandbox mit nachgebildeten Browser-APIs aus. */
function runSw() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const calls = { skipWaiting: 0, puts: [] as string[] };
  const cacheStore = new Map<string, Response>();
  const cache = {
    addAll: async () => {},
    add: async () => {},
    put: async (req: Request | string, res: Response) => {
      const u = typeof req === 'string' ? req : req.url;
      calls.puts.push(u);
      cacheStore.set(u, res);
    },
  };
  const ctx = {
    URL,
    Response,
    Promise,
    self: {
      registration: { scope: 'https://app.example/' },
      addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
      skipWaiting: () => void calls.skipWaiting++,
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async (u: string | Request) => cacheStore.get(typeof u === 'string' ? u : u.url),
    },
    fetch: async (): Promise<Response> => {
      throw new TypeError('offline');
    },
  };
  new Script(sw).runInNewContext(ctx);
  return { handlers, calls, ctx, cacheStore };
}

describe('Service-Worker-Lebenszyklus (PWA 3.0)', () => {
  it('aktiviert Updates nicht automatisch, sondern erst nach SKIP_WAITING', async () => {
    const { handlers, calls } = runSw();
    let wait: Promise<unknown> = Promise.resolve();
    handlers.install!({ waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect(calls.skipWaiting).toBe(0);
    handlers.message!({ data: { type: 'SKIP_WAITING' }, ports: [] });
    expect(calls.skipWaiting).toBe(1);
  });
  it('fängt API-Anfragen und fremde Origins nicht ab', () => {
    const { handlers } = runSw();
    for (const url of ['https://app.example/api/records', 'https://other.example/x.js']) {
      let responded = false;
      handlers.fetch!({ request: { method: 'GET', url, mode: 'cors' }, respondWith: () => (responded = true) });
      expect(responded).toBe(false);
    }
  });
  it('zeigt offline ohne gecachte Hülle eine deutsche Offline-Seite', async () => {
    const { handlers } = runSw();
    let res: Promise<Response> | undefined;
    handlers.fetch!({ request: { method: 'GET', url: 'https://app.example/', mode: 'navigate' }, respondWith: (p: Promise<Response>) => (res = p) });
    const r = await res!;
    expect(await r.text()).toContain('Keine Verbindung');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  const basic = (headers: Record<string, string>) => {
    const r = new Response('x', { headers });
    Object.defineProperty(r, 'type', { value: 'basic' });
    return r;
  };
  async function fetchAsset(headers: Record<string, string>) {
    const env = runSw();
    env.ctx.fetch = async () => basic(headers);
    let res: Promise<Response> | undefined;
    env.handlers.fetch!({ request: { method: 'GET', url: 'https://app.example/assets/a.js', mode: 'no-cors' }, respondWith: (p: Promise<Response>) => (res = p) });
    await res;
    await new Promise((r) => setTimeout(r, 0));
    return env.calls.puts;
  }
  it('legt öffentliche Dateien ab, Antworten mit no-store/private nie', async () => {
    expect(await fetchAsset({ 'Cache-Control': 'public, max-age=31536000, immutable' })).toEqual(['https://app.example/assets/a.js']);
    expect(await fetchAsset({ 'Cache-Control': 'private, max-age=60' })).toEqual([]);
    expect(await fetchAsset({ 'Cache-Control': 'no-store' })).toEqual([]);
  });
});
