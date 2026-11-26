/**
 * Passkeys (WebAuthn) über @simplewebauthn/server – keine eigene Kryptografie.
 *
 * - Registrierung nur mit gültiger Session + frischer Re-Authentifizierung
 * - Anmeldung ohne Kennung (auffindbare Credentials) → keine Konto-Enumeration
 * - Server prüft Challenge (einmalig, 5 Min.), Origin, RP-ID, User Verification,
 *   Signatur und Zähler; die Credential-ID ist eindeutig an genau ein Konto gebunden
 * - Passwort- und Recovery-Anmeldung bleiben unverändert erhalten
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import type { AppContext } from '../context.js';
import { randomToken } from '../crypto.js';
import { HttpError, requireReauth, requireSession, throttle } from '../http.js';
import { issueLoginSession } from '../login.js';
import fp from '../plugin.js';

const CHALLENGE_TTL = 5 * 60_000;
const MAX_PENDING = 10_000;
const CRED_ID_RE = /^[A-Za-z0-9_-]{16,1400}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Pending {
  challenge: string;
  expires: number;
  userId?: string;
}

/** Einmal verwendbare Challenges mit Ablaufzeit (im Speicher, eine API-Instanz). */
class ChallengeStore {
  private m = new Map<string, Pending>();
  put(key: string, p: Omit<Pending, 'expires'>) {
    const t = Date.now();
    for (const [k, v] of this.m) if (v.expires < t) this.m.delete(k);
    if (this.m.size >= MAX_PENDING) throw new HttpError(503, 'Server ausgelastet – bitte gleich erneut versuchen.');
    this.m.set(key, { ...p, expires: t + CHALLENGE_TTL });
  }
  /** Liefert und entfernt die Challenge (auch bei späterem Fehlschlag nicht wiederverwendbar). */
  take(key: string): Pending | null {
    const p = this.m.get(key);
    this.m.delete(key);
    return p && p.expires >= Date.now() ? p : null;
  }
}

const nameOk = (n: unknown): n is string => typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 60;

export function passkeyRoutes(ctx: AppContext) {
  const rpID = ctx.config.webauthnRpId ?? new URL(ctx.config.publicOrigin).hostname;
  const origin = ctx.config.publicOrigin;
  const reg = new ChallengeStore();
  const auth = new ChallengeStore();

  const list = async (userId: string) => {
    const { rows } = await ctx.db.query(
      'SELECT id, name, device_type, backed_up, transports, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at',
      [userId],
    );
    return rows.map((r) => ({ id: r.id, name: r.name, deviceType: r.device_type, backedUp: r.backed_up, transports: r.transports, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
  };

  return fp(async (app: FastifyInstance) => {
    app.get('/api/auth/passkeys', async (req) => {
      const s = requireSession(req);
      return { passkeys: await list(s.userId), rpID };
    });

    app.post('/api/auth/passkeys/register/options', async (req) => {
      const s = requireReauth(ctx, req);
      const { rows } = await ctx.db.query('SELECT webauthn_user_id FROM users WHERE id = $1', [s.userId]);
      let handle: Buffer = rows[0].webauthn_user_id;
      if (!handle) {
        handle = randomBytes(32);
        await ctx.db.query('UPDATE users SET webauthn_user_id = $2 WHERE id = $1 AND webauthn_user_id IS NULL', [s.userId, handle]);
        handle = (await ctx.db.query('SELECT webauthn_user_id FROM users WHERE id = $1', [s.userId])).rows[0].webauthn_user_id;
      }
      const existing = await ctx.db.query('SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1', [s.userId]);
      const options = await generateRegistrationOptions({
        rpName: 'TERPGRID',
        rpID,
        userName: s.loginName,
        userDisplayName: s.displayName ?? s.loginName,
        userID: new Uint8Array(handle),
        attestationType: 'none',
        excludeCredentials: existing.rows.map((r) => ({ id: r.credential_id, transports: r.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        timeout: CHALLENGE_TTL,
      });
      reg.put(s.handle, { challenge: options.challenge, userId: s.userId });
      return options;
    });

    app.post<{ Body: { response: RegistrationResponseJSON; name: string } }>(
      '/api/auth/passkeys/register/verify',
      { bodyLimit: 64 * 1024, schema: { body: { type: 'object', required: ['response', 'name'], additionalProperties: false, properties: { response: { type: 'object' }, name: { type: 'string', minLength: 1, maxLength: 60 } } } } },
      async (req) => {
        const s = requireReauth(ctx, req);
        const pending = reg.take(s.handle);
        if (!pending || pending.userId !== s.userId) throw new HttpError(400, 'Die Registrierung ist abgelaufen. Bitte erneut starten.');
        if (!nameOk(req.body.name)) throw new HttpError(400, 'Bitte einen Namen (1–60 Zeichen) angeben.');
        let v;
        try {
          v = await verifyRegistrationResponse({
            response: req.body.response,
            expectedChallenge: pending.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
          });
        } catch {
          throw new HttpError(400, 'Der Passkey konnte nicht bestätigt werden.');
        }
        if (!v.verified) throw new HttpError(400, 'Der Passkey konnte nicht bestätigt werden.');
        const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
        if (!CRED_ID_RE.test(credential.id)) throw new HttpError(400, 'Ungültiger Passkey.');
        try {
          await ctx.db.query(
            `INSERT INTO webauthn_credentials(id, user_id, credential_id, public_key, counter, transports, name, device_type, backed_up)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [randomUUID(), s.userId, credential.id, Buffer.from(credential.publicKey), credential.counter, credential.transports ?? [], req.body.name.trim(), credentialDeviceType, credentialBackedUp],
          );
        } catch (e) {
          if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'Dieser Passkey ist bereits registriert.');
          throw e;
        }
        await audit(ctx, 'passkey.add', { userId: s.userId, ip: req.ip });
        return { passkeys: await list(s.userId) };
      },
    );

    app.patch<{ Params: { id: string }; Body: { name: string } }>(
      '/api/auth/passkeys/:id',
      { schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 60 } } } } },
      async (req) => {
        const s = requireReauth(ctx, req);
        if (!UUID_RE.test(req.params.id) || !nameOk(req.body.name)) throw new HttpError(404, 'Nicht gefunden');
        const r = await ctx.db.query('UPDATE webauthn_credentials SET name = $3 WHERE id = $1 AND user_id = $2', [req.params.id, s.userId, req.body.name.trim()]);
        if (r.rowCount === 0) throw new HttpError(404, 'Nicht gefunden');
        await audit(ctx, 'passkey.rename', { userId: s.userId, ip: req.ip });
        return { passkeys: await list(s.userId) };
      },
    );

    app.delete<{ Params: { id: string } }>('/api/auth/passkeys/:id', async (req) => {
      const s = requireReauth(ctx, req);
      if (!UUID_RE.test(req.params.id)) throw new HttpError(404, 'Nicht gefunden');
      const r = await ctx.db.query('DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2', [req.params.id, s.userId]);
      if (r.rowCount === 0) throw new HttpError(404, 'Nicht gefunden');
      await audit(ctx, 'passkey.remove', { userId: s.userId, ip: req.ip });
      return { passkeys: await list(s.userId) };
    });

    // Anmeldung mit Passkey (ohne Kennung)
    app.post('/api/auth/passkeys/login/options', async (req) => {
      const wait = ctx.limits.loginIp.take(`login:${req.ip}`);
      if (wait) throttle(wait);
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', timeout: CHALLENGE_TTL });
      const flowId = randomToken(24);
      auth.put(flowId, { challenge: options.challenge });
      return { flowId, options };
    });

    app.post<{ Body: { flowId: string; response: AuthenticationResponseJSON } }>(
      '/api/auth/passkeys/login/verify',
      { bodyLimit: 64 * 1024, schema: { body: { type: 'object', required: ['flowId', 'response'], additionalProperties: false, properties: { flowId: { type: 'string', maxLength: 64 }, response: { type: 'object' } } } } },
      async (req, reply) => {
        const wait = ctx.limits.loginIp.take(`login:${req.ip}`);
        if (wait) throttle(wait);
        const fail = async (userId: string | null = null): Promise<never> => {
          await audit(ctx, 'login.failure', { userId, ip: req.ip, meta: { factor: 'passkey' } });
          throw new HttpError(401, 'Anmeldung mit Passkey fehlgeschlagen.');
        };
        const pending = auth.take(req.body.flowId);
        if (!pending) return fail();
        const credId = (req.body.response as { id?: unknown })?.id;
        if (typeof credId !== 'string' || !CRED_ID_RE.test(credId)) return fail();
        const { rows } = await ctx.db.query(
          `SELECT c.id, c.user_id, c.credential_id, c.public_key, c.counter, c.transports, u.status
             FROM webauthn_credentials c JOIN users u ON u.id = c.user_id WHERE c.credential_id = $1`,
          [credId],
        );
        const c = rows[0];
        if (!c) return fail();
        let v;
        try {
          v = await verifyAuthenticationResponse({
            response: req.body.response,
            expectedChallenge: pending.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
            credential: { id: c.credential_id, publicKey: new Uint8Array(c.public_key), counter: Number(c.counter), transports: c.transports },
          });
        } catch {
          return fail(c.user_id);
        }
        if (!v.verified) return fail(c.user_id);
        // Zähler atomar fortschreiben (bei Zähler > 0 schützt die Bibliothek bereits vor Rückschritten)
        const upd = await ctx.db.query(
          'UPDATE webauthn_credentials SET counter = $2, last_used_at = now() WHERE id = $1 AND (counter = 0 OR counter < $2 OR $2 = 0) RETURNING id',
          [c.id, v.authenticationInfo.newCounter],
        );
        if (upd.rowCount === 0) return fail(c.user_id);
        if (c.status !== 'active') throw new HttpError(403, 'Dieses Konto ist gesperrt. Bitte wende dich an die Administration.');
        await audit(ctx, 'login.success', { userId: c.user_id, ip: req.ip, meta: { factor: 'passkey' } });
        return { status: 'ok', ...(await issueLoginSession(ctx, req, reply, c.user_id, req.session?.id, 'passkey')) };
      },
    );
  });
}
