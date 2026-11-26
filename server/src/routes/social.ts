/**
 * Private Freundschaften und Profile (Phase 5.5).
 *
 * Grundsätze:
 * - Kein Verzeichnis, keine Suche: Anfragen nur über exaktes Handle bzw. Social-ID oder
 *   über widerrufbare, ablaufende Einladungscodes.
 * - Keine Enumeration: Eine Anfrage wird immer gleich beantwortet – egal ob das Ziel
 *   existiert, Anfragen abgeschaltet hat oder blockiert. Abgelehnte Anfragen sieht der
 *   Absender weiterhin als „ausstehend“ bis zum Ablauf.
 * - Freundschaft gewährt keinen Zugriff auf private Daten; nur freigegebene Profilfelder.
 * - Der Anmeldename wird nie an andere Konten ausgegeben.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { blockLabelAad, decrypt, encrypt, hmac, nicknameAad, randomBase32, randomToken } from '../crypto.js';
import { type Tx, withUser } from '../db.js';
import { HttpError, requireSession, throttle } from '../http.js';
import { CONTROL_CHARS } from '../identity.js';
import fp from '../plugin.js';
import { loadUserKeys } from '../userkeys.js';
import { UUID_RE } from '../collab/authz.js';
import { notify } from '../collab/notify.js';
import { recordActivity } from '../collab/activity.js';
import {
  DEFAULT_VISIBILITY,
  type Identity,
  type ProfileRow,
  UNKNOWN_IDENTITY,
  cleanProfile,
  cleanVisibility,
  decodeProfile,
  encodeProfile,
  ensureProfile,
  formatSocialId,
  handleProblem,
  identities,
  normalizeHandle,
  parseSocialId,
  viewProfiles,
} from '../social/profiles.js';

const REQUEST_DAYS = 30;
const GENERIC_SENT = 'Anfrage gesendet. Falls ein passendes Konto Anfragen über Handle oder Social-ID annimmt, erscheint sie dort.';
const inviteHash = (ctx: AppContext, token: string) => hmac(ctx.macKeys.invite, `friend|${token}`);
const labelOf = (i: Identity) => i.displayName ?? (i.handle ? `@${i.handle}` : i.socialId) ?? '';

function ref(id: unknown): string {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new HttpError(404, 'Nicht gefunden');
  return id;
}

/** Eigenes Profil für die Bearbeitung (vollständig, inkl. Sichtbarkeit/Einstellungen). */
export function selfProfile(ctx: AppContext, r: ProfileRow) {
  const data = decodeProfile(ctx, r);
  return {
    ref: r.user_id,
    handle: r.handle,
    socialId: formatSocialId(r.social_id),
    requestsEnabled: r.requests_enabled,
    visibility: { ...DEFAULT_VISIBILITY, ...r.visibility },
    notifyPrefs: r.notify_prefs,
    ...data,
  };
}

export async function listFriends(ctx: AppContext, c: Tx, me: string) {
  const { rows } = await c.query(
    `SELECT CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END AS friend, f.created_at, s.nickname, s.nickname_gen, s.profile_hidden
       FROM friendships f LEFT JOIN friend_settings s ON s.owner_id = $1 AND s.friend_id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
      WHERE $1 IN (f.user_a, f.user_b) ORDER BY f.created_at DESC`,
    [me],
  );
  if (!rows.length) return [];
  const views = await viewProfiles(ctx, c, me, rows.map((r) => r.friend));
  const keys = rows.some((r) => r.nickname) ? await loadUserKeys(ctx, c, me) : null;
  const out = rows.map((r) => ({
    ...(views.get(r.friend) ?? UNKNOWN_IDENTITY(r.friend)),
    since: r.created_at,
    nickname: r.nickname && keys ? decrypt(keys.get(r.nickname_gen), r.nickname, nicknameAad(me, r.friend)).toString('utf8') : null,
    profileHidden: r.profile_hidden ?? false,
  }));
  keys?.wipe();
  return out;
}

export async function listBlocks(ctx: AppContext, c: Tx, me: string) {
  const { rows } = await c.query('SELECT blocked, label, label_gen, created_at FROM blocks WHERE blocker = $1 ORDER BY created_at DESC', [me]);
  if (!rows.length) return [];
  const keys = await loadUserKeys(ctx, c, me);
  const out = rows.map((r) => ({ ref: r.blocked, label: r.label ? decrypt(keys.get(r.label_gen), r.label, blockLabelAad(me, r.blocked)).toString('utf8') : 'Blockiertes Konto', since: r.created_at }));
  keys.wipe();
  return out;
}

export async function listRequests(ctx: AppContext, c: Tx, me: string) {
  // Abgelaufene Anfragen markieren (keine Hintergrundjobs – erledigt sich beim Lesen)
  await c.query("UPDATE friend_requests SET status = 'expired' WHERE status = 'pending' AND expires_at < now() AND (from_user = $1 OR to_user = $1)", [me]);
  const inc = await c.query("SELECT id, from_user, created_at, expires_at FROM friend_requests WHERE to_user = $1 AND status = 'pending' ORDER BY created_at DESC", [me]);
  const out = await c.query(
    `SELECT id, target_label, CASE WHEN status = 'declined' THEN 'pending' ELSE status END AS status, created_at, expires_at
       FROM friend_requests WHERE from_user = $1 AND (status IN ('pending', 'declined') OR (status = 'accepted' AND responded_at > now() - interval '7 days'))
      ORDER BY created_at DESC LIMIT 100`,
    [me],
  );
  const ids = await identities(ctx, c, me, inc.rows.map((r) => r.from_user));
  return {
    incoming: inc.rows.map((r) => ({ id: r.id, from: ids.get(r.from_user) ?? UNKNOWN_IDENTITY(r.from_user), createdAt: r.created_at, expiresAt: r.expires_at })),
    outgoing: out.rows.map((r) => ({ id: r.id, target: r.target_label, status: r.status, createdAt: r.created_at, expiresAt: r.expires_at })),
  };
}

export async function listFriendInvites(c: Tx, me: string) {
  const { rows } = await c.query(
    `SELECT id, created_at, expires_at, used_at, revoked_at FROM friend_invites WHERE created_by = $1
      AND (used_at IS NULL AND revoked_at IS NULL AND expires_at > now() OR created_at > now() - interval '14 days') ORDER BY created_at DESC LIMIT 50`,
    [me],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    status: r.revoked_at ? 'revoked' : r.used_at ? 'used' : new Date(r.expires_at) < new Date() ? 'expired' : 'active',
  }));
}

/** Offene Bereichseinladungen zwischen mir und einem anderen Konto beenden (Freund entfernt/blockiert). */
async function settleSpaceInvites(c: Tx, me: string, other: string) {
  await c.query(
    "UPDATE space_invites SET status = 'revoked', responded_at = now() WHERE status = 'pending' AND invitee = $2 AND tg_space_role(space_id) = 'owner' AND invited_by = $1",
    [me, other],
  );
  await c.query("UPDATE space_invites SET status = 'declined', responded_at = now() WHERE status = 'pending' AND invitee = $1 AND invited_by = $2", [me, other]);
}

export function socialRoutes(ctx: AppContext) {
  return fp(async (app: FastifyInstance) => {
    /* ───────────── Profil ───────────── */

    app.get('/api/social/profile', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => ({ profile: selfProfile(ctx, await ensureProfile(ctx, c, s.userId)) }));
    });

    app.patch<{ Body: Record<string, unknown> }>(
      '/api/social/profile',
      {
        bodyLimit: 256 * 1024,
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              displayName: { type: ['string', 'null'], maxLength: 80 },
              bio: { type: ['string', 'null'], maxLength: 1000 },
              accent: { type: ['string', 'null'], maxLength: 20 },
              avatar: { type: ['string', 'null'], maxLength: 200_000 },
              favoriteStrains: { type: ['array', 'null'], maxItems: 12, items: { type: 'string', maxLength: 80 } },
              favoriteTerpenes: { type: ['array', 'null'], maxItems: 12, items: { type: 'string', maxLength: 80 } },
              interests: { type: ['array', 'null'], maxItems: 12, items: { type: 'string', maxLength: 80 } },
              visibility: { type: 'object', maxProperties: 10, additionalProperties: { type: 'string', enum: ['private', 'friends'] } },
              handle: { type: ['string', 'null'], maxLength: 40 },
              requestsEnabled: { type: 'boolean' },
            },
          },
        },
      },
      async (req) => {
        const s = requireSession(req);
        const body = req.body;
        return withUser(ctx.db, s.userId, async (c) => {
          const row = await ensureProfile(ctx, c, s.userId);
          const data = cleanProfile(body, decodeProfile(ctx, row));
          const visibility = cleanVisibility(body.visibility, row.visibility);
          let handle = row.handle;
          if ('handle' in body) {
            if (body.handle === null || body.handle === '') handle = null;
            else {
              const wait = ctx.limits.inviteProbe.take(`handle:${s.userId}`);
              if (wait) throttle(wait, 'Zu viele Änderungen am Handle. Bitte später erneut versuchen.');
              const h = normalizeHandle(String(body.handle));
              const p = handleProblem(h, s.loginName);
              if (p) throw new HttpError(400, p);
              handle = h;
            }
          }
          await c.query('SAVEPOINT h');
          try {
            await c.query('UPDATE profiles SET payload = $2, visibility = $3, handle = $4, requests_enabled = $5, updated_at = now() WHERE user_id = $1', [
              s.userId,
              encodeProfile(ctx, row, data),
              JSON.stringify(visibility),
              handle,
              typeof body.requestsEnabled === 'boolean' ? body.requestsEnabled : row.requests_enabled,
            ]);
          } catch (e) {
            await c.query('ROLLBACK TO SAVEPOINT h');
            if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'Dieses Handle ist bereits vergeben.');
            throw e;
          }
          return { profile: selfProfile(ctx, await ensureProfile(ctx, c, s.userId)) };
        });
      },
    );

    /** Neue Social-ID erzeugen (alte funktioniert danach nicht mehr). */
    app.post('/api/social/profile/social-id', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        await ensureProfile(ctx, c, s.userId);
        for (let i = 0; i < 5; i++) {
          await c.query('SAVEPOINT sid');
          try {
            await c.query('UPDATE profiles SET social_id = $2, updated_at = now() WHERE user_id = $1', [s.userId, randomBase32(8)]);
            await c.query('RELEASE SAVEPOINT sid');
            break;
          } catch (e) {
            await c.query('ROLLBACK TO SAVEPOINT sid');
            if ((e as { code?: string }).code !== '23505' || i === 4) throw e;
          }
        }
        return { profile: selfProfile(ctx, await ensureProfile(ctx, c, s.userId)) };
      });
    });

    /* ───────────── Übersicht ───────────── */

    app.get('/api/social/overview', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const profile = selfProfile(ctx, await ensureProfile(ctx, c, s.userId));
        const [friends, requests, blocks, invites] = [await listFriends(ctx, c, s.userId), await listRequests(ctx, c, s.userId), await listBlocks(ctx, c, s.userId), await listFriendInvites(c, s.userId)];
        return { profile, friends, requests, blocks, invites };
      });
    });

    /** Profil eines Freundes bzw. Bereichsmitglieds (nur freigegebene Felder). */
    app.get<{ Params: { id: string } }>('/api/social/users/:id', async (req) => {
      const s = requireSession(req);
      const id = ref(req.params.id);
      return withUser(ctx.db, s.userId, async (c) => {
        const v = (await viewProfiles(ctx, c, s.userId, [id])).get(id);
        if (!v || v.relation === 'self') throw new HttpError(404, 'Profil nicht gefunden oder nicht freigegeben');
        const friends = await listFriends(ctx, c, s.userId);
        const f = friends.find((x) => x.ref === id);
        const { relation, ...view } = v;
        return { profile: view, relation, friend: f ? { since: f.since, nickname: f.nickname, profileHidden: f.profileHidden } : null };
      });
    });

    /* ───────────── Anfragen ───────────── */

    app.post<{ Body: { target: string } }>(
      '/api/social/requests',
      { schema: { body: { type: 'object', required: ['target'], additionalProperties: false, properties: { target: { type: 'string', minLength: 1, maxLength: 60 } } } } },
      async (req, reply) => {
        const s = requireSession(req);
        const wait = ctx.limits.friendRequests.take(`fr:${s.userId}`);
        if (wait) throttle(wait, 'Zu viele Anfragen. Bitte später erneut versuchen.');
        const raw = req.body.target.trim();
        const isSocial = /^tg[-\s]?/i.test(raw);
        const handle = isSocial ? null : normalizeHandle(raw);
        const social = parseSocialId(raw);
        if (!handle && !social) throw new HttpError(400, 'Bitte ein Handle (@name) oder eine Social-ID (TG-XXXX-XXXX) eingeben.');
        const label = isSocial && social ? formatSocialId(social) : `@${handle}`;
        // Antwort erst nach dem COMMIT senden (withUser gibt nur zurück)
        await withUser(ctx.db, s.userId, async (c) => {
          const me = await ensureProfile(ctx, c, s.userId);
          if ((handle && me.handle === handle) || (isSocial && social === me.social_id)) throw new HttpError(400, 'Das bist du selbst.');
          const pending = await c.query("SELECT count(*)::int AS n FROM friend_requests WHERE from_user = $1 AND status = 'pending'", [s.userId]);
          if (pending.rows[0].n >= 50) throw new HttpError(429, 'Zu viele offene Anfragen. Bitte warte, bis einige beantwortet sind.');
          let target: string | null = null;
          if (handle) target = (await c.query('SELECT tg_find_user($1, $2) AS id', ['handle', handle])).rows[0].id;
          if (!target && social) target = (await c.query('SELECT tg_find_user($1, $2) AS id', ['social', social])).rows[0].id;

          if (target) {
            const fr = await c.query('SELECT tg_are_friends($1) AS f', [target]);
            if (fr.rows[0].f) return;
            // Gegenseitige Anfrage → direkt befreundet
            const rev = await c.query("SELECT id FROM friend_requests WHERE from_user = $1 AND to_user = $2 AND status = 'pending' AND expires_at > now() FOR UPDATE", [target, s.userId]);
            if (rev.rows[0]) {
              await c.query('INSERT INTO friendships(user_a, user_b) VALUES (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) ON CONFLICT DO NOTHING', [s.userId, target]);
              await c.query("UPDATE friend_requests SET status = 'accepted', responded_at = now() WHERE id = $1", [rev.rows[0].id]);
              await notify(c, { recipient: target, category: 'friends', type: 'friend.accepted' });
              return;
            }
          }
          const id = randomUUID();
          const ins = await c.query(
            `INSERT INTO friend_requests(id, from_user, to_user, target_label, status, expires_at) VALUES ($1, $2, $3, $4, 'pending', now() + make_interval(days => $5))
             ON CONFLICT DO NOTHING`,
            [id, s.userId, target, label, REQUEST_DAYS],
          );
          if (ins.rowCount && target) await notify(c, { recipient: target, category: 'friends', type: 'friend.request', ref: id });
        });
        return reply.code(202).send({ ok: true, message: GENERIC_SENT });
      },
    );

    app.post<{ Params: { id: string; action: string } }>('/api/social/requests/:id/:action', async (req) => {
      const s = requireSession(req);
      const id = ref(req.params.id);
      const action = req.params.action;
      if (!['accept', 'decline', 'cancel'].includes(action)) throw new HttpError(404, 'Nicht gefunden');
      return withUser(ctx.db, s.userId, async (c) => {
        const { rows } = await c.query("SELECT from_user, to_user FROM friend_requests WHERE id = $1 AND status = 'pending' AND expires_at > now() FOR UPDATE", [id]);
        const r = rows[0];
        if (!r) throw new HttpError(404, 'Anfrage nicht gefunden oder bereits erledigt');
        if (action === 'cancel') {
          if (r.from_user !== s.userId) throw new HttpError(404, 'Anfrage nicht gefunden oder bereits erledigt');
          await c.query("UPDATE friend_requests SET status = 'cancelled', responded_at = now() WHERE id = $1", [id]);
          return { ok: true };
        }
        if (r.to_user !== s.userId) throw new HttpError(404, 'Anfrage nicht gefunden oder bereits erledigt');
        if (action === 'decline') {
          await c.query("UPDATE friend_requests SET status = 'declined', responded_at = now() WHERE id = $1", [id]);
          return { ok: true };
        }
        const blocked = await c.query('SELECT tg_blocked_between($1) AS b', [r.from_user]);
        if (blocked.rows[0].b) throw new HttpError(404, 'Anfrage nicht gefunden oder bereits erledigt');
        await c.query('INSERT INTO friendships(user_a, user_b) VALUES (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) ON CONFLICT DO NOTHING', [s.userId, r.from_user]);
        await c.query("UPDATE friend_requests SET status = 'accepted', responded_at = now() WHERE id = $1", [id]);
        await notify(c, { recipient: r.from_user, category: 'friends', type: 'friend.accepted' });
        return { ok: true };
      });
    });

    /* ───────────── Freunde ───────────── */

    app.patch<{ Params: { id: string }; Body: { nickname?: string | null; profileHidden?: boolean } }>(
      '/api/social/friends/:id',
      { schema: { body: { type: 'object', additionalProperties: false, properties: { nickname: { type: ['string', 'null'], maxLength: 60 }, profileHidden: { type: 'boolean' } } } } },
      async (req) => {
        const s = requireSession(req);
        const id = ref(req.params.id);
        return withUser(ctx.db, s.userId, async (c) => {
          const fr = await c.query('SELECT tg_are_friends($1) AS f', [id]);
          if (!fr.rows[0].f) throw new HttpError(404, 'Freund nicht gefunden');
          const cur = await c.query('SELECT nickname, nickname_gen, profile_hidden FROM friend_settings WHERE owner_id = $1 AND friend_id = $2', [s.userId, id]);
          let nick: Buffer | null = cur.rows[0]?.nickname ?? null;
          let gen: number = cur.rows[0]?.nickname_gen ?? 1;
          if ('nickname' in req.body) {
            const n = req.body.nickname?.normalize('NFKC').trim();
            if (n && CONTROL_CHARS.test(n)) throw new HttpError(400, 'Spitzname enthält unzulässige Zeichen.');
            if (n) {
              const keys = await loadUserKeys(ctx, c, s.userId);
              nick = encrypt(keys.currentKey(), Buffer.from(n.slice(0, 40), 'utf8'), nicknameAad(s.userId, id));
              gen = keys.current;
              keys.wipe();
            } else nick = null;
          }
          const hidden = typeof req.body.profileHidden === 'boolean' ? req.body.profileHidden : (cur.rows[0]?.profile_hidden ?? false);
          await c.query(
            `INSERT INTO friend_settings(owner_id, friend_id, nickname, nickname_gen, profile_hidden) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (owner_id, friend_id) DO UPDATE SET nickname = EXCLUDED.nickname, nickname_gen = EXCLUDED.nickname_gen, profile_hidden = EXCLUDED.profile_hidden, updated_at = now()`,
            [s.userId, id, nick, gen, hidden],
          );
          return { ok: true };
        });
      },
    );

    /** Freundschaft beenden – bestehende Bereichsmitgliedschaften bleiben unberührt. */
    app.delete<{ Params: { id: string } }>('/api/social/friends/:id', async (req) => {
      const s = requireSession(req);
      const id = ref(req.params.id);
      return withUser(ctx.db, s.userId, async (c) => {
        const r = await c.query('DELETE FROM friendships WHERE user_a = least($1::uuid, $2::uuid) AND user_b = greatest($1::uuid, $2::uuid)', [s.userId, id]);
        if (!r.rowCount) throw new HttpError(404, 'Freund nicht gefunden');
        await c.query('DELETE FROM friend_settings WHERE owner_id = $1 AND friend_id = $2', [s.userId, id]);
        await settleSpaceInvites(c, s.userId, id);
        return { ok: true };
      });
    });

    /* ───────────── Blockieren ───────────── */

    app.post<{ Body: { ref: string; removeFromSpaces?: boolean } }>(
      '/api/social/blocks',
      { schema: { body: { type: 'object', required: ['ref'], additionalProperties: false, properties: { ref: { type: 'string', maxLength: 40 }, removeFromSpaces: { type: 'boolean' } } } } },
      async (req) => {
        const s = requireSession(req);
        const id = ref(req.body.ref);
        if (id === s.userId) throw new HttpError(400, 'Du kannst dich nicht selbst blockieren.');
        return withUser(ctx.db, s.userId, async (c) => {
          // Nur Konten, die man kennt (Freund, Anfragender, Bereichsmitglied)
          const v = (await viewProfiles(ctx, c, s.userId, [id])).get(id);
          if (!v) throw new HttpError(404, 'Konto nicht gefunden');
          const keys = await loadUserKeys(ctx, c, s.userId);
          const label = encrypt(keys.currentKey(), Buffer.from(labelOf(v).slice(0, 60), 'utf8'), blockLabelAad(s.userId, id));
          await c.query('INSERT INTO blocks(blocker, blocked, label, label_gen) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [s.userId, id, label, keys.current]);
          keys.wipe();
          await c.query('DELETE FROM friendships WHERE user_a = least($1::uuid, $2::uuid) AND user_b = greatest($1::uuid, $2::uuid)', [s.userId, id]);
          await c.query("UPDATE friend_requests SET status = 'declined', responded_at = now() WHERE status = 'pending' AND from_user = $2 AND to_user = $1", [s.userId, id]);
          await c.query("UPDATE friend_requests SET status = 'cancelled', responded_at = now() WHERE status = 'pending' AND from_user = $1 AND to_user = $2", [s.userId, id]);
          await settleSpaceInvites(c, s.userId, id);
          let removed = 0;
          if (req.body.removeFromSpaces !== false) {
            // Aus eigenen Bereichen entfernen (fremde Bereiche: nur der jeweilige Eigentümer)
            const sp = await c.query("SELECT m.space_id FROM space_members m JOIN space_members me ON me.space_id = m.space_id AND me.user_id = $1 AND me.role = 'owner' WHERE m.user_id = $2", [s.userId, id]);
            for (const r of sp.rows) {
              await c.query('DELETE FROM space_members WHERE space_id = $1 AND user_id = $2', [r.space_id, id]);
              await recordActivity(c, r.space_id, s.userId, 'member.removed', { subjectId: id });
              removed++;
            }
          }
          return { ok: true, removedFromSpaces: removed };
        });
      },
    );

    app.delete<{ Params: { id: string } }>('/api/social/blocks/:id', async (req) => {
      const s = requireSession(req);
      const id = ref(req.params.id);
      return withUser(ctx.db, s.userId, async (c) => {
        const r = await c.query('DELETE FROM blocks WHERE blocker = $1 AND blocked = $2', [s.userId, id]);
        return { ok: true, removed: !!r.rowCount };
      });
    });

    /* ───────────── Einladungscodes ───────────── */

    app.post<{ Body: { days?: number } }>(
      '/api/social/invites',
      { schema: { body: { type: 'object', additionalProperties: false, properties: { days: { type: 'integer', minimum: 1, maximum: 30 } } } } },
      async (req) => {
        const s = requireSession(req);
        const days = req.body.days ?? 7;
        return withUser(ctx.db, s.userId, async (c) => {
          await ensureProfile(ctx, c, s.userId);
          const active = await c.query('SELECT count(*)::int AS n FROM friend_invites WHERE created_by = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()', [s.userId]);
          if (active.rows[0].n >= 10) throw new HttpError(429, 'Höchstens 10 aktive Einladungen. Widerrufe zuerst eine bestehende.');
          const token = randomToken(24);
          const id = randomUUID();
          const r = await c.query('INSERT INTO friend_invites(id, created_by, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4)) RETURNING expires_at', [
            id,
            s.userId,
            inviteHash(ctx, token),
            days,
          ]);
          // Das Token wird nur jetzt angezeigt – gespeichert ist nur sein HMAC
          return { id, token, expiresAt: r.rows[0].expires_at };
        });
      },
    );

    app.delete<{ Params: { id: string } }>('/api/social/invites/:id', async (req) => {
      const s = requireSession(req);
      const id = ref(req.params.id);
      return withUser(ctx.db, s.userId, async (c) => {
        const r = await c.query('UPDATE friend_invites SET revoked_at = now() WHERE id = $1 AND created_by = $2 AND used_at IS NULL AND revoked_at IS NULL', [id, s.userId]);
        return { ok: true, revoked: !!r.rowCount };
      });
    });

    const tokenBody = { schema: { body: { type: 'object', required: ['token'], additionalProperties: false, properties: { token: { type: 'string', minLength: 10, maxLength: 64 } } } } };
    const INVALID = 'Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.';

    app.post<{ Body: { token: string } }>('/api/social/invites/preview', tokenBody, async (req) => {
      const s = requireSession(req);
      const wait = ctx.limits.inviteProbe.take(`inv:${s.userId}`);
      if (wait) throttle(wait);
      return withUser(ctx.db, s.userId, async (c) => {
        const { rows } = await c.query('SELECT * FROM tg_peek_friend_invite($1)', [inviteHash(ctx, req.body.token)]);
        const r = rows[0];
        if (!r) throw new HttpError(404, INVALID);
        const data = decodeProfile(ctx, r as ProfileRow);
        const vis = { ...DEFAULT_VISIBILITY, ...r.visibility };
        return {
          inviter: { ref: r.user_id, handle: r.handle, socialId: formatSocialId(r.social_id), displayName: vis.displayName === 'friends' ? (data.displayName ?? null) : null },
          expiresAt: r.expires_at,
          alreadyFriends: (await c.query('SELECT tg_are_friends($1) AS f', [r.user_id])).rows[0].f,
        };
      });
    });

    app.post<{ Body: { token: string } }>('/api/social/invites/redeem', tokenBody, async (req) => {
      const s = requireSession(req);
      const wait = ctx.limits.inviteProbe.take(`inv:${s.userId}`);
      if (wait) throttle(wait);
      return withUser(ctx.db, s.userId, async (c) => {
        await ensureProfile(ctx, c, s.userId);
        const { rows } = await c.query('SELECT tg_redeem_friend_invite($1) AS inviter', [inviteHash(ctx, req.body.token)]);
        const inviter = rows[0].inviter as string | null;
        if (!inviter) throw new HttpError(404, INVALID);
        await notify(c, { recipient: inviter, category: 'friends', type: 'friend.accepted' });
        return { ok: true, friend: (await identities(ctx, c, s.userId, [inviter])).get(inviter) ?? UNKNOWN_IDENTITY(inviter) };
      });
    });
  });
}
