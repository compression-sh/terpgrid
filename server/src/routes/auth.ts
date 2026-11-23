import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from '../plugin.js';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { audit } from '../audit.js';
import type { AppContext } from '../context.js';
import { decrypt, encrypt, hmac, randomToken, totpAad } from '../crypto.js';
import { tx } from '../db.js';
import { HttpError, requireReauth, requireSession, throttle } from '../http.js';
import { displayNameProblem, generateAccountId, normalizeLogin, usernameProblem } from '../identity.js';
import { passwordProblems } from '../passwords.js';
import { type SessionInfo, clearSessionCookie, createSession, handleOf, setSessionCookie } from '../sessions.js';
import { createUserRow, getDek, publicUser, recoveryHash, replaceRecoveryCodes } from '../users.js';

const str = (max: number, min = 1) => ({ type: 'string', minLength: min, maxLength: max }) as const;

/** Ausstehende 2FA-Anmeldungen (5 Minuten, max. 5 Versuche) – im Speicher, nicht in der DB. */
interface PendingMfa {
  userId: string;
  expires: number;
  attempts: number;
}

export function totpFor(secret: Buffer, label: string) {
  return new OTPAuth.TOTP({ issuer: 'TERPGRID', label, algorithm: 'SHA1', digits: 6, period: 30, secret: new OTPAuth.Secret({ buffer: secret.buffer.slice(secret.byteOffset, secret.byteOffset + secret.byteLength) as ArrayBuffer }) });
}

/** Prüft einen TOTP-Code (±1 Zeitschritt) und verhindert Wiederverwendung. */
export async function checkTotp(ctx: AppContext, userId: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  return tx(ctx.db, async (c) => {
    const { rows } = await c.query('SELECT login_name, totp_secret, totp_last_step FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const r = rows[0];
    if (!r?.totp_secret) return false;
    const dek = await getDek(ctx, c, userId);
    const secret = decrypt(dek, r.totp_secret, totpAad(userId));
    const totp = totpFor(secret, r.login_name);
    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) return false;
    const step = Math.floor(Date.now() / 30_000) + delta;
    if (r.totp_last_step !== null && Number(r.totp_last_step) >= step) return false; // Replay
    await c.query('UPDATE users SET totp_last_step = $2 WHERE id = $1', [userId, step]);
    return true;
  });
}

export function sessionPayload(s: Pick<SessionInfo, 'loginName' | 'loginKind' | 'displayName' | 'role' | 'totpEnabled'>) {
  return { loginName: s.loginName, loginKind: s.loginKind, displayName: s.displayName, role: s.role, totpEnabled: s.totpEnabled };
}

export function authRoutes(ctx: AppContext) {
  const pending = new Map<string, PendingMfa>();
  const prune = () => {
    const t = Date.now();
    for (const [k, v] of pending) if (v.expires < t) pending.delete(k);
  };

  return fp(async (app: FastifyInstance) => {
    async function startSession(req: FastifyRequest, reply: Parameters<typeof setSessionCookie>[1], userId: string, oldSession?: Buffer | null) {
      // Rotation: bestehende Session dieses Browsers wird ersetzt
      if (oldSession) await ctx.db.query('DELETE FROM sessions WHERE id = $1', [oldSession]);
      const { token, csrfToken } = await createSession(ctx, ctx.db, userId, req);
      setSessionCookie(ctx, reply, token);
      await ctx.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
      const { rows } = await ctx.db.query('SELECT login_name, login_kind, display_name, role, totp_enabled FROM users WHERE id = $1', [userId]);
      return { user: publicUser(rows[0]), csrfToken };
    }

    async function validInvite(token: string | undefined) {
      if (!token || token.length > 100) return null;
      const { rows } = await ctx.db.query('SELECT id FROM invitations WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()', [hmac(ctx.macKeys.invite, token)]);
      return rows[0]?.id as string | undefined;
    }

    app.get('/api/auth/config', async () => ({ inviteOnly: ctx.config.inviteOnly, minPasswordLength: 12, version: ctx.config.version }));

    app.get<{ Params: { token: string } }>('/api/auth/invite/:token', async (req) => {
      const wait = ctx.limits.probe.take(`invite:${req.ip}`);
      if (wait) throttle(wait);
      return { valid: !!(await validInvite(req.params.token)) };
    });

    app.get<{ Querystring: { name: string; invite?: string } }>(
      '/api/auth/username-available',
      { schema: { querystring: { type: 'object', required: ['name'], properties: { name: str(64), invite: str(100) } } } },
      async (req) => {
        const wait = ctx.limits.probe.take(`avail:${req.ip}`);
        if (wait) throttle(wait);
        // Bei Invite-only nur mit gültiger Einladung prüfen (begrenzt Enumeration)
        if (ctx.config.inviteOnly && !(await validInvite(req.query.invite))) throw new HttpError(403, 'Gültige Einladung erforderlich');
        const problem = usernameProblem(req.query.name);
        if (problem) return { available: false, problem };
        const { rowCount } = await ctx.db.query('SELECT 1 FROM users WHERE login_name = $1', [normalizeLogin(req.query.name)]);
        return { available: rowCount === 0 };
      },
    );

    app.post<{ Body: { mode: 'username' | 'generated'; username?: string; displayName?: string; password: string; invite?: string; ageConfirmed: boolean } }>(
      '/api/auth/register',
      {
        schema: {
          body: {
            type: 'object',
            required: ['mode', 'password', 'ageConfirmed'],
            additionalProperties: false,
            properties: { mode: { enum: ['username', 'generated'] }, username: str(64), displayName: str(60, 0), password: str(256), invite: str(100), ageConfirmed: { type: 'boolean' } },
          },
        },
      },
      async (req, reply) => {
        const wait = ctx.limits.register.take(`reg:${req.ip}`);
        if (wait) throttle(wait);
        const b = req.body;
        if (b.ageConfirmed !== true) throw new HttpError(400, 'TERPGRID ist nur für Erwachsene. Bitte bestätige, dass du volljährig bist.');
        const inviteId = await validInvite(b.invite);
        if (ctx.config.inviteOnly && !inviteId) throw new HttpError(403, 'Die Registrierung ist nur mit gültiger Einladung möglich.');
        let loginName: string;
        if (b.mode === 'username') {
          const p = usernameProblem(b.username ?? '');
          if (p) throw new HttpError(400, p);
          loginName = normalizeLogin(b.username!);
        } else {
          loginName = generateAccountId();
        }
        const displayName = b.displayName?.normalize('NFKC').trim() || null;
        if (displayName) {
          const p = displayNameProblem(displayName);
          if (p) throw new HttpError(400, p);
        }
        const problems = passwordProblems(b.password, loginName);
        if (problems.length) throw new HttpError(400, problems.join(' '), { problems });
        const passwordHash = await ctx.hasher.hash(b.password);
        let userId: string;
        let codes: string[];
        try {
          ({ userId, codes } = await tx(ctx.db, async (c) => {
            if (inviteId) {
              // Einladung atomar verbrauchen (einmalig)
              const used = await c.query('UPDATE invitations SET used_at = now() WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()', [inviteId]);
              if (used.rowCount !== 1) throw new HttpError(403, 'Die Einladung ist nicht mehr gültig.');
            }
            const id = await createUserRow(ctx, c, { loginName, loginKind: b.mode, displayName, passwordHash });
            if (inviteId) await c.query('UPDATE invitations SET used_by = $2 WHERE id = $1', [inviteId, id]);
            const rc = await replaceRecoveryCodes(ctx, c, id);
            await audit(ctx, 'register', { userId: id, ip: req.ip, meta: { kind: b.mode }, client: c });
            return { userId: id, codes: rc };
          }));
        } catch (e) {
          if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'Dieser Benutzername ist bereits vergeben.');
          throw e;
        }
        const session = await startSession(req, reply, userId, req.session?.id);
        return reply.code(201).send({ ...session, recoveryCodes: codes });
      },
    );

    app.post<{ Body: { login: string; password: string } }>(
      '/api/auth/login',
      { schema: { body: { type: 'object', required: ['login', 'password'], additionalProperties: false, properties: { login: str(80), password: str(256) } } } },
      async (req, reply) => {
        const login = normalizeLogin(req.body.login);
        const ipWait = ctx.limits.loginIp.take(`login:${req.ip}`);
        const accWait = ctx.limits.loginAccount.retryAfter(login);
        if (ipWait || accWait) {
          await audit(ctx, 'login.throttled', { ip: req.ip });
          throttle(Math.max(ipWait, accWait));
        }
        const { rows } = await ctx.db.query('SELECT id, password_hash, status, totp_enabled FROM users WHERE login_name = $1', [login]);
        const u = rows[0];
        const ok = u ? await ctx.hasher.verify(u.password_hash, req.body.password) : await ctx.hasher.verifyDummy(req.body.password);
        if (!ok || !u) {
          ctx.limits.loginAccount.fail(login);
          await audit(ctx, 'login.failure', { userId: u?.id ?? null, ip: req.ip });
          // Einheitliche Meldung – verrät nicht, ob das Konto existiert
          throw new HttpError(401, 'Anmeldung fehlgeschlagen. Kennung oder Passwort ist falsch.');
        }
        ctx.limits.loginAccount.success(login);
        if (u.status !== 'active') throw new HttpError(403, 'Dieses Konto ist gesperrt. Bitte wende dich an die Administration.');
        if (ctx.hasher.needsRehash(u.password_hash)) {
          const nh = await ctx.hasher.hash(req.body.password);
          await ctx.db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [u.id, nh]);
        }
        if (u.totp_enabled) {
          prune();
          const mfaToken = randomToken(32);
          pending.set(mfaToken, { userId: u.id, expires: Date.now() + 5 * 60_000, attempts: 0 });
          return { status: 'mfa', mfaToken };
        }
        await audit(ctx, 'login.success', { userId: u.id, ip: req.ip });
        return { status: 'ok', ...(await startSession(req, reply, u.id, req.session?.id)) };
      },
    );

    app.post<{ Body: { mfaToken: string; code: string } }>(
      '/api/auth/login/mfa',
      { schema: { body: { type: 'object', required: ['mfaToken', 'code'], additionalProperties: false, properties: { mfaToken: str(100), code: str(10) } } } },
      async (req, reply) => {
        prune();
        const p = pending.get(req.body.mfaToken);
        if (!p) throw new HttpError(401, 'Anmeldung abgelaufen. Bitte erneut anmelden.');
        p.attempts++;
        if (p.attempts > 5) {
          pending.delete(req.body.mfaToken);
          throw new HttpError(401, 'Zu viele Versuche. Bitte erneut anmelden.');
        }
        if (!(await checkTotp(ctx, p.userId, req.body.code.replace(/\s/g, '')))) {
          await audit(ctx, 'login.failure', { userId: p.userId, ip: req.ip, meta: { factor: 'totp' } });
          throw new HttpError(401, 'Der Code ist ungültig.');
        }
        pending.delete(req.body.mfaToken);
        await audit(ctx, 'login.success', { userId: p.userId, ip: req.ip, meta: { mfa: true } });
        return { status: 'ok', ...(await startSession(req, reply, p.userId, req.session?.id)) };
      },
    );

    app.post('/api/auth/logout', async (req, reply) => {
      if (req.session) {
        await ctx.db.query('DELETE FROM sessions WHERE id = $1', [req.session.id]);
        await audit(ctx, 'logout', { userId: req.session.userId, ip: req.ip });
      }
      clearSessionCookie(ctx, reply);
      return { ok: true };
    });

    app.get('/api/auth/session', async (req, reply) => {
      const s = req.session;
      if (!s) return reply.code(401).send({ error: 'Nicht angemeldet' });
      return {
        user: sessionPayload(s),
        csrfToken: s.csrfToken,
        reauthUntil: s.reauthAt ? new Date(s.reauthAt.getTime() + ctx.config.reauthMinutes * 60_000).toISOString() : null,
        session: { handle: s.handle, createdAt: s.createdAt.toISOString() },
      };
    });

    app.post<{ Body: { password: string; code?: string } }>(
      '/api/auth/reauth',
      { schema: { body: { type: 'object', required: ['password'], additionalProperties: false, properties: { password: str(256), code: str(10) } } } },
      async (req) => {
        const s = requireSession(req);
        const wait = ctx.limits.loginAccount.retryAfter(`reauth:${s.userId}`);
        if (wait) throttle(wait);
        const { rows } = await ctx.db.query('SELECT password_hash, totp_enabled FROM users WHERE id = $1', [s.userId]);
        const ok = await ctx.hasher.verify(rows[0].password_hash, req.body.password);
        const totpOk = !rows[0].totp_enabled || (req.body.code ? await checkTotp(ctx, s.userId, req.body.code.replace(/\s/g, '')) : false);
        if (!ok || !totpOk) {
          ctx.limits.loginAccount.fail(`reauth:${s.userId}`);
          throw new HttpError(401, rows[0].totp_enabled && ok ? 'Bitte gib einen gültigen 2FA-Code ein.' : 'Das Passwort ist falsch.', { totpRequired: rows[0].totp_enabled });
        }
        ctx.limits.loginAccount.success(`reauth:${s.userId}`);
        await ctx.db.query('UPDATE sessions SET reauth_at = now() WHERE id = $1', [s.id]);
        return { reauthUntil: new Date(Date.now() + ctx.config.reauthMinutes * 60_000).toISOString() };
      },
    );

    app.post<{ Body: { login: string; recoveryCode: string; newPassword: string } }>(
      '/api/auth/recover',
      { schema: { body: { type: 'object', required: ['login', 'recoveryCode', 'newPassword'], additionalProperties: false, properties: { login: str(80), recoveryCode: str(40), newPassword: str(256) } } } },
      async (req, reply) => {
        const login = normalizeLogin(req.body.login);
        const ipWait = ctx.limits.recoverIp.take(`rec:${req.ip}`);
        const accWait = ctx.limits.recoverAccount.retryAfter(login);
        if (ipWait || accWait) throttle(Math.max(ipWait, accWait));
        const problems = passwordProblems(req.body.newPassword, login);
        if (problems.length) throw new HttpError(400, problems.join(' '), { problems });
        const { rows } = await ctx.db.query("SELECT id FROM users WHERE login_name = $1 AND status = 'active'", [login]);
        const userId: string | undefined = rows[0]?.id;
        const fail = async () => {
          ctx.limits.recoverAccount.fail(login);
          await audit(ctx, 'recovery.failure', { userId: userId ?? null, ip: req.ip });
          throw new HttpError(401, 'Wiederherstellung fehlgeschlagen. Kennung oder Wiederherstellungscode ist falsch.');
        };
        if (!userId) {
          await ctx.hasher.verifyDummy(req.body.newPassword);
          return fail();
        }
        const newHash = await ctx.hasher.hash(req.body.newPassword);
        const remaining = await tx(ctx.db, async (c) => {
          // Code atomar als verbraucht markieren – verhindert Wiederverwendung (auch parallel)
          const used = await c.query('UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL', [userId, recoveryHash(ctx, userId, req.body.recoveryCode)]);
          if (used.rowCount !== 1) return null;
          // Neues Passwort, 2FA aus (Gerät evtl. verloren), alle Sessions beenden
          await c.query('UPDATE users SET password_hash = $2, password_changed_at = now(), totp_enabled = false, totp_secret = NULL, totp_last_step = NULL WHERE id = $1', [userId, newHash]);
          await c.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
          const r = await c.query('SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL', [userId]);
          await audit(ctx, 'recovery.success', { userId, ip: req.ip, client: c });
          return r.rows[0].n as number;
        });
        if (remaining === null) return fail();
        ctx.limits.recoverAccount.success(login);
        return { status: 'ok', remainingRecoveryCodes: remaining, totpDisabled: true, ...(await startSession(req, reply, userId)) };
      },
    );

    app.post<{ Body: { currentPassword: string; newPassword: string } }>(
      '/api/auth/password',
      { schema: { body: { type: 'object', required: ['currentPassword', 'newPassword'], additionalProperties: false, properties: { currentPassword: str(256), newPassword: str(256) } } } },
      async (req, reply) => {
        const s = requireSession(req);
        const wait = ctx.limits.loginAccount.retryAfter(`pw:${s.userId}`);
        if (wait) throttle(wait);
        const { rows } = await ctx.db.query('SELECT password_hash FROM users WHERE id = $1', [s.userId]);
        if (!(await ctx.hasher.verify(rows[0].password_hash, req.body.currentPassword))) {
          ctx.limits.loginAccount.fail(`pw:${s.userId}`);
          throw new HttpError(401, 'Das aktuelle Passwort ist falsch.');
        }
        const problems = passwordProblems(req.body.newPassword, s.loginName);
        if (problems.length) throw new HttpError(400, problems.join(' '), { problems });
        const nh = await ctx.hasher.hash(req.body.newPassword);
        await ctx.db.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [s.userId, nh]);
        // Alle Sessions beenden, auch diese – dann neue Session (Rotation)
        await ctx.db.query('DELETE FROM sessions WHERE user_id = $1', [s.userId]);
        await audit(ctx, 'password.change', { userId: s.userId, ip: req.ip });
        return startSession(req, reply, s.userId);
      },
    );

    app.get('/api/auth/sessions', async (req) => {
      const s = requireSession(req);
      const { rows } = await ctx.db.query('SELECT id, created_at, last_seen_at, expires_at, user_agent FROM sessions WHERE user_id = $1 ORDER BY last_seen_at DESC', [s.userId]);
      return {
        sessions: rows.map((r) => ({
          handle: handleOf(r.id),
          current: Buffer.compare(r.id, s.id) === 0,
          createdAt: r.created_at,
          lastSeenAt: r.last_seen_at,
          expiresAt: r.expires_at,
          userAgent: r.user_agent,
        })),
      };
    });

    app.delete<{ Params: { handle: string } }>('/api/auth/sessions/:handle', async (req) => {
      const s = requireSession(req);
      if (!/^[a-f0-9]{16}$/.test(req.params.handle)) throw new HttpError(400, 'Ungültige Sitzung');
      // Nur eigene Sessions (user_id aus der Session, nie aus dem Request)
      const r = await ctx.db.query("DELETE FROM sessions WHERE user_id = $1 AND encode(substring(id from 1 for 8), 'hex') = $2", [s.userId, req.params.handle]);
      if (r.rowCount === 0) throw new HttpError(404, 'Sitzung nicht gefunden');
      await audit(ctx, 'session.revoke', { userId: s.userId, ip: req.ip });
      return { ok: true };
    });

    app.post('/api/auth/sessions/revoke-others', async (req) => {
      const s = requireSession(req);
      const r = await ctx.db.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [s.userId, s.id]);
      await audit(ctx, 'session.revoke', { userId: s.userId, ip: req.ip, meta: { all: true, count: r.rowCount ?? 0 } });
      return { revoked: r.rowCount ?? 0 };
    });

    app.post('/api/auth/recovery-codes', async (req) => {
      const s = requireReauth(ctx, req);
      const codes = await tx(ctx.db, (c) => replaceRecoveryCodes(ctx, c, s.userId));
      await audit(ctx, 'recovery.regenerate', { userId: s.userId, ip: req.ip });
      return { recoveryCodes: codes };
    });

    app.get('/api/auth/recovery-codes/status', async (req) => {
      const s = requireSession(req);
      const { rows } = await ctx.db.query('SELECT count(*) FILTER (WHERE used_at IS NULL)::int AS remaining, count(*)::int AS total FROM recovery_codes WHERE user_id = $1', [s.userId]);
      return rows[0];
    });

    app.post('/api/auth/totp/setup', async (req) => {
      const s = requireReauth(ctx, req);
      if (s.totpEnabled) throw new HttpError(409, '2FA ist bereits aktiv.');
      const secret = new OTPAuth.Secret({ size: 20 });
      const raw = Buffer.from(secret.buffer);
      const dek = await getDek(ctx, ctx.db, s.userId);
      await ctx.db.query('UPDATE users SET totp_secret = $2, totp_enabled = false, totp_last_step = NULL WHERE id = $1', [s.userId, encrypt(dek, raw, totpAad(s.userId))]);
      const totp = totpFor(raw, s.loginName);
      const uri = totp.toString();
      return { secret: secret.base32, otpauthUri: uri, qrSvg: await QRCode.toString(uri, { type: 'svg', margin: 1, color: { dark: '#0a0d0c', light: '#ffffff' } }) };
    });

    app.post<{ Body: { code: string } }>(
      '/api/auth/totp/enable',
      { schema: { body: { type: 'object', required: ['code'], additionalProperties: false, properties: { code: str(10) } } } },
      async (req, reply) => {
        const s = requireReauth(ctx, req);
        if (!(await checkTotp(ctx, s.userId, req.body.code.replace(/\s/g, '')))) throw new HttpError(400, 'Der Code ist ungültig. Bitte Uhrzeit des Geräts prüfen.');
        await ctx.db.query('UPDATE users SET totp_enabled = true WHERE id = $1', [s.userId]);
        await audit(ctx, 'totp.enable', { userId: s.userId, ip: req.ip });
        // Rechteänderung → Session rotieren
        return startSession(req, reply, s.userId, s.id);
      },
    );

    app.post('/api/auth/totp/disable', async (req, reply) => {
      const s = requireReauth(ctx, req);
      await ctx.db.query('UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_last_step = NULL WHERE id = $1', [s.userId]);
      await audit(ctx, 'totp.disable', { userId: s.userId, ip: req.ip });
      return startSession(req, reply, s.userId, s.id);
    });

  });
}
