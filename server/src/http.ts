import type { FastifyReply, FastifyRequest } from 'fastify';
import { safeEqual } from './crypto.js';
import { type SessionInfo, reauthValid } from './sessions.js';
import type { AppContext } from './context.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    session: SessionInfo | null;
  }
}

export function requireSession(req: FastifyRequest): SessionInfo {
  if (!req.session) throw new HttpError(401, 'Nicht angemeldet');
  return req.session;
}

export function requireReauth(ctx: AppContext, req: FastifyRequest): SessionInfo {
  const s = requireSession(req);
  if (!reauthValid(ctx, s)) throw new HttpError(403, 'Bitte bestätige diese Aktion mit deinem Passwort.', { reauthRequired: true });
  return s;
}

export function requireAdmin(req: FastifyRequest): SessionInfo {
  const s = requireSession(req);
  if (s.role !== 'admin') throw new HttpError(403, 'Keine Berechtigung');
  return s;
}

export function throttle(retryAfter: number, message = 'Zu viele Versuche. Bitte später erneut versuchen.'): never {
  throw new HttpError(429, message, { retryAfter }, retryAfter);
}

/** Prüft das CSRF-Token (Synchronizer-Token) in konstanter Zeit. */
export function csrfValid(req: FastifyRequest): boolean {
  const s = req.session;
  const header = req.headers['x-csrf-token'];
  return !!s && typeof header === 'string' && safeEqual(header, s.csrfToken);
}

export function sendError(reply: FastifyReply, e: HttpError) {
  if (e.retryAfter) reply.header('Retry-After', String(e.retryAfter));
  return reply.code(e.status).send({ error: e.message, ...e.extra });
}
