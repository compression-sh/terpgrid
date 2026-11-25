/**
 * CI-Strains-Pro (Cannabis Intelligence Database, Shannon Goddard, CC BY 4.0):
 * Parser, Bereinigung und Validierung für den Import in den lokalen Katalog.
 *
 * Grundsätze
 * - Jede CSV-Zeile ist ein Seedbank-Angebot („Listing“) mit stabiler ID (strain_id).
 * - Sorten („Cultivars“) werden NUR innerhalb desselben Breeders zusammengefasst
 *   (Breeder-Schlüssel + Name + Version + Autoflower). Gleichnamige Sorten verschiedener
 *   Breeder bleiben getrennt.
 * - Unplausible Werte werden verworfen (nicht korrigiert) und im Bericht gezählt.
 * - Shop-Texte (Wirkungen, Aromen) bleiben als „Angabe der Quelle“ gekennzeichnet.
 */
import { createHash } from 'node:crypto';

export const CISP = {
  name: 'Cannabis Intelligence Database (CI-Strains-Pro)',
  author: 'Shannon Goddard',
  repo: 'https://github.com/Shannon-Goddard/ci-strains-pro',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  /** Geprüfte Version (Commit) und Prüfsumme der Datei raw-data.csv */
  commit: '80fbe5d40fac8dda5120f50b946f069c4961f253',
  sha256: '469fb653819f0f97c29d17ca6e58451f3e4972da72424ab9ca6d1cd319d9103c',
  /** Version der Import-Regeln – eine neue Version erzwingt einen erneuten Import derselben Datei */
  parserVersion: 4,
  changes: 'Von TERPGRID verändert: Zeichenkodierung bereinigt, unplausible Werte verworfen, Angebote je Breeder und Sorte gruppiert, Breeder-Schreibweisen zusammengeführt.',
} as const;

export const cispUrl = (commit: string = CISP.commit) => `https://raw.githubusercontent.com/Shannon-Goddard/ci-strains-pro/${commit}/raw-data.csv`;

/* ───────────── CSV (RFC 4180, Anführungszeichen, Zeilenumbrüche in Feldern) ───────────── */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/* ───────────── Text-Bereinigung ───────────── */

/**
 * Entfernt Mojibake-Ketten (mehrfach falsch dekodiertes UTF-8 wie „Ã\u0083Â\u0082…“),
 * Ersatzzeichen und Steuerzeichen; normalisiert Leerraum.
 */
/** Windows-1252-Zeichen im Bereich 0x80–0x9F (für die Rückwandlung doppelt kodierter Texte). */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Repariert mehrfach falsch dekodierten Text („Nevilâ€™s“ → „Nevil’s“), indem die Zeichen als
 * Windows-1252/Latin-1-Bytes gelesen und erneut als UTF-8 dekodiert werden – nur solange das
 * Ergebnis gültiges UTF-8 ist. Echte Sonderzeichen („São“) bleiben unverändert.
 */
export function repairMojibake(s: string): string {
  if (!/[ÃÂâ][\u0080-\u00bf\u0152-\u2122]/.test(s)) return s;
  for (let i = 0; i < 12; i++) {
    const bytes: number[] = [];
    for (const ch of s) {
      const c = ch.codePointAt(0)!;
      if (c < 0x100) bytes.push(c);
      else if (CP1252[c] !== undefined) bytes.push(CP1252[c]!);
      else return s;
    }
    let t: string;
    try {
      t = utf8.decode(Uint8Array.from(bytes));
    } catch {
      return s;
    }
    if (t === s) return s;
    s = t;
  }
  return s;
}

export function cleanText(s: string | undefined): string {
  if (!s) return '';
  return repairMojibake(s)
    .replace(/[‘’]/g, "'")
    // Kyrillisches „х“ als Kreuzungszeichen zwischen zwei Namen
    .replace(/(\S)\s+х\s+(\S)/g, '$1 x $2')
    .replace(/(?:[ÃÂ][\u0080-\u00bf]?){2,}/g, ' ')
    // eslint-disable-next-line no-control-regex -- Steuerzeichen aus fehlerhaft kodierten Quelltexten entfernen
    .replace(/[\ufffd\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
}

export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Breeder-Schlüssel: nur Groß-/Kleinschreibung, Satzzeichen und Leerraum werden ignoriert. */
export const breederKey = (s: string) => slugify(s).replace(/-/g, '');

/* ───────────── Werte ───────────── */

const num = (s: string | undefined): number | undefined => {
  if (s === undefined) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
const bool = (s: string | undefined) => s?.trim().toLowerCase() === 'true';
const round1 = (n: number) => Math.round(n * 10) / 10;

export type RejectReason = 'implausible' | 'min_gt_max' | 'not_a_name' | 'not_a_list';

/** Plausibilitätsgrenzen (dokumentiert in docs/CATALOG.md). */
export const LIMITS = {
  thc: [1, 40],
  /** THC < 1 % nur bei CBD-dominanten Sorten (CBD max ≥ 3 %) – sonst Parserartefakt der Quelle (0,0 / 0,03) */
  thcLowCbdMin: 3,
  cbd: [0.1, 30],
  flowering: [35, 120],
  heightIndoor: [15, 400],
  heightOutdoor: [30, 600],
  yieldIndoor: [50, 1500],
  yieldOutdoor: [20, 3000],
} as const;

export interface Range {
  min?: number;
  max?: number;
}

export interface Parent {
  name: string;
  /** leer bei unbekanntem Elternteil */
  slug: string;
  unknown?: boolean;
}

export interface ListingValues {
  thc?: Range;
  cbd?: Range;
  flowering?: Range;
  heightIndoorCm?: Range;
  heightOutdoorCm?: Range;
  yieldIndoorGm2?: Range;
  yieldOutdoorGPlant?: Range;
  indica?: number;
  sativa?: number;
  geneticsType?: string;
  /** Typ-Bezeichnung laut Shop (Spalte category_type), z. B. „Indica Dominant Hybrid“ */
  typeLabel?: string;
  parents?: Parent[];
  /** Abstammung als Freitext der Quelle (genetics_description / lineage_description) */
  lineageText?: string;
  /** Herkunft der strukturierten Eltern: Elternspalten oder aus dem Abstammungstext abgeleitet */
  parentsFrom?: 'columns' | 'text';
  generation?: string;
  terpenes?: string[];
  flavors?: string[];
  effects?: string[];
  harvest?: string;
}

export interface Listing {
  id: string;
  cultivarId: string;
  breederId: string;
  seedBank: string;
  breederRaw: string;
  name: string;
  nameOriginal: string;
  version?: string;
  aka?: string;
  auto: boolean;
  feminized: boolean;
  regular: boolean;
  fast: boolean;
  sourceUrl: string;
  scrapedAt?: string;
  values: ListingValues;
  rejected: Partial<Record<string, RejectReason>>;
}

function range(minS: string | undefined, maxS: string | undefined, [lo, hi]: readonly [number, number], field: string, rejected: Listing['rejected']): Range | undefined {
  let min = num(minS);
  let max = num(maxS);
  if (min === undefined && max === undefined) return undefined;
  if (min !== undefined && (min < lo || min > hi)) {
    rejected[`${field}_min`] = 'implausible';
    min = undefined;
  }
  if (max !== undefined && (max < lo || max > hi)) {
    rejected[`${field}_max`] = 'implausible';
    max = undefined;
  }
  if (min !== undefined && max !== undefined && min > max) {
    rejected[field] = 'min_gt_max';
    return undefined;
  }
  if (min === undefined && max === undefined) return undefined;
  return { min: min !== undefined ? round1(min) : undefined, max: max !== undefined ? round1(max) : undefined };
}

/** Elternangabe ist nur ein Name, wenn sie kurz ist und keinen Fließtext enthält. */
export function plausibleName(s: string): boolean {
  if (!s || s.length > 48) return false;
  if (s.split(/\s+/).length > 6) return false;
  if (/[%:!?;,]|https?:|\b(lineage|about|days?|thc|cbd|yield|genetics|flowering|gr\/m2|taste|aroma|effects?|flavou?rs?|smell|femini[sz]ed|autoflower\w*)\b/i.test(s)) return false;
  if (/[a-z][A-Z][a-z]/.test(s) && !/^Mc|^Mac/.test(s)) return false; // zusammengeklebte Wörter aus Shop-HTML
  // Sortennamen beginnen mit Großbuchstabe oder Ziffer; ganz klein geschriebene Teile sind Beschreibungstext
  // („with hints of cream“, „earthy“, „sweet strawberries“)
  if (!/^["“'(]?[\p{Lu}\d]/u.test(s)) return false;
  // Aroma- und Werbesprache aus Shop-Beschreibungen (auch groß geschrieben)
  if (/\b(notes|aromas|hints?\s+of|undertones?|sweetness|experience|refined|exclusively|quality seeds|with us|for a)\b/i.test(s)) return false;
  return /[a-z]/i.test(s);
}

const titleCase = (s: string) => (s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s);

function list(s: string | undefined, field: string, rejected: Listing['rejected'], max = 12): string[] | undefined {
  const t = cleanText(s);
  if (!t) return undefined;
  const items = t
    .split(/\s*[,/|]\s*|\s+&\s+|\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  const ok = items.filter((x) => /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9 .'-]{0,30}$/.test(x) && !/^\d/.test(x));
  if (!ok.length) {
    rejected[field] = 'not_a_list';
    return undefined;
  }
  return [...new Set(ok.map((x) => x.toLowerCase()))].slice(0, max);
}

export type Header = Record<string, number>;

export function headerIndex(row: string[]): Header {
  const h: Header = {};
  row.forEach((c, i) => (h[c.trim()] = i));
  return h;
}

export const REQUIRED_COLUMNS = ['strain_id', 'source_url', 'strain_name_display', 'seed_bank', 'breeder'] as const;

export interface RowError {
  line: number;
  reason: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cultivarIdOf(breederId: string, name: string, version: string | undefined, auto: boolean): string {
  return [breederId, slugify(name), version ? `v-${slugify(version)}` : '', auto ? 'auto' : ''].filter(Boolean).join('--');
}

/** Validiert eine CSV-Zeile. Liefert ein Listing oder einen Ablehnungsgrund. */
export function parseRow(cells: string[], h: Header, line: number): Listing | RowError {
  const g = (k: string) => (h[k] === undefined ? undefined : cells[h[k]!]);
  const id = (g('strain_id') ?? '').trim();
  if (!UUID_RE.test(id)) return { line, reason: 'Ungültige strain_id' };
  const sourceUrl = (g('source_url') ?? '').trim();
  let url: URL | undefined;
  try {
    url = new URL(sourceUrl);
  } catch {
    url = undefined;
  }
  if (!url || url.protocol !== 'https:') return { line, reason: 'Ungültige Quell-URL' };
  const name = cleanText(g('strain_name_display'));
  if (!name || name.length > 80) return { line, reason: 'Sortenname fehlt oder ist zu lang' };
  const breederRaw = cleanText(g('breeder'));
  if (!breederRaw || breederRaw.length > 80) return { line, reason: 'Breeder fehlt' };
  const seedBank = cleanText(g('seed_bank'));
  if (!seedBank) return { line, reason: 'Seedbank fehlt' };
  const breederId = slugify(breederRaw) ? breederKey(breederRaw) : '';
  if (!breederId) return { line, reason: 'Breeder ohne verwertbare Zeichen' };

  const rejected: Listing['rejected'] = {};
  const version = cleanText(g('version')) || undefined;
  const auto = bool(g('is_auto_flowering'));
  const values: ListingValues = {};

  const cbd = range(g('cbd_min'), g('cbd_max'), LIMITS.cbd, 'cbd', rejected);
  if (cbd) values.cbd = cbd;
  const thcLo = (cbd?.max ?? 0) >= LIMITS.thcLowCbdMin ? 0.1 : LIMITS.thc[0];
  const thc = range(g('thc_min'), g('thc_max'), [thcLo, LIMITS.thc[1]], 'thc', rejected);
  if (thc) values.thc = thc;
  const fl = range(g('flowering_days_min'), g('flowering_days_max'), LIMITS.flowering, 'flowering_days', rejected);
  if (fl) values.flowering = fl;
  const hi = range(g('height_indoor_cm_min'), g('height_indoor_cm_max'), LIMITS.heightIndoor, 'height_indoor_cm', rejected);
  if (hi) values.heightIndoorCm = hi;
  const ho = range(g('height_outdoor_cm_min'), g('height_outdoor_cm_max'), LIMITS.heightOutdoor, 'height_outdoor_cm', rejected);
  if (ho) values.heightOutdoorCm = ho;
  const yi = range(g('yield_indoor_g_m2_min'), g('yield_indoor_g_m2_max'), LIMITS.yieldIndoor, 'yield_indoor_g_m2', rejected);
  if (yi) values.yieldIndoorGm2 = yi;
  const yo = range(g('yield_outdoor_g_plant_min'), g('yield_outdoor_g_plant_max'), LIMITS.yieldOutdoor, 'yield_outdoor_g_plant', rejected);
  if (yo) values.yieldOutdoorGPlant = yo;

  const ind = num(g('indica_percentage'));
  const sat = num(g('sativa_percentage'));
  if (ind !== undefined || sat !== undefined) {
    if (ind !== undefined && sat !== undefined && ind >= 0 && sat >= 0 && Math.abs(ind + sat - 100) <= 1) {
      values.indica = round1(ind);
      values.sativa = round1(sat);
    } else rejected.indica_sativa = 'implausible';
  }
  const gt = cleanText(g('genetics_type'));
  if (['Sativa Dominant', 'Indica Dominant', 'Balanced Hybrid'].includes(gt)) values.geneticsType = gt;
  const cat = cleanText(g('category_type'));
  if (['Indica Dominant Hybrid', 'Sativa Dominant Hybrid', 'Balanced Hybrid', 'Indica', 'Sativa'].includes(cat)) {
    values.typeLabel = cat;
    // Gleichbedeutende Kategorien als Typ übernehmen (reine „Indica“/„Sativa“ bleiben nur Bezeichnung)
    if (!values.geneticsType && cat !== 'Indica' && cat !== 'Sativa') values.geneticsType = cat === 'Balanced Hybrid' ? cat : cat.replace(' Hybrid', '');
  }

  const parents: Parent[] = [];
  for (const k of ['parent_1_display', 'parent_2_display']) {
    const raw = cleanText(g(k));
    if (!raw) continue;
    // HTML-Reste („</strong> Name“) und lose Klammern/Sternchen am Rand entfernen, bevor geprüft wird
    const nm = titleCase(
      raw
        .replace(/<\/?[a-z][^>]*>/gi, ' ')
        .replace(/^[\s[(*-]+|[\s\])*]+$/g, '')
        .replace(/\s+strain$/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    // „Unknown …“ ist ein unbekannter Elternteil, keine Sorte
    if (/^unknown\b/i.test(nm)) parents.push({ name: nm, slug: '', unknown: true });
    else if (plausibleName(nm)) parents.push({ name: nm, slug: slugify(nm) });
    else rejected.parents = 'not_a_name';
  }
  if (rejected.parents) parents.length = 0; // halbe Abstammung wäre irreführend
  if (parents.length) {
    values.parents = parents;
    values.parentsFrom = 'columns';
  }
  for (const k of ['genetics_description', 'lineage_description']) {
    const t = cleanText(g(k));
    if (t && t.length <= 140 && /[a-z]/i.test(t) && !/^unknown( parent( strains?)?)?$/i.test(t)) {
      values.lineageText = t;
      break;
    }
  }
  // Keine Elternspalten, aber ein eindeutiger Text „A x B“ bzw. „A and B“ → strukturiert übernehmen
  if (!values.parents && !rejected.parents && values.lineageText && !/[()[\],;.]/.test(values.lineageText)) {
    const parts = values.lineageText.split(/\s+(?:x|×|and|&)\s+/i).map((p) => titleCase(p.trim()));
    if (parts.length === 2 && parts.every((p) => plausibleName(p) && !/^unknown/i.test(p)) && slugify(parts[0]!) !== slugify(parts[1]!)) {
      values.parents = parts.map((p) => ({ name: p, slug: slugify(p) }));
      values.parentsFrom = 'text';
    }
  }
  const gen = cleanText(g('generation'));
  if (/^(F\d|S\d|BX\d|IBL)$/i.test(gen)) values.generation = gen.toUpperCase();

  const terp = list(g('terpenes'), 'terpenes', rejected, 8);
  if (terp) values.terpenes = terp;
  const flav = list(g('flavors'), 'flavors', rejected);
  if (flav) values.flavors = flav;
  const eff = list(g('effects'), 'effects', rejected);
  if (eff) values.effects = eff;
  const harvest = cleanText(g('harvest_time'));
  if (harvest && harvest.length <= 60 && /[a-z]/i.test(harvest)) values.harvest = harvest;

  const scraped = (g('scraped_at') ?? '').trim();
  let scrapedAt: string | undefined;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(scraped);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(scraped);
  if (iso) scrapedAt = iso[1];
  else if (us) scrapedAt = `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;

  const aka = cleanText(g('aka_strain_name'));
  return {
    id: id.toLowerCase(),
    cultivarId: cultivarIdOf(breederId, name, version, auto),
    breederId,
    seedBank,
    breederRaw,
    name,
    nameOriginal: cleanText(g('strain_name_original')) || name,
    version,
    aka: aka && plausibleName(aka) ? aka : undefined,
    auto,
    feminized: bool(g('is_feminized_flowering')),
    regular: bool(g('is_regular_flowering')),
    fast: bool(g('is_fast_flowering')),
    sourceUrl: url.href,
    scrapedAt,
    values,
    rejected,
  };
}

/* ───────────── Gruppierung ───────────── */

export interface Breeder {
  id: string;
  name: string;
  variants: string[];
  isSeedBank: boolean;
  collabMembers: string[];
  seedBanks: string[];
  cultivarCount: number;
  listingCount: number;
}

export interface Cultivar {
  id: string;
  breederId: string;
  name: string;
  version?: string;
  auto: boolean;
  aliases: string[];
  seedTypes: string[];
  values: ListingValues;
  /** Felder, in denen sich die Angebote widersprechen (z. B. THC-Spannen ohne Überschneidung) */
  conflicts: string[];
  listingIds: string[];
  seedBanks: string[];
}

const mostCommon = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
};

const RANGE_FIELDS = ['thc', 'cbd', 'flowering', 'heightIndoorCm', 'heightOutdoorCm', 'yieldIndoorGm2', 'yieldOutdoorGPlant'] as const;

function mergeRanges(rs: Range[]): { range?: Range; conflict: boolean } {
  const valid = rs.filter((r) => r.min !== undefined || r.max !== undefined);
  if (!valid.length) return { conflict: false };
  const lo = (r: Range) => r.min ?? r.max!;
  const hi = (r: Range) => r.max ?? r.min!;
  const min = Math.min(...valid.map(lo));
  const max = Math.max(...valid.map(hi));
  // Widerspruch: zwei Angebote ohne gemeinsame Überschneidung
  const conflict = Math.max(...valid.map(lo)) > Math.min(...valid.map(hi));
  return { range: { min, max }, conflict };
}

export function groupCultivars(listings: Listing[]): { cultivars: Cultivar[]; breeders: Breeder[] } {
  const byCultivar = new Map<string, Listing[]>();
  for (const l of listings) {
    const arr = byCultivar.get(l.cultivarId) ?? [];
    arr.push(l);
    byCultivar.set(l.cultivarId, arr);
  }
  const seedBankKeys = new Set(listings.map((l) => breederKey(l.seedBank)));
  const cultivars: Cultivar[] = [];
  for (const [id, ls] of byCultivar) {
    ls.sort((a, b) => a.id.localeCompare(b.id));
    const values: ListingValues = {};
    const conflicts: string[] = [];
    for (const f of RANGE_FIELDS) {
      const m = mergeRanges(ls.map((l) => l.values[f]).filter((x): x is Range => !!x));
      if (m.range) values[f] = m.range;
      if (m.conflict) conflicts.push(f);
    }
    const ratios = ls.filter((l) => l.values.indica !== undefined);
    if (ratios.length) {
      const set = new Set(ratios.map((l) => `${l.values.indica}/${l.values.sativa}`));
      values.indica = ratios[0]!.values.indica;
      values.sativa = ratios[0]!.values.sativa;
      if (set.size > 1) conflicts.push('indica');
    }
    const types = [...new Set(ls.map((l) => l.values.geneticsType).filter(Boolean) as string[])];
    if (types.length) values.geneticsType = types.length === 1 ? types[0] : mostCommon(ls.map((l) => l.values.geneticsType).filter(Boolean) as string[]);
    if (types.length > 1) conflicts.push('geneticsType');
    const lineages = new Map<string, Parent[]>();
    for (const l of ls) if (l.values.parents?.length) lineages.set(l.values.parents.map((p) => p.slug).sort().join('×'), l.values.parents);
    if (lineages.size) values.parents = [...lineages.values()][0];
    if (lineages.size > 1) conflicts.push('parents');
    const labels = ls.map((l) => l.values.typeLabel).filter(Boolean) as string[];
    if (labels.length) values.typeLabel = mostCommon(labels);
    const texts = ls.map((l) => l.values.lineageText).filter(Boolean) as string[];
    if (texts.length) values.lineageText = mostCommon(texts);
    const from = ls.find((l) => l.values.parents?.length && l.values.parents.map((p) => p.slug).sort().join('×') === (values.parents ?? []).map((p) => p.slug).sort().join('×'))?.values.parentsFrom;
    if (from) values.parentsFrom = from;
    const gens = [...new Set(ls.map((l) => l.values.generation).filter(Boolean) as string[])];
    if (gens.length === 1) values.generation = gens[0];
    for (const f of ['terpenes', 'flavors', 'effects'] as const) {
      const all = [...new Set(ls.flatMap((l) => l.values[f] ?? []))];
      if (all.length) values[f] = all.slice(0, 12);
    }
    const harvest = ls.map((l) => l.values.harvest).filter(Boolean) as string[];
    if (harvest.length) values.harvest = mostCommon(harvest);
    const seedTypes = [ls.some((l) => l.feminized) && 'feminisiert', ls.some((l) => l.regular) && 'regulär', ls[0]!.auto && 'autoflowering', ls.some((l) => l.fast) && 'Fast Version'].filter(Boolean) as string[];
    const first = ls[0]!;
    const aliases = [...new Set([...ls.map((l) => l.aka).filter(Boolean), ...ls.map((l) => l.nameOriginal).filter((n) => slugify(n) !== slugify(first.name))] as string[])].slice(0, 10);
    cultivars.push({
      id,
      breederId: first.breederId,
      name: mostCommon(ls.map((l) => l.name)),
      version: first.version,
      auto: first.auto,
      aliases,
      seedTypes,
      values,
      conflicts,
      listingIds: ls.map((l) => l.id),
      seedBanks: [...new Set(ls.map((l) => l.seedBank))].sort(),
    });
  }
  const byBreeder = new Map<string, Listing[]>();
  for (const l of listings) byBreeder.set(l.breederId, [...(byBreeder.get(l.breederId) ?? []), l]);
  const breeders: Breeder[] = [...byBreeder.entries()].map(([id, ls]) => {
    const name = mostCommon(ls.map((l) => l.breederRaw));
    const members = / x /i.test(name) ? name.split(/ x /i).map((s) => s.trim()).filter(Boolean) : [];
    return {
      id,
      name,
      variants: [...new Set(ls.map((l) => l.breederRaw))].filter((v) => v !== name).sort(),
      isSeedBank: seedBankKeys.has(id),
      collabMembers: members.length > 1 ? members : [],
      seedBanks: [...new Set(ls.map((l) => l.seedBank))].sort(),
      cultivarCount: new Set(ls.map((l) => l.cultivarId)).size,
      listingCount: ls.length,
    };
  });
  cultivars.sort((a, b) => a.id.localeCompare(b.id));
  breeders.sort((a, b) => a.id.localeCompare(b.id));
  return { cultivars, breeders };
}

/* ───────────── Gesamtlauf + Qualitätsbericht ───────────── */

export interface QualityReport {
  source: typeof CISP.name;
  commit: string;
  sha256: string;
  checksumMatches: boolean;
  columns: number;
  rawRows: number;
  accepted: number;
  rejectedRows: number;
  rejectedReasons: Record<string, number>;
  duplicateIds: number;
  /** Mehrere Angebote derselben Seedbank für dieselbe Sorte (gleicher Breeder, Name, Version) */
  sameSeedBankDuplicates: number;
  cultivars: number;
  breeders: number;
  breederSpellingsMerged: number;
  /** Sortennamen, die bei mehreren Breedern vorkommen (bewusst NICHT zusammengeführt) */
  namesSharedAcrossBreeders: number;
  cultivarsWithConflicts: number;
  coverage: Record<string, { listings: number; percent: number }>;
  fieldRejections: Record<string, number>;
  images: number;
  parserVersion: number;
}

export interface ParsedDataset {
  listings: Listing[];
  cultivars: Cultivar[];
  breeders: Breeder[];
  report: QualityReport;
  errors: RowError[];
}

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function parseDataset(buf: Buffer, commit: string = CISP.commit): ParsedDataset {
  const digest = sha256(buf);
  const text = buf.toString('utf8').replace(/^\ufeff/, '');
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];
  const h = headerIndex(header);
  const missing = REQUIRED_COLUMNS.filter((c) => h[c] === undefined);
  if (missing.length) throw new Error(`Pflichtspalten fehlen: ${missing.join(', ')}`);
  const listings: Listing[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  let duplicateIds = 0;
  rows.forEach((cells, i) => {
    const r = parseRow(cells, h, i + 2);
    if ('reason' in r) return void errors.push(r);
    if (seen.has(r.id)) {
      duplicateIds++;
      return void errors.push({ line: i + 2, reason: 'Doppelte strain_id' });
    }
    seen.add(r.id);
    listings.push(r);
  });
  const { cultivars, breeders } = groupCultivars(listings);
  const pct = (n: number) => (listings.length ? Math.round((n / listings.length) * 1000) / 10 : 0);
  const cov = (pred: (l: Listing) => boolean) => {
    const n = listings.filter(pred).length;
    return { listings: n, percent: pct(n) };
  };
  const fieldRejections: Record<string, number> = {};
  for (const l of listings) for (const k of Object.keys(l.rejected)) fieldRejections[k] = (fieldRejections[k] ?? 0) + 1;
  const reasons: Record<string, number> = {};
  for (const e of errors) reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
  const bankKey = new Map<string, number>();
  for (const l of listings) {
    const k = `${l.seedBank}|${l.cultivarId}`;
    bankKey.set(k, (bankKey.get(k) ?? 0) + 1);
  }
  const nameBreeders = new Map<string, Set<string>>();
  for (const c of cultivars) {
    const k = slugify(c.name);
    nameBreeders.set(k, (nameBreeders.get(k) ?? new Set()).add(c.breederId));
  }
  const report: QualityReport = {
    source: CISP.name,
    commit,
    sha256: digest,
    checksumMatches: commit === CISP.commit ? digest === CISP.sha256 : false,
    columns: header.length,
    rawRows: rows.length,
    accepted: listings.length,
    rejectedRows: errors.length,
    rejectedReasons: reasons,
    duplicateIds,
    sameSeedBankDuplicates: [...bankKey.values()].filter((n) => n > 1).reduce((a, n) => a + n - 1, 0),
    cultivars: cultivars.length,
    breeders: breeders.length,
    breederSpellingsMerged: breeders.reduce((a, b) => a + b.variants.length, 0),
    namesSharedAcrossBreeders: [...nameBreeders.values()].filter((s) => s.size > 1).length,
    cultivarsWithConflicts: cultivars.filter((c) => c.conflicts.length).length,
    coverage: {
      thc: cov((l) => !!l.values.thc),
      cbd: cov((l) => !!l.values.cbd),
      lineage: cov((l) => !!l.values.parents?.length),
      lineageText: cov((l) => !!l.values.lineageText),
      typeLabel: cov((l) => !!l.values.typeLabel),
      flowering: cov((l) => !!l.values.flowering),
      indicaSativa: cov((l) => l.values.indica !== undefined),
      terpenes: cov((l) => !!l.values.terpenes?.length),
      flavors: cov((l) => !!l.values.flavors?.length),
      effects: cov((l) => !!l.values.effects?.length),
      heightIndoor: cov((l) => !!l.values.heightIndoorCm),
      yieldIndoor: cov((l) => !!l.values.yieldIndoorGm2),
      sourceUrl: cov((l) => !!l.sourceUrl),
    },
    fieldRejections,
    images: 0,
    parserVersion: CISP.parserVersion,
  };
  return { listings, cultivars, breeders, report, errors };
}
