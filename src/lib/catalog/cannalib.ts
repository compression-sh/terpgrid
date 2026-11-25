/**
 * CannaLib-Adapter (https://cannalib.org/api/) – optionale Forschungs- und
 * Abstammungsdaten. Anonym stark limitiert (laut Antwort-Headern 20/h, 60/Tag),
 * daher nur auf ausdrückliche Anfrage und nur der Sortenname wird gesendet.
 * Bilder aus CannaLib werden NICHT angezeigt (Rechte laut Quelle ungeprüft).
 */
import { stripTags } from './html';
import type { LineageParent, ResearchMatch, ResearchProfile, ValueRange } from './types';
import { CatalogError } from './types';

import { cannalibBase } from './endpoint';

export const CANNALIB_ATTRIBUTION = { provider: 'cannalib' as const, name: 'CannaLib', url: 'https://cannalib.org/' };

const finite = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? stripTags(v) : undefined);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function range(r: unknown, basis?: unknown, n?: unknown): (ValueRange & { n?: number }) | undefined {
  if (!Array.isArray(r) || r.length < 2) return undefined;
  const min = finite(r[0]);
  const max = finite(r[1]);
  if (min === undefined || max === undefined) return undefined;
  const b = isObj(basis) ? basis : undefined;
  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    unit: '%',
    basis: b && typeof b.basis === 'string' ? describeBasis(b.basis, finite(b.lab_samples)) : undefined,
    n: finite(n) ?? (b ? finite(b.lab_samples) : undefined),
  };
}

export function describeBasis(basis: string, samples?: number): string {
  if (basis === 'p10_p90_of_flower_lab_samples') return `10.–90. Perzentil aus ${samples ?? '?'} Laborproben (Blüte)`;
  return basis.replace(/_/g, ' ');
}

export function searchUrl(q: string): string {
  return `${cannalibBase()}/v1/catalogs/strains?q=${encodeURIComponent(q.trim().slice(0, 80))}`;
}
export function detailUrl(id: string): string {
  if (!/^[a-z0-9_-]{1,160}$/i.test(id)) throw new CatalogError('Ungültige CannaLib-Kennung.', 'bad_request');
  return `${cannalibBase()}/v1/catalogs/strains/${encodeURIComponent(id)}`;
}

export function normalizeSearch(raw: unknown): ResearchMatch[] {
  if (!isObj(raw) || !Array.isArray(raw.items)) throw new CatalogError('Unerwartete Antwort von CannaLib.', 'invalid_response');
  return raw.items
    .filter(isObj)
    .map((it) => ({
      id: String(it.id ?? ''),
      name: str(it.name) ?? '',
      breeder: str(it.breeder),
      type: str(it.type),
      thc: range(it.thc_range, it.thc_basis),
      topTerpenes: Array.isArray(it.top_terpenes) ? it.top_terpenes.filter((t): t is string => typeof t === 'string') : [],
    }))
    .filter((m) => m.id && m.name);
}

export function normalizeDetail(raw: unknown, fetchedAt = new Date().toISOString()): ResearchProfile {
  if (!isObj(raw) || typeof raw.id !== 'string' || !isObj(raw.evidence)) throw new CatalogError('Unerwartete Antwort von CannaLib.', 'invalid_response');
  const ev = raw.evidence;
  const lineage = isObj(ev.lineage) ? ev.lineage : {};
  const parents: LineageParent[] = Array.isArray(lineage.parents)
    ? lineage.parents
        .filter(isObj)
        .map((p) => ({
          name: str(p.id) ?? '',
          confidence: finite(p.confidence),
          sources: (Array.isArray(p.sources) ? p.sources : [p.source]).filter((s): s is string => typeof s === 'string'),
        }))
        .filter((p) => p.name)
    : [];
  const chem = isObj(ev.chemistry) ? ev.chemistry : {};
  const lp = isObj(chem.lab_potency) ? chem.lab_potency : undefined;
  const mk = (lo: unknown, hi: unknown, n: unknown, median: unknown, basis: unknown) => {
    const min = finite(lo);
    const max = finite(hi);
    if (min === undefined || max === undefined) return undefined;
    return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, unit: '%' as const, n: finite(n), median: finite(median), basis: typeof basis === 'string' ? describeBasis(basis, finite(n)) : undefined };
  };
  const gen = isObj(ev.genetics) ? ev.genetics : {};
  const datasets = Array.isArray(gen.datasets)
    ? gen.datasets.filter(isObj).map((d) => ({ name: str(d.dataset_name) ?? str(d.dataset) ?? 'Datensatz', url: typeof d.url === 'string' && d.url.startsWith('https://') ? d.url : '', samples: finite(d.n_samples) }))
    : [];
  return {
    provider: 'cannalib',
    id: raw.id,
    name: str(raw.name) ?? raw.id,
    parents,
    childrenCount: finite(lineage.children_n),
    aliases: Array.isArray(ev.aliases)
      ? [...new Set(ev.aliases.filter(isObj).map((a) => str(a.alias)).filter((a): a is string => !!a && !a.includes('/') && a.length < 40))].slice(0, 20)
      : [],
    labPotency: lp ? { thc: mk(lp.thc_lo, lp.thc_hi, lp.thc_n, lp.thc_median, lp.thc_basis), cbd: mk(lp.cbd_lo, lp.cbd_hi, lp.cbd_n, lp.cbd_median, lp.cbd_basis) } : undefined,
    topTerpenes: Array.isArray(chem.top_terpenes) ? chem.top_terpenes.filter((t): t is string => typeof t === 'string') : [],
    dnaDatasets: datasets.filter((d) => d.url),
    attribution: { ...CANNALIB_ATTRIBUTION, recordUrl: 'https://cannalib.org/' },
    fetchedAt,
  };
}
