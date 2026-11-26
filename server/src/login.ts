import type { FastifyReply, FastifyRequest } from 'fastify';
import { type AppContext, accountKey } from './context.js';
import { type AuthMethod, createSession, setSessionCookie } from './sessions.js';
import { publicUser } from './users.js';

/**
 * Gemeinsamer Abschluss aller erfolgreichen Anmeldungen (Passwort, 2FA, Passkey,
 * Recovery, Registrierung): alte Session dieses Browsers ersetzen (Rotation),
 * neue Session + Cookie, Zeitpunkt der letzten Anmeldung.
 */
export async function issueLoginSession(ctx: AppContext, req: FastifyRequest, reply: FastifyReply, userId: string, oldSession?: Buffer | null, method?: AuthMethod) {
  if (oldSession) await ctx.db.query('DELETE FROM sessions WHERE id = $1', [oldSession]);
  const { token, csrfToken } = await createSession(ctx, ctx.db, userId, req, { method });
  setSessionCookie(ctx, reply, token);
  await ctx.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
  const { rows } = await ctx.db.query('SELECT login_name, login_kind, display_name, role, totp_enabled FROM users WHERE id = $1', [userId]);
  return { user: { ...publicUser(rows[0]), accountKey: accountKey(ctx, userId) }, csrfToken };
}
