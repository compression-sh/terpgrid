/**
 * Gemeinsames Datenmodell für externe Sortenkataloge.
 * Provider-Adapter (StrainAPI, CannaLib) normalisieren ihre Antworten hierauf.
 * Fehlende Werte bleiben `undefined` bzw. leere Listen – es wird nichts ergänzt.
 */

export type ProviderId = 'strainapi' | 'cannalib' | 'cisp';

/** Evidenzstatus laut Quelle (StrainAPI V1). */
export type EvidenceState = 'supported' | 'reported' | 'disputed' | 'insufficient_data';

export type TypeClass = 'indica' | 'sativa' | 'hybrid' | 'unknown';

export interface ValueRange {
  min?: number;
  max?: number;
  value?: number;
  unit: '%';
  /** z. B. "p10–p90 aus 3013 Laborproben" (CannaLib) */
  basis?: string;
}

export interface CatalogImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  /** Quelle/Urheberhinweis wie vom Anbieter geliefert */
  credit: string;
  creditUrl: string;
}

export interface Attribution {
  provider: ProviderId;
  name: string;
  url: string;
  /** Link zur öffentlichen Seite des Datensatzes */
  recordUrl?: string;
}

export interface CatalogStrain {
  provider: ProviderId;
  /** Provider-spezifische ID (StrainAPI: slug) */
  id: string;
  /** Eindeutiger Schlüssel "provider:id" */
  key: string;
  name: string;
  aliases: string[];
  breeder?: string;
  genetics?: string;
  type?: string;
  typeClass: TypeClass;
  indicaPercent?: number;
  sativaPercent?: number;
  seedType?: string;
  thc?: ValueRange;
  cbd?: ValueRange;
  terpenes: string[];
  aroma: string[];
  flavor: string[];
  excerpt?: string;
  image?: CatalogImage;
  flowering?: { minDays?: number; maxDays?: number };
  evidence: Partial<Record<string, EvidenceState>>;
  updatedAt?: string;
  attribution: Attribution;
  /** Nur bei Detaildaten vorhanden */
  detail?: CatalogStrainDetail;
}

export interface ContentBlock {
  kind: 'heading' | 'paragraph' | 'list';
  text?: string;
  items?: string[];
}

export interface CatalogStrainDetail {
  displayTitle?: string;
  description?: string;
  /** Sicher aus HTML extrahierte Textblöcke (kein HTML-Rendering) */
  blocks: ContentBlock[];
  effects?: { mental: string[]; body: string[] };
  outdoorHarvest?: string;
  plantStructure?: string;
  yield?: string;
  publishedAt?: string;
}

export interface CatalogPage {
  items: CatalogStrain[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  /** true, wenn aus dem lokalen Cache (z. B. offline) */
  fromCache: boolean;
  fetchedAt: string;
}

/* ───────────── CannaLib (Forschungs-/Abstammungsdaten) ───────────── */

export interface LineageParent {
  name: string;
  confidence?: number;
  sources: string[];
}

export interface ResearchProfile {
  provider: 'cannalib';
  id: string;
  name: string;
  breeder?: string;
  type?: string;
  parents: LineageParent[];
  childrenCount?: number;
  aliases: string[];
  labPotency?: { thc?: ValueRange & { n?: number; median?: number }; cbd?: ValueRange & { n?: number; median?: number } };
  topTerpenes: string[];
  dnaDatasets: { name: string; url: string; samples?: number }[];
  attribution: Attribution;
  fetchedAt: string;
}

export interface ResearchMatch {
  id: string;
  name: string;
  breeder?: string;
  type?: string;
  thc?: ValueRange & { n?: number };
  topTerpenes: string[];
}

export interface RateInfo {
  limit?: number;
  remaining?: number;
  dailyRemaining?: number;
  resetSeconds?: number;
}

export class CatalogError extends Error {
  constructor(
    message: string,
    public readonly kind: 'offline' | 'rate_limited' | 'not_found' | 'bad_request' | 'server' | 'aborted' | 'invalid_response',
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}
