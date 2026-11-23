import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as CL from '../catalog/cannalib';
import { namesIn, parseGenetics } from '../catalog/genetics';
import { decodeEntities, htmlToBlocks } from '../catalog/html';
import { PoliteClient } from '../catalog/http';
import { CatalogService, TTL } from '../catalog/service';
import * as SA from '../catalog/strainapi';
import { TERPENES, matchTerpene, terpeneLabel } from '../catalog/terpenes';
import { CatalogError } from '../catalog/types';
import { deleteDatabase, useDatabaseName } from '../db/database';
import cannalibDetail from './fixtures/cannalib-detail.json';
import cannalibSearch from './fixtures/cannalib-search.json';
import saDetail from './fixtures/strainapi-detail.json';
import saList from './fixtures/strainapi-list.json';
import saSearch from './fixtures/strainapi-search.json';

/* Fixtures sind gekürzte, echte Antworten der Live-APIs (abgerufen am 23.11.2026). */

describe('StrainAPI-Normalisierung (echte Antworten)', () => {
  it('Liste: Pagination, Bilder, Quelle', () => {
    const page = SA.normalizeCollection(saList);
    expect(page.total).toBe(700);
    expect(page.totalPages).toBe(35);
    expect(page.items).toHaveLength(4);
    const first = page.items[0]!;
    expect(first.key).toBe('strainapi:peach-destiny');
    expect(first.image?.url).toMatch(/^https:\/\/www\.strainapi\.com\//);
    expect(first.attribution.name).toBe('StrainAPI');
    expect(first.typeClass).toBe('hybrid');
    expect(first.thc).toBeUndefined(); // alle Werte null → keine Angabe
  });

  it('Detail: Evidenz, Effekte als Liste, HTML nur als Text', () => {
    const s = SA.normalizeStrain(saDetail.data as SA.RawStrain, true)!;
    expect(s.evidence.genetics).toBe('supported');
    expect(s.evidence.indica_sativa_ratio).toBe('insufficient_data');
    expect(s.detail?.effects?.mental.length).toBeGreaterThan(0);
    expect(s.detail?.blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(s.detail?.blocks)).not.toMatch(/<\w+/);
  });

  it('Suche: Bereiche und Typen', () => {
    const page = SA.normalizeCollection(saSearch);
    expect(page.total).toBe(221);
    const churro = page.items.find((i) => i.name === 'Churro Gelato')!;
    expect(churro.thc).toEqual({ value: undefined, min: 22, max: 26, unit: '%' });
    expect(churro.breeder).toBeUndefined();
  });

  it('fehlende Felder, fremde Bild-Hosts und ungültige Werte', () => {
    expect(SA.normalizeStrain({ name: 'X' })).toBeUndefined();
    const s = SA.normalizeStrain({
      name: 'Test',
      slug: 'test',
      image: { url: 'http://evil.example/x.jpg' },
      thc: { min: 40, max: 20 },
      terpenes: 'Limonene, Myrcene',
      aroma: null,
      evidence: { thc: 'proven', cbd: 'reported' },
    })!;
    expect(s.image).toBeUndefined();
    expect(s.thc).toMatchObject({ min: 20, max: 40 });
    expect(s.terpenes).toEqual(['Limonene', 'Myrcene']);
    expect(s.aroma).toEqual([]);
    expect(s.evidence).toEqual({ cbd: 'reported' });
    expect(SA.safeImageUrl('https://www.strainapi.com/a.jpg')).toBeDefined();
    expect(SA.safeImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(() => SA.normalizeCollection({ foo: 1 })).toThrow(CatalogError);
  });

  it('Typ-Klassifizierung', () => {
    expect(SA.classifyType('Indica-dominant hybrid')).toBe('hybrid');
    expect(SA.classifyType('Indica')).toBe('indica');
    expect(SA.classifyType('Sativa')).toBe('sativa');
    expect(SA.classifyType(undefined, 70, 30)).toBe('indica');
    expect(SA.classifyType()).toBe('unknown');
  });

  it('URLs werden begrenzt und geprüft', () => {
    expect(SA.listUrl(0, 500)).toBe(`${SA.STRAINAPI_BASE}/strains?page=1&per_page=100`);
    expect(SA.searchUrl('Blue Dream & co', 2, 24)).toContain('q=Blue%20Dream%20%26%20co');
    expect(() => SA.detailUrl('../etc')).toThrow(CatalogError);
  });
});

describe('CannaLib-Normalisierung (echte Antworten)', () => {
  it('Suche', () => {
    const m = CL.normalizeSearch(cannalibSearch);
    expect(m[0]).toMatchObject({ id: 'strain_gelato', name: 'Gelato', breeder: 'Bog Seeds' });
    expect(m[0]!.thc?.basis).toMatch(/3013 Laborproben/);
  });
  it('Detail: Elternangaben mit Konfidenz, Laborpotenz, DNA-Datensätze', () => {
    const d = CL.normalizeDetail(cannalibDetail);
    expect(d.parents.length).toBeGreaterThan(5);
    expect(d.parents.find((p) => p.name === 'thin mint')?.confidence).toBe(0.6);
    expect(d.labPotency?.thc).toMatchObject({ min: 15.21, max: 29.55, n: 3013 });
    expect(d.dnaDatasets[0]?.url).toMatch(/^https:\/\/www\.ebi\.ac\.uk/);
    expect(d.aliases.every((a) => !a.includes('/'))).toBe(true);
  });
  it('lehnt unerwartete Antworten ab', () => {
    expect(() => CL.normalizeDetail({})).toThrow(CatalogError);
    expect(() => CL.normalizeSearch(null)).toThrow(CatalogError);
  });
});

describe('Genetik-Parser', () => {
  it('einfache Kreuzung', () => {
    const g = parseGenetics('Blue Peaches × White Truffle Cheese')!;
    expect(g.parents).toEqual([
      { kind: 'strain', name: 'Blue Peaches' },
      { kind: 'strain', name: 'White Truffle Cheese' },
    ]);
    expect(g.flags).toEqual([]);
  });
  it('verschachtelt und mit Anführungszeichen', () => {
    const g = parseGenetics('(Blue Face x Figment #5) x Zeclair #9')!;
    expect(g.parents[0]).toEqual({ kind: 'cross', parents: [{ kind: 'strain', name: 'Blue Face' }, { kind: 'strain', name: 'Figment #5' }] });
    expect(parseGenetics('"Riri" Sour Diesel x Lemon Cherry Gelato')!.parents[0]).toEqual({ kind: 'strain', name: '"Riri" Sour Diesel' });
    expect(parseGenetics('"Gelato" x Runtz')!.parents[0]).toEqual({ kind: 'strain', name: 'Gelato' });
  });
  it('alternativ berichtete Abstammung → umstritten', () => {
    const g = parseGenetics('Garlic Juice x Cherry Gelato (also reported as GMO x Lemon Cherry Gelato)')!;
    expect(g.flags).toContain('disputed');
    expect(g.parents.map((p) => (p.kind === 'strain' ? p.name : ''))).toEqual(['Garlic Juice', 'Cherry Gelato']);
    expect(g.alternatives[0]!.map((p) => (p.kind === 'strain' ? p.name : ''))).toEqual(['GMO', 'Lemon Cherry Gelato']);
  });
  it('Phänotyp-Annotation und unbekannt', () => {
    const g = parseGenetics('Papaya (BA Botanicals cut) × JOMO')!;
    expect(g.flags).toContain('phenotype');
    expect(namesIn({ kind: 'cross', parents: g.parents })).toEqual(['Papaya', 'JOMO']);
    expect(parseGenetics('Unknown x Kush')!.flags).toContain('unknown');
  });
  it('nicht auflösbare Angaben werden nicht erfunden', () => {
    const g = parseGenetics('Lemon Cherry Gelato backcross lines')!;
    expect(g.parents).toEqual([]);
    expect(g.flags).toEqual(expect.arrayContaining(['unparsed', 'backcross']));
    expect(parseGenetics('')).toBeUndefined();
    expect(parseGenetics('Gelato')!.parents).toEqual([]);
  });
});

describe('HTML wird nur als Text übernommen', () => {
  it('extrahiert Blöcke und verwirft Skripte', () => {
    const b = htmlToBlocks('<h2>Profil &amp; Genetik</h2><p>Text <strong>fett</strong> &times; <a href="x">Link</a></p><script>alert(1)</script><ul><li>A</li><li><img src=x onerror=alert(1)>B</li></ul>');
    expect(b).toEqual([
      { kind: 'heading', text: 'Profil & Genetik' },
      { kind: 'paragraph', text: 'Text fett × Link' },
      { kind: 'list', items: ['A', 'B'] },
    ]);
    expect(decodeEntities('&#946;-Myrcene &#x3b1;')).toBe('β-Myrcene α');
  });
});

describe('Terpen-Atlas', () => {
  it('ordnet Schreibweisen verschiedener Quellen zu', () => {
    expect(matchTerpene('beta-Myrcene')?.id).toBe('myrcene');
    expect(matchTerpene('beta_myrcene')?.id).toBe('myrcene');
    expect(matchTerpene('Beta-Caryophyllene')?.id).toBe('caryophyllene');
    expect(matchTerpene('delta-Limonene')?.id).toBe('limonene');
    expect(matchTerpene('alpha_pinene')?.id).toBe('pinene');
    expect(matchTerpene('trans_nerolidol')).toBeUndefined();
    expect(terpeneLabel('trans_nerolidol')).toBe('trans-nerolidol');
  });
  it('jeder Eintrag hat Formel, CAS, PubChem-Quelle', () => {
    for (const t of TERPENES) {
      expect(t.formula).toMatch(/^C/);
      expect(t.cas).toMatch(/^\d+-\d{2}-\d$/);
      expect(t.sources.some((s) => s.url.includes(`pubchem.ncbi.nlm.nih.gov/compound/${t.pubchemCid}`))).toBe(true);
    }
  });
});

/* ───────────── HTTP-Client & Service ───────────── */

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('PoliteClient', () => {
  it('429 sperrt den Host bis Retry-After', async () => {
    let t = 1_000_000;
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429, { 'Retry-After': '30' }));
    const c = new PoliteClient({ fetchImpl, now: () => t, minIntervalMs: 0 });
    await expect(c.getJson('https://api.example/x')).rejects.toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 30 });
    await expect(c.getJson('https://api.example/y')).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += 31_000;
    fetchImpl.mockImplementationOnce(async () => jsonResponse({ ok: 1 }));
    await expect(c.getJson('https://api.example/z')).resolves.toMatchObject({ data: { ok: 1 } });
  });

  it('liest Limits aus Headern und sperrt bei Restkontingent 0', async () => {
    const c = new PoliteClient({ minIntervalMs: 0, fetchImpl: async () => jsonResponse({}, 200, { 'X-RateLimit-Limit': '20', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '120' }) });
    await c.getJson('https://cl.example/a');
    expect(c.lastRate).toMatchObject({ limit: 20, remaining: 0, resetSeconds: 120 });
    expect(c.blockedFor('https://cl.example/b')).toBeGreaterThan(100);
  });

  it('Netzwerkfehler, 404, ungültiges JSON, Abbruch', async () => {
    const off = new PoliteClient({ minIntervalMs: 0, fetchImpl: async () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(off.getJson('https://a.example/')).rejects.toMatchObject({ kind: 'offline' });
    const nf = new PoliteClient({ minIntervalMs: 0, fetchImpl: async () => jsonResponse({}, 404) });
    await expect(nf.getJson('https://a.example/')).rejects.toMatchObject({ kind: 'not_found' });
    const bad = new PoliteClient({ minIntervalMs: 0, fetchImpl: async () => new Response('<html>', { status: 200 }) });
    await expect(bad.getJson('https://a.example/')).rejects.toMatchObject({ kind: 'invalid_response' });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(nf.getJson('https://a.example/', { signal: ctrl.signal })).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('begrenzt die Parallelität', async () => {
    let active = 0;
    let peak = 0;
    const c = new PoliteClient({
      maxConcurrent: 2,
      minIntervalMs: 0,
      fetchImpl: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return jsonResponse({});
      },
    });
    await Promise.all(Array.from({ length: 6 }, (_, i) => c.getJson(`https://p.example/${i}`)));
    expect(peak).toBe(2);
  });

  it('sendet keine Cookies und keinen Referrer', async () => {
    const fetchImpl = vi.fn(async (_u: string, _init?: RequestInit) => jsonResponse({}));
    await new PoliteClient({ fetchImpl, minIntervalMs: 0 }).getJson('https://a.example/');
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
  });
});

let n = 0;
describe('CatalogService (Cache & Offline)', () => {
  beforeEach(async () => {
    await deleteDatabase();
    useDatabaseName(`terpgrid-catalog-${++n}`);
  });

  function setup(handler: (url: string) => Response | Promise<Response>) {
    let t = Date.parse('2026-11-23T12:00:00Z');
    const fetchImpl = vi.fn(async (url: string) => handler(url));
    const svc = new CatalogService({ strainapi: new PoliteClient({ fetchImpl, minIntervalMs: 0 }), now: () => t });
    return { svc, fetchImpl, advance: (ms: number) => (t += ms) };
  }

  it('nutzt frischen Cache ohne erneute Anfrage', async () => {
    const { svc, fetchImpl } = setup(() => jsonResponse(saList, 200, { 'X-WP-Total': '700', 'X-WP-TotalPages': '35' }));
    const a = await svc.list(1, 4);
    const b = await svc.list(1, 4);
    expect(a.items.map((i) => i.key)).toEqual(b.items.map((i) => i.key));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('offline: veralteter Cache als gekennzeichneter Fallback', async () => {
    let offline = false;
    const { svc, advance } = setup(() => (offline ? Promise.reject(new TypeError('offline')) : jsonResponse(saSearch)));
    await svc.search('gelato');
    advance(TTL.list + 1000);
    offline = true;
    const res = await svc.search('gelato');
    expect(res.fromCache).toBe(true);
    expect(res.items.length).toBe(20);
    advance(TTL.stale);
    await expect(svc.search('gelato')).rejects.toMatchObject({ kind: 'offline' });
  });

  it('deaktivierte Online-Daten: nur Cache, sonst klarer Fehler', async () => {
    const { svc, fetchImpl } = setup(() => jsonResponse(saDetail));
    await svc.detail('peach-destiny');
    svc.setOnline(() => false);
    const d = await svc.detail('peach-destiny');
    expect(d.strain.name).toBe('Peach Destiny');
    await expect(svc.detail('anders')).rejects.toMatchObject({ kind: 'offline' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('loadAll lädt alle Seiten und entfernt Doppelte', async () => {
    const { svc, fetchImpl } = setup((url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      const items = saList.data.slice((page - 1) * 2, page * 2);
      return jsonResponse({ data: [...items, saList.data[0]], pagination: { page, per_page: 100, total: 4, total_pages: 2 } });
    });
    const progress: number[] = [];
    const all = await svc.loadAll((l) => progress.push(l));
    expect(all.items.map((i) => i.id)).toHaveLength(4);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(progress.length).toBe(2);
  });

  it('exakte Namenssuche führt gleichnamige Sorten nicht zusammen', async () => {
    const twin = { ...saSearch.data[0], slug: 'churro-gelato-2', breeder: 'Anderer Breeder' };
    const { svc } = setup(() => jsonResponse({ data: [saSearch.data[0], twin, saSearch.data[1]], pagination: { page: 1, per_page: 20, total: 3, total_pages: 1 } }));
    const hits = await svc.findExact('churro gelato');
    expect(hits.map((h) => h.id)).toEqual(['churro-gelato', 'churro-gelato-2']);
  });

  it('räumt abgelaufene Cache-Einträge auf', async () => {
    const { svc, advance } = setup(() => jsonResponse(saList));
    await svc.list(1, 4);
    advance(TTL.stale + 1);
    expect(await svc.pruneCache()).toBe(1);
    expect((await svc.cacheInfo()).entries).toBe(0);
  });
});

import { buildLineage, layoutLineage } from '../catalog/lineage';
import type { CatalogStrain } from '../catalog/types';

describe('Abstammungsgraph', () => {
  const mk = (name: string, genetics?: string, breeder?: string): CatalogStrain => ({
    provider: 'strainapi',
    id: name.toLowerCase().replace(/\W+/g, '-') + (breeder ? `-${breeder.toLowerCase()}` : ''),
    key: `strainapi:${name.toLowerCase().replace(/\W+/g, '-')}${breeder ? `-${breeder.toLowerCase()}` : ''}`,
    name,
    breeder,
    genetics,
    aliases: [],
    typeClass: 'hybrid',
    terpenes: [],
    aroma: [],
    flavor: [],
    evidence: {},
    attribution: { provider: 'strainapi', name: 'StrainAPI', url: 'https://www.strainapi.com/' },
  });
  const db: Record<string, CatalogStrain[]> = {
    'cherry gelato': [mk('Cherry Gelato', 'Black Cherry Funk x Acai Berry Gelato')],
    'garlic juice': [],
    gmo: [mk('GMO', 'Chemdawg x GSC', 'A'), mk('GMO', undefined, 'B')],
    'black cherry funk': [mk('Black Cherry Funk')],
  };
  const resolve = async (n: string) => db[n.toLowerCase()] ?? [];

  it('nur belegte Beziehungen, mehrdeutig statt zusammengeführt, alternative Angaben markiert', async () => {
    const root = mk('Garlic Cherry Gelato', 'Garlic Juice x Cherry Gelato (also reported as GMO x Lemon Cherry Gelato)');
    const g = await buildLineage(root, resolve, { maxDepth: 2 });
    const byLabel = (l: string) => g.nodes.find((n) => n.label === l)!;
    expect(byLabel('Cherry Gelato').kind).toBe('strain');
    expect(byLabel('Garlic Juice').kind).toBe('unresolved');
    expect(byLabel('GMO').kind).toBe('ambiguous');
    expect(byLabel('GMO').candidates).toHaveLength(2);
    expect(g.edges.find((e) => e.from === byLabel('GMO').id)?.kind).toBe('alternative');
    // Zweite Generation über eindeutige Auflösung
    expect(byLabel('Black Cherry Funk').depth).toBe(2);
    expect(g.edges.every((e) => g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to))).toBe(true);
  });

  it('respektiert das Anfragebudget und kennzeichnet Kürzungen', async () => {
    const root = mk('X', 'Cherry Gelato x Garlic Juice');
    const g = await buildLineage(root, resolve, { maxRequests: 1 });
    expect(g.requests).toBe(1);
    expect(g.truncated).toBe(true);
    expect(g.nodes.find((n) => n.label === 'Garlic Juice')?.flags).toContain('not-looked-up');
  });

  it('ohne belegte Genetik bleibt nur die Wurzel', async () => {
    const g = await buildLineage(mk('Solo'), resolve);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it('CannaLib-Angaben als eigene Kantenart mit Konfidenz', async () => {
    const g = await buildLineage(mk('Gelato'), resolve, { research: [{ name: 'sunset sherbet', confidence: 1, sources: [] }, { name: 'thin mint', confidence: 0.6, sources: [] }] });
    expect(g.edges.filter((e) => e.kind === 'research').map((e) => e.label)).toEqual(['100 %', '60 %']);
  });

  it('Layout: Generationen als Spalten, keine Überlappung in einer Spalte', async () => {
    const g = await buildLineage(mk('Garlic Cherry Gelato', 'Garlic Juice x Cherry Gelato'), resolve);
    const { pos } = layoutLineage(g);
    const cols = new Map<number, number[]>();
    for (const p of pos.values()) cols.set(p.x, [...(cols.get(p.x) ?? []), p.y]);
    for (const ys of cols.values()) expect(new Set(ys).size).toBe(ys.length);
    expect(pos.get(g.nodes[0]!.id)!.x).toBe(0);
  });
});
