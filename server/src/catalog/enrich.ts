/**
 * Anreicherung des lokalen Katalogs aus weiteren Quellen (StrainAPI, Find My Seeds).
 *
 * Rechtlicher Rahmen (geprüft am 24.11.2026, siehe docs/CATALOG.md):
 * - Beide Quellen erlauben die Nutzung in Anwendungen und „angemessenes Caching“, verbieten aber
 *   das systematische Spiegeln bzw. Nachbauen ihrer Datenbank. Deshalb:
 *   · nur kleine, vom Admin ausgelöste Chargen (max. 50 Sorten je Lauf),
 *   · Angaben mit Ablaufdatum (Cache, kein Archiv), Abgleichsentscheidungen dauerhaft,
 *   · Ratenbegrenzung je Quelle, Retry mit Backoff, Quellenangabe in der Oberfläche.
 * Fachliche Regeln:
 * - Konservativer Abgleich: Übernahme nur, wenn Name UND Breeder übereinstimmen. Sammeleinträge
 *   mehrerer Breeder (z. B. „Gelato“ von 18 Breedern) werden nie einer Breeder-Linie zugeordnet.
 * - Terpene sind Nennungen (keine Mengen), Cannabinoide Spannen laut Quelle – Belegart „database“.
 * - Wirkungen/„Conditions“ (medizinische Aussagen) werden nicht übernommen.
 */
import type pg from 'pg';
import { breederKey, slugify } from './cisp.js';

type Q = Pick<pg.Pool, 'query'>;

export type Provider = 'strainapi' | 'findmyseeds';

export const PROVIDERS: Record<Provider, { name: string; url: string; license: string; minIntervalMs: number; ttlDays: number; search: (q: string) => string }> = {
  strainapi: {
    name: 'StrainAPI',
    url: 'https://www.strainapi.com/',
    license: 'StrainAPI API Terms (Okt. 2026): Nutzung und angemessenes Caching erlaubt, Namensnennung „Data provided by StrainAPI“, kein Nachbau der Datenbank',
    minIntervalMs: 1500,
    ttlDays: 30,
    search: (q) => `https://www.strainapi.com/wp-json/strainapi/v1/search?q=${encodeURIComponent(q)}&per_page=10`,
  },
  findmyseeds: {
    // Deaktiviert: Der Anbieter beantwortet automatisierte Anfragen mit erkennbarer Client-Kennung mit HTTP 403
    // (Stand 24.11.2026) und verlangt Rücksprache vor automatisierter Nutzung. Keine Umgehung.
    name: 'Find My Seeds',
    url: 'https://www.findmyseeds.com/',
    license: 'Find My Seeds API Policy: persönliche/edukative Nutzung erlaubt, Caching erwünscht, Namensnennung, kein Massen-Download oder Spiegeln',
    minIntervalMs: 2000,
    ttlDays: 30,
    search: (q) => `https://www.findmyseeds.com/wp-json/strain-compass/v1/strains?q=${encodeURIComponent(q)}&per_page=10`,
  },
};

export const MAX_BATCH = 50;

/** Aktive Quellen für Anreicherungsläufe (Find My Seeds blockiert automatisierte Clients). */
export const ENABLED_PROVIDERS: Provider[] = ['strainapi'];

/* ───────────── Normalisierung der Quellen ───────────── */

export interface ProviderRecord {
  id: string;
  name: string;
  /** Alle genannten Breeder (Sammeleinträge haben mehrere) */
  breeders: string[];
  url?: string;
  terpenes: string[];
  thc?: { min?: number; max?: number; value?: number };
  cbd?: { min?: number; max?: number; value?: number };
  genetics?: string;
  aroma: string[];
  description?: string;
  image?: { url: string; credit: string };
  type?: string;
  flowering?: { min?: number; max?: number };
  seedType?: string;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);
const plain = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&hellip;/g, '…').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, '’').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

export function normalizeStrainApi(raw: unknown): ProviderRecord[] {
  const data = (raw as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((r) => {
    const x = r as Record<string, unknown>;
    const id = x.id ?? x.slug;
    const name = str(x.name);
    if (!id || !name) return [];
    const range = (o: unknown) => {
      const v = o as { min?: unknown; max?: unknown; value?: unknown } | undefined;
      const out = { min: num(v?.min), max: num(v?.max), value: num(v?.value) };
      return out.min === undefined && out.max === undefined && out.value === undefined ? undefined : out;
    };
    const aroma = [...strList(x.aroma), ...strList(x.flavor)].flatMap((a) => a.split(/\s*,\s*/)).filter(Boolean);
    return [
      {
        id: String(id),
        name,
        breeders: str(x.breeder) ? [str(x.breeder)!] : [],
        url: str(x.url),
        terpenes: strList(x.terpenes),
        thc: range(x.thc),
        cbd: range(x.cbd),
        genetics: str(x.genetics),
        aroma: [...new Set(aroma.map((a) => a.toLowerCase()))].slice(0, 12),
        description: str(x.excerpt) ? plain(String(x.excerpt)) : undefined,
        // Fotos werden nicht übernommen: Urheber/Lizenz je Bild und Zuordnung zur konkreten Breeder-Linie sind nicht belegt
        image: undefined,
        type: str(x.type),
        flowering: (x.flowering as { min_days?: unknown; max_days?: unknown } | undefined) ? { min: num((x.flowering as { min_days?: unknown }).min_days), max: num((x.flowering as { max_days?: unknown }).max_days) } : undefined,
        seedType: str(x.seed_type),
      },
    ];
  });
}

export function normalizeFindMySeeds(raw: unknown): ProviderRecord[] {
  const items = (raw as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((r) => {
    const x = r as Record<string, unknown>;
    const name = str(x.name);
    if (x.id === undefined || !name) return [];
    const one = (v: unknown) => (num(v) !== undefined ? { value: num(v) } : undefined);
    return [
      {
        id: String(x.id),
        name,
        // „ApeOrigin | Barneys Farm | …“ = Sammeleintrag mehrerer Breeder
        breeders: str(x.breeder) ? String(x.breeder).split('|').map((b) => b.trim()).filter(Boolean) : [],
        url: str(x.url),
        terpenes: strList(x.terpenes),
        thc: one(x.thc),
        cbd: one(x.cbd),
        genetics: undefined, // „parents“ mischt Varianten mehrerer Linien – nicht als Abstammung übernommen
        aroma: strList(x.flavors).map((a) => a.toLowerCase()),
        description: str(x.excerpt) ? plain(String(x.excerpt)) : undefined,
        image: undefined, // Bildrechte nicht geklärt
        type: str(x.type),
        flowering: num(x.flowering_days_min) !== undefined || num(x.flowering_days_max) !== undefined ? { min: num(x.flowering_days_min), max: num(x.flowering_days_max) } : undefined,
        seedType: undefined,
      },
    ];
  });
}

/* ───────────── Terpen-Namen auf kanonische IDs ───────────── */

/** Kanonische Terpen-IDs (siehe Frontend lib/catalog/terpenes.ts) – nur eindeutige Zuordnungen. */
const TERPENE_ALIASES: Record<string, string> = {
  myrcene: 'myrcene',
  'beta-myrcene': 'myrcene',
  'β-myrcene': 'myrcene',
  limonene: 'limonene',
  'd-limonene': 'limonene',
  caryophyllene: 'caryophyllene',
  'beta-caryophyllene': 'caryophyllene',
  'β-caryophyllene': 'caryophyllene',
  'alpha-pinene': 'alpha-pinene',
  'α-pinene': 'alpha-pinene',
  pinene: 'pinene-unspecified',
  'beta-pinene': 'beta-pinene',
  'β-pinene': 'beta-pinene',
  linalool: 'linalool',
  humulene: 'humulene',
  'alpha-humulene': 'humulene',
  'α-humulene': 'humulene',
  terpinolene: 'terpinolene',
  ocimene: 'ocimene-unspecified',
  'beta-ocimene': 'beta-ocimene',
  'β-ocimene': 'beta-ocimene',
  nerolidol: 'nerolidol-unspecified',
  'trans-nerolidol': 'trans-nerolidol',
  '(e)-nerolidol': 'trans-nerolidol',
  bisabolol: 'bisabolol',
  'alpha-bisabolol': 'bisabolol',
  'α-bisabolol': 'bisabolol',
  guaiol: 'guaiol',
  geraniol: 'geraniol',
  camphene: 'camphene',
  borneol: 'borneol',
  eucalyptol: 'eucalyptol',
  '1,8-cineole': 'eucalyptol',
  terpineol: 'terpineol-unspecified',
  'alpha-terpineol': 'alpha-terpineol',
  'α-terpineol': 'alpha-terpineol',
  fenchol: 'fenchol',
  'delta 3 carene': 'delta-3-carene',
  'delta-3-carene': 'delta-3-carene',
  '3-carene': 'delta-3-carene',
  'caryophyllene oxide': 'caryophyllene-oxide',
  'p-cymene': 'p-cymene',
  valencene: 'valencene',
  sabinene: 'sabinene',
  phellandrene: 'phellandrene-unspecified',
  'alpha-phellandrene': 'alpha-phellandrene',
  'α-phellandrene': 'alpha-phellandrene',
  pulegone: 'pulegone',
  'alpha-terpinene': 'alpha-terpinene',
  'gamma-terpinene': 'gamma-terpinene',
  farnesene: 'farnesene-unspecified',
};

/** Normalisiert einen Terpen-Namen; unbekannte Namen bleiben als Originaltext erhalten (id undefined). */
export function normalizeTerpene(name: string): { id?: string; original: string } {
  const k = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return { id: TERPENE_ALIASES[k], original: name.trim() };
}

/* ───────────── Konservativer Abgleich ───────────── */

export interface CultivarRef {
  id: string;
  name: string;
  name_slug: string;
  breeder_id: string;
  breeder_name: string;
  aliases: string[];
  version?: string | null;
  auto?: boolean;
}

export interface MatchDecision {
  status: 'exact' | 'probable' | 'ambiguous' | 'none';
  cultivarId?: string;
  candidates: string[];
  reason: string;
}

/**
 * Regeln:
 * - exact: Name (oder ein Alias) normalisiert gleich UND der Datensatz nennt genau EINEN Breeder,
 *   dessen Schlüssel dem Breeder der Sorte entspricht.
 * - probable: gleicher Name, Quelle nennt genau einen Breeder, aber andere Schreibweise des
 *   Breeders nicht eindeutig zuordenbar → nur zur Prüfung, nicht angezeigt.
 * - ambiguous: Sammeleintrag mehrerer Breeder oder Quelle ohne Breeder, mehrere Katalogsorten.
 * - none: kein Katalogeintrag mit diesem Namen.
 */
export function decideMatch(rec: ProviderRecord, sameName: CultivarRef[]): MatchDecision {
  const ids = sameName.map((c) => c.id);
  if (!sameName.length) return { status: 'none', candidates: [], reason: 'Kein Katalogeintrag mit diesem Namen' };
  if (rec.breeders.length === 0) return { status: 'ambiguous', candidates: ids, reason: 'Quelle nennt keinen Breeder' };
  if (rec.breeders.length > 1) return { status: 'ambiguous', candidates: ids, reason: `Sammeleintrag mehrerer Breeder (${rec.breeders.length})` };
  const bk = breederKey(rec.breeders[0]!);
  // Versionen (#45, XL …) und Auto-Linien sind eigene Sorten: Ein schlichter Name passt nur zur Linie ohne Version
  // und – sofern die Quelle nicht „Auto“ nennt – zur photoperiodischen Linie.
  const provAuto = /\bauto(flower(ing)?)?\b/i.test(rec.name) || /autoflower/i.test(rec.seedType ?? '');
  const sameBreeder = sameName.filter((c) => c.breeder_id === bk);
  const hits = sameBreeder.filter((c) => !c.version && !!c.auto === provAuto);
  if (sameBreeder.length && !hits.length) return { status: 'ambiguous', candidates: sameBreeder.map((h) => h.id), reason: 'Beim Breeder nur Versionen bzw. Linien mit anderem Blüteverhalten' };
  if (hits.length === 1) return { status: 'exact', cultivarId: hits[0]!.id, candidates: ids, reason: 'Name und Breeder stimmen überein' };
  if (hits.length > 1) return { status: 'ambiguous', candidates: hits.map((h) => h.id), reason: 'Mehrere Linien desselben Breeders (z. B. Auto/Version)' };
  // Breeder ähnlich (z. B. „Barneys Farm“ vs. „Barney's Farm“ ist schon über breederKey gleich) – sonst nur Prüfvorschlag
  const loose = sameName.filter((c) => c.breeder_id.includes(bk) || bk.includes(c.breeder_id));
  if (loose.length === 1) return { status: 'probable', cultivarId: loose[0]!.id, candidates: ids, reason: `Breeder ähnlich („${rec.breeders[0]}“ ↔ „${loose[0]!.breeder_name}“) – Prüfung nötig` };
  return { status: 'none', candidates: ids, reason: `Breeder „${rec.breeders[0]}“ nicht unter den gleichnamigen Sorten` };
}

/** Feldangaben aus einem zugeordneten Datensatz (nur Felder mit Inhalt). */
export function claimsFrom(_provider: Provider, rec: ProviderRecord) {
  const out: { field: string; original: unknown; normalized: unknown }[] = [];
  if (rec.terpenes.length) out.push({ field: 'terpenes', original: rec.terpenes, normalized: rec.terpenes.map(normalizeTerpene) });
  const rng = (r?: { min?: number; max?: number; value?: number }, hi = 40) => {
    if (!r) return undefined;
    const vals = [r.min, r.max, r.value].filter((x): x is number => x !== undefined);
    if (!vals.length || vals.some((v) => v < 0 || v > hi)) return undefined;
    if (r.min !== undefined && r.max !== undefined && r.min > r.max) return undefined;
    return { min: r.min ?? r.value, max: r.max ?? r.value, unit: '%' };
  };
  const thc = rng(rec.thc);
  if (thc && (thc.max ?? 0) > 0) out.push({ field: 'thc', original: rec.thc, normalized: thc });
  const cbd = rng(rec.cbd, 30);
  if (cbd) out.push({ field: 'cbd', original: rec.cbd, normalized: cbd });
  if (rec.genetics && rec.genetics.length <= 160) out.push({ field: 'genetics', original: rec.genetics, normalized: rec.genetics });
  if (rec.aroma.length) out.push({ field: 'aroma', original: rec.aroma, normalized: rec.aroma });
  if (rec.description && rec.description.length >= 40) out.push({ field: 'description', original: rec.description, normalized: rec.description.slice(0, 600) });
  if (rec.type) out.push({ field: 'type', original: rec.type, normalized: rec.type });
  if (rec.flowering && (rec.flowering.min || rec.flowering.max)) out.push({ field: 'flowering', original: rec.flowering, normalized: rec.flowering });
  if (rec.seedType) out.push({ field: 'seedType', original: rec.seedType, normalized: rec.seedType });
  return out;
}

/* ───────────── Lauf (Charge) ───────────── */

export interface EnrichOptions {
  provider: Provider;
  limit: number;
  dryRun?: boolean;
  cultivarIds?: string[];
  startedBy?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (m: string) => void;
  /** Fortsetzen ab einem abgebrochenen Lauf */
  resumeRunId?: number;
}

export interface EnrichResult {
  runId: number;
  processed: number;
  matched: number;
  claims: number;
  decisions: Record<string, number>;
  errors: { cultivar: string; error: string }[];
}

async function fetchJson(url: string, f: typeof fetch, sleep: (ms: number) => Promise<void>): Promise<unknown> {
  let wait = 2000;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await f(url, { headers: { Accept: 'application/json', 'User-Agent': 'TERPGRID self-hosted (catalog enrichment, low volume)' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : wait);
      wait *= 2;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) throw new Error('Keine JSON-Antwort');
    return res.json();
  }
  throw new Error('Quelle wiederholt nicht verfügbar (Ratenlimit/Serverfehler)');
}

/**
 * Reichert eine Charge an: Auswahl = angegebene Sorten oder die meistgelisteten ohne Entscheidung
 * dieser Quelle. Je Sorte EINE Suchanfrage nach dem Namen; Treffer werden abgeglichen, Entscheidungen
 * gespeichert, Feldangaben nur bei „exact“ (bzw. nach Admin-Freigabe) übernommen.
 */
export async function enrichBatch(db: Q, opts: EnrichOptions): Promise<EnrichResult> {
  if (!ENABLED_PROVIDERS.includes(opts.provider)) throw new Error(`${PROVIDERS[opts.provider].name} ist für automatisierte Anreicherung deaktiviert (Anbieter blockiert automatisierte Clients).`);
  const P = PROVIDERS[opts.provider];
  const limit = Math.max(1, Math.min(MAX_BATCH, opts.limit));
  const f = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log = opts.log ?? (() => {});
  let runId: number;
  // Fortsetzen: bereits entschiedene Sorten sind über catalog_matches ausgeschlossen, fehlgeschlagene
  // werden erneut versucht – der Checkpoint dokumentiert nur die zuletzt bearbeitete Sorte.
  if (opts.resumeRunId) {
    const r = (await db.query<{ id: number }>('SELECT id FROM catalog_enrichment_runs WHERE id = $1 AND provider = $2', [opts.resumeRunId, opts.provider])).rows[0];
    if (!r) throw new Error('Lauf nicht gefunden');
    runId = r.id;
    await db.query("UPDATE catalog_enrichment_runs SET status = 'running', finished_at = NULL WHERE id = $1", [runId]);
  } else {
    runId = (await db.query<{ id: number }>("INSERT INTO catalog_enrichment_runs(provider, dry_run, status, requested, started_by) VALUES ($1, $2, 'running', $3, $4) RETURNING id", [opts.provider, !!opts.dryRun, limit, opts.startedBy ?? 'cli'])).rows[0]!.id;
  }
  // Auswahl: deterministisch nach Angebotszahl, ohne bereits entschiedene Sorten dieser Quelle
  const sel = opts.cultivarIds?.length
    ? (await db.query<{ id: string; name: string }>(`SELECT id, name FROM catalog_cultivars WHERE id = ANY($1) ORDER BY id`, [opts.cultivarIds.slice(0, limit)])).rows
    : (
        await db.query<{ id: string; name: string }>(
          `SELECT c.id, c.name FROM catalog_cultivars c
            WHERE NOT EXISTS (SELECT 1 FROM catalog_matches m WHERE m.provider = $1 AND (m.cultivar_id = c.id OR c.id = ANY(m.candidates)))
            ORDER BY c.listing_count DESC, c.id LIMIT $2`,
          [opts.provider, limit],
        )
      ).rows;
  const result: EnrichResult = { runId, processed: 0, matched: 0, claims: 0, decisions: {}, errors: [] };
  const seenNames = new Set<string>();
  for (const c of sel) {
    const nameKey = slugify(c.name);
    if (seenNames.has(nameKey)) continue; // eine Suche je Name genügt (gleichnamige Linien werden gemeinsam entschieden)
    seenNames.add(nameKey);
    try {
      const raw = await fetchJson(P.search(c.name), f, sleep);
      const recs = (opts.provider === 'strainapi' ? normalizeStrainApi(raw) : normalizeFindMySeeds(raw)).filter((r) => slugify(r.name) === nameKey);
      const sameName = (
        await db.query<CultivarRef>(
          `SELECT c.id, c.name, c.name_slug, c.breeder_id, b.name AS breeder_name, c.aliases, c.version, c.auto FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id WHERE c.name_slug = $1`,
          [nameKey],
        )
      ).rows;
      for (const rec of recs) {
        const d = decideMatch(rec, sameName);
        result.decisions[d.status] = (result.decisions[d.status] ?? 0) + 1;
        if (opts.dryRun) {
          log(`  [Probe] ${rec.name} (${rec.breeders.join(' | ') || 'ohne Breeder'}) → ${d.status}: ${d.reason}`);
          continue;
        }
        // Admin-Entscheidungen nie automatisch überschreiben
        await db.query(
          `INSERT INTO catalog_matches(provider, provider_id, provider_name, provider_breeder, status, cultivar_id, candidates, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (provider, provider_id) DO UPDATE SET provider_name = EXCLUDED.provider_name, provider_breeder = EXCLUDED.provider_breeder,
             status = EXCLUDED.status, cultivar_id = EXCLUDED.cultivar_id, candidates = EXCLUDED.candidates, reason = EXCLUDED.reason, decided_at = now()
           WHERE catalog_matches.decided_by = 'auto'`,
          [opts.provider, rec.id, rec.name.slice(0, 200), rec.breeders.join(' | ').slice(0, 500) || null, d.status, d.cultivarId ?? null, d.candidates, d.reason],
        );
        const effective = (await db.query<{ status: string; cultivar_id: string | null }>('SELECT status, cultivar_id FROM catalog_matches WHERE provider = $1 AND provider_id = $2', [opts.provider, rec.id])).rows[0]!;
        // Angaben aus einer früheren (anderen) Zuordnung desselben Quelldatensatzes entfernen
        await db.query(
          `DELETE FROM catalog_claims WHERE provider = $1 AND source_record_id = $2 AND ($3::text IS NULL OR cultivar_id <> $3 OR $4 NOT IN ('exact', 'probable'))`,
          [opts.provider, rec.id, effective.cultivar_id, effective.status],
        );
        if (effective.status !== 'exact' && effective.status !== 'probable') continue;
        if (!effective.cultivar_id) continue;
        if (effective.status === 'exact') result.matched++;
        const review = effective.status === 'exact' ? 'accepted' : 'pending';
        for (const cl of claimsFrom(opts.provider, rec)) {
          await db.query(
            `INSERT INTO catalog_claims(cultivar_id, field, provider, source_record_id, source_url, original, normalized, evidence, license, retrieved_at, expires_at, review_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'database', $8, now(), now() + make_interval(days => $9), $10)
             ON CONFLICT (cultivar_id, field, provider, source_record_id) DO UPDATE SET source_url = EXCLUDED.source_url, original = EXCLUDED.original,
               normalized = EXCLUDED.normalized, retrieved_at = now(), expires_at = EXCLUDED.expires_at,
               review_status = CASE WHEN catalog_claims.review_status = 'rejected' THEN 'rejected' ELSE EXCLUDED.review_status END`,
            [effective.cultivar_id, cl.field, opts.provider, rec.id, rec.url?.startsWith('https://') ? rec.url : null, JSON.stringify(cl.original), JSON.stringify(cl.normalized), P.license, P.ttlDays, review],
          );
          result.claims++;
        }
      }
      if (!recs.length) {
        result.decisions.none = (result.decisions.none ?? 0) + 1;
        if (!opts.dryRun)
          await db.query(
            `INSERT INTO catalog_matches(provider, provider_id, provider_name, status, candidates, reason) VALUES ($1, $2, $3, 'none', $4, 'Kein Datensatz mit diesem Namen bei der Quelle')
             ON CONFLICT (provider, provider_id) DO NOTHING`,
            [opts.provider, `name:${nameKey}`.slice(0, 120), c.name, [c.id]],
          );
      }
    } catch (e) {
      result.errors.push({ cultivar: c.id, error: (e as Error).message.slice(0, 200) });
      log(`  Fehler bei ${c.id}: ${(e as Error).message}`);
    }
    result.processed++;
    await db.query('UPDATE catalog_enrichment_runs SET processed = $2, matched = $3, claims = $4, errors = $5, checkpoint = $6 WHERE id = $1', [runId, result.processed, result.matched, result.claims, JSON.stringify(result.errors), c.id]);
    await sleep(P.minIntervalMs);
  }
  const failed = result.errors.length > 0 && result.errors.length === result.processed;
  await db.query('UPDATE catalog_enrichment_runs SET status = $2, finished_at = now() WHERE id = $1', [runId, failed ? 'failed' : 'done']);
  return result;
}

/** Abgelaufene Angaben entfernen (Cache-Pflege gemäß Nutzungsbedingungen). */
export async function purgeExpiredClaims(db: Q): Promise<number> {
  return (await db.query('DELETE FROM catalog_claims WHERE expires_at IS NOT NULL AND expires_at < now()')).rowCount ?? 0;
}

/**
 * StrainAPI-Abgleich über die Liste der Quelle (8 Seiten à 100, nacheinander, mit Pause): Die Liste wird
 * nur im Arbeitsspeicher verarbeitet. Gespeichert werden ausschließlich Abgleichsentscheidungen für Namen,
 * die es auch im Katalog gibt, und Feldangaben für exakte Zuordnungen – mit Ablaufdatum (Cache, kein Archiv).
 */
export async function enrichFromStrainApiIndex(db: Q, opts: { maxPages?: number; dryRun?: boolean; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; log?: (m: string) => void; startedBy?: string }): Promise<EnrichResult> {
  const P = PROVIDERS.strainapi;
  const f = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxPages = Math.max(1, Math.min(10, opts.maxPages ?? 8));
  const runId = (await db.query<{ id: number }>("INSERT INTO catalog_enrichment_runs(provider, dry_run, status, requested, started_by) VALUES ('strainapi', $1, 'running', $2, $3) RETURNING id", [!!opts.dryRun, maxPages * 100, opts.startedBy ?? 'cli'])).rows[0]!.id;
  const result: EnrichResult = { runId, processed: 0, matched: 0, claims: 0, decisions: {}, errors: [] };
  for (let page = 1; page <= maxPages; page++) {
    let recs: ProviderRecord[] = [];
    let totalPages = maxPages;
    try {
      const raw = (await fetchJson(`https://www.strainapi.com/wp-json/strainapi/v1/strains?page=${page}&per_page=100`, f, sleep)) as { pagination?: { total_pages?: number } };
      recs = normalizeStrainApi(raw);
      totalPages = Number(raw?.pagination?.total_pages) || maxPages;
    } catch (e) {
      result.errors.push({ cultivar: `page:${page}`, error: (e as Error).message.slice(0, 200) });
      break;
    }
    for (const rec of recs) {
      result.processed++;
      const sameName = (
        await db.query<CultivarRef>(
          `SELECT c.id, c.name, c.name_slug, c.breeder_id, b.name AS breeder_name, c.aliases, c.version, c.auto FROM catalog_cultivars c JOIN catalog_breeders b ON b.id = c.breeder_id WHERE c.name_slug = $1`,
          [slugify(rec.name)],
        )
      ).rows;
      const d = decideMatch(rec, sameName);
      result.decisions[d.status] = (result.decisions[d.status] ?? 0) + 1;
      if (d.status === 'none' || opts.dryRun) continue; // Namen ohne Katalogbezug werden nicht gespeichert
      await db.query(
        `INSERT INTO catalog_matches(provider, provider_id, provider_name, provider_breeder, status, cultivar_id, candidates, reason)
         VALUES ('strainapi', $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (provider, provider_id) DO UPDATE SET provider_name = EXCLUDED.provider_name, provider_breeder = EXCLUDED.provider_breeder,
           status = EXCLUDED.status, cultivar_id = EXCLUDED.cultivar_id, candidates = EXCLUDED.candidates, reason = EXCLUDED.reason, decided_at = now()
         WHERE catalog_matches.decided_by = 'auto'`,
        [rec.id, rec.name.slice(0, 200), rec.breeders.join(' | ').slice(0, 500) || null, d.status, d.cultivarId ?? null, d.candidates, d.reason],
      );
      const eff = (await db.query<{ status: string; cultivar_id: string | null }>("SELECT status, cultivar_id FROM catalog_matches WHERE provider = 'strainapi' AND provider_id = $1", [rec.id])).rows[0]!;
      await db.query(
        `DELETE FROM catalog_claims WHERE provider = 'strainapi' AND source_record_id = $1 AND ($2::text IS NULL OR cultivar_id <> $2 OR $3 NOT IN ('exact', 'probable'))`,
        [rec.id, eff.cultivar_id, eff.status],
      );
      if (!eff.cultivar_id || (eff.status !== 'exact' && eff.status !== 'probable')) continue;
      if (eff.status === 'exact') result.matched++;
      for (const cl of claimsFrom('strainapi', rec)) {
        await db.query(
          `INSERT INTO catalog_claims(cultivar_id, field, provider, source_record_id, source_url, original, normalized, evidence, license, retrieved_at, expires_at, review_status)
           VALUES ($1, $2, 'strainapi', $3, $4, $5, $6, 'database', $7, now(), now() + make_interval(days => $8), $9)
           ON CONFLICT (cultivar_id, field, provider, source_record_id) DO UPDATE SET source_url = EXCLUDED.source_url, original = EXCLUDED.original,
             normalized = EXCLUDED.normalized, retrieved_at = now(), expires_at = EXCLUDED.expires_at,
             review_status = CASE WHEN catalog_claims.review_status = 'rejected' THEN 'rejected' ELSE EXCLUDED.review_status END`,
          [eff.cultivar_id, cl.field, rec.id, rec.url?.startsWith('https://') ? rec.url : null, JSON.stringify(cl.original), JSON.stringify(cl.normalized), P.license, P.ttlDays, eff.status === 'exact' ? 'accepted' : 'pending'],
        );
        result.claims++;
      }
    }
    await db.query('UPDATE catalog_enrichment_runs SET processed = $2, matched = $3, claims = $4, errors = $5, checkpoint = $6 WHERE id = $1', [runId, result.processed, result.matched, result.claims, JSON.stringify(result.errors), `page:${page}`]);
    opts.log?.(`  Seite ${page}/${Math.min(totalPages, maxPages)}: ${recs.length} Datensätze · bisher ${result.matched} exakt`);
    if (page >= totalPages) break;
    await sleep(P.minIntervalMs);
  }
  await db.query('UPDATE catalog_enrichment_runs SET status = $2, finished_at = now(), processed = $3, matched = $4, claims = $5, errors = $6 WHERE id = $1', [runId, result.errors.length ? 'failed' : 'done', result.processed, result.matched, result.claims, JSON.stringify(result.errors)]);
  return result;
}
