import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDataset } from '../src/catalog/cisp.js';
import { type CultivarRef, claimsFrom, decideMatch, enrichBatch, enrichFromStrainApiIndex, normalizeFindMySeeds, normalizeStrainApi, normalizeTerpene } from '../src/catalog/enrich.js';
import { importDataset } from '../src/catalog/importer.js';
import { catalogAudit } from '../src/catalog/audit.js';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';

const fx = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', f), 'utf8'));

const ref = (id: string, breeder: string, extra: Partial<CultivarRef> = {}): CultivarRef => ({ id, name: 'Gelato', name_slug: 'gelato', breeder_id: breeder, breeder_name: breeder, aliases: [], version: null, auto: false, ...extra });

describe('Normalisierung externer Quellen', () => {
  it('StrainAPI: Felder werden übernommen, nichts ergänzt', () => {
    const [r] = normalizeStrainApi(fx('strainapi-barf-breath.json'));
    expect(r).toMatchObject({ id: '5752', name: 'Barf Breath', breeders: ['Solfire Gardens'], terpenes: ['Ocimene', 'Caryophyllene', 'Limonene', 'Myrcene'], genetics: 'Don Mega x Giggle Gas' });
    expect(r!.thc).toEqual({ min: 20, max: 25, value: undefined });
  });
  it('Find My Seeds: Sammeleintrag mehrerer Breeder wird als solcher erkannt; Wirkungen/„Conditions“ nicht übernommen', () => {
    const [g] = normalizeFindMySeeds(fx('findmyseeds-gelato.json'));
    expect(g!.breeders.length).toBeGreaterThan(5);
    expect(JSON.stringify(g)).not.toMatch(/Anxiety|Depression/);
    expect(g!.genetics).toBeUndefined(); // „parents“ vermischt Linien
  });
  it('Terpen-Namen: Synonyme ja, Isomer-Raten nein', () => {
    expect(normalizeTerpene('Beta-Caryophyllene').id).toBe('caryophyllene');
    expect(normalizeTerpene('1,8-Cineole').id).toBe('eucalyptol');
    expect(normalizeTerpene('Pinene').id).toBe('pinene-unspecified'); // α oder β unbekannt
    expect(normalizeTerpene('Unbekanntol').id).toBeUndefined();
  });
});

describe('Konservativer Abgleich', () => {
  it('exakt nur bei gleichem Namen UND Breeder', () => {
    const d = decideMatch({ id: '1', name: 'Gelato', breeders: ["Barney's Farm"], terpenes: [], aroma: [] }, [ref('barneysfarm--gelato', 'barneysfarm'), ref('fastbuds--gelato', 'fastbuds')]);
    expect(d).toMatchObject({ status: 'exact', cultivarId: 'barneysfarm--gelato' });
  });
  it('Sammeleinträge und fehlende Breeder werden nie zugeordnet', () => {
    expect(decideMatch({ id: '2', name: 'Gelato', breeders: ['A', 'B'], terpenes: [], aroma: [] }, [ref('a--gelato', 'a')]).status).toBe('ambiguous');
    expect(decideMatch({ id: '3', name: 'Gelato', breeders: [], terpenes: [], aroma: [] }, [ref('a--gelato', 'a')]).status).toBe('ambiguous');
  });
  it('anderer Breeder → keine Zuordnung; ähnlicher Breeder → nur Prüfvorschlag', () => {
    expect(decideMatch({ id: '4', name: 'Gelato', breeders: ['Cookies'], terpenes: [], aroma: [] }, [ref('barneysfarm--gelato', 'barneysfarm')]).status).toBe('none');
    expect(decideMatch({ id: '5', name: 'Gelato', breeders: ['Barneys Farm Seeds'], terpenes: [], aroma: [] }, [ref('barneysfarm--gelato', 'barneysfarm')]).status).toBe('probable');
  });
  it('mehrere Linien desselben Breeders (Auto/Version) bleiben mehrdeutig', () => {
    // Schlichter Name → photoperiodische Linie ohne Version; Version #45 und Auto-Linie bleiben unberührt
    expect(decideMatch({ id: '6', name: 'Gelato', breeders: ['Fast Buds'], terpenes: [], aroma: [] }, [ref('fastbuds--gelato', 'fastbuds'), ref('fastbuds--gelato--auto', 'fastbuds', { auto: true })])).toMatchObject({ status: 'exact', cultivarId: 'fastbuds--gelato' });
    expect(decideMatch({ id: '6b', name: 'Gelato', breeders: ["Barney's Farm"], terpenes: [], aroma: [] }, [ref('barneysfarm--gelato--v-45', 'barneysfarm', { version: '45' })]).status).toBe('ambiguous');
    expect(decideMatch({ id: '6c', name: 'Gelato', breeders: ['Fast Buds'], terpenes: [], aroma: [] }, [ref('fastbuds--gelato--auto', 'fastbuds', { auto: true })]).status).toBe('ambiguous');
  });
  it('keine erfundenen Angaben: leere Felder erzeugen keine Angaben, Ausreißer werden verworfen', () => {
    expect(claimsFrom('strainapi', { id: '7', name: 'X', breeders: ['B'], terpenes: [], aroma: [] })).toEqual([]);
    // Fotos werden nie als Angabe übernommen (Rechte und Zuordnung zur Breeder-Linie unbelegt)
    expect(claimsFrom('strainapi', { id: '9', name: 'X', breeders: ['B'], terpenes: [], aroma: [], image: { url: 'https://example.org/x.jpg', credit: 'x' } })).toEqual([]);
    const c = claimsFrom('strainapi', { id: '8', name: 'X', breeders: ['B'], terpenes: [], aroma: [], thc: { min: 20, max: 8211 } });
    expect(c.find((x) => x.field === 'thc')).toBeUndefined();
  });
});

describe.skipIf(!hasDb)('Anreicherungslauf (Datenbank, Quelle simuliert)', () => {
  let env: TestEnv;
  let owner: pg.Client;
  let calls = 0;
  beforeAll(async () => {
    env = await setup();
    owner = new pg.Client({ connectionString: env.ownerUrl });
    await owner.connect();
    await importDataset(owner as unknown as pg.PoolClient, parseDataset(readFileSync(join(import.meta.dirname, 'fixtures', 'cisp-sample.csv'))));
  });
  afterAll(async () => {
    await owner?.end();
    await env?.close();
  });

  const fakeIndex = (async (url: string) => {
    calls++;
    if (!url.includes('/strains?')) return new Response('{}', { status: 404 });
    // Eine echte Zuordnung (Barney's Farm Gelato), ein Sammeleintrag, ein Fremdname
    const data = [
      { id: 1, name: 'Northern Lights', breeder: 'Amsterdam Marijuana Seeds', url: 'https://www.strainapi.com/northern-lights/', terpenes: ['Limonene', 'Beta-Caryophyllene'], thc: { min: 22, max: 25 }, excerpt: 'Beschreibungstext der Quelle mit ausreichender Länge für die Übernahme als Beschreibung.' },
      { id: 2, name: 'Northern Lights', breeder: null, terpenes: ['Myrcene'] },
      { id: 4, name: 'Gelato', breeder: "Barney's Farm", terpenes: ['Myrcene'] }, // nur Version #45 im Auszug → mehrdeutig
      { id: 3, name: 'Gibt Es Nicht', breeder: 'Niemand', terpenes: ['Myrcene'] },
    ];
    return new Response(JSON.stringify({ data, pagination: { total_pages: 1 } }), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;

  it('Probelauf schreibt keine Abgleiche/Angaben', async () => {
    const r = await enrichFromStrainApiIndex(owner as unknown as pg.Pool, { dryRun: true, fetchImpl: fakeIndex, sleep: async () => {} });
    expect(r.decisions.exact).toBe(1);
    expect((await owner.query('SELECT count(*)::int AS n FROM catalog_claims')).rows[0].n).toBe(0);
    expect((await owner.query('SELECT count(*)::int AS n FROM catalog_matches')).rows[0].n).toBe(0);
  });

  it('nur die exakte Zuordnung liefert Angaben – mit Herkunft und Ablaufdatum; Lauf ist idempotent', async () => {
    const r = await enrichFromStrainApiIndex(owner as unknown as pg.Pool, { fetchImpl: fakeIndex, sleep: async () => {} });
    expect(r.matched).toBe(1);
    const claims = (await owner.query("SELECT cultivar_id, field, provider, source_url, evidence, expires_at FROM catalog_claims ORDER BY field")).rows;
    expect(new Set(claims.map((c) => c.cultivar_id))).toEqual(new Set(['amsterdammarijuanaseeds--northern-lights']));
    expect((await owner.query("SELECT count(*)::int AS n FROM catalog_claims WHERE cultivar_id LIKE '%--v-%'")).rows[0].n).toBe(0);
    expect(claims.every((c) => c.evidence === 'database' && c.provider === 'strainapi' && c.expires_at)).toBe(true);
    expect(claims.map((c) => c.field).sort()).toEqual(['description', 'terpenes', 'thc']);
    // Gleichnamige Sorten anderer Breeder erhalten nichts
    expect((await owner.query("SELECT count(*)::int AS n FROM catalog_claims WHERE cultivar_id <> 'amsterdammarijuanaseeds--northern-lights'")).rows[0].n).toBe(0);
    const before = (await owner.query('SELECT count(*)::int AS n FROM catalog_claims')).rows[0].n;
    await enrichFromStrainApiIndex(owner as unknown as pg.Pool, { fetchImpl: fakeIndex, sleep: async () => {} });
    expect((await owner.query('SELECT count(*)::int AS n FROM catalog_claims')).rows[0].n).toBe(before);
    const amb = (await owner.query("SELECT status FROM catalog_matches WHERE provider_id = '2'")).rows[0];
    expect(amb.status).toBe('ambiguous');
    expect((await owner.query("SELECT count(*)::int AS n FROM catalog_matches WHERE provider_id = '3'")).rows[0].n).toBe(0);
    expect((await owner.query("SELECT status FROM catalog_matches WHERE provider_id = '4'")).rows[0].status).toBe('ambiguous'); // Namen ohne Katalogbezug nicht gespeichert
  });

  it('Sortenseite und Atlas-Index zeigen die Angaben mit Quelle', async () => {
    const c = new Client(env.app);
    await c.register('enrich_user');
    const d = (await c.get('/api/catalog/local/cultivars/amsterdammarijuanaseeds--northern-lights')).json;
    expect(d.claims.find((x: { field: string }) => x.field === 'terpenes')).toMatchObject({ provider: 'strainapi', providerName: 'StrainAPI', evidence: 'database' });
    const idx = (await c.get('/api/catalog/local/terpene-index')).json;
    expect(idx.terpenes.find((t: { id: string }) => t.id === 'limonene').database).toBe(1);
    const list = (await c.get('/api/catalog/local/terpenes/limonene/cultivars')).json;
    expect(list.items.some((i: { id: string; terpeneSource: string }) => i.id === 'amsterdammarijuanaseeds--northern-lights' && i.terpeneSource === 'database')).toBe(true);
  });

  it('Audit zählt Datenbank-Angaben getrennt; Laborwerte bleiben 0', async () => {
    const a = await catalogAudit(owner as unknown as pg.Pool);
    const t = a.fields.find((f) => f.field === 'terpenes')!;
    expect(t.evidence.database).toBe(1);
    expect(a.fields.every((f) => f.evidence.lab === 0)).toBe(true);
  });

  it('Admin-Prüfliste: nur Admins; Freigabe nur für Kandidaten', async () => {
    const u = new Client(env.app);
    await u.register('kein_admin');
    expect((await u.get('/api/admin/catalog/quality')).status).toBe(403);
    expect((await u.post('/api/admin/catalog/enrich', { provider: 'strainapi', limit: 5 })).status).toBe(403);
    const adm = new Client(env.app);
    await adm.register('katalog_admin');
    await owner.query("UPDATE users SET role = 'admin' WHERE login_name = 'katalog_admin'");
    await adm.post('/api/auth/logout');
    await adm.post('/api/auth/login', { login: 'katalog_admin', password: 'sehr-sicheres-passwort-42' });
    const q = await adm.get('/api/admin/catalog/quality');
    expect(q.status).toBe(200);
    expect(q.json.fields.find((f: { field: string }) => f.field === 'terpeneAmounts').present).toBe(0);
    expect((await adm.post('/api/admin/catalog/matches/strainapi/2', { action: 'accept', cultivarId: 'nicht-kandidat' })).status).toBe(400);
    expect((await adm.post('/api/admin/catalog/matches/strainapi/2', { action: 'reject' })).status).toBe(200);
    expect((await owner.query("SELECT status, decided_by FROM catalog_matches WHERE provider_id = '2'")).rows[0]).toEqual({ status: 'rejected', decided_by: 'admin' });
    // Ein späterer automatischer Lauf überschreibt die Admin-Entscheidung nicht
    await enrichFromStrainApiIndex(owner as unknown as pg.Pool, { fetchImpl: fakeIndex, sleep: async () => {} });
    expect((await owner.query("SELECT status FROM catalog_matches WHERE provider_id = '2'")).rows[0].status).toBe('rejected');
  });

  it('Find My Seeds ist für automatisierte Läufe gesperrt', async () => {
    await expect(enrichBatch(owner as unknown as pg.Pool, { provider: 'findmyseeds', limit: 1, fetchImpl: fakeIndex, sleep: async () => {} })).rejects.toThrow(/deaktiviert/);
    expect(calls).toBeGreaterThan(0);
  });

  it('Laufzeitrolle: Kernkatalog bleibt schreibgeschützt', async () => {
    const app = new pg.Client({ connectionString: env.appUrl });
    await app.connect();
    try {
      await expect(app.query("UPDATE catalog_cultivars SET name = 'x' WHERE id = 'amsterdammarijuanaseeds--northern-lights'")).rejects.toThrow(/permission denied/);
    } finally {
      await app.end();
    }
  });
});
