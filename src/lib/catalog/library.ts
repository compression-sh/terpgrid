/**
 * Client für den lokal indexierten Katalog der eigenen Instanz (CI-Strains-Pro in PostgreSQL).
 * Nur im Servermodus verfügbar; Suchanfragen gehen ausschließlich an den eigenen Server.
 */
import { api } from '../server/api';
import type { CatalogStrain, TypeClass } from './types';

export interface LibRange {
  min?: number;
  max?: number;
}

export interface LibParent {
  name: string;
  slug: string;
  unknown?: boolean;
}

export type MatchTier = 'exact' | 'prefix' | 'name' | 'related' | 'similar';

export interface LibCultivar {
  id: string;
  name: string;
  version?: string;
  breeder: { id: string; name: string };
  auto: boolean;
  aliases: string[];
  seedTypes: string[];
  geneticsType?: string;
  thc?: LibRange;
  cbd?: LibRange;
  flowering?: LibRange;
  indica?: number;
  sativa?: number;
  parents: LibParent[];
  terpenes: string[];
  seedBanks: string[];
  listingCount: number;
  conflicts: string[];
  match?: MatchTier;
  values?: LibValues;
}

export interface LibValues {
  thc?: LibRange;
  cbd?: LibRange;
  flowering?: LibRange;
  heightIndoorCm?: LibRange;
  heightOutdoorCm?: LibRange;
  yieldIndoorGm2?: LibRange;
  yieldOutdoorGPlant?: LibRange;
  indica?: number;
  sativa?: number;
  geneticsType?: string;
  parents?: LibParent[];
  generation?: string;
  typeLabel?: string;
  lineageText?: string;
  parentsFrom?: 'columns' | 'text';
  terpenes?: string[];
  flavors?: string[];
  effects?: string[];
  harvest?: string;
}

export interface LibListing {
  id: string;
  seedBank: string;
  breederRaw: string;
  nameOriginal: string;
  sourceUrl: string;
  scrapedAt?: string;
  values: LibValues;
  rejected: string[];
}

export interface LibAttribution {
  name: string;
  author: string;
  url: string;
  license: string;
  licenseUrl: string;
  changes: string;
}

export interface LibStatus {
  available: boolean;
  version?: string;
  importedAt?: string;
  counts?: { cultivars: number; breeders: number; listings: number };
  coverage?: Record<string, { listings: number; percent: number }>;
  attribution: LibAttribution;
}

export interface LibSearchResult {
  items: LibCultivar[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  groups: Partial<Record<MatchTier, number>>;
  query: string;
}

export interface LibClaim {
  field: 'terpenes' | 'thc' | 'cbd' | 'genetics' | 'aroma' | 'description' | 'image' | 'type' | 'flowering' | 'seedType';
  provider: string;
  providerName: string;
  providerUrl?: string;
  sourceUrl?: string | null;
  value: unknown;
  evidence: 'database' | 'breeder' | 'lab';
  retrievedAt: string;
}

export interface LibCultivarDetail {
  claims?: LibClaim[];
  cultivar: LibCultivar & { values: LibValues };
  listings: LibListing[];
  parentMatches: { slug: string; matches: { id: string; name: string; breeder: string; auto: boolean }[] }[];
  children: LibCultivar[];
  childCount: number;
  sameName: LibCultivar[];
  dataset?: { version: string; importedAt: string };
  attribution: LibAttribution;
}

export interface LibLineageNode {
  id: string;
  kind: 'root' | 'strain' | 'ambiguous' | 'unresolved' | 'unknown';
  label: string;
  depth: number;
  cultivar?: LibCultivar;
  candidates?: LibCultivar[];
  flags: string[];
  expanded: boolean;
}

export interface LibLineage {
  rootId: string;
  nodes: LibLineageNode[];
  edges: { from: string; to: string; kind: 'documented' | 'alternative' }[];
  truncated: boolean;
  maxDepth: number;
  attribution: LibAttribution;
}

export interface LibBreeder {
  id: string;
  name: string;
  variants: string[];
  isSeedBank: boolean;
  collabMembers: string[];
  seedBanks: string[];
  cultivarCount: number;
  listingCount: number;
}

export interface LibBreederList {
  items: LibBreeder[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  letters: Record<string, number>;
}

export interface LibBreederDetail {
  breeder: LibBreeder;
  stats: Record<string, number>;
  topParents: { slug: string; count: number }[];
  collaborations: { id: string; name: string; cultivarCount: number }[];
  attribution: LibAttribution;
}

/** Wie viele Katalogsorten ein Terpen NENNEN (Seedbank-Texte bzw. Datenbank-Angaben) – keine Mengen */
export interface LibTerpeneIndex {
  terpenes: { id: string; names: string[]; cisp: number; database: number }[];
  cultivarsWithTerpenes: number;
}
export interface LibTerpeneCultivars {
  id: string;
  total: number;
  page: number;
  totalPages: number;
  items: (LibCultivar & { terpeneSource: 'seedbank' | 'database' })[];
}

export interface LibSearchParams {
  q?: string;
  breeder?: string;
  type?: 'indica' | 'sativa' | 'balanced';
  auto?: '1' | '0';
  seed?: 'feminisiert' | 'regulär';
  lineage?: '1';
  thc?: '1';
  thcMin?: number;
  cbdMin?: number;
  terpene?: string;
  parent?: string;
  sort?: 'relevance' | 'name' | 'thc' | 'breeder' | 'listings';
  page?: number;
  perPage?: number;
}

const qs = (p: object) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};

let statusCache: Promise<LibStatus> | null = null;
/** Letzter bekannter Status (für sofortige Anzeige ohne Flackern) */
export let lastLibraryStatus: LibStatus | undefined;

export const library = {
  status(force = false): Promise<LibStatus> {
    if (!statusCache || force)
      statusCache = api<LibStatus>('GET', '/api/catalog/local/status').then((s) => (lastLibraryStatus = s)).catch((e) => {
      statusCache = null;
      throw e;
    });
    return statusCache;
  },
  search: (p: LibSearchParams, signal?: AbortSignal) => api<LibSearchResult>('GET', `/api/catalog/local/search${qs(p)}`, undefined, { signal }),
  cultivar: (id: string, signal?: AbortSignal) => api<LibCultivarDetail>('GET', `/api/catalog/local/cultivars/${encodeURIComponent(id)}`, undefined, { signal }),
  lineage: (id: string, depth: number, signal?: AbortSignal) => api<LibLineage>('GET', `/api/catalog/local/lineage/${encodeURIComponent(id)}?depth=${depth}`, undefined, { signal }),
  byName: (slug: string, signal?: AbortSignal) => api<{ slug: string; items: LibCultivar[]; childCount: number }>('GET', `/api/catalog/local/by-name/${encodeURIComponent(slug)}`, undefined, { signal }),
  breeders: (p: { q?: string; letter?: string; sort?: 'name' | 'cultivars'; kind?: 'seedbank' | 'collab'; page?: number; perPage?: number }, signal?: AbortSignal) =>
    api<LibBreederList>('GET', `/api/catalog/local/breeders${qs(p)}`, undefined, { signal }),
  terpeneIndex: (signal?: AbortSignal) => api<LibTerpeneIndex>('GET', '/api/catalog/local/terpene-index', undefined, { signal }),
  terpeneCultivars: (id: string, page: number, signal?: AbortSignal) =>
    api<LibTerpeneCultivars>('GET', `/api/catalog/local/terpenes/${encodeURIComponent(id)}/cultivars?page=${page}`, undefined, { signal }),
  breeder: (id: string, signal?: AbortSignal) => api<LibBreederDetail>('GET', `/api/catalog/local/breeders/${encodeURIComponent(id)}`, undefined, { signal }),
};

export function resetLibraryStatus() {
  statusCache = null;
  lastLibraryStatus = undefined;
}

export const CISP_ATTRIBUTION_NAME = 'CI-Strains-Pro';
export const CISP_REPO = 'https://github.com/Shannon-Goddard/ci-strains-pro';

export function typeClassOf(geneticsType?: string): TypeClass {
  if (geneticsType === 'Indica Dominant') return 'indica';
  if (geneticsType === 'Sativa Dominant') return 'sativa';
  if (geneticsType === 'Balanced Hybrid') return 'hybrid';
  return 'unknown';
}

export const GENETICS_LABEL: Record<string, string> = {
  'Indica Dominant': 'Indica-dominant',
  'Sativa Dominant': 'Sativa-dominant',
  'Balanced Hybrid': 'Ausgewogener Hybrid',
};

/** Abbildung auf das gemeinsame Katalogmodell (Karten, Favoriten, Vergleich). */
export function toCatalogStrain(c: LibCultivar): CatalogStrain {
  const v = c.values;
  return {
    provider: 'cisp',
    id: c.id,
    key: `cisp:${c.id}`,
    name: c.version ? `${c.name} (${c.version})` : c.name,
    aliases: c.aliases,
    breeder: c.breeder.name,
    genetics: c.parents.length ? c.parents.map((p) => p.name).join(' × ') : undefined,
    type: c.geneticsType ? GENETICS_LABEL[c.geneticsType] : undefined,
    typeClass: typeClassOf(c.geneticsType),
    indicaPercent: c.indica,
    sativaPercent: c.sativa,
    seedType: c.seedTypes.join(', ') || undefined,
    thc: c.thc ? { min: c.thc.min, max: c.thc.max, unit: '%', basis: 'Angabe der Seedbank(s)' } : undefined,
    cbd: c.cbd ? { min: c.cbd.min, max: c.cbd.max, unit: '%', basis: 'Angabe der Seedbank(s)' } : undefined,
    terpenes: c.terpenes,
    aroma: v?.flavors ?? [],
    flavor: [],
    flowering: c.flowering ? { minDays: c.flowering.min, maxDays: c.flowering.max } : undefined,
    evidence: {},
    attribution: { provider: 'cisp', name: CISP_ATTRIBUTION_NAME, url: CISP_REPO, recordUrl: undefined },
    facts: {
      lineage: c.parents.length === 0 ? 'none' : c.parents.some((p) => p.unknown) ? 'partial-unknown' : 'documented',
      thc: !!c.thc,
      cbd: !!c.cbd,
      terpenes: c.terpenes.length > 0,
      flowering: !!c.flowering,
      sources: c.listingCount,
      image: false,
      conflicts: c.conflicts,
    },
  };
}

/**
 * Belegart einer Katalogangabe je Feld: „Breeder-Angabe“ nur, wenn ein Angebot aus dem Shop des Breeders
 * genau dieses Feld enthält – sonst stammt der Wert von Händlern („Seedbank-Angabe“).
 */
export function listingEvidence(detail: Pick<LibCultivarDetail, 'cultivar' | 'listings'>, keys: (keyof LibValues)[]): 'breeder' | 'seedbank' {
  const has = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  const own = detail.listings.filter((l) => l.seedBank.toLowerCase().replace(/[^a-z0-9]/g, '') === detail.cultivar.breeder.id);
  return own.some((l) => keys.some((k) => has(l.values?.[k]))) ? 'breeder' : 'seedbank';
}

export const MATCH_LABEL: Record<MatchTier, string> = {
  exact: 'Exakter Name',
  prefix: 'Namensanfang / Alias',
  name: 'Im Namen',
  related: 'Breeder, Abstammung, Terpen oder Seedbank',
  similar: 'Ähnliche Schreibweise',
};
