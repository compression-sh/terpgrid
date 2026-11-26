/**
 * Private In-App-Benachrichtigungen und Datenschutz-Center 2.0 (Phase 5.5).
 * Benachrichtigungen enthalten keine Inhalte; Bereichsnamen werden nur Mitgliedern
 * entschlüsselt. Deep-Links baut der Client – geöffnet wird regulär autorisiert.
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { type Tx, withUser } from '../db.js';
import { HttpError, requireSession } from '../http.js';
import fp from '../plugin.js';
import { loadSpaceKeys } from '../collab/keys.js';
import { NOTIFICATION_CATEGORIES, OPTIONAL_CATEGORIES } from '../collab/notify.js';
import { decodeMeta } from '../collab/spaces.js';
import { DEFAULT_VISIBILITY, UNKNOWN_IDENTITY, ensureProfile, identities } from '../social/profiles.js';
import { listBlocks, listFriendInvites, listFriends, listRequests } from './social.js';
import { incomingInvites, spaceList } from './spaces.js';

async function spaceNames(ctx: AppContext, c: Tx, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  // RLS: nur Bereiche, in denen ich Mitglied bin
  const { rows } = await c.query('SELECT id, meta, meta_gen FROM spaces WHERE id = ANY($1::uuid[]) AND tg_space_role(id) IS NOT NULL', [unique]);
  for (const r of rows) {
    const keys = await loadSpaceKeys(ctx, c, r.id);
    out.set(r.id, decodeMeta(keys.get(r.meta_gen), r.id, r.meta).name);
    keys.wipe();
  }
  return out;
}

export function notificationRoutes(ctx: AppContext) {
  return fp(async (app: FastifyInstance) => {
    app.get('/api/notifications/unread', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const { rows } = await c.query('SELECT category, count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL GROUP BY category', [s.userId]);
        const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.n]));
        return { count: rows.reduce((a, r) => a + r.n, 0), byCategory };
      });
    });

    app.get<{ Querystring: { before?: string; category?: string; unread?: string } }>('/api/notifications', async (req) => {
      const s = requireSession(req);
      const before = /^\d{1,19}$/.test(req.query.before ?? '') ? req.query.before! : null;
      const category = (NOTIFICATION_CATEGORIES as readonly string[]).includes(req.query.category ?? '') ? req.query.category! : null;
      return withUser(ctx.db, s.userId, async (c) => {
        // Alte, gelesene Meldungen nach 90 Tagen entfernen (beim Lesen, ohne Hintergrundjob)
        await c.query("DELETE FROM notifications WHERE user_id = $1 AND (dismissed_at < now() - interval '30 days' OR (read_at IS NOT NULL AND updated_at < now() - interval '90 days'))", [s.userId]);
        const { rows } = await c.query(
          `SELECT id, category, type, actor_id, space_id, target_store, target_id, ref_id, count, created_at, updated_at, read_at FROM notifications
            WHERE user_id = $1 AND dismissed_at IS NULL AND ($2::bigint IS NULL OR id < $2) AND ($3::text IS NULL OR category = $3) AND ($4::boolean IS FALSE OR read_at IS NULL)
            ORDER BY updated_at DESC, id DESC LIMIT 50`,
          [s.userId, before, category, req.query.unread === '1'],
        );
        const actors = await identities(ctx, c, s.userId, rows.map((r) => r.actor_id).filter(Boolean));
        const names = await spaceNames(ctx, c, rows.map((r) => r.space_id));
        return {
          notifications: rows.map((r) => ({
            id: String(r.id),
            category: r.category,
            type: r.type,
            actor: r.actor_id ? (actors.get(r.actor_id) ?? UNKNOWN_IDENTITY(r.actor_id)) : null,
            spaceId: r.space_id && names.has(r.space_id) ? r.space_id : null,
            spaceName: r.space_id ? (names.get(r.space_id) ?? null) : null,
            store: r.target_store,
            targetId: r.target_id,
            ref: r.ref_id,
            count: r.count,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            read: !!r.read_at,
          })),
          more: rows.length === 50,
        };
      });
    });

    app.post<{ Body: { ids?: string[]; all?: boolean } }>(
      '/api/notifications/read',
      { schema: { body: { type: 'object', additionalProperties: false, properties: { ids: { type: 'array', maxItems: 200, items: { type: 'string', pattern: '^\\d{1,19}$' } }, all: { type: 'boolean' } } } } },
      async (req) => {
        const s = requireSession(req);
        return withUser(ctx.db, s.userId, async (c) => {
          const r = req.body.all
            ? await c.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [s.userId])
            : await c.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::bigint[])', [s.userId, req.body.ids ?? []]);
          return { ok: true, updated: r.rowCount };
        });
      },
    );

    app.post<{ Params: { id: string } }>('/api/notifications/:id/dismiss', async (req) => {
      const s = requireSession(req);
      if (!/^\d{1,19}$/.test(req.params.id)) throw new HttpError(404, 'Nicht gefunden');
      return withUser(ctx.db, s.userId, async (c) => {
        const r = await c.query('UPDATE notifications SET dismissed_at = now(), read_at = coalesce(read_at, now()) WHERE user_id = $1 AND id = $2', [s.userId, req.params.id]);
        return { ok: true, dismissed: !!r.rowCount };
      });
    });

    app.get('/api/notifications/prefs', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const p = await ensureProfile(ctx, c, s.userId);
        return { prefs: Object.fromEntries(NOTIFICATION_CATEGORIES.map((k) => [k, k === 'access' ? true : p.notify_prefs[k] !== false])), locked: ['access'] };
      });
    });

    app.put<{ Body: Record<string, boolean> }>(
      '/api/notifications/prefs',
      { schema: { body: { type: 'object', additionalProperties: false, properties: Object.fromEntries(NOTIFICATION_CATEGORIES.map((k) => [k, { type: 'boolean' }])) } } },
      async (req) => {
        const s = requireSession(req);
        return withUser(ctx.db, s.userId, async (c) => {
          await ensureProfile(ctx, c, s.userId);
          const prefs = Object.fromEntries(OPTIONAL_CATEGORIES.map((k) => [k, req.body[k] !== false]));
          await c.query('UPDATE profiles SET notify_prefs = $2, updated_at = now() WHERE user_id = $1', [s.userId, JSON.stringify(prefs)]);
          return { prefs: { ...prefs, access: true } };
        });
      },
    );

    /**
     * Datenschutz-Center 2.0: vollständige Übersicht, wer was sehen kann – Freunde,
     * Blockierungen, Profil-Sichtbarkeit, eigene und erhaltene Freigaben, Mitgliedschaften,
     * offene Einladungen und Benachrichtigungseinstellungen.
     */
    app.get('/api/privacy/overview', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const p = await ensureProfile(ctx, c, s.userId);
        const spaces = await spaceList(ctx, c, s.userId);
        const shared = await c.query(
          `SELECT space_id, origin, count(*)::int AS n FROM space_records WHERE created_by = $1 AND origin IN ('copy', 'move') AND NOT deleted AND parent_id IS NULL GROUP BY space_id, origin`,
          [s.userId],
        );
        const outInv = await c.query(
          `SELECT i.id, i.space_id, i.invitee, i.role, i.expires_at FROM space_invites i WHERE i.invited_by = $1 AND i.status = 'pending' AND i.expires_at > now() ORDER BY i.created_at DESC`,
          [s.userId],
        );
        const invitees = await identities(ctx, c, s.userId, outInv.rows.map((r) => r.invitee));
        const names = new Map(spaces.map((x) => [x.id, x.name]));
        return {
          profile: { handle: p.handle, visibility: { ...DEFAULT_VISIBILITY, ...p.visibility }, requestsEnabled: p.requests_enabled },
          friends: await listFriends(ctx, c, s.userId),
          blocks: await listBlocks(ctx, c, s.userId),
          requests: await listRequests(ctx, c, s.userId),
          friendInvites: await listFriendInvites(c, s.userId),
          ownedSpaces: spaces.filter((x) => x.role === 'owner'),
          memberships: spaces.filter((x) => x.role !== 'owner'),
          outgoingShares: shared.rows.map((r) => ({ spaceId: r.space_id, spaceName: names.get(r.space_id) ?? null, mode: r.origin, count: r.n })),
          spaceInvitesIncoming: await incomingInvites(ctx, c, s.userId),
          spaceInvitesOutgoing: outInv.rows.map((r) => ({ id: r.id, spaceId: r.space_id, spaceName: names.get(r.space_id) ?? null, invitee: invitees.get(r.invitee) ?? UNKNOWN_IDENTITY(r.invitee), role: r.role, expiresAt: r.expires_at })),
          notificationPrefs: Object.fromEntries(NOTIFICATION_CATEGORIES.map((k) => [k, k === 'access' ? true : p.notify_prefs[k] !== false])),
        };
      });
    });
  });
}
