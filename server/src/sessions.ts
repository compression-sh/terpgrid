/**
 * Serverseitige Sessions mit opaken 256-Bit-Tokens.
 * In der DB liegt nur SHA-256(token). Idle- und absolutes Timeout, Rotation
 * nach Login und Rechteänderungen, Widerruf einzeln oder gesamt.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { type AppContext, ipTag } from './context.js';
import { randomToken, sha256 } from './crypto.js';
import type { Tx } from './db.js';

export interface SessionInfo {
  id: Buffer;
  handle: string;
  userId: string;
  csrfToken: string;
  reauthAt: Date | null;
  createdAt: Date;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  loginName: string;
  loginKind: 'username' | 'generated';
  displayName: string | null;
  totpEnabled: boolean;
}

export const sessionCookieName = (ctx: AppContext) => (ctx.config.cookieSecure ? '__Host-tg_session' : 'tg_session_dev');

export function handleOf(id: Buffer): string {
  return id.subarray(0, 8).toString('hex');
}

export type AuthMethod = 'password' | 'totp' | 'passkey' | 'recovery' | 'register';

export async function createSession(ctx: AppContext, client: Tx | AppContext['db'], userId: string, req: FastifyRequest, opts: { reauth?: boolean; method?: AuthMethod } = {}): Promise<{ token: string; csrfToken: string }> {
  const token = randomToken(32);
  const csrfToken = randomToken(32);
  const ua = (req.headers['user-agent'] ?? '').toString().slice(0, 160) || null;
  await client.query(
    `INSERT INTO sessions(id, user_id, csrf_token, expires_at, reauth_at, user_agent, ip_tag, auth_method)
     VALUES ($1, $2, $3, now() + make_interval(days => $4), CASE WHEN $5 THEN now() ELSE NULL END, $6, $7, $8)`,
    [sha256(token), userId, csrfToken, ctx.config.sessionAbsoluteDays, opts.reauth ?? true, ua, ipTag(ctx, req.ip), opts.method ?? null],
  );
  return { token, csrfToken };
}

export function setSessionCookie(ctx: AppContext, reply: FastifyReply, token: string): void {
  reply.setCookie(sessionCookieName(ctx), token, {
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: ctx.config.sessionAbsoluteDays * 86400,
  });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName(ctx), { path: '/', secure: ctx.config.cookieSecure, httpOnly: true, sameSite: 'strict' });
}

/** Lädt und prüft die Session (Ablauf, Idle-Timeout, Kontostatus) und aktualisiert last_seen. */
export async function loadSession(ctx: AppContext, token: string | undefined): Promise<SessionInfo | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const id = sha256(token);
  const { rows } = await ctx.db.query(
    `SELECT s.id, s.user_id, s.csrf_token, s.reauth_at, s.created_at, s.last_seen_at, s.expires_at,
            u.role, u.status, u.login_name, u.login_kind, u.display_name, u.totp_enabled
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const now = Date.now();
  const idleMs = ctx.config.sessionIdleMinutes * 60_000;
  if (new Date(r.expires_at).getTime() <= now || now - new Date(r.last_seen_at).getTime() > idleMs || r.status !== 'active') {
    await ctx.db.query('DELETE FROM sessions WHERE id = $1', [id]);
    return null;
  }
  // last_seen höchstens einmal pro Minute schreiben
  if (now - new Date(r.last_seen_at).getTime() > 60_000) await ctx.db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [id]);
  return {
    id,
    handle: handleOf(id),
    userId: r.user_id,
    csrfToken: r.csrf_token,
    reauthAt: r.reauth_at ? new Date(r.reauth_at) : null,
    createdAt: new Date(r.created_at),
    role: r.role,
    status: r.status,
    loginName: r.login_name,
    loginKind: r.login_kind,
    displayName: r.display_name,
    totpEnabled: r.totp_enabled,
  };
}

export function reauthValid(ctx: AppContext, s: SessionInfo): boolean {
  return !!s.reauthAt && Date.now() - s.reauthAt.getTime() < ctx.config.reauthMinutes * 60_000;
}

export async function cleanupSessions(ctx: AppContext): Promise<number> {
  const r = await ctx.db.query(`DELETE FROM sessions WHERE expires_at < now() OR last_seen_at < now() - make_interval(mins => $1)`, [ctx.config.sessionIdleMinutes]);
  return r.rowCount ?? 0;
}
