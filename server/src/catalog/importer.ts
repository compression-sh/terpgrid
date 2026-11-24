/**
 * Import des CI-Strains-Pro-Datensatzes in PostgreSQL.
 *
 * - Eine Transaktion: Bei einem Fehler bleibt der bisherige Katalog unverändert.
 * - Idempotent: Ist dieselbe Datei (SHA-256) bereits aktiv, passiert nichts (außer mit force).
 * - Upsert nach stabilen IDs (Listing = strain_id der Quelle, Sorte = Breeder+Name+Version+Auto);
 *   Einträge, die in der neuen Version fehlen, werden entfernt.
 * - Persönliche Daten (verschlüsselte Datensätze) werden nie angefasst: Verknüpfungen eigener Sorten
 *   speichern nur den Schlüssel „cisp:<id>“ und eine eigene Kopie der Angaben.
 * - Rückkehr zu einer älteren Version: denselben Befehl mit der älteren Datei bzw. dem älteren Commit ausführen.
 */
import type pg from 'pg';
import { CISP, slugify, type Breeder, type Cultivar, type Listing, type ParsedDataset } from './cisp.js';

type Q = Pick<pg.PoolClient, 'query'>;

export interface ImportResult {
  status: 'imported' | 'unchanged' | 'dry-run';
  importId?: number;
  breeders: number;
  cultivars: number;
  listings: number;
  removed?: { breeders: number; cultivars: number; listings: number };
}

const BATCH = 1500;

function chunks<T>(xs: T[], n = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function cultivarRow(c: Cultivar, breeders: Map<string, Breeder>, importId: number) {
  const b = breeders.get(c.breederId)!;
  const v = c.values;
  return {
    id: c.id,
    breeder_id: c.breederId,
    name: c.name,
    name_lower: c.name.toLowerCase(),
    name_slug: slugify(c.name),
    version: c.version ?? null,
    auto: c.auto,
    aliases: c.aliases,
    seed_types: c.seedTypes,
    genetics_type: v.geneticsType ?? null,
    thc_min: v.thc?.min ?? v.thc?.max ?? null,
    thc_max: v.thc?.max ?? v.thc?.min ?? null,
    cbd_max: v.cbd?.max ?? v.cbd?.min ?? null,
    has_lineage: !!v.parents?.length,
    parent_slugs: (v.parents ?? []).map((p) => p.slug),
    terpenes: v.terpenes ?? [],
    values: v,
    conflicts: c.conflicts,
    seed_banks: c.seedBanks,
    listing_count: c.listingIds.length,
    // Gewichtete Suchtexte: A Name, B Aliase/Breeder, C Eltern/Seedbanks, D Terpene/Typ
    sa: [c.name, c.version ?? ''].join(' '),
    sb: [...c.aliases, b.name, ...b.variants].join(' '),
    sc: [...(v.parents ?? []).map((p) => p.name), ...c.seedBanks].join(' '),
    sd: [...(v.terpenes ?? []), v.geneticsType ?? '', c.auto ? 'auto autoflower autoflowering' : '', ...c.seedTypes].join(' '),
    import_id: importId,
  };
}

const listingRow = (l: Listing, importId: number) => ({
  id: l.id,
  cultivar_id: l.cultivarId,
  seed_bank: l.seedBank,
  breeder_raw: l.breederRaw,
  name_original: l.nameOriginal,
  source_url: l.sourceUrl,
  scraped_at: l.scrapedAt ?? null,
  values: l.values,
  rejected: l.rejected,
  import_id: importId,
});

export async function activeImport(db: Q): Promise<{ id: number; version: string; sha256: string; imported_at: Date; report: unknown } | undefined> {
  const { rows } = await db.query("SELECT id, version, sha256, imported_at, report FROM catalog_imports WHERE source = 'cisp' AND status = 'active'");
  return rows[0];
}

export async function importDataset(client: pg.PoolClient, data: ParsedDataset, opts: { dryRun?: boolean; force?: boolean; log?: (m: string) => void } = {}): Promise<ImportResult> {
  const log = opts.log ?? (() => {});
  const counts = { breeders: data.breeders.length, cultivars: data.cultivars.length, listings: data.listings.length };
  if (opts.dryRun) return { status: 'dry-run', ...counts };
  const active = await activeImport(client);
  if (active && active.sha256 === data.report.sha256 && !opts.force) return { status: 'unchanged', importId: active.id, ...counts };

  await client.query('BEGIN');
  try {
    // Parallele Importe verhindern
    await client.query('SELECT pg_advisory_xact_lock(727421)');
    await client.query("UPDATE catalog_imports SET status = 'superseded' WHERE source = 'cisp' AND status = 'active'");
    const { rows } = await client.query<{ id: number }>("INSERT INTO catalog_imports(source, version, sha256, status, report) VALUES ('cisp', $1, $2, 'active', $3) RETURNING id", [data.report.commit, data.report.sha256, data.report]);
    const importId = rows[0]!.id;
    const breeders = new Map(data.breeders.map((b) => [b.id, b]));

    for (const part of chunks(data.breeders)) {
      await client.query(
        `INSERT INTO catalog_breeders(id, name, variants, is_seed_bank, collab_members, seed_banks, cultivar_count, listing_count, import_id)
         SELECT x.id, x.name, x.variants, x."isSeedBank", x."collabMembers", x."seedBanks", x."cultivarCount", x."listingCount", $2
           FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, variants text[], "isSeedBank" boolean, "collabMembers" text[], "seedBanks" text[], "cultivarCount" int, "listingCount" int)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, variants = EXCLUDED.variants, is_seed_bank = EXCLUDED.is_seed_bank,
           collab_members = EXCLUDED.collab_members, seed_banks = EXCLUDED.seed_banks, cultivar_count = EXCLUDED.cultivar_count,
           listing_count = EXCLUDED.listing_count, import_id = EXCLUDED.import_id`,
        [JSON.stringify(part.map((b) => ({ ...b, variants: b.variants, collabMembers: b.collabMembers }))), importId],
      );
    }
    log(`Breeder: ${data.breeders.length}`);

    for (const part of chunks(data.cultivars)) {
      await client.query(
        `INSERT INTO catalog_cultivars(id, breeder_id, name, name_lower, name_slug, version, auto, aliases, seed_types, genetics_type, thc_min, thc_max, cbd_max,
                                       has_lineage, parent_slugs, terpenes, "values", conflicts, seed_banks, listing_count, search, import_id)
         SELECT x.id, x.breeder_id, x.name, x.name_lower, x.name_slug, x.version, x.auto, x.aliases, x.seed_types, x.genetics_type, x.thc_min, x.thc_max, x.cbd_max,
                x.has_lineage, x.parent_slugs, x.terpenes, x."values", x.conflicts, x.seed_banks, x.listing_count,
                setweight(to_tsvector('simple', x.sa), 'A') || setweight(to_tsvector('simple', x.sb), 'B') ||
                setweight(to_tsvector('simple', x.sc), 'C') || setweight(to_tsvector('simple', x.sd), 'D'),
                x.import_id
           FROM jsonb_to_recordset($1::jsonb) AS x(id text, breeder_id text, name text, name_lower text, name_slug text, version text, auto boolean, aliases text[],
                seed_types text[], genetics_type text, thc_min numeric, thc_max numeric, cbd_max numeric, has_lineage boolean, parent_slugs text[], terpenes text[],
                "values" jsonb, conflicts text[], seed_banks text[], listing_count int, sa text, sb text, sc text, sd text, import_id int)
         ON CONFLICT (id) DO UPDATE SET breeder_id = EXCLUDED.breeder_id, name = EXCLUDED.name, name_lower = EXCLUDED.name_lower, name_slug = EXCLUDED.name_slug,
           version = EXCLUDED.version, auto = EXCLUDED.auto, aliases = EXCLUDED.aliases, seed_types = EXCLUDED.seed_types, genetics_type = EXCLUDED.genetics_type,
           thc_min = EXCLUDED.thc_min, thc_max = EXCLUDED.thc_max, cbd_max = EXCLUDED.cbd_max, has_lineage = EXCLUDED.has_lineage, parent_slugs = EXCLUDED.parent_slugs,
           terpenes = EXCLUDED.terpenes, "values" = EXCLUDED."values", conflicts = EXCLUDED.conflicts, seed_banks = EXCLUDED.seed_banks,
           listing_count = EXCLUDED.listing_count, search = EXCLUDED.search, import_id = EXCLUDED.import_id`,
        [JSON.stringify(part.map((c) => cultivarRow(c, breeders, importId)))],
      );
    }
    log(`Sorten: ${data.cultivars.length}`);

    for (const part of chunks(data.listings)) {
      await client.query(
        `INSERT INTO catalog_listings(id, cultivar_id, seed_bank, breeder_raw, name_original, source_url, scraped_at, "values", rejected, import_id)
         SELECT x.id, x.cultivar_id, x.seed_bank, x.breeder_raw, x.name_original, x.source_url, x.scraped_at, x."values", x.rejected, x.import_id
           FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, cultivar_id text, seed_bank text, breeder_raw text, name_original text, source_url text,
                scraped_at date, "values" jsonb, rejected jsonb, import_id int)
         ON CONFLICT (id) DO UPDATE SET cultivar_id = EXCLUDED.cultivar_id, seed_bank = EXCLUDED.seed_bank, breeder_raw = EXCLUDED.breeder_raw,
           name_original = EXCLUDED.name_original, source_url = EXCLUDED.source_url, scraped_at = EXCLUDED.scraped_at, "values" = EXCLUDED."values",
           rejected = EXCLUDED.rejected, import_id = EXCLUDED.import_id`,
        [JSON.stringify(part.map((l) => listingRow(l, importId)))],
      );
    }
    log(`Angebote: ${data.listings.length}`);

    // In der neuen Version nicht mehr enthaltene Einträge entfernen (Reihenfolge wegen Fremdschlüsseln)
    const rl = await client.query('DELETE FROM catalog_listings WHERE import_id <> $1', [importId]);
    const rc = await client.query('DELETE FROM catalog_cultivars WHERE import_id <> $1', [importId]);
    const rb = await client.query('DELETE FROM catalog_breeders WHERE import_id <> $1', [importId]);
    await client.query('COMMIT');
    await client.query('ANALYZE catalog_breeders, catalog_cultivars, catalog_listings').catch(() => {});
    return { status: 'imported', importId, ...counts, removed: { breeders: rb.rowCount ?? 0, cultivars: rc.rowCount ?? 0, listings: rl.rowCount ?? 0 } };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

export const attribution = {
  name: CISP.name,
  author: CISP.author,
  url: CISP.repo,
  license: CISP.license,
  licenseUrl: CISP.licenseUrl,
  changes: CISP.changes,
};
