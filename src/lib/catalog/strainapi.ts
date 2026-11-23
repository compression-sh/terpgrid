/**
 * StrainAPI-Adapter (https://www.strainapi.com/docs/).
 * Öffentliche Read-only-API, kein Schlüssel. Bedingungen: Quellenangabe
 * „Data provided by StrainAPI“, angemessenes Caching, keine Massenkopie.
 */
import { htmlToBlocks, stripTags } from './html';
import { CatalogError, type CatalogPage, type CatalogStrain, type EvidenceState, type TypeClass, type ValueRange } from './types';

import { strainapiBase } from './endpoint';

export const STRAINAPI_BASE = 'https://www.strainapi.com/wp-json/strainapi/v1';
export const STRAINAPI_HOME = 'https://www.strainapi.com/';
export const STRAINAPI_ATTRIBUTION = { provider: 'strainapi' as const, name: 'StrainAPI', url: STRAINAPI_HOME };

/* ───────────── Rohformate (nur benötigte Felder, alles optional/nullable) ───────────── */

interface RawRange {
  value?: number | null;
  min?: number | null;
  max?: number | null;
  unit?: string | null;
}

export interface RawStrain {
  id?: number;
  name?: string | null;
  display_title?: string | null;
  slug?: string | null;
  url?: string | null;
  excerpt?: string | null;
  image?: { url?: string | null; width?: number | null; height?: number | null; alt?: string | null } | null;
  breeder?: string | null;
  genetics?: string | null;
  type?: string | null;
  indica_percent?: number | null;
  sativa_percent?: number | null;
  seed_type?: string | null;
  thc?: RawRange | null;
  cbd?: RawRange | null;
  terpenes?: unknown;
  flowering?: { min_days?: number | null; max_days?: number | null } | null;
  aroma?: unknown;
  flavor?: unknown;
  effects?: { mental?: unknown; body?: unknown } | null;
  evidence?: Record<string, unknown> | unknown[] | null;
  outdoor_harvest?: string | null;
  plant_structure?: string | null;
  yield?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  description?: string | null;
  content_html?: string | null;
}

export interface RawCollection {
  data?: RawStrain[];
  pagination?: { page?: number; per_page?: number; total?: number; total_pages?: number };
}

/* ───────────── Normalisierung ───────────── */

const finite = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** "mixed"-Felder (Liste oder String) zu bereinigter String-Liste. */
export function toList(v: unknown): string[] {
  if (Array.isArray(v)) return [...new Set(v.map((x) => (typeof x === 'string' ? stripTags(x) : '')).filter(Boolean))];
  if (typeof v === 'string' && v.trim()) return [...new Set(v.split(/[,;]|\s·\s/).map((x) => stripTags(x)).filter(Boolean))];
  return [];
}

export function normalizeRange(r: RawRange | null | undefined): ValueRange | undefined {
  if (!r) return undefined;
  const value = finite(r.value);
  let min = finite(r.min);
  let max = finite(r.max);
  if (value === undefined && min === undefined && max === undefined) return undefined;
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const clamp = (n?: number) => (n === undefined ? undefined : Math.min(100, Math.max(0, n)));
  return { value: clamp(value), min: clamp(min), max: clamp(max), unit: '%' };
}

export function classifyType(type?: string, indica?: number, sativa?: number): TypeClass {
  const t = (type ?? '').toLowerCase();
  if (/hybrid/.test(t)) return 'hybrid';
  if (/indica/.test(t) && !/sativa/.test(t)) return 'indica';
  if (/sativa/.test(t) && !/indica/.test(t)) return 'sativa';
  if (/indica|sativa/.test(t)) return 'hybrid';
  if (indica !== undefined && sativa !== undefined) return indica > sativa ? 'indica' : sativa > indica ? 'sativa' : 'hybrid';
  return 'unknown';
}

const EVIDENCE = new Set<EvidenceState>(['supported', 'reported', 'disputed', 'insufficient_data']);

export function normalizeEvidence(e: RawStrain['evidence']): Partial<Record<string, EvidenceState>> {
  const out: Partial<Record<string, EvidenceState>> = {};
  if (!e || Array.isArray(e) || typeof e !== 'object') return out;
  for (const [k, v] of Object.entries(e)) if (typeof v === 'string' && EVIDENCE.has(v as EvidenceState)) out[k] = v as EvidenceState;
  return out;
}

/** Nur https-Bilder des Anbieters selbst werden übernommen. */
export function safeImageUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return undefined;
    if (u.hostname !== 'www.strainapi.com' && u.hostname !== 'strainapi.com') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function safeRecordUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)strainapi\.com$/.test(u.hostname) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeStrain(raw: RawStrain, withDetail = false): CatalogStrain | undefined {
  const slug = str(raw.slug);
  const name = str(raw.name);
  if (!slug || !name) return undefined;
  const type = str(raw.type);
  const indica = finite(raw.indica_percent);
  const sativa = finite(raw.sativa_percent);
  const imgUrl = safeImageUrl(raw.image?.url);
  const recordUrl = safeRecordUrl(raw.url);
  const fl = raw.flowering;
  const minDays = finite(fl?.min_days);
  const maxDays = finite(fl?.max_days);
  const strain: CatalogStrain = {
    provider: 'strainapi',
    id: slug,
    key: `strainapi:${slug}`,
    name: stripTags(name),
    aliases: [],
    breeder: str(raw.breeder) ? stripTags(raw.breeder!) : undefined,
    genetics: str(raw.genetics) ? stripTags(raw.genetics!) : undefined,
    type,
    typeClass: classifyType(type, indica, sativa),
    indicaPercent: indica,
    sativaPercent: sativa,
    seedType: str(raw.seed_type),
    thc: normalizeRange(raw.thc),
    cbd: normalizeRange(raw.cbd),
    terpenes: toList(raw.terpenes),
    aroma: toList(raw.aroma),
    flavor: toList(raw.flavor),
    excerpt: str(raw.excerpt) ? stripTags(raw.excerpt!) : undefined,
    image: imgUrl
      ? { url: imgUrl, width: finite(raw.image?.width), height: finite(raw.image?.height), alt: str(raw.image?.alt), credit: 'StrainAPI', creditUrl: recordUrl ?? STRAINAPI_HOME }
      : undefined,
    flowering: minDays !== undefined || maxDays !== undefined ? { minDays, maxDays } : undefined,
    evidence: normalizeEvidence(raw.evidence),
    updatedAt: str(raw.updated_at),
    attribution: { ...STRAINAPI_ATTRIBUTION, recordUrl },
  };
  if (withDetail) {
    const eff = raw.effects;
    const mental = toList(eff?.mental);
    const body = toList(eff?.body);
    strain.detail = {
      displayTitle: str(raw.display_title) ? stripTags(raw.display_title!) : undefined,
      description: str(raw.description) ? stripTags(raw.description!) : undefined,
      blocks: htmlToBlocks(raw.content_html ?? ''),
      effects: mental.length || body.length ? { mental, body } : undefined,
      outdoorHarvest: str(raw.outdoor_harvest),
      plantStructure: str(raw.plant_structure),
      yield: str(raw.yield),
      publishedAt: str(raw.published_at),
    };
  }
  return strain;
}

export function normalizeCollection(raw: unknown, headers?: Headers, fromCache = false, fetchedAt = new Date().toISOString()): CatalogPage {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as RawCollection).data)) throw new CatalogError('Unerwartete Antwort von StrainAPI.', 'invalid_response');
  const c = raw as RawCollection;
  const items = c.data!.map((r) => normalizeStrain(r)).filter((x): x is CatalogStrain => !!x);
  const hTotal = Number(headers?.get('X-WP-Total'));
  const hPages = Number(headers?.get('X-WP-TotalPages'));
  const perPage = c.pagination?.per_page ?? items.length;
  const total = c.pagination?.total ?? (Number.isFinite(hTotal) ? hTotal : items.length);
  return {
    items,
    page: c.pagination?.page ?? 1,
    perPage,
    total,
    totalPages: c.pagination?.total_pages ?? (Number.isFinite(hPages) ? hPages : Math.max(1, Math.ceil(total / Math.max(1, perPage)))),
    fromCache,
    fetchedAt,
  };
}

/* ───────────── URLs ───────────── */

export function listUrl(page: number, perPage: number): string {
  return `${strainapiBase()}/strains?page=${Math.max(1, Math.floor(page))}&per_page=${Math.min(100, Math.max(1, Math.floor(perPage)))}`;
}
export function searchUrl(q: string, page: number, perPage: number): string {
  return `${strainapiBase()}/search?q=${encodeURIComponent(q.trim().slice(0, 80))}&page=${Math.max(1, Math.floor(page))}&per_page=${Math.min(100, Math.max(1, Math.floor(perPage)))}`;
}
export function detailUrl(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/i.test(slug)) throw new CatalogError('Ungültige Sorten-Kennung.', 'bad_request');
  return `${strainapiBase()}/strains/${encodeURIComponent(slug)}`;
}
