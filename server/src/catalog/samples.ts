/**
 * Öffentliche Laborproben aus wissenschaftlichen Datensätzen.
 *
 * Quelle 1: Smith, Vergara, Keegan & Jikomes (2022), „The phytochemical diversity of commercial
 * Cannabis in the United States“, PLoS ONE 17(5): e0267498. Datensatz im Repository der Autorinnen
 * und Autoren unter CC0 1.0 (Gemeinfreiheit), Stand Commit e71c838.
 *
 * Wichtig für die Darstellung:
 * - Jede Zeile ist EINE Blütenprobe eines US-Handelsprodukts (Labore und Hersteller anonymisiert).
 * - Der Sortenname ist der normalisierte Produktname (Slug) – kein Breeder, keine belegte Genetik.
 * - Cannabinoide sind von den Autoren berechnete Gesamtwerte (z. B. THC + 0,877 × THCA); fehlende
 *   Säureformen wurden dort mit 0 angenommen. Einheit: Massenprozent (% w/w).
 * - Terpene: nur die 14 von allen Laboren häufig gemessenen Verbindungen; Ocimen und Nerolidol als
 *   Summe ihrer Isomere. „0“ bedeutet laut Quelle nicht nachgewiesen bzw. unter der Bestimmungsgrenze.
 *   Fehlende Werte (leer) wurden nicht gemessen und werden nicht als 0 behandelt.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { headerIndex, parseCsv } from './cisp.js';

export interface SampleSource {
  id: string;
  name: string;
  citation: string;
  doi: string;
  repository: string;
  commit: string;
  path: string;
  sha256: string;
  license: string;
  licenseUrl: string;
  unit: '%';
}

export const SMITH2022: SampleSource = {
  id: 'smith2022',
  name: 'Smith et al. (2022) – Laborproben aus sechs US-Bundesstaaten',
  citation: 'Smith CJ, Vergara D, Keegan B, Jikomes N (2022). The phytochemical diversity of commercial Cannabis in the United States. PLoS ONE 17(5): e0267498.',
  doi: '10.1371/journal.pone.0267498',
  repository: 'https://github.com/cjsmith015/phytochemical-diversity-cannabis',
  commit: 'e71c838e6bacdb3302c9410c595f09f3aea9984f',
  path: 'data/preproc_lab_data_pub_20220218.csv',
  sha256: '1850b918bb3a00b903f9e254953bb695012314bd264c419efb68bc482b392182',
  license: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  unit: '%',
};

export const sampleUrl = (s: SampleSource, commit = s.commit) => `https://raw.githubusercontent.com/cjsmith015/phytochemical-diversity-cannabis/${commit}/${s.path}`;

/** Spalten der Quelle → Feldschlüssel in TERPGRID (Cannabinoide: berechnete Gesamtwerte der Autoren). */
export const SMITH_CANNABINOIDS: Record<string, string> = {
  tot_thc: 'thc_total',
  tot_cbd: 'cbd_total',
  tot_cbg: 'cbg_total',
  tot_cbc: 'cbc_total',
  tot_cbn: 'cbn_total',
  tot_thcv: 'thcv_total',
};
/** Terpen-Spalten (Originalbezeichnung der Quelle bleibt als Schlüssel erhalten). */
export const SMITH_TERPENES = ['myrcene', 'limonene', 'caryophyllene', 'humulene', 'linalool', 'a_pinene', 'b_pinene', 'terpinolene', 'a_terpinene', 'g_terpinene', 'camphene', 'bisabolol', 'tot_ocimene', 'tot_nerolidol_ct'] as const;

const REGIONS = new Set(['AK', 'CA', 'FL', 'MI', 'OR', 'WA']);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface Sample {
  ref: string;
  nameKey: string | null;
  region: string | null;
  lab: string | null;
  cannabinoids: Record<string, number>;
  terpenes: Record<string, number> | null;
  totalTerpenes: number | null;
}

export interface ParsedSamples {
  source: SampleSource;
  sha256: string;
  checksumMatches: boolean;
  rows: number;
  samples: Sample[];
  rejected: Record<string, number>;
}

const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const t = v.trim();
  if (t === '' || /^nan$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Liest und prüft den Smith-2022-Datensatz. Ungültige Zeilen werden mit Grund gezählt, nie „repariert“. */
export function parseSmith2022(buf: Buffer): ParsedSamples {
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const rows = parseCsv(buf.toString('utf8'));
  const header = rows.shift() ?? [];
  const h = headerIndex(header);
  for (const k of ['u_id', 'strain_slug', 'region', 'lab_id', 'has_terps', 'total_terps', ...Object.keys(SMITH_CANNABINOIDS), ...SMITH_TERPENES])
    if (h[k] === undefined) throw new Error(`Spalte „${k}“ fehlt – unerwartetes Dateiformat`);
  const rejected: Record<string, number> = {};
  const reject = (r: string) => (rejected[r] = (rejected[r] ?? 0) + 1);
  const samples: Sample[] = [];
  const seen = new Set<string>();
  for (const cells of rows) {
    if (cells.length === 1 && cells[0] === '') continue;
    const g = (k: string) => cells[h[k]!];
    const ref = (g('u_id') ?? '').trim();
    if (!/^\d{1,9}$/.test(ref)) {
      reject('ungültige Proben-ID');
      continue;
    }
    if (seen.has(ref)) {
      reject('doppelte Proben-ID');
      continue;
    }
    // Mehrfache Bindestriche der Quelle („northern-lights--5“ aus „Northern Lights #5“) vereinheitlichen
    const slug = (g('strain_slug') ?? '').trim().toLowerCase().replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
    if (slug && (!SLUG_RE.test(slug) || slug.length > 80)) {
      reject('ungültiger Produktname');
      continue;
    }
    const region = (g('region') ?? '').trim();
    const cannabinoids: Record<string, number> = {};
    let bad = false;
    for (const [col, key] of Object.entries(SMITH_CANNABINOIDS)) {
      const v = numOrNull(g(col));
      if (v === null) continue;
      if (Number.isNaN(v) || v < 0 || v > 100) bad = true;
      else cannabinoids[key] = Math.round(v * 1000) / 1000;
    }
    if (bad) {
      reject('Cannabinoidwert außerhalb 0–100 %');
      continue;
    }
    let terpenes: Record<string, number> | null = null;
    let total: number | null = null;
    if ((g('has_terps') ?? '').trim() === 'True') {
      terpenes = {};
      for (const col of SMITH_TERPENES) {
        const v = numOrNull(g(col));
        if (v === null) continue;
        // Die Autoren haben Proben mit Einzelwerten > 5 % bereits entfernt; alles darüber ist ein Formatfehler
        if (Number.isNaN(v) || v < 0 || v > 5) bad = true;
        else terpenes[col] = Math.round(v * 10000) / 10000;
      }
      const t = numOrNull(g('total_terps'));
      if (t !== null && (Number.isNaN(t) || t < 0 || t > 30)) bad = true;
      else total = t === null ? null : Math.round(t * 1000) / 1000;
      if (bad) {
        reject('Terpenwert außerhalb des plausiblen Bereichs');
        continue;
      }
      if (Object.keys(terpenes).length === 0) terpenes = null;
    }
    seen.add(ref);
    samples.push({
      ref,
      nameKey: slug || null,
      region: REGIONS.has(region) ? region : null,
      lab: /^lab\d{1,2}$/.test((g('lab_id') ?? '').trim()) ? g('lab_id')!.trim() : null,
      cannabinoids,
      terpenes,
      totalTerpenes: total,
    });
  }
  return { source: SMITH2022, sha256, checksumMatches: sha256 === SMITH2022.sha256, rows: rows.length, samples, rejected };
}

export interface SampleImportResult {
  importId: number;
  status: 'imported' | 'unchanged';
  samples: number;
  names: number;
}

/**
 * Schreibt alle Proben einer Quelle in einer Transaktion (idempotent: gleiche Prüfsumme → nichts zu tun,
 * sonst werden die Proben dieser Quelle vollständig ersetzt) und berechnet die Verteilungen je Produktname.
 * Läuft mit der Owner-Rolle; Nutzerdaten werden nicht berührt.
 */
export async function importSamples(client: pg.PoolClient, data: ParsedSamples, opts: { force?: boolean; log?: (m: string) => void } = {}): Promise<SampleImportResult> {
  const log = opts.log ?? (() => {});
  const src = data.source.id;
  const active = await client.query<{ id: number; sha256: string }>(`SELECT id, sha256 FROM catalog_sample_imports WHERE source = $1 AND status = 'active'`, [src]);
  if (active.rows[0]?.sha256 === data.sha256 && !opts.force) return { importId: active.rows[0].id, status: 'unchanged', samples: 0, names: 0 };
  await client.query('BEGIN');
  try {
    const imp = await client.query<{ id: number }>(
      `INSERT INTO catalog_sample_imports (source, version, sha256, status, rows_total, accepted, rejected, rejected_reasons) VALUES ($1, $2, $3, 'running', $4, $5, $6, $7) RETURNING id`,
      [src, data.source.commit, data.sha256, data.rows, data.samples.length, data.rows - data.samples.length, JSON.stringify(data.rejected)],
    );
    const importId = imp.rows[0]!.id;
    await client.query(`DELETE FROM catalog_samples WHERE source = $1`, [src]);
    await client.query(`DELETE FROM catalog_sample_stats WHERE source = $1`, [src]);
    const B = 1000;
    for (let i = 0; i < data.samples.length; i += B) {
      const chunk = data.samples.slice(i, i + B);
      await client.query(
        `INSERT INTO catalog_samples (source, sample_ref, name_key, region, lab_ref, cannabinoids, terpenes, total_terpenes, import_id)
         SELECT $1, x.ref, x.name_key, x.region, x.lab, x.cannabinoids, x.terpenes, x.total, $2
         FROM jsonb_to_recordset($3::jsonb) AS x(ref text, name_key text, region text, lab text, cannabinoids jsonb, terpenes jsonb, total numeric)`,
        [src, importId, JSON.stringify(chunk.map((s) => ({ ref: s.ref, name_key: s.nameKey, region: s.region, lab: s.lab, cannabinoids: s.cannabinoids, terpenes: s.terpenes, total: s.totalTerpenes })))],
      );
      if ((i / B) % 20 === 0) log(`Proben geschrieben: ${Math.min(i + B, data.samples.length)} / ${data.samples.length}`);
    }
    // Verteilungen je Produktname – nur aus vorhandenen Messwerten (fehlend ≠ 0)
    await client.query(
      `WITH v AS (
         SELECT s.name_key, f.key, f.value::numeric AS val
         FROM catalog_samples s,
              jsonb_each_text(s.cannabinoids || coalesce(s.terpenes, '{}'::jsonb)
                              || CASE WHEN s.total_terpenes IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('total_terpenes', s.total_terpenes) END) f
         WHERE s.source = $1 AND s.name_key IS NOT NULL
       ), agg AS (
         SELECT name_key, key, jsonb_build_object(
           'n', count(*), 'detected', count(*) FILTER (WHERE val > 0),
           'p25', round(percentile_cont(0.25) WITHIN GROUP (ORDER BY val)::numeric, 4),
           'median', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY val)::numeric, 4),
           'p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY val)::numeric, 4),
           'min', min(val), 'max', max(val)) AS j
         FROM v GROUP BY name_key, key
       ), st AS (SELECT name_key, jsonb_object_agg(key, j) AS stats FROM agg GROUP BY name_key),
       rg AS (SELECT name_key, jsonb_object_agg(region, n) AS regions FROM (SELECT name_key, region, count(*) n FROM catalog_samples WHERE source = $1 AND name_key IS NOT NULL AND region IS NOT NULL GROUP BY 1, 2) r GROUP BY name_key),
       cnt AS (SELECT name_key, count(*) AS n, count(*) FILTER (WHERE terpenes IS NOT NULL) AS nt FROM catalog_samples WHERE source = $1 AND name_key IS NOT NULL GROUP BY name_key)
       INSERT INTO catalog_sample_stats (source, name_key, samples, terpene_samples, regions, stats)
       SELECT $1, cnt.name_key, cnt.n, cnt.nt, coalesce(rg.regions, '{}'), coalesce(st.stats, '{}')
       FROM cnt LEFT JOIN st USING (name_key) LEFT JOIN rg USING (name_key)`,
      [src],
    );
    await client.query(`UPDATE catalog_sample_imports SET status = 'replaced' WHERE source = $1 AND status = 'active'`, [src]);
    await client.query(`UPDATE catalog_sample_imports SET status = 'active', finished_at = now() WHERE id = $1`, [importId]);
    const names = await client.query<{ n: string }>(`SELECT count(*) n FROM catalog_sample_stats WHERE source = $1`, [src]);
    await client.query('COMMIT');
    return { importId, status: 'imported', samples: data.samples.length, names: Number(names.rows[0]!.n) };
  } catch (e) {
    await client.query('ROLLBACK');
    await client
      .query(`INSERT INTO catalog_sample_imports (source, version, sha256, status, error, finished_at) VALUES ($1, $2, $3, 'failed', $4, now())`, [src, data.source.commit, data.sha256, String((e as Error).message).slice(0, 500)])
      .catch(() => {});
    throw e;
  }
}

/**
 * Atlas-Verbindung → Spalte der Quelle. `isomerSum`: Die Quelle meldet die Summe mehrerer Isomere
 * (Ocimen: α-/β-Formen; Nerolidol: cis/trans) – die Werte sind daher NICHT die der genannten Einzelform.
 */
export const SMITH_ATLAS: Record<string, { column: (typeof SMITH_TERPENES)[number]; isomerSum?: string }> = {
  myrcene: { column: 'myrcene' },
  limonene: { column: 'limonene' },
  caryophyllene: { column: 'caryophyllene' },
  humulene: { column: 'humulene' },
  linalool: { column: 'linalool' },
  'alpha-pinene': { column: 'a_pinene' },
  'beta-pinene': { column: 'b_pinene' },
  terpinolene: { column: 'terpinolene' },
  'alpha-terpinene': { column: 'a_terpinene' },
  'gamma-terpinene': { column: 'g_terpinene' },
  camphene: { column: 'camphene' },
  bisabolol: { column: 'bisabolol' },
  'beta-ocimene': { column: 'tot_ocimene', isomerSum: 'Summe aller Ocimen-Isomere' },
  'trans-nerolidol': { column: 'tot_nerolidol_ct', isomerSum: 'Summe aus cis- und trans-Nerolidol' },
};
