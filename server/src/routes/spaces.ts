/**
 * Gemeinsame Bereiche (Phase 5.5) – jede Route prüft Mitgliedschaft und Rechte neu
 * (requireSpace) und läuft mit aktivem RLS-Kontext (withUser). Nichtmitglieder erhalten
 * 404, Mitglieder ohne Recht 403.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { type Zippable, strToU8, zipSync } from 'fflate';
import type { AppContext } from '../context.js';
import { decrypt, encrypt, spaceCommentAad, spaceFileAad } from '../crypto.js';
import { type Tx, withUser } from '../db.js';
import { KIND_MIMES, newStorageName, readBlob, removeBlob, sniffMime, trashBlob, writeBlob } from '../files.js';
import { HttpError, requireReauth, requireSession, throttle } from '../http.js';
import fp from '../plugin.js';
import { ID_RE } from '../stores.js';
import { loadUserKeys } from '../userkeys.js';
import { recordActivity } from '../collab/activity.js';
import { type SpaceAccess, UUID_RE, assertCan, forbidden, requireSpace } from '../collab/authz.js';
import { loadSpaceKeys, unwrapSpaceKey } from '../collab/keys.js';
import { notify, notifyMembers } from '../collab/notify.js';
import { ACCESS_LABEL, ASSIGNABLE, type Action, ROLES, type Role, can, isAccess } from '../collab/permissions.js';
import { applySpaceChange, decodeSpacePayload, listSpaceChanges, setResourceAccess, type SpaceChangeResult } from '../collab/records.js';
import { type ShareItem, executeShare, planBytes, planShare } from '../collab/share.js';
import { SPACE_KINDS, type SpaceKind, type SpaceMeta, cleanMeta, createSpace, decodeMeta, deleteSpace, encodeMeta, readMeta, rotateSpaceKey } from '../collab/spaces.js';
import { UNKNOWN_IDENTITY, ensureProfile, identities } from '../social/profiles.js';

const INVITE_DAYS = 14;
const ACTIONS: Action[] = [
  'space.update',
  'space.delete',
  'space.transfer',
  'space.rotateKey',
  'space.export',
  'members.invite',
  'members.changeRole',
  'members.remove',
  'members.leave',
  'resource.create',
  'resource.update',
  'resource.delete',
  'resource.setAccess',
  'resource.shareInto',
  'file.write',
  'comment.create',
  'comment.moderate',
];

function uuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(404, 'Nicht gefunden');
  return v;
}

/** Rechte für die Oberfläche – reine Anzeige, der Server prüft jede Aktion erneut. */
const permissionsFor = (sa: SpaceAccess) => Object.fromEntries(ACTIONS.map((a) => [a, can(sa.role, a, { allowExport: sa.allowExport })]));

async function spaceList(ctx: AppContext, c: Tx, me: string) {
  const { rows } = await c.query(
    `SELECT s.id, s.kind, s.owner_id, s.pending_owner_id, s.meta, s.meta_gen, s.allow_export, s.updated_at, m.role,
            (SELECT count(*)::int FROM space_members x WHERE x.space_id = s.id) AS members,
            (SELECT count(*)::int FROM space_records r WHERE r.space_id = s.id AND NOT r.deleted AND r.parent_id IS NULL) AS resources,
            (SELECT max(updated_at) FROM space_records r WHERE r.space_id = s.id) AS last_change
       FROM spaces s JOIN space_members m ON m.space_id = s.id AND m.user_id = $1 ORDER BY coalesce((SELECT max(updated_at) FROM space_records r WHERE r.space_id = s.id), s.updated_at) DESC`,
    [me],
  );
  const owners = await identities(ctx, c, me, rows.map((r) => r.owner_id));
  const out = [];
  for (const r of rows) {
    const keys = await loadSpaceKeys(ctx, c, r.id);
    const meta = decodeMeta(keys.get(r.meta_gen), r.id, r.meta);
    keys.wipe();
    out.push({
      id: r.id,
      kind: r.kind,
      ...meta,
      role: r.role as Role,
      owner: owners.get(r.owner_id) ?? UNKNOWN_IDENTITY(r.owner_id),
      pendingTransferToMe: r.pending_owner_id === me,
      members: r.members,
      resources: r.resources,
      allowExport: r.allow_export,
      updatedAt: r.last_change ?? r.updated_at,
    });
  }
  return out;
}

async function incomingInvites(ctx: AppContext, c: Tx, me: string) {
  await c.query("UPDATE space_invites SET status = 'expired' WHERE invitee = $1 AND status = 'pending' AND expires_at < now()", [me]);
  const { rows } = await c.query("SELECT id, invited_by, role, created_at, expires_at FROM space_invites WHERE invitee = $1 AND status = 'pending' ORDER BY created_at DESC", [me]);
  const ids = await identities(ctx, c, me, rows.map((r) => r.invited_by));
  const out = [];
  for (const r of rows) {
    const m = await c.query('SELECT * FROM tg_invite_space_meta($1)', [r.id]);
    const x = m.rows[0];
    if (!x) continue;
    const key = unwrapSpaceKey(ctx, x.space_id, x.meta_gen, x.dek_wrapped, x.kek_version);
    const meta = decodeMeta(key, x.space_id, x.meta);
    key.fill(0);
    out.push({ id: r.id, spaceId: x.space_id, kind: x.kind, name: meta.name, description: meta.description, accent: meta.accent, role: r.role, from: ids.get(r.invited_by) ?? UNKNOWN_IDENTITY(r.invited_by), createdAt: r.created_at, expiresAt: r.expires_at });
  }
  return out;
}

export { spaceList, incomingInvites };

export function spaceRoutes(ctx: AppContext) {
  return fp(async (app: FastifyInstance) => {
    const rate = (userId: string) => {
      const w = ctx.limits.social.take(`sp:${userId}`);
      if (w) throttle(w, 'Zu viele Aktionen in kurzer Zeit. Bitte kurz warten.');
    };

    /* ───────────── Bereiche ───────────── */

    app.get('/api/spaces', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        await ensureProfile(ctx, c, s.userId);
        return { spaces: await spaceList(ctx, c, s.userId), invites: await incomingInvites(ctx, c, s.userId) };
      });
    });

    app.post<{ Body: { name: string; description?: string; kind?: SpaceKind; accent?: SpaceMeta['accent'] } }>(
      '/api/spaces',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            additionalProperties: false,
            properties: { name: { type: 'string', maxLength: 80 }, description: { type: 'string', maxLength: 800 }, kind: { type: 'string', enum: [...SPACE_KINDS] }, accent: { type: 'string', maxLength: 20 } },
          },
        },
      },
      async (req, reply) => {
        const s = requireSession(req);
        rate(s.userId);
        const meta = cleanMeta(req.body);
        const id = await withUser(ctx.db, s.userId, async (c) => {
          await ensureProfile(ctx, c, s.userId);
          return createSpace(ctx, c, s.userId, req.body.kind ?? 'general', meta);
        });
        return reply.code(201).send({ id });
      },
    );

    app.get<{ Params: { id: string } }>('/api/spaces/:id', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'space.read');
        const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
        const meta = await readMeta(c, keys, sa.spaceId);
        keys.wipe();
        const members = await c.query('SELECT user_id, role, created_at FROM space_members WHERE space_id = $1 ORDER BY array_position($2::text[], role), created_at', [sa.spaceId, ROLES]);
        const ids = await identities(ctx, c, s.userId, members.rows.map((m) => m.user_id));
        const invites =
          sa.role === 'owner'
            ? (await c.query("SELECT id, invitee, role, created_at, expires_at FROM space_invites WHERE space_id = $1 AND status = 'pending' AND expires_at > now() ORDER BY created_at DESC", [sa.spaceId])).rows
            : [];
        const inviteIds = await identities(ctx, c, s.userId, invites.map((i) => i.invitee));
        const info = await c.query('SELECT storage_bytes, created_at, key_gen FROM spaces WHERE id = $1', [sa.spaceId]);
        return {
          space: {
            id: sa.spaceId,
            kind: sa.kind,
            ...meta,
            role: sa.role,
            allowExport: sa.allowExport,
            storageBytes: Number(info.rows[0].storage_bytes),
            createdAt: info.rows[0].created_at,
            keyGeneration: info.rows[0].key_gen,
            pendingOwner: sa.pendingOwnerId ? ((await identities(ctx, c, s.userId, [sa.pendingOwnerId])).get(sa.pendingOwnerId) ?? UNKNOWN_IDENTITY(sa.pendingOwnerId)) : null,
            pendingTransferToMe: sa.pendingOwnerId === s.userId,
          },
          me: s.userId,
          permissions: permissionsFor(sa),
          members: members.rows.map((m) => ({ ...(ids.get(m.user_id) ?? UNKNOWN_IDENTITY(m.user_id)), role: m.role, since: m.created_at, isMe: m.user_id === s.userId })),
          invites: invites.map((i) => ({ id: i.id, invitee: inviteIds.get(i.invitee) ?? UNKNOWN_IDENTITY(i.invitee), role: i.role, createdAt: i.created_at, expiresAt: i.expires_at })),
        };
      });
    });

    app.patch<{ Params: { id: string }; Body: { name?: string; description?: string; accent?: SpaceMeta['accent']; allowExport?: boolean } }>(
      '/api/spaces/:id',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: { name: { type: 'string', maxLength: 80 }, description: { type: 'string', maxLength: 800 }, accent: { type: ['string', 'null'], maxLength: 20 }, allowExport: { type: 'boolean' } },
          },
        },
      },
      async (req) => {
        const s = requireSession(req);
        return withUser(ctx.db, s.userId, async (c) => {
          const sa = await requireSpace(c, req.params.id, s.userId, 'space.update');
          const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
          const { allowExport: _ignored, ...metaInput } = req.body;
          const meta = cleanMeta({ ...metaInput, accent: req.body.accent === null ? '' : req.body.accent } as Partial<SpaceMeta>, await readMeta(c, keys, sa.spaceId));
          await c.query('UPDATE spaces SET meta = $2, meta_gen = $3, allow_export = coalesce($4, allow_export), updated_at = now() WHERE id = $1', [
            sa.spaceId,
            encodeMeta(keys.currentKey(), sa.spaceId, meta),
            keys.current,
            typeof req.body.allowExport === 'boolean' ? req.body.allowExport : null,
          ]);
          keys.wipe();
          await recordActivity(c, sa.spaceId, s.userId, 'space.updated');
          return { ok: true };
        });
      },
    );

    app.delete<{ Params: { id: string }; Body: { confirm: string } }>(
      '/api/spaces/:id',
      { schema: { body: { type: 'object', required: ['confirm'], additionalProperties: false, properties: { confirm: { type: 'string', maxLength: 80 } } } } },
      async (req) => {
        const s = requireReauth(ctx, req);
        return withUser(ctx.db, s.userId, async (c) => {
          const sa = await requireSpace(c, req.params.id, s.userId, 'space.delete');
          const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
          const meta = await readMeta(c, keys, sa.spaceId);
          keys.wipe();
          if (req.body.confirm.trim() !== meta.name) throw new HttpError(400, 'Zur Bestätigung bitte den Namen des Bereichs eingeben.');
          return { ok: true, ...(await deleteSpace(c, sa.spaceId, s.userId)) };
        });
      },
    );

    /* ───────────── Einladungen & Mitglieder ───────────── */

    app.post<{ Params: { id: string }; Body: { ref: string; role: Role } }>(
      '/api/spaces/:id/invites',
      { schema: { body: { type: 'object', required: ['ref', 'role'], additionalProperties: false, properties: { ref: { type: 'string', maxLength: 40 }, role: { type: 'string', enum: [...ASSIGNABLE] } } } } },
      async (req, reply) => {
        const s = requireSession(req);
        rate(s.userId);
        const target = uuid(req.body.ref);
        const created = await withUser(ctx.db, s.userId, async (c) => {
          const sa = await requireSpace(c, req.params.id, s.userId, 'members.invite');
          // Nur bestätigte Freunde – keine Einladungen an Unbekannte, keine Enumeration
          const rel = await c.query('SELECT tg_are_friends($1) AS f, tg_blocked_between($1) AS b', [target]);
          if (!rel.rows[0].f || rel.rows[0].b) throw new HttpError(400, 'Einladen kannst du nur bestätigte Freunde.');
          const member = await c.query('SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2', [sa.spaceId, target]);
          if (member.rowCount) throw new HttpError(409, 'Diese Person ist bereits Mitglied.');
          await c.query("UPDATE space_invites SET status = 'expired' WHERE space_id = $1 AND invitee = $2 AND status = 'pending' AND expires_at < now()", [sa.spaceId, target]);
          const id = randomUUID();
          const r = await c.query(
            `INSERT INTO space_invites(id, space_id, invitee, role, invited_by, status, expires_at) VALUES ($1, $2, $3, $4, $5, 'pending', now() + make_interval(days => $6))
             ON CONFLICT DO NOTHING`,
            [id, sa.spaceId, target, req.body.role, s.userId, INVITE_DAYS],
          );
          if (!r.rowCount) throw new HttpError(409, 'Für diese Person gibt es bereits eine offene Einladung.');
          await recordActivity(c, sa.spaceId, s.userId, 'member.invited', { subjectId: target, meta: { role: req.body.role } });
          await notify(c, { recipient: target, category: 'invites', type: 'space.invite', ref: id });
          return id;
        });
        // Antwort erst nach dem COMMIT
        return reply.code(201).send({ id: created });
      },
    );

    app.delete<{ Params: { id: string; inviteId: string } }>('/api/spaces/:id/invites/:inviteId', async (req) => {
      const s = requireSession(req);
      const inviteId = uuid(req.params.inviteId);
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'invites.revoke');
        const r = await c.query("UPDATE space_invites SET status = 'revoked', responded_at = now() WHERE id = $1 AND space_id = $2 AND status = 'pending' RETURNING invitee", [inviteId, sa.spaceId]);
        if (r.rowCount) await recordActivity(c, sa.spaceId, s.userId, 'invite.revoked', { subjectId: r.rows[0].invitee });
        return { ok: true, revoked: !!r.rowCount };
      });
    });

    app.post<{ Params: { inviteId: string; action: string } }>('/api/space-invites/:inviteId/:action', async (req) => {
      const s = requireSession(req);
      const inviteId = uuid(req.params.inviteId);
      if (!['accept', 'decline'].includes(req.params.action)) throw new HttpError(404, 'Nicht gefunden');
      return withUser(ctx.db, s.userId, async (c) => {
        const { rows } = await c.query("SELECT space_id, role, invited_by FROM space_invites WHERE id = $1 AND invitee = $2 AND status = 'pending' AND expires_at > now() FOR UPDATE", [inviteId, s.userId]);
        const inv = rows[0];
        if (!inv) throw new HttpError(404, 'Einladung nicht gefunden, abgelaufen oder widerrufen');
        if (req.params.action === 'decline') {
          await c.query("UPDATE space_invites SET status = 'declined', responded_at = now() WHERE id = $1", [inviteId]);
          return { ok: true };
        }
        const blocked = await c.query('SELECT tg_blocked_between($1) AS b', [inv.invited_by]);
        if (inv.invited_by && blocked.rows[0].b) throw new HttpError(404, 'Einladung nicht gefunden, abgelaufen oder widerrufen');
        await ensureProfile(ctx, c, s.userId);
        await c.query('INSERT INTO space_members(space_id, user_id, role, added_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [inv.space_id, s.userId, inv.role, inv.invited_by]);
        await c.query("UPDATE space_invites SET status = 'accepted', responded_at = now() WHERE id = $1", [inviteId]);
        await recordActivity(c, inv.space_id, s.userId, 'member.joined', { meta: { role: inv.role } });
        await notifyMembers(c, inv.space_id, s.userId, { category: 'access', type: 'member.joined' });
        return { ok: true, spaceId: inv.space_id };
      });
    });

    app.patch<{ Params: { id: string; userId: string }; Body: { role: Role } }>(
      '/api/spaces/:id/members/:userId',
      { schema: { body: { type: 'object', required: ['role'], additionalProperties: false, properties: { role: { type: 'string', enum: [...ASSIGNABLE] } } } } },
      async (req) => {
        const s = requireSession(req);
        const target = uuid(req.params.userId);
        return withUser(ctx.db, s.userId, async (c) => {
          const sa = await requireSpace(c, req.params.id, s.userId, 'members.changeRole');
          if (target === s.userId) throw new HttpError(400, 'Die eigene Rolle änderst du über die Eigentumsübertragung.');
          const r = await c.query("UPDATE space_members SET role = $3, updated_at = now() WHERE space_id = $1 AND user_id = $2 AND role <> 'owner' RETURNING role", [sa.spaceId, target, req.body.role]);
          if (!r.rowCount) throw new HttpError(404, 'Mitglied nicht gefunden');
          await recordActivity(c, sa.spaceId, s.userId, 'member.role', { subjectId: target, meta: { role: req.body.role } });
          await notify(c, { recipient: target, category: 'access', type: 'member.role', spaceId: sa.spaceId, ref: req.body.role });
          return { ok: true };
        });
      },
    );

    /** Mitglied entfernen (Eigentümer) oder Bereich verlassen (eigene Mitgliedschaft). */
    app.delete<{ Params: { id: string; userId: string } }>('/api/spaces/:id/members/:userId', async (req) => {
      const s = requireSession(req);
      const target = uuid(req.params.userId);
      return withUser(ctx.db, s.userId, async (c) => {
        const self = target === s.userId;
        const sa = await requireSpace(c, req.params.id, s.userId, self ? 'members.leave' : 'members.remove');
        if (self && sa.role === 'owner') throw forbidden('Als Eigentümer zuerst das Eigentum übertragen oder den Bereich löschen.');
        const exists = await c.query("SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2 AND role <> 'owner'", [sa.spaceId, target]);
        if (!exists.rowCount) throw new HttpError(404, 'Mitglied nicht gefunden');
        // Verlauf zuerst (nach dem Verlassen darf man nicht mehr in den Bereich schreiben)
        await recordActivity(c, sa.spaceId, s.userId, self ? 'member.left' : 'member.removed', self ? {} : { subjectId: target });
        if (sa.pendingOwnerId === target) await c.query('UPDATE spaces SET pending_owner_id = NULL WHERE id = $1', [sa.spaceId]);
        await c.query('DELETE FROM space_members WHERE space_id = $1 AND user_id = $2', [sa.spaceId, target]);
        await notify(c, self ? { recipient: sa.ownerId, category: 'access', type: 'member.left', spaceId: sa.spaceId } : { recipient: target, category: 'access', type: 'member.removed', spaceId: sa.spaceId });
        return { ok: true };
      });
    });

    /* ───────────── Eigentumsübertragung ───────────── */

    app.post<{ Params: { id: string }; Body: { ref: string } }>(
      '/api/spaces/:id/transfer',
      { schema: { body: { type: 'object', required: ['ref'], additionalProperties: false, properties: { ref: { type: 'string', maxLength: 40 } } } } },
      async (req) => {
        const s = requireReauth(ctx, req);
        const target = uuid(req.body.ref);
        return withUser(ctx.db, s.userId, async (c) => {
          const sa = await requireSpace(c, req.params.id, s.userId, 'space.transfer');
          if (target === s.userId) throw new HttpError(400, 'Du bist bereits Eigentümer.');
          const m = await c.query('SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2', [sa.spaceId, target]);
          if (!m.rowCount) throw new HttpError(400, 'Übertragen kannst du nur an Mitglieder dieses Bereichs.');
          await c.query('UPDATE spaces SET pending_owner_id = $2, updated_at = now() WHERE id = $1', [sa.spaceId, target]);
          await recordActivity(c, sa.spaceId, s.userId, 'space.transfer.offered', { subjectId: target });
          await notify(c, { recipient: target, category: 'access', type: 'space.transfer.offered', spaceId: sa.spaceId });
          return { ok: true };
        });
      },
    );

    app.delete<{ Params: { id: string } }>('/api/spaces/:id/transfer', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'space.read');
        if (sa.role !== 'owner' && sa.pendingOwnerId !== s.userId) throw forbidden();
        await c.query(sa.role === 'owner' ? 'UPDATE spaces SET pending_owner_id = NULL WHERE id = $1' : 'SELECT 1', sa.role === 'owner' ? [sa.spaceId] : []);
        if (sa.role !== 'owner') {
          // Abgelehnt durch das Ziel: Eigentümer informieren
          await notify(c, { recipient: sa.ownerId, category: 'access', type: 'space.transfer.offered', spaceId: sa.spaceId, ref: 'declined' });
        }
        return { ok: true };
      });
    });

    app.post<{ Params: { id: string } }>('/api/spaces/:id/transfer/accept', async (req) => {
      const s = requireReauth(ctx, req);
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'space.read');
        if (sa.pendingOwnerId !== s.userId) throw new HttpError(404, 'Keine offene Übertragung');
        // Dateien des Bereichs zählen künftig beim neuen Eigentümer
        const bytes = Number((await c.query('SELECT storage_bytes FROM spaces WHERE id = $1', [sa.spaceId])).rows[0].storage_bytes);
        const u = await c.query('SELECT storage_bytes FROM users WHERE id = $1', [s.userId]);
        if (Number(u.rows[0].storage_bytes) + bytes > ctx.config.userQuotaBytes) throw new HttpError(413, 'Dein Speicherkontingent reicht für die Dateien dieses Bereichs nicht aus.');
        const ok = (await c.query('SELECT tg_accept_transfer($1) AS ok', [sa.spaceId])).rows[0].ok;
        if (!ok) throw new HttpError(409, 'Übertragung nicht möglich');
        await c.query('UPDATE users SET storage_bytes = greatest(0, storage_bytes - $2) WHERE id = $1', [sa.ownerId, bytes]);
        await c.query('UPDATE users SET storage_bytes = storage_bytes + $2 WHERE id = $1', [s.userId, bytes]);
        await recordActivity(c, sa.spaceId, s.userId, 'space.transfer.accepted', { subjectId: sa.ownerId });
        await notifyMembers(c, sa.spaceId, s.userId, { category: 'access', type: 'space.transfer.accepted' });
        return { ok: true };
      });
    });

    app.post<{ Params: { id: string } }>('/api/spaces/:id/rotate-key', async (req) => {
      const s = requireReauth(ctx, req);
      await withUser(ctx.db, s.userId, async (c) => requireSpace(c, req.params.id, s.userId, 'space.rotateKey'));
      return rotateSpaceKey(ctx, s.userId, req.params.id);
    });

    /* ───────────── Inhalte (Sync) ───────────── */

    app.get<{ Params: { id: string }; Querystring: { since?: string; limit?: string } }>('/api/spaces/:id/changes', async (req) => {
      const s = requireSession(req);
      const since = /^\d{1,19}$/.test(req.query.since ?? '0') ? BigInt(req.query.since ?? '0') : null;
      if (since === null) throw new HttpError(400, 'Ungültiger Cursor');
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'resource.read');
        const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
        const { changes, more } = await listSpaceChanges(c, sa.spaceId, keys, since, limit);
        keys.wipe();
        return { changes, cursor: changes.length ? changes[changes.length - 1]!.seq : String(since), more, role: sa.role };
      });
    });

    app.post<{ Params: { id: string } }>('/api/spaces/:id/push', { bodyLimit: 8 * 1024 * 1024 }, async (req) => {
      const s = requireSession(req);
      const changes = (req.body as { changes?: unknown })?.changes;
      if (!Array.isArray(changes) || changes.length > 200) throw new HttpError(400, 'Ungültige Änderungsliste (max. 200)');
      return withUser(ctx.db, s.userId, async (c) => {
        // Mitgliedschaft bei JEDEM Push neu prüfen – entzogener Zugriff → 404, auch für Offline-Änderungen
        const sa = await requireSpace(c, req.params.id, s.userId);
        if (!can(sa.role, 'resource.create') && !can(sa.role, 'resource.update')) throw forbidden('Mit deiner Rolle kannst du Inhalte nur ansehen.');
        const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
        const results: SpaceChangeResult[] = [];
        const touched: { store: string; id: string }[] = [];
        for (const ch of changes) {
          await c.query('SAVEPOINT ch');
          try {
            const r = await applySpaceChange(c, sa, s.userId, keys, ch);
            results.push(r);
            if (r.status === 'ok') touched.push({ store: r.store, id: r.id });
            await c.query('RELEASE SAVEPOINT ch');
          } catch (e) {
            await c.query('ROLLBACK TO SAVEPOINT ch');
            const code = (e as { code?: string }).code;
            if (code?.startsWith('23') || code === '42501') results.push({ store: String(ch?.store), id: String(ch?.id), status: 'rejected', error: code === '42501' ? 'Keine Berechtigung' : 'Ungültiger Datensatz' });
            else throw e;
          }
        }
        keys.wipe();
        // Eine zusammengefasste Benachrichtigung je Ressource und Empfänger
        for (const t of touched.slice(0, 20)) await notifyMembers(c, sa.spaceId, s.userId, { category: 'updates', type: 'space.update', store: t.store, id: t.id }, { readable: t });
        return { results, role: sa.role };
      });
    });

    app.post<{ Params: { id: string }; Body: { store: string; id: string; access: string } }>(
      '/api/spaces/:id/access',
      { schema: { body: { type: 'object', required: ['store', 'id', 'access'], additionalProperties: false, properties: { store: { type: 'string', maxLength: 20 }, id: { type: 'string', maxLength: 80 }, access: { type: 'string', maxLength: 20 } } } } },
      async (req) => {
        const s = requireSession(req);
        if (!isAccess(req.body.access)) throw new HttpError(400, 'Unbekannte Zugriffsstufe');
        return withUser(ctx.db, s.userId, async (c) => {
          const sa = await requireSpace(c, req.params.id, s.userId, 'resource.setAccess');
          const r = await setResourceAccess(c, sa, s.userId, req.body.store, req.body.id, req.body.access as 'members');
          if (r.changed === -1) throw new HttpError(404, 'Eintrag nicht gefunden');
          if (r.changed === -2) throw new HttpError(400, 'Die Zugriffsstufe gilt für den ganzen Eintrag – bitte am übergeordneten Eintrag ändern.');
          return { ok: true, changed: r.changed, label: ACCESS_LABEL[req.body.access as 'members'] };
        });
      },
    );

    /* ───────────── Dateien ───────────── */

    type FP = { id: string; kind: string; fid: string; variant: string };
    const fileTarget = (p: FP, record?: string) => {
      if (!(p.kind in KIND_MIMES) || !ID_RE.test(p.fid)) throw new HttpError(404, 'Nicht gefunden');
      const variants = p.kind === 'photo' ? ['full', 'thumb'] : ['doc'];
      if (!variants.includes(p.variant)) throw new HttpError(404, 'Nicht gefunden');
      const recordStore = p.kind === 'photo' ? 'photos' : 'labReports';
      const recordId = p.kind === 'photo' ? p.fid : record;
      if (!recordId || !ID_RE.test(recordId)) throw new HttpError(400, 'Zugehöriger Eintrag fehlt');
      return { kind: p.kind as 'photo' | 'labdoc', fid: p.fid, variant: p.variant, recordStore, recordId };
    };

    app.put<{ Params: FP; Querystring: { record?: string } }>('/api/spaces/:id/files/:kind/:fid/:variant', { bodyLimit: ctx.config.maxUploadBytes }, async (req, reply) => {
      const s = requireSession(req);
      const t = fileTarget(req.params, req.query.record);
      const wait = ctx.limits.upload.take(`up:${s.userId}`);
      if (wait) throttle(wait, 'Zu viele Uploads. Bitte später erneut versuchen.');
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, 'Leere Datei');
      const mime = sniffMime(body);
      if (!mime || !KIND_MIMES[t.kind].includes(mime)) throw new HttpError(415, 'Dateityp nicht erlaubt');
      const name = newStorageName();
      await withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'file.write');
        const rec = await c.query('SELECT access, payload, key_gen FROM space_records WHERE space_id = $1 AND store = $2 AND id = $3 AND NOT deleted', [sa.spaceId, t.recordStore, t.recordId]);
        if (!rec.rows[0]) throw new HttpError(404, 'Zugehöriger Eintrag nicht gefunden');
        assertCan(sa, 'file.write', { access: rec.rows[0].access });
        const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
        if (t.kind === 'labdoc') {
          const d = decodeSpacePayload(keys.get(rec.rows[0].key_gen), sa.spaceId, 'labReports', t.recordId, rec.rows[0].payload) as { documentId?: string };
          if (d?.documentId !== t.fid) throw new HttpError(400, 'Dokument gehört nicht zu diesem Bericht');
        }
        const old = await c.query('SELECT size, storage_name FROM space_files WHERE space_id = $1 AND kind = $2 AND id = $3 AND variant = $4', [sa.spaceId, t.kind, t.fid, t.variant]);
        const oldSize = Number(old.rows[0]?.size ?? 0);
        const u = await c.query('SELECT storage_bytes FROM users WHERE id = $1 FOR UPDATE', [sa.ownerId]);
        if (Number(u.rows[0].storage_bytes) - oldSize + body.length > ctx.config.userQuotaBytes) throw new HttpError(413, 'Das Speicherkontingent des Bereichseigentümers ist erschöpft.');
        await writeBlob(ctx.config.fileDir, name, encrypt(keys.currentKey(), body, spaceFileAad(sa.spaceId, t.kind, t.fid, t.variant)));
        await c.query(
          `INSERT INTO space_files(space_id, kind, id, variant, mime, size, storage_name, key_gen, record_store, record_id, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (space_id, kind, id, variant) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size, storage_name = EXCLUDED.storage_name, key_gen = EXCLUDED.key_gen, uploaded_by = EXCLUDED.uploaded_by, created_at = now()`,
          [sa.spaceId, t.kind, t.fid, t.variant, mime, body.length, name, keys.current, t.recordStore, t.recordId, s.userId],
        );
        keys.wipe();
        await c.query('UPDATE spaces SET storage_bytes = greatest(0, storage_bytes - $2 + $3) WHERE id = $1', [sa.spaceId, oldSize, body.length]);
        await c.query('UPDATE users SET storage_bytes = greatest(0, storage_bytes - $2 + $3) WHERE id = $1', [sa.ownerId, oldSize, body.length]);
        if (old.rows[0]?.storage_name) await trashBlob(c, old.rows[0].storage_name);
        if (t.variant !== 'thumb') await recordActivity(c, sa.spaceId, s.userId, 'file.uploaded', { store: t.recordStore, id: t.recordId });
      }).catch(async (e) => {
        await removeBlob(ctx.config.fileDir, name).catch(() => {});
        throw e;
      });
      return reply.code(201).send({ ok: true, mime, size: body.length });
    });

    app.get<{ Params: FP }>('/api/spaces/:id/files/:kind/:fid/:variant', async (req, reply) => {
      const s = requireSession(req);
      if (!(req.params.kind in KIND_MIMES) || !ID_RE.test(req.params.fid)) throw new HttpError(404, 'Nicht gefunden');
      const data = await withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'space.read');
        // RLS: Datei nur sichtbar, wenn die zugehörige Ressource lesbar ist
        const { rows } = await c.query('SELECT mime, storage_name, key_gen, record_store, record_id FROM space_files WHERE space_id = $1 AND kind = $2 AND id = $3 AND variant = $4', [
          sa.spaceId,
          req.params.kind,
          req.params.fid,
          req.params.variant,
        ]);
        if (!rows[0]) throw new HttpError(404, 'Nicht gefunden');
        const rec = await c.query('SELECT access FROM space_records WHERE space_id = $1 AND store = $2 AND id = $3', [sa.spaceId, rows[0].record_store, rows[0].record_id]);
        if (!rec.rows[0] || !can(sa.role, 'file.read', { access: rec.rows[0].access })) throw new HttpError(404, 'Nicht gefunden');
        const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
        const body = decrypt(keys.get(rows[0].key_gen), await readBlob(ctx.config.fileDir, rows[0].storage_name), spaceFileAad(sa.spaceId, req.params.kind, req.params.fid, req.params.variant));
        keys.wipe();
        return { mime: rows[0].mime as string, body };
      });
      return reply
        .header('Content-Type', data.mime)
        .header('Content-Disposition', 'attachment')
        .header('Cache-Control', 'private, no-store')
        .header('Content-Security-Policy', "default-src 'none'; sandbox")
        .send(data.body);
    });

    /* ───────────── Kommentare ───────────── */

    const commentView = async (c: Tx, me: string, sa: SpaceAccess, rows: { id: string; target_store: string; target_id: string; parent_id: string | null; author_id: string | null; payload: Buffer | null; key_gen: number; created_at: string; edited_at: string | null; deleted_at: string | null }[]) => {
      const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
      const ids = await identities(ctx, c, me, rows.map((r) => r.author_id).filter((x): x is string => !!x));
      const out = rows.map((r) => ({
        id: r.id,
        store: r.target_store,
        targetId: r.target_id,
        parentId: r.parent_id,
        author: r.author_id ? (ids.get(r.author_id) ?? UNKNOWN_IDENTITY(r.author_id)) : UNKNOWN_IDENTITY(null),
        mine: r.author_id === me,
        text: r.payload && !r.deleted_at ? (JSON.parse(decrypt(keys.get(r.key_gen), r.payload, spaceCommentAad(sa.spaceId, r.id)).toString('utf8')) as { text: string }).text : null,
        createdAt: r.created_at,
        editedAt: r.edited_at,
        deleted: !!r.deleted_at,
        canEdit: r.author_id === me && !r.deleted_at && can(sa.role, 'comment.editOwn'),
        canDelete: !r.deleted_at && ((r.author_id === me && can(sa.role, 'comment.deleteOwn')) || can(sa.role, 'comment.moderate')),
      }));
      keys.wipe();
      return out;
    };

    app.get<{ Params: { id: string }; Querystring: { store?: string; target?: string } }>('/api/spaces/:id/comments', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'comment.read');
        const filter = req.query.store && req.query.target;
        const { rows } = await c.query(
          `SELECT id, target_store, target_id, parent_id, author_id, payload, key_gen, created_at, edited_at, deleted_at FROM space_comments
            WHERE space_id = $1 AND ($2::text IS NULL OR (target_store = $2 AND target_id = $3)) ORDER BY created_at LIMIT 500`,
          [sa.spaceId, filter ? req.query.store : null, filter ? req.query.target : null],
        );
        return { comments: await commentView(c, s.userId, sa, rows), canComment: can(sa.role, 'comment.create') };
      });
    });

    app.post<{ Params: { id: string }; Body: { store: string; target: string; text: string; parentId?: string } }>(
      '/api/spaces/:id/comments',
      {
        schema: {
          body: {
            type: 'object',
            required: ['store', 'target', 'text'],
            additionalProperties: false,
            properties: { store: { type: 'string', maxLength: 20 }, target: { type: 'string', maxLength: 80 }, text: { type: 'string', minLength: 1, maxLength: 4000 }, parentId: { type: 'string', maxLength: 40 } },
          },
        },
      },
      async (req, reply) => {
        const s = requireSession(req);
        rate(s.userId);
        const text = req.body.text.normalize('NFKC').trim();
        if (!text || text.length > 2000) throw new HttpError(400, 'Kommentar: 1–2000 Zeichen.');
        const created = await withUser(ctx.db, s.userId, async (c) => {
          const sa = await requireSpace(c, req.params.id, s.userId, 'comment.create');
          const rec = await c.query('SELECT access, deleted FROM space_records WHERE space_id = $1 AND store = $2 AND id = $3', [sa.spaceId, req.body.store, req.body.target]);
          if (!rec.rows[0] || rec.rows[0].deleted || !can(sa.role, 'comment.read', { access: rec.rows[0].access })) throw new HttpError(404, 'Eintrag nicht gefunden');
          let parentAuthor: string | null = null;
          if (req.body.parentId) {
            const p = await c.query('SELECT author_id, parent_id FROM space_comments WHERE id = $1 AND space_id = $2 AND target_store = $3 AND target_id = $4', [
              uuid(req.body.parentId),
              sa.spaceId,
              req.body.store,
              req.body.target,
            ]);
            if (!p.rows[0]) throw new HttpError(404, 'Kommentar nicht gefunden');
            if (p.rows[0].parent_id) throw new HttpError(400, 'Antworten sind nur auf oberster Ebene möglich.');
            parentAuthor = p.rows[0].author_id;
          }
          const id = randomUUID();
          const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
          await c.query('INSERT INTO space_comments(id, space_id, target_store, target_id, parent_id, author_id, payload, key_gen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
            id,
            sa.spaceId,
            req.body.store,
            req.body.target,
            req.body.parentId ?? null,
            s.userId,
            encrypt(keys.currentKey(), Buffer.from(JSON.stringify({ text }), 'utf8'), spaceCommentAad(sa.spaceId, id)),
            keys.current,
          ]);
          keys.wipe();
          await recordActivity(c, sa.spaceId, s.userId, 'comment.created', { store: req.body.store, id: req.body.target });
          const t = { store: req.body.store, id: req.body.target };
          if (parentAuthor && parentAuthor !== s.userId) await notify(c, { recipient: parentAuthor, category: 'comments', type: 'comment.reply', spaceId: sa.spaceId, store: t.store, id: t.id, ref: id });
          await notifyMembers(c, sa.spaceId, s.userId, { category: 'comments', type: 'comment.new', store: t.store, id: t.id, ref: id }, { readable: t });
          return id;
        });
        return reply.code(201).send({ id: created });
      },
    );

    app.patch<{ Params: { id: string; cid: string }; Body: { text: string } }>(
      '/api/spaces/:id/comments/:cid',
      { schema: { body: { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string', minLength: 1, maxLength: 4000 } } } } },
      async (req) => {
        const s = requireSession(req);
        const cid = uuid(req.params.cid);
        const text = req.body.text.normalize('NFKC').trim();
        if (!text || text.length > 2000) throw new HttpError(400, 'Kommentar: 1–2000 Zeichen.');
        return withUser(ctx.db, s.userId, async (c) => {
          const sa = await requireSpace(c, req.params.id, s.userId, 'comment.editOwn');
          const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
          const r = await c.query('UPDATE space_comments SET payload = $3, key_gen = $4, edited_at = now() WHERE id = $1 AND space_id = $2 AND author_id = $5 AND deleted_at IS NULL', [
            cid,
            sa.spaceId,
            encrypt(keys.currentKey(), Buffer.from(JSON.stringify({ text }), 'utf8'), spaceCommentAad(sa.spaceId, cid)),
            keys.current,
            s.userId,
          ]);
          keys.wipe();
          if (!r.rowCount) throw new HttpError(404, 'Kommentar nicht gefunden');
          return { ok: true };
        });
      },
    );

    app.delete<{ Params: { id: string; cid: string } }>('/api/spaces/:id/comments/:cid', async (req) => {
      const s = requireSession(req);
      const cid = uuid(req.params.cid);
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'comment.read');
        const { rows } = await c.query('SELECT author_id FROM space_comments WHERE id = $1 AND space_id = $2 AND deleted_at IS NULL', [cid, sa.spaceId]);
        if (!rows[0]) throw new HttpError(404, 'Kommentar nicht gefunden');
        const own = rows[0].author_id === s.userId;
        assertCan(sa, own ? 'comment.deleteOwn' : 'comment.moderate');
        await c.query('UPDATE space_comments SET payload = NULL, deleted_at = now() WHERE id = $1', [cid]);
        return { ok: true };
      });
    });

    /* ───────────── Aktivität ───────────── */

    app.get<{ Params: { id: string }; Querystring: { before?: string } }>('/api/spaces/:id/activity', async (req) => {
      const s = requireSession(req);
      const before = /^\d{1,19}$/.test(req.query.before ?? '') ? req.query.before! : null;
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'activity.read');
        const { rows } = await c.query(
          `SELECT id, actor_id, type, target_store, target_id, subject_id, meta, count, created_at, updated_at FROM space_activity
            WHERE space_id = $1 AND ($2::bigint IS NULL OR id < $2) ORDER BY id DESC LIMIT 60`,
          [sa.spaceId, before],
        );
        const ids = await identities(ctx, c, s.userId, rows.flatMap((r) => [r.actor_id, r.subject_id]).filter(Boolean));
        return {
          activity: rows.map((r) => ({
            id: String(r.id),
            type: r.type,
            actor: r.actor_id ? (ids.get(r.actor_id) ?? UNKNOWN_IDENTITY(r.actor_id)) : UNKNOWN_IDENTITY(null),
            subject: r.subject_id ? (ids.get(r.subject_id) ?? UNKNOWN_IDENTITY(r.subject_id)) : null,
            store: r.target_store,
            targetId: r.target_id,
            meta: r.meta,
            count: r.count,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
          more: rows.length === 60,
        };
      });
    });

    /* ───────────── Export ───────────── */

    app.get<{ Params: { id: string } }>('/api/spaces/:id/export', async (req, reply) => {
      const s = requireSession(req);
      const zip = await withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'space.export');
        const keys = await loadSpaceKeys(ctx, c, sa.spaceId);
        const meta = await readMeta(c, keys, sa.spaceId);
        // Nur, was die eigene Rolle lesen darf (RLS filtert zusätzlich)
        const recs = await c.query('SELECT store, id, payload, key_gen, access, origin FROM space_records WHERE space_id = $1 AND NOT deleted ORDER BY store, id', [sa.spaceId]);
        const data: Record<string, unknown[]> = {};
        const readable = new Set<string>();
        for (const r of recs.rows) {
          if (!can(sa.role, 'resource.read', { access: r.access })) continue;
          readable.add(`${r.store}:${r.id}`);
          (data[r.store] ??= []).push(decodeSpacePayload(keys.get(r.key_gen), sa.spaceId, r.store, r.id, r.payload));
        }
        const files: Zippable = {};
        const list: { kind: string; id: string; variant: string; path: string; mime: string }[] = [];
        const fr = await c.query('SELECT kind, id, variant, mime, storage_name, key_gen, record_store, record_id FROM space_files WHERE space_id = $1', [sa.spaceId]);
        for (const f of fr.rows) {
          if (!readable.has(`${f.record_store}:${f.record_id}`)) continue;
          const body = decrypt(keys.get(f.key_gen), await readBlob(ctx.config.fileDir, f.storage_name), spaceFileAad(sa.spaceId, f.kind, f.id, f.variant));
          const ext = f.mime.includes('png') ? 'png' : f.mime.includes('webp') ? 'webp' : f.mime.includes('pdf') ? 'pdf' : 'jpg';
          const path = `${f.kind === 'photo' ? 'photos' : 'documents'}/${f.id}${f.variant === 'thumb' ? '.thumb' : ''}.${ext}`;
          files[path] = new Uint8Array(body);
          list.push({ kind: f.kind, id: f.id, variant: f.variant, path, mime: f.mime });
        }
        keys.wipe();
        files['manifest.json'] = strToU8(
          JSON.stringify({ app: 'TERPGRID', kind: 'space-export', format: 1, exportedAt: new Date().toISOString(), space: { name: meta.name, description: meta.description ?? '', role: sa.role }, data, files: list }, null, 2),
        );
        return zipSync(files, { level: 0 });
      });
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="terpgrid-bereich-${new Date().toISOString().slice(0, 10)}.zip"`)
        .send(Buffer.from(zip));
    });

    /* ───────────── Teilen (Kopie / Verschieben) ───────────── */

    const shareSchema = {
      schema: {
        body: {
          type: 'object',
          required: ['items', 'mode'],
          additionalProperties: false,
          properties: {
            items: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', required: ['store', 'id'], additionalProperties: false, properties: { store: { type: 'string', maxLength: 20 }, id: { type: 'string', maxLength: 80 } } } },
            mode: { type: 'string', enum: ['copy', 'move'] },
            options: {
              type: 'object',
              additionalProperties: false,
              properties: { photos: { type: 'boolean' }, tasks: { type: 'boolean' }, quantities: { type: 'boolean' }, costs: { type: 'boolean' }, notes: { type: 'boolean' }, documents: { type: 'boolean' } },
            },
          },
        },
      },
    };
    type ShareBody = { items: ShareItem[]; mode: 'copy' | 'move'; options?: Record<string, boolean> };

    /** Vorschau ohne Zielbereich (z. B. beim Anlegen eines neuen Bereichs) – liest nur eigene Daten. */
    app.post<{ Body: ShareBody }>('/api/share/preview', shareSchema, async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const keys = await loadUserKeys(ctx, c, s.userId);
        const plan = await planShare(c, s.userId, keys, req.body.items, req.body.mode, req.body.options);
        keys.wipe();
        plan.summary.bytes = await planBytes(c, s.userId, plan);
        return { summary: plan.summary, mode: plan.mode, role: 'owner' as Role };
      });
    });

    app.post<{ Params: { id: string }; Body: ShareBody }>('/api/spaces/:id/share/preview', shareSchema, async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'resource.shareInto');
        const keys = await loadUserKeys(ctx, c, s.userId);
        const plan = await planShare(c, s.userId, keys, req.body.items, req.body.mode, req.body.options);
        keys.wipe();
        plan.summary.bytes = await planBytes(c, s.userId, plan);
        return { summary: plan.summary, mode: plan.mode, role: sa.role };
      });
    });

    app.post<{ Params: { id: string }; Body: ShareBody }>('/api/spaces/:id/share', { ...shareSchema, bodyLimit: 1024 * 1024 }, async (req) => {
      const s = requireSession(req);
      rate(s.userId);
      return withUser(ctx.db, s.userId, async (c) => {
        const sa = await requireSpace(c, req.params.id, s.userId, 'resource.shareInto');
        const userKeys = await loadUserKeys(ctx, c, s.userId);
        const spaceKeys = await loadSpaceKeys(ctx, c, sa.spaceId);
        try {
          const plan = await planShare(c, s.userId, userKeys, req.body.items, req.body.mode, req.body.options);
          const r = await executeShare(ctx, c, sa, s.userId, userKeys, spaceKeys, plan);
          return { ok: true, mode: plan.mode, ...r, ids: plan.records.filter((x) => req.body.items.some((i) => i.store === x.fromStore && i.id === x.fromId)).map((x) => ({ store: x.store, id: x.id })) };
        } finally {
          userKeys.wipe();
          spaceKeys.wipe();
        }
      });
    });

  });
}
