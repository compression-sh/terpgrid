/**
 * Administration des Sortenkatalogs: Vollständigkeit, Anreicherungsläufe, Prüfliste der Abgleiche.
 * Nur für Admins; ändert ausschließlich öffentliche Katalog-Metadaten (keine Nutzerdaten).
 */
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import { type AuditReport, catalogAudit } from '../catalog/audit.js';
import { MAX_BATCH, PROVIDERS, type Provider, enrichBatch } from '../catalog/enrich.js';
import type { AppContext } from '../context.js';
import { HttpError, requireAdmin } from '../http.js';
import fp from '../plugin.js';

const ADMIN_BATCH = 25;

export function catalogAdminRoutes(ctx: AppContext) {
  let cache: { at: number; report: AuditReport } | null = null;
  let running: Promise<unknown> | null = null;

  return fp(async (app: FastifyInstance) => {
    app.get<{ Querystring: { refresh?: string } }>('/api/admin/catalog/quality', async (req) => {
      requireAdmin(req);
      if (!cache || req.query.refresh === '1' || Date.now() - cache.at > 10 * 60_000) cache = { at: Date.now(), report: await catalogAudit(ctx.db) };
      const imp = (await ctx.db.query("SELECT version, imported_at, report->>'parserVersion' AS parser FROM catalog_imports WHERE status = 'active'")).rows[0];
      return { ...cache.report, dataset: imp ?? null, cachedAt: new Date(cache.at).toISOString() };
    });

    app.get('/api/admin/catalog/runs', async (req) => {
      requireAdmin(req);
      const { rows } = await ctx.db.query(
        'SELECT id, provider, dry_run, status, requested, processed, matched, claims, errors, checkpoint, started_by, started_at, finished_at FROM catalog_enrichment_runs ORDER BY id DESC LIMIT 20',
      );
      return { runs: rows, running: !!running, providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, license: p.license, ttlDays: p.ttlDays })), maxBatch: ADMIN_BATCH };
    });

    app.post<{ Body: { provider: Provider; limit: number; dryRun?: boolean } }>(
      '/api/admin/catalog/enrich',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['provider', 'limit'],
            properties: { provider: { type: 'string', enum: Object.keys(PROVIDERS) }, limit: { type: 'integer', minimum: 1, maximum: ADMIN_BATCH }, dryRun: { type: 'boolean' } },
          },
        },
      },
      async (req, reply) => {
        const s = requireAdmin(req);
        if (running) throw new HttpError(409, 'Es läuft bereits eine Anreicherung.');
        await audit(ctx, 'admin.catalog.enrich', { userId: s.userId, meta: { provider: req.body.provider, limit: req.body.limit, dryRun: !!req.body.dryRun } });
        // Läuft im Hintergrund weiter; Fortschritt über /runs (Checkpoint je Sorte)
        running = enrichBatch(ctx.db, { provider: req.body.provider, limit: Math.min(ADMIN_BATCH, MAX_BATCH, req.body.limit), dryRun: req.body.dryRun, startedBy: 'admin', fetchImpl: ctx.fetchImpl })
          .catch(() => undefined)
          .finally(() => {
            running = null;
            cache = null;
          });
        return reply.code(202).send({ started: true });
      },
    );

    app.get<{ Querystring: { status?: string; provider?: string; page?: string } }>('/api/admin/catalog/matches', async (req) => {
      requireAdmin(req);
      const status = ['probable', 'ambiguous', 'exact', 'rejected', 'none'].includes(req.query.status ?? '') ? req.query.status! : 'probable';
      const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
      const params: unknown[] = [status];
      let where = 'm.status = $1';
      if (req.query.provider && req.query.provider in PROVIDERS) {
        params.push(req.query.provider);
        where += ` AND m.provider = $${params.length}`;
      }
      const total = Number((await ctx.db.query(`SELECT count(*) AS n FROM catalog_matches m WHERE ${where}`, params)).rows[0]?.n ?? 0);
      params.push((page - 1) * 30);
      const { rows } = await ctx.db.query(
        `SELECT m.provider, m.provider_id, m.provider_name, m.provider_breeder, m.status, m.cultivar_id, m.candidates, m.reason, m.decided_by, m.decided_at,
                c.name AS cultivar_name, b.name AS cultivar_breeder
           FROM catalog_matches m LEFT JOIN catalog_cultivars c ON c.id = m.cultivar_id LEFT JOIN catalog_breeders b ON b.id = c.breeder_id
          WHERE ${where} ORDER BY m.decided_at DESC, m.provider_id LIMIT 30 OFFSET $${params.length}`,
        params,
      );
      return { items: rows, total, page };
    });

    app.post<{ Params: { provider: string; id: string }; Body: { action: 'accept' | 'reject'; cultivarId?: string } }>(
      '/api/admin/catalog/matches/:provider/:id',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['action'],
            properties: { action: { type: 'string', enum: ['accept', 'reject'] }, cultivarId: { type: 'string', pattern: '^[a-z0-9-]{1,260}$' } },
          },
        },
      },
      async (req) => {
        const s = requireAdmin(req);
        if (!(req.params.provider in PROVIDERS) || !/^[A-Za-z0-9:_-]{1,120}$/.test(req.params.id)) throw new HttpError(400, 'Ungültige Kennung');
        const m = (await ctx.db.query('SELECT status, cultivar_id, candidates FROM catalog_matches WHERE provider = $1 AND provider_id = $2', [req.params.provider, req.params.id])).rows[0];
        if (!m) throw new HttpError(404, 'Abgleich nicht gefunden');
        if (req.body.action === 'reject') {
          await ctx.db.query("UPDATE catalog_matches SET status = 'rejected', decided_by = 'admin', decided_at = now() WHERE provider = $1 AND provider_id = $2", [req.params.provider, req.params.id]);
          await ctx.db.query("UPDATE catalog_claims SET review_status = 'rejected' WHERE provider = $1 AND source_record_id = $2", [req.params.provider, req.params.id]);
        } else {
          // Freigabe nur für eine Sorte aus den Kandidaten (keine freie Zuordnung)
          const target = req.body.cultivarId ?? m.cultivar_id;
          if (!target || !(m.candidates as string[]).includes(target)) throw new HttpError(400, 'Bitte eine Sorte aus den Kandidaten wählen.');
          await ctx.db.query("UPDATE catalog_matches SET status = 'exact', cultivar_id = $3, decided_by = 'admin', decided_at = now() WHERE provider = $1 AND provider_id = $2", [
            req.params.provider,
            req.params.id,
            target,
          ]);
          // Bereits geladene Angaben (bei „probable“ als „pending“ gespeichert) freigeben; sonst lädt der nächste Lauf sie
          await ctx.db.query("UPDATE catalog_claims SET review_status = 'accepted', cultivar_id = $3 WHERE provider = $1 AND source_record_id = $2 AND review_status = 'pending'", [
            req.params.provider,
            req.params.id,
            target,
          ]);
        }
        await audit(ctx, 'admin.catalog.review', { userId: s.userId, meta: { provider: req.params.provider, action: req.body.action } });
        cache = null;
        return { ok: true };
      },
    );
  });
}
