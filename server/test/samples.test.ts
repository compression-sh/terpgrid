import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDataset } from '../src/catalog/cisp.js';
import { importDataset } from '../src/catalog/importer.js';
import { SMITH_ATLAS, SMITH_TERPENES, importSamples, parseSmith2022 } from '../src/catalog/samples.js';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';

const FIXTURE = readFileSync(join(import.meta.dirname, 'fixtures', 'cisp-sample.csv'));
const HEAD =
  'u_id,lab_id,strain_slug,anon_producer,region,product_category,strain_category,strain_popularity,chemotype,has_cannabs,chemotype_ratio,tot_thc,tot_cbd,tot_cbg,tot_cbc,tot_cbn,tot_thcv,has_terps,total_terps,terp_var,top_terp_f,tot_ocimene,camphene,g_terpinene,tot_nerolidol_ct,humulene,caryophyllene,limonene,linalool,myrcene,bisabolol,b_pinene,a_terpinene,terpinolene,a_pinene';
// Terpen-Spalten in Kopfzeilen-Reihenfolge: tot_ocimene … a_pinene (14 Werte)
const row = (id: string, slug: string, region: string, thc: string, terps: string | null) =>
  `${id},lab2,${slug},1,${region},FLOWER,None,,THC-Dom,True,1,${thc},0.05,0.5,0,0,0,${terps ? 'True' : 'False'},${terps ? '1.5' : ''},0.01,myrcene,${terps ?? ',,,,,,,,,,,,,'}`;
const CSV = [
  HEAD,
  row('1', 'northern-lights', 'WA', '18.5', '0.02,0.01,0,0.01,0.1,0.3,0.2,0.05,0.6,0,0.05,0,0,0.1'),
  row('2', 'northern-lights', 'OR', '21.0', '0.04,0,0,0.02,0.2,0.5,0.1,0.07,0.2,0.01,0.06,0,0,0.2'),
  // Probe ohne Myrcen-Messung (leer) – darf nicht als 0 zählen
  row('3', 'northern-lights', 'WA', '16.0', '0,0,0,0,0.1,0.4,0.3,0.1,,0,0.02,0,0,0.05'),
  row('4', 'gelato-33', 'CA', '24.0', '0.1,0,0,0,0.1,0.2,0.4,0.1,0.3,0,0.05,0,0,0.1'),
  row('5', 'gelato', 'CA', '22.0', null),
  row('6', 'northern-lights--5', 'MI', '19.0', null),
  row('7', '', 'AK', '17.0', null),
  row('x8', 'gelato', 'CA', '22.0', null),
  row('9', 'gelato', 'CA', '150', null),
  row('1', 'gelato', 'CA', '22.0', null),
].join('\n');

describe('Laborproben (Smith et al. 2022): Einlesen', () => {
  it('prüft Zeilen, normalisiert Namen und behandelt fehlende Werte nicht als 0', () => {
    const d = parseSmith2022(Buffer.from(CSV));
    expect(d.rows).toBe(10);
    expect(d.samples.map((s) => s.ref)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(d.rejected).toEqual({ 'ungültige Proben-ID': 1, 'Cannabinoidwert außerhalb 0–100 %': 1, 'doppelte Proben-ID': 1 });
    expect(d.samples.find((s) => s.ref === '6')!.nameKey).toBe('northern-lights-5');
    expect(d.samples.find((s) => s.ref === '7')!.nameKey).toBeNull();
    const s3 = d.samples.find((s) => s.ref === '3')!;
    expect(s3.terpenes).not.toHaveProperty('myrcene');
    expect(s3.terpenes!.limonene).toBe(0.3);
    expect(d.samples.find((s) => s.ref === '5')!.terpenes).toBeNull();
    expect(d.samples[0]!.cannabinoids).toMatchObject({ thc_total: 18.5, cbd_total: 0.05 });
    expect(d.checksumMatches).toBe(false);
  });

  it('jede Atlas-Zuordnung zeigt auf eine vorhandene Spalte; Isomer-Summen sind gekennzeichnet', () => {
    for (const [id, m] of Object.entries(SMITH_ATLAS)) expect(SMITH_TERPENES, id).toContain(m.column);
    expect(SMITH_ATLAS['beta-ocimene']!.isomerSum).toBeTruthy();
    expect(SMITH_ATLAS['trans-nerolidol']!.isomerSum).toBeTruthy();
    expect(SMITH_ATLAS.myrcene!.isomerSum).toBeUndefined();
  });
});

describe.skipIf(!hasDb)('Laborproben im Katalog', () => {
  let env: TestEnv;
  let c: Client;
  let owner: pg.Client;
  const data = () => parseSmith2022(Buffer.from(CSV));

  beforeAll(async () => {
    env = await setup();
    c = new Client(env.app);
    await c.register('proben_user');
    owner = new pg.Client({ connectionString: env.ownerUrl });
    await owner.connect();
    await importDataset(owner as unknown as pg.PoolClient, parseDataset(FIXTURE));
  });
  afterAll(async () => {
    await owner?.end();
    await env?.close();
  });

  it('Import ist idempotent; erneuter Import ersetzt vollständig', async () => {
    const r1 = await importSamples(owner as unknown as pg.PoolClient, data());
    expect(r1).toMatchObject({ status: 'imported', samples: 7 });
    expect((await importSamples(owner as unknown as pg.PoolClient, data())).status).toBe('unchanged');
    const r3 = await importSamples(owner as unknown as pg.PoolClient, data(), { force: true });
    expect(r3.status).toBe('imported');
    const q = await owner.query(`SELECT (SELECT count(*)::int FROM catalog_samples) n, (SELECT count(*)::int FROM catalog_sample_imports WHERE status = 'active') a, (SELECT count(*)::int FROM catalog_sample_imports WHERE status = 'replaced') r`);
    expect(q.rows[0]).toEqual({ n: 7, a: 1, r: 1 });
  });

  it('Laufzeitrolle kann Proben nur lesen', async () => {
    const app = new pg.Client({ connectionString: env.appUrl });
    await app.connect();
    try {
      await expect(app.query(`DELETE FROM catalog_samples`)).rejects.toThrow(/permission denied/);
      await expect(app.query(`INSERT INTO catalog_sample_stats (source, name_key, samples, terpene_samples, stats) VALUES ('x', 'y', 1, 0, '{}')`)).rejects.toThrow(/permission denied/);
      expect((await app.query('SELECT count(*)::int n FROM catalog_samples')).rows[0].n).toBe(7);
    } finally {
      await app.end();
    }
  });

  it('Sortenseite: nur gleichnamige photoperiodische Sorten, mit Anzahl gleichnamiger Breeder', async () => {
    const nl = (await c.get('/api/catalog/local/search?q=northern%20lights&perPage=20')).json.items as { id: string; auto: boolean; version?: string }[];
    const photo = nl.find((x) => !x.auto && !x.version)!;
    const d = (await c.get(`/api/catalog/local/cultivars/${photo.id}`)).json;
    expect(d.samples).toMatchObject({ nameKey: 'northern-lights', samples: 3, terpeneSamples: 3, sameNameBreeders: 2, unit: '%', source: { license: 'CC0 1.0', doi: '10.1371/journal.pone.0267498' } });
    // Myrcen nur in 2 von 3 Proben gemessen
    expect(d.samples.stats.myrcene).toMatchObject({ n: 2, detected: 2 });
    expect(d.samples.stats.thc_total).toMatchObject({ n: 3, min: 16, max: 21 });
    expect(d.samples.regions).toEqual({ WA: 2, OR: 1 });
    const auto = nl.find((x) => x.auto)!;
    expect((await c.get(`/api/catalog/local/cultivars/${auto.id}`)).json.samples).toBeUndefined();
  });

  it('Name mit Version wird exakt abgeglichen; „Gelato“-Proben gehen nicht an Autoflower oder „Gelato #33“', async () => {
    const items = ((await c.get('/api/catalog/local/search?q=gelato&perPage=40')).json.items as { id: string; name: string; auto: boolean; version?: string }[]).filter((x) => x.name === 'Gelato');
    expect(items.length).toBeGreaterThan(5);
    let withSamples = 0;
    for (const it of items) {
      const s = (await c.get(`/api/catalog/local/cultivars/${it.id}`)).json.samples;
      if (it.auto) expect(s, it.id).toBeUndefined();
      else if (it.version === '#33' || it.version === '33') {
        expect(s?.samples, it.id).toBe(1);
        withSamples++;
      } else expect(s, it.id).toBeUndefined();
    }
    expect(withSamples).toBe(2);
  });

  it('Filter „mit Laborproben“ und Terpen-Atlas mit Isomer-Hinweis', async () => {
    const f = (await c.get('/api/catalog/local/search?samples=1&perPage=50')).json.items as { name: string; auto: boolean }[];
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => !x.auto)).toBe(true);
    expect(f.some((x) => x.name === 'Northern Lights')).toBe(true);
    const t = (await c.get('/api/catalog/local/terpenes/beta-ocimene/cultivars')).json;
    expect(t.measured).toMatchObject({ column: 'tot_ocimene', samples: 4, isomerSum: 'Summe aller Ocimen-Isomere' });
    const m = (await c.get('/api/catalog/local/terpenes/myrcene/cultivars')).json;
    expect(m.measured).toMatchObject({ samples: 3, detected: 3 });
    expect((await c.get('/api/catalog/local/terpenes/eucalyptol/cultivars')).json.measured).toBeUndefined();
  });

  it('erfordert Anmeldung', async () => {
    expect((await new Client(env.app).get('/api/catalog/local/terpenes/myrcene/cultivars')).status).toBe(401);
  });
});

describe('Deploy-Skript', () => {
  it('import-samples.sh nutzt denselben Commit und dieselbe Prüfsumme wie der Code', async () => {
    const { SMITH2022 } = await import('../src/catalog/samples.js');
    const sh = readFileSync(join(import.meta.dirname, '..', '..', 'deploy', 'import-samples.sh'), 'utf8');
    expect(sh).toContain(`COMMIT="${SMITH2022.commit}"`);
    expect(sh).toContain(`SHA256="${SMITH2022.sha256}"`);
    expect(sh).toContain(SMITH2022.path);
  });
});
