import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import type { AppContext } from '../context.js';
import { withUser } from '../db.js';
import { HttpError, requireSession } from '../http.js';
import fp from '../plugin.js';
import { type ChangeResult, applyChange, assertChanges, listChanges } from '../records.js';
import { loadUserKeys } from '../userkeys.js';

export function syncRoutes(ctx: AppContext) {
  return fp(async (app: FastifyInstance) => {
    app.get<{ Querystring: { since?: string; limit?: string } }>('/api/sync/changes', async (req) => {
      const s = requireSession(req);
      const since = /^\d{1,19}$/.test(req.query.since ?? '0') ? BigInt(req.query.since ?? '0') : null;
      if (since === null) throw new HttpError(400, 'Ungültiger Cursor');
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
      return withUser(ctx.db, s.userId, async (c) => {
        const keys = await loadUserKeys(ctx, c, s.userId);
        const changes = await listChanges(c, s.userId, keys, since, limit + 1);
        keys.wipe();
        const more = changes.length > limit;
        const page = more ? changes.slice(0, limit) : changes;
        return { changes: page, cursor: page.length ? page[page.length - 1]!.seq : String(since), more };
      });
    });

    app.post('/api/sync/push', { bodyLimit: 8 * 1024 * 1024 }, async (req) => {
      const s = requireSession(req);
      const changes = assertChanges(req.body);
      const results: ChangeResult[] = await withUser(ctx.db, s.userId, async (c) => {
        const keys = await loadUserKeys(ctx, c, s.userId);
        const out: ChangeResult[] = [];
        for (const ch of changes) {
          // Savepoint je Änderung: ein Fehler bricht nicht den ganzen Stapel ab
          await c.query('SAVEPOINT ch');
          try {
            out.push(await applyChange(c, s.userId, keys, ch));
            await c.query('RELEASE SAVEPOINT ch');
          } catch (e) {
            await c.query('ROLLBACK TO SAVEPOINT ch');
            if ((e as { code?: string }).code?.startsWith('23')) out.push({ store: String(ch?.store), id: String(ch?.id), status: 'rejected', error: 'Ungültiger Datensatz' });
            else throw e;
          }
        }
        keys.wipe();
        return out;
      });
      if (changes.some((c) => c?.mode === 'import')) await audit(ctx, 'import', { userId: s.userId, meta: { count: changes.length } });
      return { results };
    });

    app.get('/api/sync/summary', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const { rows } = await c.query('SELECT store, count(*) FILTER (WHERE NOT deleted)::int AS n, coalesce(max(seq), 0)::text AS seq FROM records WHERE user_id = $1 GROUP BY store', [s.userId]);
        const f = await c.query('SELECT kind, variant, count(*)::int AS n FROM files WHERE user_id = $1 GROUP BY kind, variant', [s.userId]);
        return { records: Object.fromEntries(rows.map((r) => [r.store, r.n])), files: f.rows };
      });
    });
  });
}
