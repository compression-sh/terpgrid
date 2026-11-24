import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDataset } from '../src/catalog/cisp.js';
import { type CultivarRef, claimsFrom, decideMatch, enrichBatch, enrichFromStrainApiIndex, normalizeFindMySeeds, normalizeStrainApi, normalizeTerpene, refreshStrainApi } from '../src/catalog/enrich.js';
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
  it('falsche Zuordnungen werden verhindert: Namensähnlichkeit, Kooperationen, fremde Breeder', () => {
    // Nur Namensbestandteil gleich → kein Kandidat (Abgleich nur über den exakten Namen)
    expect(decideMatch({ id: '10', name: 'Gelato Cake', breeders: ["Barney's Farm"], terpenes: [], aroma: [] }, []).status).toBe('none');
    // Kooperationsangabe der Quelle („A x B“) ist kein einzelner Breeder → nie exakt
    expect(decideMatch({ id: '11', name: 'Gelato', breeders: ["Barney's Farm x Cookies"], terpenes: [], aroma: [] }, [ref('barneysfarm--gelato', 'barneysfarm')]).status).not.toBe('exact');
    // Mehrere gleichnamige Linien, Quelle nennt einen dritten Breeder → keine Zuordnung
    expect(decideMatch({ id: '12', name: 'Gelato', breeders: ['Seedsman'], terpenes: [], aroma: [] }, [ref('barneysfarm--gelato', 'barneysfarm'), ref('fastbuds--gelato', 'fastbuds')]).status).toBe('none');
    // Groß-/Kleinschreibung und Satzzeichen des Breeders zählen nicht als Unterschied
    expect(decideMatch({ id: '13', name: 'gelato', breeders: ['BARNEYS FARM'], terpenes: [], aroma: [] }, [ref('barneysfarm--gelato', 'barneysfarm')])).toMatchObject({ status: 'exact', cultivarId: 'barneysfarm--gelato' });
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
  describe('Aktualisierung abgelaufener Angaben (30 Tage)', () => {
    const NL = 'amsterdammarijuanaseeds--northern-lights';
    const count = async (sql: string) => (await owner.query(sql)).rows[0].n as number;
    let fetches = 0;
    const counting = (impl: typeof fetch) => (async (u: string, i?: RequestInit) => (fetches++, impl(u as never, i))) as unknown as typeof fetch;

    it('Angaben laufen nach 30 Tagen ab und werden ab Ablauf nicht mehr angezeigt', async () => {
      const days = (await owner.query(`SELECT round(extract(epoch FROM expires_at - retrieved_at) / 86400)::int AS d FROM catalog_claims WHERE cultivar_id = '${NL}' LIMIT 1`)).rows[0].d;
      expect(days).toBe(30);
      const c = new Client(env.app);
      await c.register('ttl_user');
      await owner.query(`UPDATE catalog_claims SET expires_at = now() - interval '1 minute' WHERE cultivar_id = '${NL}' AND field = 'thc'`);
      const d = (await c.get(`/api/catalog/local/cultivars/${NL}`)).json;
      expect(d.claims.some((x: { field: string }) => x.field === 'thc')).toBe(false);
      expect(d.claims.some((x: { field: string }) => x.field === 'terpenes')).toBe(true);
      await owner.query(`UPDATE catalog_claims SET expires_at = retrieved_at + interval '30 days' WHERE cultivar_id = '${NL}'`);
    });

    it('nichts fällig → kein Abruf', async () => {
      fetches = 0;
      const r = await refreshStrainApi(owner as unknown as pg.Pool, { fetchImpl: counting(fakeIndex), sleep: async () => {} });
      expect(r.action).toBe('nothing-due');
      expect(fetches).toBe(0);
    });

    it('fällig, aber letzter Abruf zu kurz her → kein Abruf (Ratenschutz)', async () => {
      await owner.query(`UPDATE catalog_claims SET expires_at = now() + interval '2 days' WHERE cultivar_id = '${NL}'`);
      fetches = 0;
      const r = await refreshStrainApi(owner as unknown as pg.Pool, { fetchImpl: counting(fakeIndex), sleep: async () => {} });
      expect(r.action).toBe('too-soon');
      expect(r.expiring).toBeGreaterThan(0);
      expect(fetches).toBe(0);
    });

    it('fehlgeschlagener Abruf lässt gültige Angaben stehen; nur Abgelaufenes wird entfernt', async () => {
      await owner.query("UPDATE catalog_enrichment_runs SET started_at = now() - interval '3 days'");
      const failing = (async () => new Response('Fehler', { status: 503 })) as unknown as typeof fetch;
      const before = await count(`SELECT count(*)::int AS n FROM catalog_claims WHERE cultivar_id = '${NL}'`);
      await owner.query(`UPDATE catalog_claims SET expires_at = now() - interval '1 hour' WHERE cultivar_id = '${NL}' AND field = 'description'`);
      const r = await refreshStrainApi(owner as unknown as pg.Pool, { fetchImpl: failing, sleep: async () => {} });
      expect(r.action).toBe('run');
      expect(r.run!.errors.length).toBeGreaterThan(0);
      expect(r.purged).toBe(1);
      expect(await count(`SELECT count(*)::int AS n FROM catalog_claims WHERE cultivar_id = '${NL}'`)).toBe(before - 1);
      // fehlgeschlagener Lauf zählt für die Drosselung mit – kein erneuter Versuch im selben Zeitfenster
      expect((await refreshStrainApi(owner as unknown as pg.Pool, { fetchImpl: failing, sleep: async () => {} })).action).toBe('too-soon');
    });

    it('erfolgreicher Abruf verlängert die Gültigkeit, entfernt nicht mehr gelieferte Felder und lässt Nutzerdaten unberührt', async () => {
      const u = new Client(env.app);
      await u.register('refresh_owner');
      await u.post('/api/sync/push', { changes: [{ store: 'strains', id: 's1', baseVersion: 0, data: { id: 's1', name: 'Northern Lights', catalogRef: `cisp:${NL}` } }] });
      const userRows = await count('SELECT count(*)::int AS n FROM records');
      const userHash = (await owner.query("SELECT md5(string_agg(id || ':' || version::text, ',' ORDER BY id)) AS h FROM records")).rows[0].h;
      const adminDecision = (await owner.query("SELECT status, decided_by FROM catalog_matches WHERE provider_id = '2'")).rows[0];
      await owner.query("UPDATE catalog_enrichment_runs SET started_at = now() - interval '3 days'");
      // Quelle liefert jetzt keine THC-Angabe und keine Beschreibung mehr
      const changed = (async (url: string) => {
        const res = await fakeIndex(url as never);
        const body = await res.json();
        body.data[0] = { ...body.data[0], thc: undefined, excerpt: undefined };
        return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;
      const r = await refreshStrainApi(owner as unknown as pg.Pool, { fetchImpl: changed, sleep: async () => {} });
      expect(r.action).toBe('run');
      expect(r.run!.errors).toEqual([]);
      const fields = (await owner.query(`SELECT field, expires_at > now() + interval '29 days' AS fresh FROM catalog_claims WHERE cultivar_id = '${NL}' ORDER BY field`)).rows;
      expect(fields).toEqual([{ field: 'terpenes', fresh: true }]);
      // Nutzerdaten (verschlüsselte Datensätze, Verknüpfung zur Katalogsorte) und Admin-Entscheidungen unverändert
      expect(await count('SELECT count(*)::int AS n FROM records')).toBe(userRows);
      expect((await owner.query("SELECT md5(string_agg(id || ':' || version::text, ',' ORDER BY id)) AS h FROM records")).rows[0].h).toBe(userHash);
      expect((await owner.query("SELECT status, decided_by FROM catalog_matches WHERE provider_id = '2'")).rows[0]).toEqual(adminDecision);
      expect((await owner.query("SELECT started_by FROM catalog_enrichment_runs ORDER BY id DESC LIMIT 1")).rows[0].started_by).toBe('refresh');
    });
  });
});
