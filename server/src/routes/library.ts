/**
 * Lokaler Sortenkatalog (CI-Strains-Pro in PostgreSQL): Suche, Sorten, Breeder.
 * Öffentliche Referenzdaten; Zugriff nur für angemeldete Konten (kein offener Datenendpunkt).
 * Suchanfragen verlassen den eigenen Server nicht.
 */
import type { FastifyInstance } from 'fastify';
import { attribution, activeImport } from '../catalog/importer.js';
import { slugify } from '../catalog/cisp.js';
import type { AppContext } from '../context.js';
import { HttpError, requireSession } from '../http.js';
import fp from '../plugin.js';

const ID_RE = /^[a-z0-9-]{1,260}$/;
const BREEDER_RE = /^[a-z0-9]{1,80}$/;

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
};
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Trefferart je Rang (für ehrliche Gruppierung in der Oberfläche) */
export const TIERS = ['exact', 'prefix', 'name', 'related', 'similar'] as const;

interface CultivarRow {
  id: string;
  breeder_id: string;
  breeder_name: string;
  name: string;
  version: string | null;
  auto: boolean;
  aliases: string[];
  seed_types: string[];
  genetics_type: string | null;
  thc_min: string | null;
  thc_max: string | null;
  cbd_max: string | null;
  has_lineage: boolean;
  terpenes: string[];
  values: Record<string, unknown>;
  conflicts: string[];
  seed_banks: string[];
  listing_count: number;
  tier?: number;
}

function cultivarOut(r: CultivarRow, full = false) {
  const v = r.values as { parents?: { name: string; slug: string }[]; cbd?: { min?: number; max?: number }; thc?: { min?: number; max?: number }; flowering?: { min?: number; max?: number }; indica?: number; sativa?: number };
  return {
    id: r.id,
    name: r.name,
    version: r.version ?? undefined,
    breeder: { id: r.breeder_id, name: r.breeder_name },
    auto: r.auto,
    aliases: r.aliases,
    seedTypes: r.seed_types,
    geneticsType: r.genetics_type ?? undefined,
    thc: v.thc,
    cbd: v.cbd,
    flowering: v.flowering,
    indica: v.indica,
    sativa: v.sativa,
    parents: v.parents ?? [],
    terpenes: r.terpenes,
    seedBanks: r.seed_banks,
    listingCount: r.listing_count,
    conflicts: r.conflicts,
    match: r.tier !== undefined ? TIERS[r.tier] : undefined,
    ...(full ? { values: r.values } : {}),
  };
}

const SELECT_CULTIVAR = `c.id, c.breeder_id, b.name AS breeder_name, c.name, c.version, c.auto, c.aliases, c.seed_types, c.genetics_type,
  c.thc_min, c.thc_max, c.cbd_max, c.has_lineage, c.terpenes, c."values", c.conflicts, c.seed_banks, c.listing_count`;

const TYPE_MAP: Record<string, string> = { indica: 'Indica Dominant', sativa: 'Sativa Dominant', balanced: 'Balanced Hybrid' };

export function libraryRoutes(ctx: AppContext) {
  return fp(async (app: FastifyInstance) => {
    app.get('/api/catalog/local/status', async (req) => {
      requireSession(req);
      let imp;
      try {
        imp = await activeImport(ctx.db);
      } catch {
        imp = undefined;
      }
      if (!imp) return { available: false, attribution };
      const r = imp.report as { cultivars: number; breeders: number; accepted: number; coverage: unknown };
      return {
        available: true,
        version: imp.version,
        sha256: imp.sha256,
        importedAt: imp.imported_at,
        counts: { cultivars: r.cultivars, breeders: r.breeders, listings: r.accepted },
        coverage: r.coverage,
        attribution,
      };
    });

    app.get('/api/catalog/local/report', async (req) => {
      requireSession(req);
      const imp = await activeImport(ctx.db);
      if (!imp) throw new HttpError(404, 'Kein Katalog importiert');
      return { version: imp.version, importedAt: imp.imported_at, report: imp.report, attribution };
    });

    app.get<{ Querystring: Record<string, string | undefined> }>('/api/catalog/local/search', async (req) => {
      requireSession(req);
      const qs = req.query;
      const q = String(qs.q ?? '').trim().toLowerCase().slice(0, 80);
      const page = int(qs.page, 1, 1, 10_000);
      const perPage = int(qs.perPage, 24, 1, 100);
      const params: unknown[] = [];
      const p = (v: unknown) => {
        params.push(v);
        return `$${params.length}`;
      };
      const where: string[] = [];
      let tierSql = 'NULL::int';
      if (q) {
        const pq = p(q);
        const pl = p(`%${likeEscape(q)}%`);
        const pp = p(`${likeEscape(q)}%`);
        const pts = `plainto_tsquery('simple', ${pq})`;
        where.push(`(c.name_lower LIKE ${pl} OR c.search @@ ${pts} OR c.name_lower % ${pq})`);
        tierSql = `CASE WHEN c.name_lower = ${pq} THEN 0
                        WHEN c.name_lower LIKE ${pp} OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE lower(a) = ${pq}) THEN 1
                        WHEN c.name_lower LIKE ${pl} THEN 2
                        WHEN c.search @@ ${pts} THEN 3 ELSE 4 END`;
      }
      if (qs.breeder) {
        if (!BREEDER_RE.test(qs.breeder)) throw new HttpError(400, 'Ungültiger Breeder');
        where.push(`c.breeder_id = ${p(qs.breeder)}`);
      }
      if (qs.type && TYPE_MAP[qs.type]) where.push(`c.genetics_type = ${p(TYPE_MAP[qs.type])}`);
      if (qs.auto === '1') where.push('c.auto');
      if (qs.auto === '0') where.push('NOT c.auto');
      if (qs.seed === 'feminisiert' || qs.seed === 'regulär') where.push(`${p(qs.seed)} = ANY(c.seed_types)`);
      if (qs.lineage === '1') where.push('c.has_lineage');
      if (qs.thc === '1') where.push('c.thc_max IS NOT NULL');
      const thcMin = Number(qs.thcMin);
      if (qs.thcMin && Number.isFinite(thcMin)) where.push(`c.thc_max >= ${p(thcMin)}`);
      const cbdMin = Number(qs.cbdMin);
      if (qs.cbdMin && Number.isFinite(cbdMin)) where.push(`c.cbd_max >= ${p(cbdMin)}`);
      if (qs.terpene && /^[a-z0-9 -]{2,30}$/.test(qs.terpene)) where.push(`${p(qs.terpene)} = ANY(c.terpenes)`);
      if (qs.parent && ID_RE.test(qs.parent)) where.push(`${p(qs.parent)} = ANY(c.parent_slugs)`);
      const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sort = qs.sort ?? (q ? 'relevance' : 'name');
      const order =
        sort === 'thc'
          ? 'c.thc_max DESC NULLS LAST, c.name_lower, c.id'
          : sort === 'breeder'
            ? 'b.name, c.name_lower, c.id'
            : sort === 'listings'
              ? 'c.listing_count DESC, c.name_lower, c.id'
              : q && sort === 'relevance'
                ? `tier, similarity(c.name_lower, $1) DESC, c.listing_count DESC, c.name_lower, c.id`
                : 'c.name_lower, c.id';
      const base = `FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id ${W}`;
      const counts = await ctx.db.query<{ tier: number | null; n: string }>(`SELECT ${tierSql} AS tier, count(*) AS n ${base} GROUP BY 1`, params);
      const total = counts.rows.reduce((a, r) => a + Number(r.n), 0);
      const groups: Record<string, number> = {};
      for (const r of counts.rows) if (r.tier !== null) groups[TIERS[r.tier]!] = Number(r.n);
      const lim = p(perPage);
      const off = p((page - 1) * perPage);
      const { rows } = await ctx.db.query<CultivarRow>(
        `SELECT * FROM (SELECT ${SELECT_CULTIVAR}, c.name_lower, ${tierSql} AS tier, b.name AS bname ${base}) c ORDER BY ${order.replace(/b\.name/g, 'c.bname')} LIMIT ${lim} OFFSET ${off}`,
        params,
      );
      return { items: rows.map((r) => cultivarOut({ ...r, tier: q ? (r.tier ?? undefined) : undefined })), total, page, perPage, totalPages: Math.ceil(total / perPage), groups, query: q };
    });

    app.get<{ Params: { id: string } }>('/api/catalog/local/cultivars/:id', async (req) => {
      requireSession(req);
      if (!ID_RE.test(req.params.id)) throw new HttpError(400, 'Ungültige Kennung');
      const { rows } = await ctx.db.query<CultivarRow & { name_slug: string }>(`SELECT ${SELECT_CULTIVAR}, c.name_slug FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id WHERE c.id = $1`, [req.params.id]);
      const c = rows[0];
      if (!c) throw new HttpError(404, 'Sorte nicht im Katalog');
      const listings = await ctx.db.query(
        `SELECT id, seed_bank, breeder_raw, name_original, source_url, scraped_at, "values", rejected FROM catalog_listings WHERE cultivar_id = $1 ORDER BY seed_bank, id`,
        [c.id],
      );
      const parents = ((c.values as { parents?: { name: string; slug: string }[] }).parents ?? []).map((x) => x.slug).filter(Boolean);
      const parentMatches = parents.length
        ? (
            await ctx.db.query<{ name_slug: string; id: string; name: string; breeder_name: string; auto: boolean }>(
              `SELECT c.name_slug, c.id, c.name, b.name AS breeder_name, c.auto FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id
                WHERE c.name_slug = ANY($1) ORDER BY c.name_slug, c.listing_count DESC, c.id`,
              [parents],
            )
          ).rows
        : [];
      const children = await ctx.db.query<CultivarRow>(
        `SELECT ${SELECT_CULTIVAR} FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id WHERE $1 = ANY(c.parent_slugs) ORDER BY c.listing_count DESC, c.name_lower, c.id LIMIT 24`,
        [c.name_slug],
      );
      const childCount = await ctx.db.query<{ n: string }>('SELECT count(*) AS n FROM catalog_cultivars WHERE $1 = ANY(parent_slugs)', [c.name_slug]);
      const sameName = await ctx.db.query<CultivarRow>(
        `SELECT ${SELECT_CULTIVAR} FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id WHERE c.name_slug = $1 AND c.id <> $2 ORDER BY b.name, c.id LIMIT 30`,
        [c.name_slug, c.id],
      );
      const imp = await activeImport(ctx.db);
      return {
        cultivar: cultivarOut(c, true),
        listings: listings.rows.map((l) => ({
          id: l.id,
          seedBank: l.seed_bank,
          breederRaw: l.breeder_raw,
          nameOriginal: l.name_original,
          sourceUrl: l.source_url,
          scrapedAt: l.scraped_at ? new Date(l.scraped_at).toISOString().slice(0, 10) : undefined,
          values: l.values,
          rejected: Object.keys(l.rejected ?? {}),
        })),
        parentMatches: parents.map((slug) => ({ slug, matches: parentMatches.filter((m) => m.name_slug === slug).slice(0, 8).map((m) => ({ id: m.id, name: m.name, breeder: m.breeder_name, auto: m.auto })) })),
        children: children.rows.map((r) => cultivarOut(r)),
        childCount: Number(childCount.rows[0]?.n ?? 0),
        sameName: sameName.rows.map((r) => cultivarOut(r)),
        dataset: imp ? { version: imp.version, importedAt: imp.imported_at } : undefined,
        attribution,
      };
    });

    /**
     * Abstammungsgraph aus dokumentierten Elternangaben (Breitensuche, max. 4 Generationen, max. 80 Knoten).
     * Ein Elternname wird nur aufgelöst, wenn genau EINE Sorte im Katalog so heißt; sonst „mehrdeutig“
     * (Kandidaten verschiedener Breeder werden nicht gleichgesetzt) bzw. „nicht im Katalog“.
     * Widersprüchliche Elternangaben verschiedener Seedbanks erscheinen als alternative Kanten.
     */
    app.get<{ Params: { id: string }; Querystring: { depth?: string } }>('/api/catalog/local/lineage/:id', async (req) => {
      requireSession(req);
      if (!ID_RE.test(req.params.id)) throw new HttpError(400, 'Ungültige Kennung');
      const maxDepth = int(req.query.depth, 3, 1, 4);
      const MAX_NODES = 80;
      type P = { name: string; slug: string; unknown?: boolean };
      type Row = CultivarRow & { name_slug: string };
      const load = async (where: string, arg: unknown) =>
        (await ctx.db.query<Row>(`SELECT ${SELECT_CULTIVAR}, c.name_slug FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id WHERE ${where} ORDER BY c.listing_count DESC, c.id`, [arg])).rows;
      const root = (await load('c.id = $1', req.params.id))[0];
      if (!root) throw new HttpError(404, 'Sorte nicht im Katalog');
      interface N {
        id: string;
        kind: 'root' | 'strain' | 'ambiguous' | 'unresolved' | 'unknown';
        label: string;
        depth: number;
        cultivar?: ReturnType<typeof cultivarOut>;
        candidates?: ReturnType<typeof cultivarOut>[];
        flags: string[];
        expanded: boolean;
      }
      const nodes = new Map<string, N>();
      const edges: { from: string; to: string; kind: 'documented' | 'alternative' }[] = [];
      let truncated = false;
      const addEdge = (from: string, to: string, kind: 'documented' | 'alternative') => {
        if (!edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to, kind });
      };
      nodes.set(root.id, { id: root.id, kind: 'root', label: root.name, depth: 0, cultivar: cultivarOut(root), flags: root.conflicts.includes('parents') ? ['conflict'] : [], expanded: true });
      let level: Row[] = [root];
      for (let depth = 0; level.length && depth < maxDepth; depth++) {
        // Elternangaben je Sorte: primär + abweichende Angaben anderer Seedbanks
        const sets = new Map<string, { primary: P[]; alternatives: P[][] }>();
        for (const c of level) {
          const primary = ((c.values as { parents?: P[] }).parents ?? []) as P[];
          const alternatives: P[][] = [];
          if (c.conflicts.includes('parents')) {
            const ls = await ctx.db.query<{ values: { parents?: P[] } }>(`SELECT "values" FROM catalog_listings WHERE cultivar_id = $1`, [c.id]);
            const key = (ps: P[]) => ps.map((x) => x.slug || x.name).sort().join('×');
            const seen = new Set([key(primary)]);
            for (const l of ls.rows) {
              const ps = l.values.parents ?? [];
              if (ps.length && !seen.has(key(ps))) {
                seen.add(key(ps));
                alternatives.push(ps);
              }
            }
          }
          sets.set(c.id, { primary, alternatives: alternatives.slice(0, 3) });
        }
        const slugs = [...new Set([...sets.values()].flatMap((s) => [...s.primary, ...s.alternatives.flat()]).filter((p) => !p.unknown && p.slug).map((p) => p.slug))];
        const found = slugs.length ? await load('c.name_slug = ANY($1)', slugs) : [];
        const bySlug = new Map<string, Row[]>();
        for (const r of found) bySlug.set(r.name_slug, [...(bySlug.get(r.name_slug) ?? []), r]);
        const next: Row[] = [];
        for (const c of level) {
          const s = sets.get(c.id)!;
          const place = (p: P, i: number, kind: 'documented' | 'alternative') => {
            if (nodes.size >= MAX_NODES) {
              truncated = true;
              return;
            }
            if (p.unknown || !p.slug) {
              const id = `unknown:${c.id}:${kind}:${i}`;
              nodes.set(id, { id, kind: 'unknown', label: p.name, depth: depth + 1, flags: ['unknown'], expanded: true });
              return addEdge(id, c.id, kind);
            }
            const hits = bySlug.get(p.slug) ?? [];
            if (hits.length === 1) {
              const h = hits[0]!;
              if (!nodes.has(h.id)) {
                nodes.set(h.id, { id: h.id, kind: 'strain', label: h.name, depth: depth + 1, cultivar: cultivarOut(h), flags: h.conflicts.includes('parents') ? ['conflict'] : [], expanded: false });
                next.push(h);
              }
              return addEdge(h.id, c.id, kind);
            }
            const id = hits.length > 1 ? `ambiguous:${p.slug}` : `name:${p.slug}`;
            if (!nodes.has(id))
              nodes.set(id, {
                id,
                kind: hits.length > 1 ? 'ambiguous' : 'unresolved',
                label: p.name,
                depth: depth + 1,
                candidates: hits.length > 1 ? hits.slice(0, 12).map((h) => cultivarOut(h)) : undefined,
                flags: hits.length > 1 ? [`${hits.length} gleichnamige Sorten`, ...(hits.some((h) => h.breeder_id === c.breeder_id) ? ['same-breeder-candidate'] : [])] : ['not-in-catalog'],
                expanded: true,
              });
            addEdge(id, c.id, kind);
          };
          s.primary.forEach((p, i) => place(p, i, 'documented'));
          s.alternatives.forEach((alt, j) => alt.forEach((p, i) => place(p, j * 10 + i, 'alternative')));
          const n = nodes.get(c.id);
          if (n) n.expanded = true;
        }
        level = next;
      }
      // Tiefste Ebene: Sorten mit weiteren dokumentierten Eltern sind gekürzt
      for (const r of level) if (((r.values as { parents?: P[] }).parents ?? []).length) truncated = true;
      return { rootId: root.id, nodes: [...nodes.values()], edges, truncated, maxDepth, attribution };
    });

    app.get<{ Params: { slug: string } }>('/api/catalog/local/by-name/:slug', async (req) => {
      requireSession(req);
      const slug = slugify(req.params.slug);
      if (!slug) throw new HttpError(400, 'Ungültiger Name');
      const { rows } = await ctx.db.query<CultivarRow>(
        `SELECT ${SELECT_CULTIVAR} FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id WHERE c.name_slug = $1 ORDER BY c.listing_count DESC, c.id LIMIT 40`,
        [slug],
      );
      const childCount = await ctx.db.query<{ n: string }>('SELECT count(*) AS n FROM catalog_cultivars WHERE $1 = ANY(parent_slugs)', [slug]);
      return { slug, items: rows.map((r) => cultivarOut(r)), childCount: Number(childCount.rows[0]?.n ?? 0) };
    });

    app.get<{ Querystring: Record<string, string | undefined> }>('/api/catalog/local/breeders', async (req) => {
      requireSession(req);
      const qs = req.query;
      const q = String(qs.q ?? '').trim().toLowerCase().slice(0, 60);
      const page = int(qs.page, 1, 1, 1000);
      const perPage = int(qs.perPage, 48, 1, 200);
      const params: unknown[] = [];
      const where: string[] = [];
      if (q) {
        params.push(`%${likeEscape(q)}%`, q);
        where.push(`(lower(name) LIKE $1 OR lower(name) % $2 OR EXISTS (SELECT 1 FROM unnest(variants) v WHERE lower(v) LIKE $1))`);
      }
      if (qs.letter) {
        if (qs.letter === '#') where.push(`id ~ '^[0-9]'`);
        else if (/^[a-z]$/.test(qs.letter)) {
          params.push(qs.letter);
          where.push(`left(id, 1) = $${params.length}`);
        }
      }
      if (qs.kind === 'seedbank') where.push('is_seed_bank');
      if (qs.kind === 'collab') where.push(`cardinality(collab_members) > 0`);
      const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const order = qs.sort === 'cultivars' ? 'cultivar_count DESC, lower(name)' : 'lower(name)';
      const total = Number((await ctx.db.query<{ n: string }>(`SELECT count(*) AS n FROM catalog_breeders ${W}`, params)).rows[0]?.n ?? 0);
      const letters = (await ctx.db.query<{ l: string; n: string }>(`SELECT CASE WHEN id ~ '^[0-9]' THEN '#' ELSE left(id, 1) END AS l, count(*) AS n FROM catalog_breeders GROUP BY 1 ORDER BY 1`)).rows;
      params.push(perPage, (page - 1) * perPage);
      const { rows } = await ctx.db.query(
        `SELECT id, name, variants, is_seed_bank, collab_members, seed_banks, cultivar_count, listing_count FROM catalog_breeders ${W} ORDER BY ${order}, id LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return {
        items: rows.map((b) => ({ id: b.id, name: b.name, variants: b.variants, isSeedBank: b.is_seed_bank, collabMembers: b.collab_members, seedBanks: b.seed_banks, cultivarCount: b.cultivar_count, listingCount: b.listing_count })),
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        letters: Object.fromEntries(letters.map((l) => [l.l, Number(l.n)])),
      };
    });

    app.get<{ Params: { id: string } }>('/api/catalog/local/breeders/:id', async (req) => {
      requireSession(req);
      if (!BREEDER_RE.test(req.params.id)) throw new HttpError(400, 'Ungültige Kennung');
      const { rows } = await ctx.db.query(`SELECT id, name, variants, is_seed_bank, collab_members, seed_banks, cultivar_count, listing_count FROM catalog_breeders WHERE id = $1`, [req.params.id]);
      const b = rows[0];
      if (!b) throw new HttpError(404, 'Breeder nicht im Katalog');
      const stats = (
        await ctx.db.query(
          `SELECT count(*) AS n, count(*) FILTER (WHERE auto) AS auto, count(*) FILTER (WHERE has_lineage) AS lineage, count(*) FILTER (WHERE thc_max IS NOT NULL) AS thc,
                  count(*) FILTER (WHERE genetics_type = 'Indica Dominant') AS indica, count(*) FILTER (WHERE genetics_type = 'Sativa Dominant') AS sativa,
                  count(*) FILTER (WHERE genetics_type = 'Balanced Hybrid') AS balanced
             FROM catalog_cultivars WHERE breeder_id = $1`,
          [b.id],
        )
      ).rows[0];
      const topParents = (
        await ctx.db.query<{ slug: string; n: string }>(
          `SELECT p AS slug, count(*) AS n FROM catalog_cultivars, unnest(parent_slugs) p WHERE breeder_id = $1 AND p <> 'ruderalis' GROUP BY p ORDER BY count(*) DESC, p LIMIT 12`,
          [b.id],
        )
      ).rows;
      // Kooperationen, an denen dieser Breeder beteiligt ist (z. B. „X x Y“)
      const collabs = (await ctx.db.query(`SELECT id, name, cultivar_count FROM catalog_breeders WHERE id <> $1 AND $2 = ANY(SELECT lower(m) FROM unnest(collab_members) m) ORDER BY name`, [b.id, b.name.toLowerCase()])).rows;
      return {
        breeder: { id: b.id, name: b.name, variants: b.variants, isSeedBank: b.is_seed_bank, collabMembers: b.collab_members, seedBanks: b.seed_banks, cultivarCount: b.cultivar_count, listingCount: b.listing_count },
        stats: Object.fromEntries(Object.entries(stats ?? {}).map(([k, v]) => [k, Number(v)])),
        topParents: topParents.map((t) => ({ slug: t.slug, count: Number(t.n) })),
        collaborations: collabs.map((c) => ({ id: c.id, name: c.name, cultivarCount: c.cultivar_count })),
        attribution,
      };
    });
  });
}
