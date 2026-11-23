import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KeyRing } from '../src/crypto.js';
import { rotateKeys } from '../src/keys.js';
import { getDek } from '../src/users.js';
import { Client, MASTER1, MASTER2, type TestEnv, hasDb, setup } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 2)]);

describe.skipIf(!hasDb)('Synchronisation', () => {
  let env: TestEnv;
  let c: Client;
  beforeAll(async () => {
    env = await setup();
    c = new Client(env.app);
    await c.register('sync_user');
  });
  afterAll(async () => env?.close());

  const push = (changes: unknown[]) => c.post('/api/sync/push', { changes });

  it('legt an, aktualisiert mit Version, meldet Konflikte statt still zu überschreiben', async () => {
    const r1 = await push([{ store: 'plants', id: 'p1', baseVersion: 0, data: { id: 'p1', name: 'A' } }]);
    expect(r1.json.results[0]).toMatchObject({ status: 'ok', version: 1 });
    const r2 = await push([{ store: 'plants', id: 'p1', baseVersion: 1, data: { id: 'p1', name: 'B' } }]);
    expect(r2.json.results[0]).toMatchObject({ status: 'ok', version: 2 });
    // Zweites Gerät mit veralteter Version
    const r3 = await push([{ store: 'plants', id: 'p1', baseVersion: 1, data: { id: 'p1', name: 'C' } }]);
    expect(r3.json.results[0].status).toBe('conflict');
    expect(r3.json.results[0].server).toEqual({ version: 2, deleted: false, data: { id: 'p1', name: 'B' } });
    // Neuanlage über vorhandenen Datensatz → Konflikt
    expect((await push([{ store: 'plants', id: 'p1', baseVersion: 0, data: { id: 'p1', name: 'D' } }])).json.results[0].status).toBe('conflict');
  });

  it('Löschmarken werden synchronisiert; fehlender Datensatz mit Version > 0 ist ein Konflikt', async () => {
    const d = await push([{ store: 'plants', id: 'p1', baseVersion: 2, deleted: true }]);
    expect(d.json.results[0]).toMatchObject({ status: 'ok', version: 3 });
    const pull = await c.get('/api/sync/changes?since=0');
    expect(pull.json.changes.find((x: any) => x.id === 'p1')).toMatchObject({ deleted: true, data: null, version: 3 });
    expect((await push([{ store: 'plants', id: 'nie-da', baseVersion: 4, data: { id: 'nie-da' } }])).json.results[0].status).toBe('conflict');
  });

  it('Import ist idempotent (gleicher Inhalt → unverändert, unabhängig von Schlüsselreihenfolge)', async () => {
    const a = await push([{ store: 'strains', id: 's1', baseVersion: 0, data: { id: 's1', name: 'X', thc: 20 }, mode: 'import' }]);
    expect(a.json.results[0].status).toBe('ok');
    const b = await push([{ store: 'strains', id: 's1', baseVersion: 0, data: { thc: 20, name: 'X', id: 's1' }, mode: 'import' }]);
    expect(b.json.results[0]).toMatchObject({ status: 'unchanged', version: 1 });
    const diff = await push([{ store: 'strains', id: 's1', baseVersion: 0, data: { id: 's1', name: 'Y' }, mode: 'import' }]);
    expect(diff.json.results[0].status).toBe('conflict');
  });

  it('Pull ist seitenweise mit Cursor', async () => {
    await push(Array.from({ length: 15 }, (_, i) => ({ store: 'activities', id: `a${i}`, baseVersion: 0, data: { id: `a${i}` } })));
    const seen: string[] = [];
    let cursor = '0';
    for (let i = 0; i < 20; i++) {
      const r = await c.get(`/api/sync/changes?since=${cursor}&limit=7`);
      seen.push(...r.json.changes.map((x: any) => x.id));
      cursor = r.json.cursor;
      if (!r.json.more) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((s) => s.startsWith('a'))).toHaveLength(15);
    expect((await c.get('/api/sync/changes?since=abc')).status).toBe(400);
  });

  it('weist ungültige Bereiche, IDs, Daten und zu große Stapel zurück', async () => {
    const r = await push([
      { store: 'users', id: 'x', baseVersion: 0, data: {} },
      { store: 'grows', id: '../etc', baseVersion: 0, data: {} },
      { store: 'grows', id: 'ok1', baseVersion: -1, data: {} },
      { store: 'grows', id: 'ok2', baseVersion: 0, data: [1] },
      { store: 'grows', id: 'ok3', baseVersion: 0, data: { id: 'anders' } },
      { store: 'grows', id: 'ok4', baseVersion: 0, data: { id: 'ok4', big: 'x'.repeat(300_000) } },
    ]);
    expect(r.status).toBe(200);
    expect(r.json.results.map((x: any) => x.status)).toEqual(['rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected']);
    expect((await push(Array.from({ length: 201 }, (_, i) => ({ store: 'grows', id: `z${i}`, baseVersion: 0, data: {} })))).status).toBe(400);
  });

  it('Dateien: Typprüfung per Signatur, Varianten, Kontingent, Ersetzen ohne Altlasten', async () => {
    // Falsch deklarierter Typ: HTML als image/jpeg
    expect((await c.req('PUT', '/api/files/photo/f1/full', Buffer.from('<html><script>alert(1)</script>'), { 'content-type': 'image/jpeg' })).status).toBe(415);
    // PDF ist für Fotos nicht erlaubt, für Laborberichte schon
    expect((await c.req('PUT', '/api/files/photo/f1/full', PDF, { 'content-type': 'application/pdf' })).status).toBe(415);
    expect((await c.req('PUT', '/api/files/labdoc/d1/doc', PDF, { 'content-type': 'application/pdf' })).status).toBe(201);
    // Unbekannte Art/Variante, Pfad-Tricks
    expect((await c.req('PUT', '/api/files/photo/f1/original', PNG, { 'content-type': 'image/png' })).status).toBe(404);
    expect((await c.req('PUT', '/api/files/secret/f1/full', PNG, { 'content-type': 'image/png' })).status).toBe(404);
    expect((await c.req('PUT', '/api/files/photo/..%2F..%2Fetc/full', PNG, { 'content-type': 'image/png' })).status).toBe(404);
    expect((await c.req('PUT', '/api/files/photo/f1/full', PNG, { 'content-type': 'image/png' })).status).toBe(201);
    const g = await c.get('/api/files/photo/f1/full');
    expect(g.headers['content-type']).toBe('image/png');
    expect(g.headers['content-disposition']).toBe('attachment');
    expect(g.headers['cache-control']).toContain('no-store');
    expect(g.headers['x-content-type-options']).toBe('nosniff');
    const before = (await c.get('/api/files')).json.usedBytes;
    expect((await c.req('PUT', '/api/files/photo/f1/full', PNG, { 'content-type': 'image/png' })).status).toBe(201);
    expect((await c.get('/api/files')).json.usedBytes).toBe(before);
    const count = (dir: string): number => readdirSync(dir).reduce((n, f) => n + (statSync(join(dir, f)).isDirectory() ? count(join(dir, f)) : 1), 0);
    expect(count(env.fileDir)).toBe(2);
    // Kontingent
    env.ctx.config.userQuotaBytes = before + 10;
    expect((await c.req('PUT', '/api/files/photo/f2/full', PNG, { 'content-type': 'image/png' })).status).toBe(413);
    env.ctx.config.userQuotaBytes = 2 * 1024 ** 3;
    // Größenlimit
    const huge = Buffer.concat([PNG, Buffer.alloc(env.ctx.config.maxUploadBytes)]);
    expect((await c.req('PUT', '/api/files/photo/f3/full', huge, { 'content-type': 'image/png' })).status).toBe(413);
    expect((await c.req('DELETE', '/api/files/photo/f1/full')).json.deleted).toBe(true);
    expect((await c.get('/api/files')).json.usedBytes).toBe(before - PNG.length);
  });

  it('Manipulierte Datei auf der Platte wird beim Download erkannt', async () => {
    await c.req('PUT', '/api/files/photo/t1/full', PNG, { 'content-type': 'image/png' });
    const { rows } = await env.ctx.db.query('SELECT 1');
    expect(rows).toHaveLength(1);
    const { readdirSync: rd, readFileSync, writeFileSync } = await import('node:fs');
    // Neueste Datei finden und ein Byte kippen
    const all: string[] = [];
    for (const d of rd(env.fileDir)) for (const f of rd(join(env.fileDir, d))) all.push(join(env.fileDir, d, f));
    all.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    const buf = readFileSync(all[0]!);
    buf[buf.length - 1]! ^= 1;
    writeFileSync(all[0]!, buf);
    const r = await c.get('/api/files/photo/t1/full');
    expect(r.status).toBe(500);
    expect(r.json.error).toBe('Interner Fehler');
  });

  it('Key-Rotation: neue Master-Key-Version verpackt DEKs neu, Daten bleiben lesbar', async () => {
    const { rows } = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'sync_user'");
    const before = await getDek(env.ctx, env.ctx.db, rows[0].id);
    const ring = new KeyRing(
      new Map([
        [1, Buffer.from(MASTER1, 'base64')],
        [2, Buffer.from(MASTER2, 'base64')],
      ]),
      2,
    );
    expect(await rotateKeys(env.ctx.db, ring)).toBeGreaterThan(0);
    expect(await rotateKeys(env.ctx.db, ring)).toBe(0);
    const v = await env.ctx.db.query('SELECT DISTINCT dek_key_version FROM users');
    expect(v.rows).toEqual([{ dek_key_version: 2 }]);
    env.ctx.keys = ring;
    expect((await getDek(env.ctx, env.ctx.db, rows[0].id)).equals(before)).toBe(true);
    expect((await c.get('/api/sync/changes?since=0')).json.changes.length).toBeGreaterThan(0);
    // Ohne Version 2 im Schlüsselring sind die Daten nicht mehr lesbar
    env.ctx.keys = new KeyRing(new Map([[1, Buffer.from(MASTER1, 'base64')]]), 1);
    expect((await c.get('/api/sync/changes?since=0')).status).toBe(500);
    env.ctx.keys = ring;
    // Neue Konten nutzen die aktuelle Version
    await new Client(env.app).register('nach_rotation');
    const n = await env.ctx.db.query("SELECT dek_key_version FROM users WHERE login_name = 'nach_rotation'");
    expect(n.rows[0].dek_key_version).toBe(2);
  });
});
