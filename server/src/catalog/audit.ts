/**
 * Vollständigkeits-Audit des lokalen Katalogs – reine Zählungen aus der Datenbank.
 * Unterscheidet „Feld vorhanden“ von Belegart (Breeder-/Seedbank-Angabe, Datenbank-Angabe,
 * Labormessung) und von Widersprüchen bzw. beim Import verworfenen Werten.
 * Kein Feld gilt als „verifiziert“, nur weil es nicht leer ist.
 */
import type pg from 'pg';

type Q = Pick<pg.Pool, 'query'>;

export interface FieldStat {
  field: string;
  label: string;
  total: number;
  present: number;
  missing: number;
  conflicting: number;
  /** Beim Import als unplausibel verworfene Werte (mind. ein Angebot betroffen) */
  questionable: number;
  /** Belegart der vorhandenen Werte */
  evidence: { breeder: number; seedbank: number; database: number; lab: number };
}

export interface AuditReport {
  generatedAt: string;
  cultivars: number;
  breeders: number;
  listings: number;
  fields: FieldStat[];
  providers: { provider: string; matchedCultivars: number; claims: number; byStatus: Record<string, number> }[];
}

/**
 * Belegart je Sorte: Stammt mind. ein Angebot direkt vom Breeder (Seedbank = Breeder),
 * gilt der Wert als „Breeder-Angabe“, sonst als „Seedbank-Angabe“. Labormessungen enthält
 * der Katalog nicht (private Laborberichte bleiben im Konto und fließen nie ein).
 */
/** keys = Schlüssel in den Angebotswerten (catalog_listings.values), aus denen das Feld stammt – für die Belegart je Feld */
const FIELDS: { field: string; label: string; present: string; conflict?: string; rejected?: string[]; claimField?: string; keys?: string[] }[] = [
  { field: 'breeder', label: 'Breeder', present: 'true' },
  { field: 'aliases', label: 'Weitere Bezeichnungen', present: 'cardinality(c.aliases) > 0' },
  { field: 'type', label: 'Typ (Indica/Sativa/Hybrid)', present: `(c."values"->>'geneticsType') IS NOT NULL`, conflict: 'geneticsType', keys: ['geneticsType'] },
  { field: 'typeLabel', label: 'Typ-Bezeichnung laut Shop', present: `(c."values"->>'typeLabel') IS NOT NULL`, keys: ['typeLabel'] },
  { field: 'ratio', label: 'Indica-/Sativa-Anteil', present: `(c."values"->>'indica') IS NOT NULL`, conflict: 'indica', rejected: ['indica_sativa'], keys: ['indica', 'sativa'] },
  { field: 'seedType', label: 'Samentyp (fem./regulär)', present: `('feminisiert' = ANY(c.seed_types) OR 'regulär' = ANY(c.seed_types))` },
  { field: 'auto', label: 'Blüteverhalten (Auto/photoperiodisch)', present: 'true' },
  { field: 'lineage', label: 'Abstammung (strukturiert)', present: 'c.has_lineage', conflict: 'parents', rejected: ['parents'], claimField: 'genetics', keys: ['parents'] },
  { field: 'lineageText', label: 'Abstammung (Text der Quelle)', present: `(c."values"->>'lineageText') IS NOT NULL`, keys: ['lineageText'] },
  { field: 'thc', label: 'THC', present: 'c.thc_max IS NOT NULL', conflict: 'thc', rejected: ['thc_min', 'thc_max', 'thc'], claimField: 'thc', keys: ['thc'] },
  { field: 'cbd', label: 'CBD', present: 'c.cbd_max IS NOT NULL', conflict: 'cbd', rejected: ['cbd_min', 'cbd_max', 'cbd'], claimField: 'cbd', keys: ['cbd'] },
  { field: 'otherCannabinoids', label: 'Weitere Cannabinoide (THCA, CBG, CBN …)', present: 'false' },
  { field: 'terpenes', label: 'Terpene (Nennung)', present: 'cardinality(c.terpenes) > 0', rejected: ['terpenes'], claimField: 'terpenes', keys: ['terpenes'] },
  { field: 'terpeneAmounts', label: 'Terpene (Mengen)', present: 'false' },
  { field: 'flavors', label: 'Aroma/Geschmack', present: `jsonb_array_length(coalesce(c."values"->'flavors', '[]'::jsonb)) > 0`, rejected: ['flavors'], claimField: 'aroma', keys: ['flavors'] },
  { field: 'effects', label: 'Beschriebene Wirkung (Shop-Text)', present: `jsonb_array_length(coalesce(c."values"->'effects', '[]'::jsonb)) > 0`, keys: ['effects'] },
  { field: 'flowering', label: 'Blütezeit', present: `(c."values"->'flowering') IS NOT NULL`, conflict: 'flowering', rejected: ['flowering_days_min', 'flowering_days_max'], keys: ['flowering'] },
  { field: 'height', label: 'Wuchshöhe', present: `(c."values"->'heightIndoorCm') IS NOT NULL OR (c."values"->'heightOutdoorCm') IS NOT NULL`, keys: ['heightIndoorCm', 'heightOutdoorCm'] },
  { field: 'yield', label: 'Ertragsangabe', present: `(c."values"->'yieldIndoorGm2') IS NOT NULL OR (c."values"->'yieldOutdoorGPlant') IS NOT NULL`, keys: ['yieldIndoorGm2', 'yieldOutdoorGPlant'] },
  { field: 'description', label: 'Beschreibung', present: 'false', claimField: 'description' },
  { field: 'image', label: 'Foto (Rechte und Zuordnung belegt)', present: 'false', claimField: 'image' },
  { field: 'source', label: 'Quellenangabe (URL)', present: 'c.listing_count > 0' },
];

export async function catalogAudit(db: Q): Promise<AuditReport> {
  const base = (await db.query<{ cultivars: string; breeders: string; listings: string }>(
    `SELECT (SELECT count(*) FROM catalog_cultivars) AS cultivars, (SELECT count(*) FROM catalog_breeders) AS breeders, (SELECT count(*) FROM catalog_listings) AS listings`,
  )).rows[0]!;
  const total = Number(base.cultivars);
  const hasClaims = (await db.query<{ ok: boolean }>(`SELECT to_regclass('catalog_claims') IS NOT NULL AS ok`)).rows[0]!.ok;
  const fields: FieldStat[] = [];
  // Ein Durchlauf: je Sorte „Breeder direkt“ und alle verworfenen Feldschlüssel vorab bestimmen
  const lit = (x: string) => `'${x.replace(/'/g, "''")}'`; // Feldnamen sind Konstanten dieses Moduls
  const cols: string[] = [];
  FIELDS.forEach((f, i) => {
    const claim = hasClaims && f.claimField ? `EXISTS (SELECT 1 FROM catalog_claims k WHERE k.cultivar_id = x.id AND k.field = ${lit(f.claimField)} AND k.review_status = 'accepted' AND (k.expires_at IS NULL OR k.expires_at > now()))` : 'false';
    const pres = f.present.replace(/\bc\./g, 'x.');
    const direct = f.keys ? `x.direct_keys && ARRAY[${f.keys.map(lit).join(',')}]::text[]` : 'x.direct';
    const rej = f.rejected?.length ? `x.rejected_keys && ARRAY[${f.rejected.map(lit).join(',')}]` : 'false';
    cols.push(
      `count(*) FILTER (WHERE (${pres}) OR ${claim}) AS p${i}`,
      // Breeder-Angabe nur, wenn ein Angebot aus dem Shop des Breeders genau dieses Feld liefert
      `count(*) FILTER (WHERE (${pres}) AND ${direct}) AS b${i}`,
      `count(*) FILTER (WHERE (${pres}) AND NOT ${direct}) AS s${i}`,
      `count(*) FILTER (WHERE ${claim}) AS d${i}`,
      `count(*) FILTER (WHERE ${f.conflict ? `${lit(f.conflict)} = ANY(x.conflicts)` : 'false'}) AS k${i}`,
      `count(*) FILTER (WHERE ${rej}) AS q${i}`,
    );
  });
  const row = (
    await db.query<Record<string, string>>(
      `WITH x AS (
         SELECT c.*,
                EXISTS (SELECT 1 FROM catalog_listings l WHERE l.cultivar_id = c.id AND regexp_replace(lower(l.seed_bank), '[^a-z0-9]', '', 'g') = c.breeder_id) AS direct,
                coalesce((SELECT array_agg(DISTINCT k) FROM catalog_listings l, jsonb_object_keys(l.rejected) k WHERE l.cultivar_id = c.id), '{}') AS rejected_keys,
                coalesce((SELECT array_agg(DISTINCT e.key) FROM catalog_listings l, jsonb_each(l."values") e
                           WHERE l.cultivar_id = c.id AND regexp_replace(lower(l.seed_bank), '[^a-z0-9]', '', 'g') = c.breeder_id
                             AND e.value NOT IN ('null'::jsonb, '[]'::jsonb, '""'::jsonb)), '{}') AS direct_keys
           FROM catalog_cultivars c)
       SELECT ${cols.join(',\n              ')} FROM x`,
    )
  ).rows[0]!;
  FIELDS.forEach((f, i) => {
    const present = Number(row[`p${i}`]);
    fields.push({
      field: f.field,
      label: f.label,
      total,
      present,
      missing: total - present,
      conflicting: Number(row[`k${i}`]),
      questionable: Number(row[`q${i}`]),
      evidence: { breeder: Number(row[`b${i}`]), seedbank: Number(row[`s${i}`]), database: Number(row[`d${i}`]), lab: 0 },
    });
  });
  const providers: AuditReport['providers'] = [];
  if (hasClaims) {
    const rows = (await db.query<{ provider: string; status: string; n: string }>(`SELECT provider, status, count(*) AS n FROM catalog_matches GROUP BY 1, 2 ORDER BY 1, 2`)).rows;
    const claims = (await db.query<{ provider: string; cultivars: string; n: string }>(
      `SELECT provider, count(DISTINCT cultivar_id) AS cultivars, count(*) AS n FROM catalog_claims WHERE review_status = 'accepted' AND (expires_at IS NULL OR expires_at > now()) GROUP BY 1`,
    )).rows;
    for (const p of [...new Set([...rows.map((r) => r.provider), ...claims.map((c) => c.provider)])]) {
      const c = claims.find((x) => x.provider === p);
      providers.push({
        provider: p,
        matchedCultivars: Number(c?.cultivars ?? 0),
        claims: Number(c?.n ?? 0),
        byStatus: Object.fromEntries(rows.filter((r) => r.provider === p).map((r) => [r.status, Number(r.n)])),
      });
    }
  }
  return { generatedAt: new Date().toISOString(), cultivars: total, breeders: Number(base.breeders), listings: Number(base.listings), fields, providers };
}
