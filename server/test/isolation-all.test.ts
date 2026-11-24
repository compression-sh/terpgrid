/**
 * Erweiterte Mandantentrennung: jeder synchronisierte Bereich einzeln, manipulierte
 * IDs/Ownership-Felder/Paging-Parameter, verschachtelte Datei-Pfade und ein Nachweis,
 * dass jede Abfrage auf private Tabellen im echten Request mit gesetztem RLS-Kontext läuft.
 */
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYNC_STORES } from '../src/stores.js';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('A-FOTO'), Buffer.alloc(32, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7 A-DOKUMENT'), Buffer.alloc(32, 2)]);

/** Repräsentative Inhalte je Bereich (inkl. Favoriten, THC-Lab-Berechnungen, Einstellungen) */
function sample(store: string, id: string): Record<string, unknown> {
  const base = { id, secret: `GEHEIM-A-${store}`, createdAt: 't', updatedAt: 't' };
  switch (store) {
    case 'strains':
      return { ...base, name: 'A-Sorte', favorite: true, externalKey: 'strainapi:a' };
    case 'calculations':
      return { ...base, kind: 'edibles', name: 'A-Rechnung', input: { thc: 20 }, summary: {} };
    case 'settings':
      return { key: id, value: { theme: 'A', secret: `GEHEIM-A-${store}` } };
    case 'photos':
      return { ...base, takenAt: 't', mime: 'image/png' };
    case 'labReports':
      return { ...base, title: 'A-Labor', documentId: 'doc-a' };
    default:
      return { ...base, name: `A-${store}` };
  }
}

describe.skipIf(!hasDb)('Mandantentrennung über alle Bereiche', () => {
  let env: TestEnv;
  let a: Client;
  let b: Client;
  let aId: string;
  const log: { client: number; sql: string }[] = [];

  beforeAll(async () => {
    env = await setup();
    // SQL je Pool-Verbindung mitschneiden (RLS-Nachweis)
    const origConnect = env.ctx.db.connect.bind(env.ctx.db);
    let n = 0;
    (env.ctx.db as any).connect = async (cb?: unknown) => {
      // pool.query() nutzt intern die Callback-Variante – unverändert durchreichen
      if (typeof cb === 'function') return (origConnect as any)(cb);
      const c = await origConnect();
      const id = ++n;
      const q = c.query.bind(c);
      (c as any).query = (sql: any, ...rest: any[]) => {
        log.push({ client: id, sql: typeof sql === 'string' ? sql : sql.text });
        return (q as any)(sql, ...rest);
      };
      return c;
    };
    a = new Client(env.app);
    b = new Client(env.app);
    await a.register('iso_a');
    await b.register('iso_b');
    aId = (await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'iso_a'")).rows[0].id;
    const r = await a.post('/api/sync/push', { changes: SYNC_STORES.map((s) => ({ store: s, id: `a-${s}`, baseVersion: 0, data: sample(s, `a-${s}`) })) });
    expect(r.json.results.every((x: any) => x.status === 'ok')).toBe(true);
    expect((await a.req('PUT', '/api/files/photo/a-photos/full', PNG, { 'content-type': 'image/png' })).status).toBe(201);
    expect((await a.req('PUT', '/api/files/photo/a-photos/thumb', PNG, { 'content-type': 'image/png' })).status).toBe(201);
    expect((await a.req('PUT', '/api/files/labdoc/doc-a/doc', PDF, { 'content-type': 'application/pdf' })).status).toBe(201);
  });
  afterAll(async () => env?.close());

  it.each(SYNC_STORES.map((s) => [s]))('%s: B kann A-Datensatz weder lesen, überschreiben noch löschen', async (store) => {
    const id = `a-${store}`;
    // Lesen über Pull (auch mit beliebigem Cursor)
    for (const since of ['0', '1', '999999999']) {
      const p = await b.get(`/api/sync/changes?since=${since}&limit=500`);
      expect(JSON.stringify(p.json)).not.toContain('GEHEIM-A');
    }
    // Überschreiben mit geratener Version → eigener/abgelehnter Datensatz, nie A's
    for (const baseVersion of [0, 1, 2]) {
      const w = await b.post('/api/sync/push', { changes: [{ store, id, baseVersion, data: { ...sample(store, id), secret: 'B-UEBERSCHRIEBEN', userId: aId, user_id: aId } }] });
      const res = w.json.results[0];
      expect(JSON.stringify(res)).not.toContain('GEHEIM-A');
      if (res.status === 'conflict') expect(res.server.data === null || !JSON.stringify(res.server.data).includes('GEHEIM-A')).toBe(true);
    }
    // Löschen
    await b.post('/api/sync/push', { changes: [{ store, id, baseVersion: 1, deleted: true }] });
    // A sieht weiterhin seinen unveränderten Datensatz
    const own = await a.get('/api/sync/changes?since=0&limit=500');
    const rec = own.json.changes.find((c: any) => c.store === store && c.id === id);
    expect(rec.deleted).toBe(false);
    expect(JSON.stringify(rec.data)).toContain(`GEHEIM-A-${store}`);
    expect(JSON.stringify(rec.data)).not.toContain('B-UEBERSCHRIEBEN');
  });

  it('Datei-Zugriffe mit fremden, verschachtelten oder manipulierten IDs schlagen fehl, ohne Existenz zu verraten', async () => {
    const paths = [
      '/api/files/photo/a-photos/full',
      '/api/files/photo/a-photos/thumb',
      '/api/files/labdoc/doc-a/doc',
      '/api/files/photo/..%2Fa-photos/full',
      '/api/files/photo/a-photos%2F..%2F..%2Fx/full',
      '/api/files/photo/a-photos/full%00',
      '/api/files/labdoc/a-photos/full',
    ];
    const statuses = new Set<number>();
    for (const p of paths) {
      const r = await b.get(p);
      statuses.add(r.status);
      expect(Buffer.from(r.raw).includes(Buffer.from('A-FOTO'))).toBe(false);
    }
    // Gleiche Antwort für „gibt es nicht“ und „gehört jemand anderem“
    const missing = await b.get('/api/files/photo/gibt-es-nicht/full');
    expect([...statuses].every((s) => s === 404)).toBe(true);
    expect(missing.status).toBe(404);
    expect((await b.get('/api/files/photo/a-photos/full')).json).toEqual(missing.json);
    expect((await b.get('/api/files')).json.files).toHaveLength(0);
  });

  it('Paging-Parameter sind begrenzt und validiert', async () => {
    for (const q of ['since=-1', 'since=abc', 'since=1e9', 'since=99999999999999999999']) expect((await b.get(`/api/sync/changes?${q}`)).status).toBe(400);
    const big = await a.get('/api/sync/changes?since=0&limit=100000');
    expect(big.status).toBe(200);
    expect(big.json.changes.length).toBeLessThanOrEqual(500);
  });

  it('Export und Zusammenfassung von B enthalten nichts von A', async () => {
    const e = await b.get('/api/account/export');
    const z = unzipSync(new Uint8Array(e.raw));
    expect(Object.keys(z)).toEqual(['manifest.json']);
    expect(strFromU8(z['manifest.json']!)).not.toContain('GEHEIM-A');
    const s = await b.get('/api/sync/summary');
    expect(s.json.files).toEqual([]);
    expect(JSON.stringify(s.json)).not.toContain('a-');
  });

  it('A-Export enthält alle eigenen Bereiche inkl. Favoriten, Berechnungen, Laborbericht und Dateien', async () => {
    const e = await a.get('/api/account/export');
    const z = unzipSync(new Uint8Array(e.raw));
    const m = JSON.parse(strFromU8(z['manifest.json']!));
    for (const s of SYNC_STORES.filter((x) => x !== 'settings')) expect(m.data[s]).toHaveLength(1);
    expect(m.data.strains[0].favorite).toBe(true);
    expect(m.photoFiles).toHaveLength(1);
    expect(m.docFiles).toHaveLength(1);
  });

  it('jede Abfrage auf private Tabellen läuft im echten Request mit gesetztem RLS-Kontext', () => {
    const byClient = new Map<number, string[]>();
    for (const l of log) byClient.set(l.client, [...(byClient.get(l.client) ?? []), l.sql]);
    let checked = 0;
    for (const sqls of byClient.values()) {
      let ctxSet = false;
      for (const sql of sqls) {
        if (/^BEGIN/.test(sql)) ctxSet = false;
        if (/set_config\('app\.user_id'/.test(sql)) ctxSet = true;
        if (/\b(FROM|INTO|UPDATE)\s+(records|files)\b/i.test(sql)) {
          checked++;
          expect(ctxSet, `ohne RLS-Kontext: ${sql.slice(0, 80)}`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
