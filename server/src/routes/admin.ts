/**
 * Minimale Administration. Bewusst KEIN Zugriff auf private Inhalte anderer:
 * nur Konten-Metadaten, aggregierte Zahlen, Einladungen, Systemzustand.
 */
import { randomUUID } from 'node:crypto';
import { readFile, statfs } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import type { AppContext } from '../context.js';
import { hmac, randomToken } from '../crypto.js';
import { schemaStatus } from '../migrate.js';
import { HttpError, requireAdmin, requireReauth } from '../http.js';
import fp from '../plugin.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function adminRoutes(ctx: AppContext) {
  return fp(async (app: FastifyInstance) => {
    const admin = (req: Parameters<typeof requireAdmin>[0], reauth = false) => {
      const s = requireAdmin(req);
      if (reauth) requireReauth(ctx, req);
      return s;
    };

    app.get('/api/admin/overview', async (req) => {
      admin(req);
      const users = await ctx.db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'active')::int AS active, count(*) FILTER (WHERE status = 'suspended')::int AS suspended, coalesce(sum(storage_bytes), 0)::text AS storage FROM users");
      const inv = await ctx.db.query('SELECT count(*) FILTER (WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now())::int AS open FROM invitations');
      const sess = await ctx.db.query('SELECT count(*)::int AS n FROM sessions WHERE expires_at > now()');
      const sec = await ctx.db.query(
        "SELECT type, count(*)::int AS n FROM audit_events WHERE created_at > now() - interval '7 days' AND type IN ('login.failure','login.throttled','recovery.failure','recovery.success','admin.user.status','invite.create','invite.revoke','account.delete') GROUP BY type",
      );
      const recent = await ctx.db.query(
        "SELECT type, created_at, ip_tag FROM audit_events WHERE type IN ('login.throttled','recovery.failure','recovery.success','admin.user.status','account.delete') ORDER BY id DESC LIMIT 20",
      );
      let disk: { freeBytes: number; totalBytes: number } | null = null;
      try {
        const st = await statfs(ctx.config.fileDir);
        disk = { freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize };
      } catch {
        disk = null;
      }
      let backup: unknown = null;
      if (ctx.config.backupStatusFile) {
        try {
          const raw = JSON.parse(await readFile(ctx.config.backupStatusFile, 'utf8'));
          backup = { lastSuccess: typeof raw.lastSuccess === 'string' ? raw.lastSuccess : null, lastCheck: typeof raw.lastCheck === 'string' ? raw.lastCheck : null, ok: raw.ok === true };
        } catch {
          backup = { ok: false, lastSuccess: null, lastCheck: null };
        }
      }
      return {
        version: ctx.config.version,
        startedAt: ctx.startedAt,
        inviteOnly: ctx.config.inviteOnly,
        users: { ...users.rows[0], storage: Number(users.rows[0].storage) },
        openInvites: inv.rows[0].open,
        activeSessions: sess.rows[0].n,
        errors: ctx.errors,
        securityEvents7d: Object.fromEntries(sec.rows.map((r) => [r.type, r.n])),
        recentSecurityEvents: recent.rows,
        disk,
        backup,
        health: { database: 'ok' },
      };
    });

    /** System Health: nur Betriebskennzahlen, keine personenbezogenen Daten */
    app.get('/api/admin/system', async (req) => {
      admin(req);
      const t0 = performance.now();
      let db: Record<string, unknown> = { ok: false };
      try {
        const r = await ctx.db.query('SELECT pg_database_size(current_database())::text AS size, (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS connections');
        db = { ok: true, latencyMs: Math.round((performance.now() - t0) * 10) / 10, sizeBytes: Number(r.rows[0].size), connections: r.rows[0].connections, pool: { total: ctx.db.totalCount, idle: ctx.db.idleCount, waiting: ctx.db.waitingCount } };
      } catch {
        db = { ok: false };
      }
      const schema = await schemaStatus(ctx.db);
      const trash = await ctx.db.query('SELECT count(*)::int AS n FROM file_trash');
      const rot = await ctx.db.query("SELECT count(DISTINCT user_id)::int AS n FROM user_keys WHERE state = 'retiring'");
      // Gesamtbelegung durch Nutzerdateien (aggregiert, ohne Personenbezug)
      // (files steht unter Row-Level-Security – die je Konto gepflegte Summe in users wird verwendet)
      const files = (await ctx.db.query<{ bytes: string }>('SELECT coalesce(sum(storage_bytes), 0)::text AS bytes FROM users')).rows[0]!;
      const catalog = await catalogHealth(ctx.db);
      const mem = process.memoryUsage();
      let disk: { freeBytes: number; totalBytes: number } | null = null;
      try {
        const st = await statfs(ctx.config.fileDir);
        disk = { freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize };
      } catch {
        disk = null;
      }
      return {
        version: ctx.config.version,
        node: process.version,
        memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed },
        http: ctx.metrics.snapshot(),
        db,
        schema: { applied: schema.applied.length, pending: schema.pending, unknown: schema.unknown },
        storage: { disk, trashBlobs: trash.rows[0].n, userFilesBytes: Number(files.bytes) },
        catalog,
        keys: { rotationsInProgress: rot.rows[0].n },
        tasks: { failures: ctx.tasks.failures, lastFailure: ctx.tasks.lastFailure ?? null },
        errors: ctx.errors,
      };
    });

    app.get('/api/admin/users', async (req) => {
      admin(req);
      const { rows } = await ctx.db.query(
        'SELECT id, login_name, login_kind, display_name, role, status, totp_enabled, storage_bytes, created_at, last_login_at FROM users ORDER BY created_at',
      );
      return { users: rows.map((r) => ({ ...r, storage_bytes: Number(r.storage_bytes) })) };
    });

    app.post<{ Params: { id: string }; Body: { status: 'active' | 'suspended' } }>(
      '/api/admin/users/:id/status',
      { schema: { body: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { enum: ['active', 'suspended'] } } } } },
      async (req) => {
        const s = admin(req, true);
        if (!UUID_RE.test(req.params.id)) throw new HttpError(404, 'Nicht gefunden');
        if (req.params.id === s.userId) throw new HttpError(409, 'Das eigene Konto kann nicht gesperrt werden.');
        const r = await ctx.db.query('UPDATE users SET status = $2 WHERE id = $1', [req.params.id, req.body.status]);
        if (r.rowCount === 0) throw new HttpError(404, 'Nicht gefunden');
        if (req.body.status === 'suspended') await ctx.db.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
        await audit(ctx, 'admin.user.status', { userId: s.userId, ip: req.ip, meta: { status: req.body.status } });
        return { ok: true };
      },
    );

    app.get('/api/admin/invites', async (req) => {
      admin(req);
      const { rows } = await ctx.db.query(
        `SELECT i.id, i.note, i.created_at, i.expires_at, i.used_at, i.revoked_at, u.login_name AS used_by
           FROM invitations i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC LIMIT 100`,
      );
      return { invites: rows };
    });

    app.post<{ Body: { days?: number; note?: string } }>(
      '/api/admin/invites',
      { schema: { body: { type: 'object', additionalProperties: false, properties: { days: { type: 'integer', minimum: 1, maximum: 30 }, note: { type: 'string', maxLength: 120 } } } } },
      async (req) => {
        const s = admin(req, true);
        const token = randomToken(24);
        const id = randomUUID();
        const days = req.body.days ?? 7;
        await ctx.db.query('INSERT INTO invitations(id, token_hash, created_by, note, expires_at) VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))', [
          id,
          hmac(ctx.macKeys.invite, token),
          s.userId,
          req.body.note?.trim() || null,
          days,
        ]);
        await audit(ctx, 'invite.create', { userId: s.userId, ip: req.ip, meta: { days } });
        // Klartext-Token nur in dieser Antwort; gespeichert wird nur der HMAC
        return { id, token, url: `${ctx.config.publicOrigin}/#/register?invite=${token}`, expiresInDays: days };
      },
    );

    app.delete<{ Params: { id: string } }>('/api/admin/invites/:id', async (req) => {
      const s = admin(req, true);
      if (!UUID_RE.test(req.params.id)) throw new HttpError(404, 'Nicht gefunden');
      const r = await ctx.db.query('UPDATE invitations SET revoked_at = now() WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL', [req.params.id]);
      if (r.rowCount === 0) throw new HttpError(404, 'Einladung nicht gefunden oder bereits verwendet');
      await audit(ctx, 'invite.revoke', { userId: s.userId, ip: req.ip });
      return { ok: true };
    });
  });
}

/**
 * Zustand des Sortenkatalogs und der StrainAPI-Zwischenspeicherung für die Systemansicht.
 * status: unused = keine Anreicherung genutzt · ok = nichts läuft in 7 Tagen ab · due = Angaben laufen bald ab ·
 * overdue = abgelaufene Angaben noch nicht entfernt (Aktualisierung lief nicht).
 */
export async function catalogHealth(db: { query: AppContext['db']['query'] }) {
  const imp = (await db.query<{ version: string; imported_at: Date; cultivars: number }>(
    "SELECT version, imported_at, (SELECT count(*)::int FROM catalog_cultivars) AS cultivars FROM catalog_imports WHERE status = 'active' LIMIT 1",
  )).rows[0];
  const c = (await db.query<{ active: number; expiring: number; expired: number; next_expiry: Date | null }>(
    `SELECT count(*) FILTER (WHERE expires_at IS NULL OR expires_at > now())::int AS active,
            count(*) FILTER (WHERE expires_at > now() AND expires_at < now() + interval '7 days')::int AS expiring,
            count(*) FILTER (WHERE expires_at <= now())::int AS expired,
            min(expires_at) FILTER (WHERE expires_at > now()) AS next_expiry
       FROM catalog_claims WHERE review_status = 'accepted'`,
  )).rows[0]!;
  const last = (await db.query<{ id: number; status: string; started_by: string; started_at: Date; finished_at: Date | null; errors: unknown[] }>(
    'SELECT id, status, started_by, started_at, finished_at, errors FROM catalog_enrichment_runs WHERE NOT dry_run ORDER BY started_at DESC LIMIT 1',
  )).rows[0];
  const status = c.active + c.expired === 0 ? 'unused' : c.expired > 0 ? 'overdue' : c.expiring > 0 ? 'due' : 'ok';
  return {
    dataset: imp ? { version: imp.version, importedAt: imp.imported_at, cultivars: imp.cultivars } : null,
    claims: { active: c.active, expiringIn7d: c.expiring, expired: c.expired, nextExpiry: c.next_expiry },
    lastRun: last ? { id: last.id, status: last.status, startedBy: last.started_by, startedAt: last.started_at, finishedAt: last.finished_at, errors: Array.isArray(last.errors) ? last.errors.length : 0 } : null,
    status,
  };
}
