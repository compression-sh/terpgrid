/**
 * Fastify-App: Sicherheits-Hooks, Session-Laden, CSRF/Origin-Prüfung,
 * Fehlerbehandlung ohne Detailpreisgabe, Routen-Registrierung.
 */
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { HttpError, csrfValid, sendError } from './http.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { fileRoutes } from './routes/files.js';
import { syncRoutes } from './routes/sync.js';
import { loadSession, sessionCookieName } from './sessions.js';

/** Entfernt Query-Strings und Geheimnisse im Pfad (Einladungs-Token) aus Log-Ausgaben. */
export function redactUrl(url: string): string {
  return url.split('?')[0]!.replace(/^\/api\/auth\/invite\/[^/]+/, '/api/auth/invite/[geschwärzt]');
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Schreibende Endpunkte ohne Session (Login etc.) – nur mit Origin-Prüfung + Custom-Header */
const PRE_AUTH = new Set(['/api/auth/login', '/api/auth/login/mfa', '/api/auth/register', '/api/auth/recover']);

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: ctx.config.trustProxy,
    // Unbekannte Felder ablehnen statt stillschweigend entfernen
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
    bodyLimit: 1024 * 1024,
    requestTimeout: 30_000,
    connectionTimeout: 30_000,
    disableRequestLogging: ctx.config.env === 'test',
    logger:
      ctx.config.env === 'test'
        ? false
        : {
            level: ctx.config.env === 'production' ? 'info' : 'debug',
            // Keine Zugangsdaten, Cookies oder Tokens in Logs
            redact: { paths: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'req.headers.authorization', 'res.headers["set-cookie"]'], remove: true },
            serializers: {
              // Ohne Query-String; Einladungs-Token im Pfad wird geschwärzt
              req: (r) => ({ method: r.method, url: redactUrl(r.url as string), ip: undefined }),
            },
          },
  });

  await app.register(cookie);
  app.decorateRequest('session', null);

  // Rohdaten-Uploads (Fotos/Dokumente)
  app.addContentTypeParser(['application/octet-stream', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'], { parseAs: 'buffer', bodyLimit: ctx.config.maxUploadBytes }, (_req, body, done) => done(null, body));

  app.addHook('onRequest', async (req, reply) => {
    // Sicherheits-Header für alle API-Antworten (Caddy ergänzt CSP/HSTS)
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Cache-Control', 'no-store');

    if (!req.url.startsWith('/api/')) return;
    // API-Antworten (JSON, Dateien, Proxy-Bilder) werden nie als Dokument mit Skripten ausgeführt
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
    const limited = ctx.limits.api.take(`ip:${req.ip}`);
    if (limited) return sendError(reply, new HttpError(429, 'Zu viele Anfragen', { retryAfter: limited }, limited));

    req.session = await loadSession(ctx, req.cookies[sessionCookieName(ctx)]);

    if (SAFE_METHODS.has(req.method)) return;
    // Origin muss zur eigenen Instanz gehören (Browser senden Origin bei POST/PUT/PATCH/DELETE)
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== ctx.config.publicOrigin) return sendError(reply, new HttpError(403, 'Ungültige Herkunft der Anfrage'));
    const path = req.url.split('?')[0]!;
    if (PRE_AUTH.has(path)) {
      // Custom-Header erzwingt bei fremden Origins einen (abgelehnten) CORS-Preflight
      if (req.headers['x-requested-with'] !== 'terpgrid') return sendError(reply, new HttpError(403, 'Ungültige Anfrage'));
      return;
    }
    if (req.session && !csrfValid(req)) return sendError(reply, new HttpError(403, 'Sicherheitstoken ungültig – bitte Seite neu laden.'));
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof HttpError) return sendError(reply, err);
    const e = err as { statusCode?: number; validation?: unknown; code?: string; name?: string; message?: string };
    if (e.validation) return reply.code(400).send({ error: 'Ungültige Eingabe' });
    if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: 'Datei oder Anfrage zu groß' });
    if (e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(415).send({ error: 'Nicht unterstützter Inhaltstyp' });
    if (e.name === 'BusyError') return reply.code(503).header('Retry-After', '5').send({ error: 'Server ausgelastet – bitte gleich erneut versuchen.' });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'Ungültige Anfrage' });
    ctx.errors.count++;
    ctx.errors.last = new Date().toISOString();
    req.log.error({ err: { name: e.name, code: e.code, message: e.message?.slice(0, 200) } }, 'Unerwarteter Fehler');
    return reply.code(500).send({ error: 'Interner Fehler' });
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Nicht gefunden' }));

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/health/ready', async (_req, reply) => {
    try {
      await ctx.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  await app.register(authRoutes(ctx));
  await app.register(accountRoutes(ctx));
  await app.register(syncRoutes(ctx));
  await app.register(fileRoutes(ctx));
  await app.register(catalogRoutes(ctx));
  await app.register(adminRoutes(ctx));
  return app;
}
