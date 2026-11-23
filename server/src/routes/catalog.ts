/**
 * Fester Proxy für öffentliche Sortendaten (StrainAPI, CannaLib).
 * - Nur feste Zielhosts und Pfadmuster (kein SSRF: Ziel-URL wird nie frei übernommen)
 * - Keine Cookies/Benutzerdaten an Anbieter, keine Weiterleitungen, Größen- und Zeitlimits
 * - Nur für angemeldete Benutzer (verhindert offenen Proxy)
 * - Kurzer In-Memory-Cache reduziert Last bei den Anbietern
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../context.js';
import { HttpError, requireSession, throttle } from '../http.js';
import fp from '../plugin.js';
import { WindowLimiter } from '../ratelimit.js';

const STRAINAPI = 'https://www.strainapi.com/wp-json/strainapi/v1';
const CANNALIB = 'https://api.cannalib.org';
const MAX_JSON = 2 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const PASS_HEADERS = ['x-wp-total', 'x-wp-totalpages', 'retry-after', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;
const IMG_PATH_RE = /^\/wp-content\/uploads\/[A-Za-z0-9/_.%-]{1,300}\.(?:jpe?g|png|webp)$/i;

interface Cached {
  at: number;
  status: number;
  type: string;
  headers: Record<string, string>;
  body: Buffer;
}

class Lru {
  private m = new Map<string, Cached>();
  constructor(
    private readonly max: number,
    private readonly ttl: number,
  ) {}
  get(k: string): Cached | undefined {
    const v = this.m.get(k);
    if (!v) return undefined;
    if (Date.now() - v.at > this.ttl) {
      this.m.delete(k);
      return undefined;
    }
    this.m.delete(k);
    this.m.set(k, v);
    return v;
  }
  set(k: string, v: Cached) {
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value!);
  }
}

async function readLimited(res: Response, max: number): Promise<Buffer> {
  const len = Number(res.headers.get('content-length'));
  if (len && len > max) throw new HttpError(502, 'Antwort der Quelle zu groß');
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(502, 'Antwort der Quelle zu groß');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
};

export function catalogRoutes(ctx: AppContext) {
  const json = new Lru(300, 10 * 60_000);
  const images = new Lru(200, 60 * 60_000);
  // CannaLib erlaubt anonym ca. 20 Anfragen/Std. – gemeinsam für die ganze Instanz
  const cannalibLimit = new WindowLimiter(18, 60 * 60_000);
  const userLimit = new WindowLimiter(300, 15 * 60_000);

  async function proxy(reply: FastifyReply, url: string, kind: 'json' | 'image', userId: string, onFetch?: () => void) {
    const cache = kind === 'json' ? json : images;
    const hit = cache.get(url);
    if (!hit) {
      const wait = userLimit.take(userId);
      if (wait) throttle(wait);
      onFetch?.();
    }
    const entry =
      hit ??
      (await (async () => {
        let res: Response;
        try {
          res = await ctx.fetchImpl(url, {
            method: 'GET',
            redirect: 'error',
            headers: { Accept: kind === 'json' ? 'application/json' : 'image/*', 'User-Agent': 'TERPGRID self-hosted' },
            signal: AbortSignal.timeout(15_000),
          });
        } catch {
          throw new HttpError(502, 'Quelle nicht erreichbar');
        }
        const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
        if (kind === 'image' && (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type))) throw new HttpError(502, 'Bild nicht verfügbar');
        if (kind === 'json' && res.ok && type !== 'application/json') throw new HttpError(502, 'Unerwartete Antwort der Quelle');
        const body = await readLimited(res, kind === 'json' ? MAX_JSON : MAX_IMAGE);
        const headers: Record<string, string> = {};
        for (const h of PASS_HEADERS) {
          const v = res.headers.get(h);
          if (v && /^[\w .:,-]{1,40}$/.test(v)) headers[h] = v;
        }
        const e: Cached = { at: Date.now(), status: res.status, type: kind === 'json' ? 'application/json' : type, headers, body };
        if (res.ok) cache.set(url, e);
        return e;
      })());
    for (const [k, v] of Object.entries(entry.headers)) reply.header(k, v);
    reply.header('Cache-Control', kind === 'image' ? 'private, max-age=3600' : 'no-store');
    if (entry.status >= 500) return reply.code(502).send({ error: 'Quelle meldet einen Fehler' });
    return reply.code(entry.status === 429 ? 429 : entry.status >= 400 ? 404 : 200).type(entry.type).send(entry.body);
  }

  return fp(async (app: FastifyInstance) => {
    app.addHook('onRequest', async (req) => {
      if (req.url.startsWith('/api/catalog/') && !ctx.config.catalogEnabled) throw new HttpError(404, 'Nicht gefunden');
    });

    app.get<{ Querystring: { page?: string; per_page?: string } }>('/api/catalog/strainapi/strains', async (req, reply) => {
      const s = requireSession(req);
      return proxy(reply, `${STRAINAPI}/strains?page=${int(req.query.page, 1, 1, 10_000)}&per_page=${int(req.query.per_page, 24, 1, 100)}`, 'json', s.userId);
    });

    app.get<{ Querystring: { q?: string; page?: string; per_page?: string } }>('/api/catalog/strainapi/search', async (req, reply) => {
      const s = requireSession(req);
      const q = String(req.query.q ?? '').trim().slice(0, 80);
      if (!q) throw new HttpError(400, 'Suchbegriff fehlt');
      return proxy(reply, `${STRAINAPI}/search?q=${encodeURIComponent(q)}&page=${int(req.query.page, 1, 1, 10_000)}&per_page=${int(req.query.per_page, 24, 1, 100)}`, 'json', s.userId);
    });

    app.get<{ Params: { slug: string } }>('/api/catalog/strainapi/strains/:slug', async (req, reply) => {
      const s = requireSession(req);
      if (!SLUG_RE.test(req.params.slug)) throw new HttpError(400, 'Ungültige Sortenkennung');
      return proxy(reply, `${STRAINAPI}/strains/${req.params.slug}`, 'json', s.userId);
    });

    const cannalib = () => () => {
      const wait = cannalibLimit.take('global');
      if (wait) throttle(wait, 'Das gemeinsame CannaLib-Kontingent dieser Instanz ist erschöpft.');
    };

    app.get<{ Querystring: { q?: string } }>('/api/catalog/cannalib/v1/catalogs/strains', async (req, reply) => {
      const s = requireSession(req);
      const q = String(req.query.q ?? '').trim().slice(0, 80);
      if (!q) throw new HttpError(400, 'Suchbegriff fehlt');
      const url = `${CANNALIB}/v1/catalogs/strains?q=${encodeURIComponent(q)}`;
      return proxy(reply, url, 'json', s.userId, cannalib());
    });

    app.get<{ Params: { id: string } }>('/api/catalog/cannalib/v1/catalogs/strains/:id', async (req, reply) => {
      const s = requireSession(req);
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.id)) throw new HttpError(400, 'Ungültige Kennung');
      const url = `${CANNALIB}/v1/catalogs/strains/${req.params.id}`;
      return proxy(reply, url, 'json', s.userId, cannalib());
    });

    app.get<{ Querystring: { u?: string } }>('/api/catalog/image', async (req, reply) => {
      const s = requireSession(req);
      let u: URL;
      try {
        u = new URL(String(req.query.u ?? ''));
      } catch {
        throw new HttpError(400, 'Ungültige Bildadresse');
      }
      if (u.protocol !== 'https:' || !['www.strainapi.com', 'strainapi.com'].includes(u.hostname) || u.port || u.username || u.password || u.search || u.hash || !IMG_PATH_RE.test(u.pathname) || u.pathname.includes('..')) {
        throw new HttpError(400, 'Bildadresse nicht erlaubt');
      }
      return proxy(reply, `https://www.strainapi.com${u.pathname}`, 'image', s.userId);
    });
  });
}
