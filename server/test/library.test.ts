import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDataset } from '../src/catalog/cisp.js';
import { importDataset } from '../src/catalog/importer.js';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';

const FIXTURE = readFileSync(join(import.meta.dirname, 'fixtures', 'cisp-sample.csv'));

describe.skipIf(!hasDb)('Lokaler Katalog (CI-Strains-Pro)', () => {
  let env: TestEnv;
  let c: Client;
  let owner: pg.Client;

  beforeAll(async () => {
    env = await setup();
    c = new Client(env.app);
    await c.register('katalog_user');
    owner = new pg.Client({ connectionString: env.ownerUrl });
    await owner.connect();
  });
  afterAll(async () => {
    await owner?.end();
    await env?.close();
  });

  it('meldet „nicht verfügbar“ vor dem Import', async () => {
    const r = await c.get('/api/catalog/local/status');
    expect(r.json).toMatchObject({ available: false, attribution: { license: 'CC BY 4.0' } });
  });

  it('Probelauf schreibt nichts, Import ist idempotent', async () => {
    const data = parseDataset(FIXTURE);
    expect((await importDataset(owner as unknown as pg.PoolClient, data, { dryRun: true })).status).toBe('dry-run');
    expect((await owner.query('SELECT count(*)::int AS n FROM catalog_cultivars')).rows[0].n).toBe(0);
    const r1 = await importDataset(owner as unknown as pg.PoolClient, data);
    expect(r1.status).toBe('imported');
    const r2 = await importDataset(owner as unknown as pg.PoolClient, data);
    expect(r2.status).toBe('unchanged');
    expect((await owner.query('SELECT count(*)::int AS n FROM catalog_listings')).rows[0].n).toBe(data.listings.length);
  });

  it('erfordert Anmeldung', async () => {
    expect((await new Client(env.app).get('/api/catalog/local/search?q=gelato')).status).toBe(401);
    expect((await new Client(env.app).get('/api/catalog/local/breeders')).status).toBe(401);
  });

  it('Status mit Version, Zählwerten und Namensnennung', async () => {
    const s = (await c.get('/api/catalog/local/status')).json;
    expect(s.available).toBe(true);
    expect(s.counts.listings).toBe(39);
    expect(s.attribution.url).toBe('https://github.com/Shannon-Goddard/ci-strains-pro');
  });

  it('Suche: exakte Namenstreffer zuerst, korrekte Gesamtzahl und Gruppen', async () => {
    const r = (await c.get('/api/catalog/local/search?q=gelato&perPage=5')).json;
    expect(r.items[0].name.toLowerCase()).toBe('gelato');
    expect(r.items[0].match).toBe('exact');
    const sum = Object.values(r.groups as Record<string, number>).reduce((a, n) => a + n, 0);
    expect(sum).toBe(r.total);
    // Gesamtzahl unabhängig von der Seitengröße
    const all = (await c.get('/api/catalog/local/search?q=gelato&perPage=100')).json;
    expect(all.total).toBe(r.total);
    expect(all.items).toHaveLength(r.total);
    // Reihenfolge der Ränge ist monoton
    const order = ['exact', 'prefix', 'name', 'related', 'similar'];
    const ranks = all.items.map((i: { match: string }) => order.indexOf(i.match));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('Sonderzeichen werden nicht als Platzhalter ausgewertet', async () => {
    const r = (await c.get('/api/catalog/local/search?q=%25')).json;
    expect(r.total).toBe(0);
    expect((await c.get("/api/catalog/local/search?q=%27%3B%20DROP%20TABLE%20users%3B--")).status).toBe(200);
  });

  it('Filter und Sortierung', async () => {
    const auto = (await c.get('/api/catalog/local/search?auto=1&perPage=100')).json;
    expect(auto.items.every((i: { auto: boolean }) => i.auto)).toBe(true);
    const thc = (await c.get('/api/catalog/local/search?sort=thc&thc=1&perPage=100')).json;
    const vals = thc.items.map((i: { thc?: { max?: number; min?: number } }) => i.thc?.max ?? i.thc?.min ?? 0);
    expect([...vals].sort((a, b) => b - a)).toEqual(vals);
    expect((await c.get('/api/catalog/local/search?breeder=..%2F')).status).toBe(400);
  });

  it('Sortenseite mit Angeboten, Quell-URLs und gleichnamigen Sorten anderer Breeder', async () => {
    const id = (await c.get('/api/catalog/local/search?q=gelato')).json.items[0].id;
    const d = (await c.get(`/api/catalog/local/cultivars/${id}`)).json;
    expect(d.cultivar.id).toBe(id);
    expect(d.listings.length).toBeGreaterThan(0);
    expect(d.listings.every((l: { sourceUrl: string }) => l.sourceUrl.startsWith('https://'))).toBe(true);
    expect(d.sameName.every((s: { breeder: { id: string } }) => s.breeder.id !== d.cultivar.breeder.id || s.id !== id)).toBe(true);
    expect((await c.get('/api/catalog/local/cultivars/gibt-es-nicht')).status).toBe(404);
    expect((await c.get('/api/catalog/local/cultivars/UNGUELTIG!')).status).toBe(400);
  });

  it('Breeder-Verzeichnis und Profil', async () => {
    const list = (await c.get('/api/catalog/local/breeders?perPage=200')).json;
    expect(list.total).toBe(list.items.length);
    expect(list.items.filter((b: { id: string }) => b.id === 'aceseeds')).toHaveLength(1);
    const letter = (await c.get('/api/catalog/local/breeders?letter=a')).json;
    expect(letter.items.every((b: { id: string }) => b.id.startsWith('a'))).toBe(true);
    const p = (await c.get('/api/catalog/local/breeders/barneysfarm')).json;
    expect(p.breeder.name).toBe("Barney's Farm");
    expect(p.stats.n).toBe(p.breeder.cultivarCount);
    const own = (await c.get('/api/catalog/local/search?breeder=barneysfarm&perPage=100')).json;
    expect(own.total).toBe(p.breeder.cultivarCount);
  });

  it('Abstammungsgraph: nur dokumentierte Eltern, gleichnamige Sorten bleiben getrennt', async () => {
    const withParents = (await owner.query("SELECT id FROM catalog_cultivars WHERE has_lineage ORDER BY listing_count DESC, id")).rows.map((r) => r.id as string);
    expect(withParents.length).toBeGreaterThan(0);
    let sawResolved = false;
    for (const id of withParents) {
      const g = (await c.get(`/api/catalog/local/lineage/${id}?depth=4`)).json;
      expect(g.rootId).toBe(id);
      expect(g.nodes.filter((n: { kind: string }) => n.kind === 'root')).toHaveLength(1);
      expect(g.nodes.length).toBeLessThanOrEqual(80);
      const ids = new Set(g.nodes.map((n: { id: string }) => n.id));
      for (const e of g.edges) {
        expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
        expect(['documented', 'alternative']).toContain(e.kind);
      }
      for (const n of g.nodes as { kind: string; id: string; candidates?: { id: string; breeder: { id: string } }[] }[]) {
        if (n.kind === 'ambiguous') {
          expect(n.candidates!.length).toBeGreaterThan(1);
          expect(new Set(n.candidates!.map((x) => x.id)).size).toBe(n.candidates!.length);
        }
        if (n.kind === 'strain') {
          sawResolved = true;
          expect((await owner.query('SELECT 1 FROM catalog_cultivars WHERE id = $1', [n.id])).rowCount).toBe(1);
        }
      }
      // Jede dokumentierte Elternangabe der Wurzel erscheint als Kante zur Wurzel
      const root = (await owner.query('SELECT "values" FROM catalog_cultivars WHERE id = $1', [id])).rows[0].values;
      expect(g.edges.filter((e: { to: string; kind: string }) => e.to === id && e.kind === 'documented').length).toBe(new Set((root.parents ?? []).map((p: { slug: string; unknown?: boolean }, i: number) => (p.unknown || !p.slug ? `u${i}` : p.slug))).size);
    }
    void sawResolved;
    expect((await c.get('/api/catalog/local/lineage/gibt-es-nicht')).status).toBe(404);
    expect((await new Client(env.app).get(`/api/catalog/local/lineage/${withParents[0]}`)).status).toBe(401);
  });

  it('Laufzeitrolle darf den Katalog nur lesen', async () => {
    const app = new pg.Client({ connectionString: env.appUrl });
    await app.connect();
    try {
      await expect(app.query("DELETE FROM catalog_cultivars WHERE id = 'x'")).rejects.toThrow(/permission denied/);
      await expect(app.query("INSERT INTO catalog_imports(source, version, sha256, status, report) VALUES ('x','x',repeat('a',64),'active','{}')")).rejects.toThrow(/permission denied/);
    } finally {
      await app.end();
    }
  });

  it('Neue Version: stabile IDs bleiben, entfallene Einträge werden entfernt', async () => {
    const before = (await owner.query('SELECT id FROM catalog_cultivars ORDER BY id')).rows.map((r) => r.id);
    // Version ohne die letzten fünf Zeilen
    const text = FIXTURE.toString('utf8').trimEnd().split('\n');
    const smaller = parseDataset(Buffer.from(text.slice(0, -5).join('\n') + '\n'));
    const r = await importDataset(owner as unknown as pg.PoolClient, smaller);
    expect(r.status).toBe('imported');
    const after = (await owner.query('SELECT id FROM catalog_cultivars ORDER BY id')).rows.map((x) => x.id);
    expect(after.every((id: string) => before.includes(id))).toBe(true);
    expect((await owner.query('SELECT count(*)::int AS n FROM catalog_listings')).rows[0].n).toBe(smaller.listings.length);
    const imports = (await owner.query("SELECT status FROM catalog_imports ORDER BY id")).rows.map((x) => x.status);
    expect(imports).toEqual(['superseded', 'active']);
  });

  it('fehlgeschlagener Import lässt den bisherigen Katalog unverändert', async () => {
    const n = (await owner.query('SELECT count(*)::int AS n FROM catalog_listings')).rows[0].n;
    const broken = parseDataset(FIXTURE);
    broken.listings[0]!.sourceUrl = 'http://nicht-erlaubt'; // verletzt CHECK-Constraint
    await expect(importDataset(owner as unknown as pg.PoolClient, broken, { force: true })).rejects.toThrow();
    expect((await owner.query('SELECT count(*)::int AS n FROM catalog_listings')).rows[0].n).toBe(n);
    expect((await owner.query("SELECT count(*)::int AS n FROM catalog_imports WHERE status = 'active'")).rows[0].n).toBe(1);
  });
});
