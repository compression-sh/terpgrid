/**
 * Datenqualitätsprüfung des öffentlichen Sortenkatalogs – reproduzierbar, nur lesend.
 * Jede Regel liefert Anzahl, Beispiele und eine empfohlene Prüfaktion. Es wird nichts automatisch
 * geändert: wissenschaftlich mehrdeutige Angaben entscheidet ein Mensch.
 */
import type pg from 'pg';
import { normalizeTerpene } from './enrich.js';
import { SMITH2022 } from './samples.js';

type Q = Pick<pg.Pool, 'query'>;
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  count: number;
  examples: { id?: string; label: string }[];
  action: string;
}

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

async function rule(db: Q, f: Omit<Finding, 'count' | 'examples'>, countSql: string, exampleSql: string, params: unknown[] = []): Promise<Finding> {
  const n = Number((await db.query<{ n: string }>(countSql, params)).rows[0]?.n ?? 0);
  const examples = n ? (await db.query<{ id?: string; label: string }>(`${exampleSql} LIMIT 8`, params)).rows : [];
  return { ...f, count: n, examples };
}

export async function catalogQuality(db: Q): Promise<{ generatedAt: string; findings: Finding[]; summary: Record<Severity, number> }> {
  const has = async (t: string) => (await db.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [t])).rows[0]!.ok;
  const findings: Finding[] = [];

  findings.push(
    await rule(
      db,
      { id: 'thc-order', severity: 'high', title: 'THC-Spanne fehlerhaft (Minimum über Maximum)', action: 'Angebote der Sorte prüfen.' },
      `SELECT count(*) n FROM catalog_cultivars WHERE thc_min > thc_max`,
      `SELECT id, name || ' (' || thc_min || '–' || thc_max || ' %)' AS label FROM catalog_cultivars WHERE thc_min > thc_max ORDER BY id`,
    ),
    await rule(
      db,
      // Höchster Gesamt-THC-Wert in 89.923 Laborproben (Smith et al. 2022): 35,7 %
      { id: 'thc-high', severity: 'medium', title: 'THC-Angabe über 35 % (über dem höchsten Messwert öffentlicher Laborproben)', action: 'Werbeangabe wahrscheinlich – als Seedbank-/Breeder-Angabe gekennzeichnet lassen, nicht als Messwert darstellen.' },
      `SELECT count(*) n FROM catalog_cultivars WHERE thc_max > 35`,
      `SELECT id, name || ' (' || thc_min || '–' || thc_max || ' %)' AS label FROM catalog_cultivars WHERE thc_max > 35 ORDER BY thc_max DESC, id`,
    ),
    await rule(
      db,
      { id: 'cbd-range', severity: 'high', title: 'CBD-Wert unplausibel (> 30 %)', action: 'Angebote der Sorte prüfen.' },
      `SELECT count(*) n FROM catalog_cultivars WHERE cbd_max > 30`,
      `SELECT id, name || ' (' || cbd_max || ' %)' AS label FROM catalog_cultivars WHERE cbd_max > 30 ORDER BY id`,
    ),
    await rule(
      db,
      { id: 'self-parent', severity: 'medium', title: 'Sorte nennt sich selbst als Elternteil (gleicher Name, gleiche Variante)', action: 'Quelltext prüfen; meist Seedbank-Fehler. Wird im Graph nicht aufgelöst.' },
      `SELECT count(*) n FROM catalog_cultivars c WHERE NOT c.auto AND (c.version IS NULL OR c.version = '') AND c.name_slug = ANY(c.parent_slugs)`,
      `SELECT c.id, c.name AS label FROM catalog_cultivars c WHERE NOT c.auto AND (c.version IS NULL OR c.version = '') AND c.name_slug = ANY(c.parent_slugs) ORDER BY c.listing_count DESC, c.id`,
    ),
    await rule(
      db,
      { id: 'auto-from-photo', severity: 'info', title: 'Autoflower- oder Versionsvariante mit gleichnamigem Elternteil', action: 'Erwartbar (z. B. „Gelato Auto“ aus „Gelato“) – keine Aktion nötig.' },
      `SELECT count(*) n FROM catalog_cultivars c WHERE (c.auto OR coalesce(c.version, '') <> '') AND c.name_slug = ANY(c.parent_slugs)`,
      `SELECT c.id, c.name || CASE WHEN c.auto THEN ' (Auto)' ELSE ' ' || coalesce(c.version, '') END AS label FROM catalog_cultivars c WHERE (c.auto OR coalesce(c.version, '') <> '') AND c.name_slug = ANY(c.parent_slugs) ORDER BY c.id`,
    ),
    await rule(
      db,
      { id: 'duplicate-parent', severity: 'low', title: 'Beide Elternteile identisch', action: 'Quelltext prüfen (z. B. „Selbstung“ oder Tippfehler).' },
      `SELECT count(*) n FROM catalog_cultivars WHERE cardinality(parent_slugs) = 2 AND parent_slugs[1] = parent_slugs[2] AND parent_slugs[1] <> ''`,
      `SELECT id, name || ': ' || parent_slugs[1] AS label FROM catalog_cultivars WHERE cardinality(parent_slugs) = 2 AND parent_slugs[1] = parent_slugs[2] AND parent_slugs[1] <> '' ORDER BY id`,
    ),
    await rule(
      db,
      { id: 'two-cycle', severity: 'medium', title: 'Gegenseitige Elternangabe (A stammt von B und B von A)', action: 'Widersprüchliche Abstammung – Quellen beider Sorten vergleichen; der Graph zeigt beide Angaben, löst sie aber nicht auf.' },
      `SELECT count(*) n FROM (SELECT DISTINCT least(a.name_slug, b.name_slug), greatest(a.name_slug, b.name_slug)
         FROM catalog_cultivars a JOIN catalog_cultivars b ON b.name_slug = ANY(a.parent_slugs) AND a.name_slug = ANY(b.parent_slugs) AND a.name_slug <> b.name_slug) x`,
      `SELECT DISTINCT least(a.name_slug, b.name_slug) || ' ↔ ' || greatest(a.name_slug, b.name_slug) AS label
         FROM catalog_cultivars a JOIN catalog_cultivars b ON b.name_slug = ANY(a.parent_slugs) AND a.name_slug = ANY(b.parent_slugs) AND a.name_slug <> b.name_slug ORDER BY 1`,
    ),
    await rule(
      db,
      { id: 'encoding', severity: 'medium', title: 'Reste fehlerhafter Zeichenkodierung in Sortendaten', action: 'Parser-Reparatur greift nicht – Rohdaten prüfen.' },
      `SELECT count(*) n FROM catalog_cultivars WHERE name ~ '[ÃÂ][\\u0080-\\u00bf]' OR "values"::text ~ '[ÃÂ][\\u0080-\\u00bf]'`,
      `SELECT id, name AS label FROM catalog_cultivars WHERE name ~ '[ÃÂ][\\u0080-\\u00bf]' OR "values"::text ~ '[ÃÂ][\\u0080-\\u00bf]' ORDER BY id`,
    ),
  );

  // Terpennamen ohne Atlas-Zuordnung (Normalisierung in TypeScript)
  const names = (await db.query<{ t: string; n: string }>(`SELECT t, count(*) n FROM catalog_cultivars, unnest(terpenes) t GROUP BY t ORDER BY count(*) DESC`)).rows;
  const unknown = names.filter((r) => !normalizeTerpene(r.t).id);
  findings.push({
    id: 'terpene-unknown',
    severity: 'low',
    title: 'Terpennamen ohne Zuordnung zum Atlas',
    count: unknown.reduce((s, r) => s + Number(r.n), 0),
    examples: unknown.slice(0, 8).map((r) => ({ label: `${r.t} (${r.n}×)` })),
    action: 'Synonym im Atlas ergänzen, falls chemisch eindeutig; sonst als Originalbezeichnung belassen.',
  });

  if (await has('catalog_claims')) {
    findings.push(
      await rule(
        db,
        { id: 'claims-expired', severity: 'medium', title: 'Abgelaufene Angaben externer Quellen (werden nicht mehr angezeigt)', action: '`enrich-catalog --refresh` manuell ausführen oder Angaben löschen lassen.' },
        `SELECT count(*) n FROM catalog_claims WHERE expires_at IS NOT NULL AND expires_at <= now()`,
        `SELECT k.cultivar_id AS id, k.provider || ': ' || k.field || ' (' || k.cultivar_id || ')' AS label FROM catalog_claims k WHERE expires_at IS NOT NULL AND expires_at <= now() ORDER BY expires_at`,
      ),
      await rule(
        db,
        { id: 'matches-review', severity: 'medium', title: 'Abgleiche externer Quellen warten auf Prüfung (wahrscheinlich/mehrdeutig)', action: 'In der Prüfliste bestätigen oder ablehnen; nichts wird automatisch übernommen.' },
        `SELECT count(*) n FROM catalog_matches WHERE status IN ('probable', 'ambiguous') AND decided_by = 'auto'`,
        `SELECT cultivar_id AS id, provider || ': ' || provider_name || ' (' || status || ')' AS label FROM catalog_matches WHERE status IN ('probable', 'ambiguous') AND decided_by = 'auto' ORDER BY provider_name`,
      ),
      await rule(
        db,
        { id: 'claims-license', severity: 'critical', title: 'Angaben ohne Lizenz- oder Herkunftsvermerk', action: 'Angaben ohne Lizenz dürfen nicht angezeigt werden – Import prüfen.' },
        `SELECT count(*) n FROM catalog_claims WHERE coalesce(license, '') = '' OR coalesce(provider, '') = ''`,
        `SELECT cultivar_id AS id, field || ' (' || coalesce(provider, '?') || ')' AS label FROM catalog_claims WHERE coalesce(license, '') = '' OR coalesce(provider, '') = '' ORDER BY id`,
      ),
    );
  }

  if (await has('catalog_sample_stats')) {
    const active = (await db.query<{ sha256: string }>(`SELECT sha256 FROM catalog_sample_imports WHERE source = $1 AND status = 'active'`, [SMITH2022.id])).rows[0];
    findings.push({
      id: 'samples-version',
      severity: active && active.sha256 !== SMITH2022.sha256 ? 'high' : 'info',
      title: active ? (active.sha256 === SMITH2022.sha256 ? 'Laborproben: geprüfte Datensatzversion aktiv' : 'Laborproben: nicht geprüfte Datensatzversion aktiv') : 'Laborproben: noch nicht importiert',
      count: active ? (active.sha256 === SMITH2022.sha256 ? 0 : 1) : 0,
      examples: [],
      action: active ? 'Mit ./import-samples.sh die geprüfte Version importieren.' : 'Optional: ./import-samples.sh ausführen (CC0, ca. 20 MB).',
    });
    findings.push(
      await rule(
        db,
        { id: 'samples-ambiguous-name', severity: 'info', title: 'Laborproben-Namen, die mehrere Breeder im Katalog tragen', action: 'Erwartbar – Proben werden als „Nicht eindeutig zugeordnet“ gekennzeichnet und keinem Breeder zugeschrieben.' },
        `SELECT count(*) n FROM (SELECT s.name_key FROM catalog_sample_stats s JOIN catalog_cultivars c ON NOT c.auto AND catalog_name_key(c.name_slug, c.version) = s.name_key GROUP BY s.name_key HAVING count(DISTINCT c.breeder_id) > 1) x`,
        `SELECT s.name_key || ' (' || count(DISTINCT c.breeder_id) || ' Breeder, ' || max(s.samples) || ' Proben)' AS label FROM catalog_sample_stats s JOIN catalog_cultivars c ON NOT c.auto AND catalog_name_key(c.name_slug, c.version) = s.name_key GROUP BY s.name_key HAVING count(DISTINCT c.breeder_id) > 1 ORDER BY max(s.samples) DESC`,
      ),
    );
  }

  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.count - a.count);
  const summary = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, findings.filter((f) => f.severity === s && f.count > 0).length])) as Record<Severity, number>;
  return { generatedAt: new Date().toISOString(), findings, summary };
}
