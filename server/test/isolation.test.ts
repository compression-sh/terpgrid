/**
 * Zwei-Benutzer-Isolation: A kann B's Daten weder lesen, ändern, löschen,
 * exportieren noch herunterladen. Zusätzlich: RLS greift auch ohne App-Filter.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF-BILDDATEN-VON-BOB'), Buffer.alloc(200, 7)]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe.skipIf(!hasDb)('Mandantentrennung A/B', () => {
  let env: TestEnv;
  let alice: Client;
  let bob: Client;
  let bobId: string;
  beforeAll(async () => {
    env = await setup();
    alice = new Client(env.app);
    bob = new Client(env.app);
    await alice.register('alice');
    await bob.register('bob');
    const { rows } = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'bob'");
    bobId = rows[0].id;
    const r = await bob.post('/api/sync/push', {
      changes: [
        { store: 'journal', id: 'shared-id', baseVersion: 0, data: { id: 'shared-id', notes: 'BOB-GEHEIM' } },
        { store: 'grows', id: 'g-bob', baseVersion: 0, data: { id: 'g-bob', name: 'Bobs Grow' } },
      ],
    });
    expect(r.json.results.every((x: any) => x.status === 'ok')).toBe(true);
    expect((await bob.req('PUT', '/api/files/photo/p-bob/full', JPEG, { 'content-type': 'image/jpeg' })).status).toBe(201);
  });
  afterAll(async () => env?.close());

  it('A sieht B-Datensätze nicht im Pull', async () => {
    const r = await alice.get('/api/sync/changes?since=0');
    expect(r.status).toBe(200);
    expect(r.json.changes).toHaveLength(0);
    expect(JSON.stringify(r.json)).not.toContain('BOB-GEHEIM');
  });

  it('A kann B-Datensatz gleicher ID nicht überschreiben – es entsteht ein eigener Datensatz', async () => {
    const r = await alice.post('/api/sync/push', { changes: [{ store: 'journal', id: 'shared-id', baseVersion: 0, data: { id: 'shared-id', notes: 'ALICE' } }] });
    expect(r.json.results[0].status).toBe('ok');
    const b = await bob.get('/api/sync/changes?since=0');
    expect(b.json.changes.find((c: any) => c.id === 'shared-id').data.notes).toBe('BOB-GEHEIM');
  });

  it('A kann B-Datensatz nicht löschen (eigene Löschmarke betrifft nur A)', async () => {
    const r = await alice.post('/api/sync/push', { changes: [{ store: 'grows', id: 'g-bob', baseVersion: 0, deleted: true }] });
    expect(r.json.results[0].status).toBe('unchanged');
    const r2 = await alice.post('/api/sync/push', { changes: [{ store: 'grows', id: 'g-bob', baseVersion: 1, deleted: true }] });
    expect(r2.json.results[0].status).toBe('conflict');
    expect(r2.json.results[0].server.data).toBeNull();
    const b = await bob.get('/api/sync/changes?since=0');
    expect(b.json.changes.find((c: any) => c.id === 'g-bob').deleted).toBe(false);
  });

  it('ein vom Client mitgeschicktes user_id-Feld hat keine Wirkung', async () => {
    const r = await alice.req('GET', `/api/sync/changes?since=0&user_id=${bobId}`);
    expect(JSON.stringify(r.json)).not.toContain('BOB-GEHEIM');
    const p = await alice.post('/api/sync/push', { userId: bobId, changes: [] });
    expect(JSON.stringify(p.json)).not.toContain('BOB');
  });

  it('A kann B-Dateien weder herunterladen, überschreiben noch löschen', async () => {
    expect((await alice.get('/api/files/photo/p-bob/full')).status).toBe(404);
    expect((await alice.req('DELETE', '/api/files/photo/p-bob/full')).json.deleted).toBe(false);
    expect((await alice.req('PUT', '/api/files/photo/p-bob/full', JPEG, { 'content-type': 'image/jpeg' })).status).toBe(201);
    const b = await bob.get('/api/files/photo/p-bob/full');
    expect(b.status).toBe(200);
    expect(Buffer.from(b.raw).equals(JPEG)).toBe(true);
    expect((await alice.get('/api/files')).json.files).toHaveLength(1);
  });

  it('A-Export enthält keine B-Daten', async () => {
    const r = await alice.get('/api/account/export');
    expect(r.status).toBe(200);
    const z = unzipSync(new Uint8Array(r.raw));
    const manifest = JSON.parse(strFromU8(z['manifest.json']!));
    expect(manifest.app).toBe('TERPGRID');
    expect(manifest.format).toBe(2);
    expect(JSON.stringify(manifest)).not.toContain('BOB-GEHEIM');
    expect(manifest.data.journal).toEqual([{ id: 'shared-id', notes: 'ALICE' }]);
    expect(manifest.data.grows).toEqual([]);
  });

  it('Inhalte liegen verschlüsselt in DB und Dateisystem', async () => {
    const { rows } = await env.ctx.db.query("SELECT payload FROM records WHERE store = 'journal'");
    // Als App-Rolle ohne Benutzerkontext: RLS liefert nichts
    expect(rows).toHaveLength(0);
    // Auch der Schema-Owner sieht wegen FORCE ROW LEVEL SECURITY nichts
    const owner = new pg.Client({ connectionString: env.ownerUrl });
    await owner.connect();
    expect((await owner.query('SELECT payload FROM records')).rowCount).toBe(0);
    await owner.end();
    // Superuser (wie ein Angreifer mit DB-Dump): nur Chiffrat
    const sup = new pg.Client({ connectionString: env.superDbUrl });
    await sup.connect();
    const all = await sup.query('SELECT payload FROM records');
    await sup.end();
    expect(all.rows.length).toBeGreaterThan(0);
    for (const r of all.rows) if (r.payload) expect(r.payload.includes(Buffer.from('GEHEIM'))).toBe(false);
    const files = walk(env.fileDir);
    expect(files.length).toBe(2);
    for (const f of files) {
      expect(readFileSync(f).includes(Buffer.from('BILDDATEN'))).toBe(false);
      expect(f).toMatch(/[a-f0-9]{48}$/);
    }
  });

  it('RLS: App-Rolle sieht ohne bzw. mit fremdem Kontext keine Zeilen und kann nicht fremd schreiben', async () => {
    const c = new pg.Client({ connectionString: env.appUrl });
    await c.connect();
    try {
      expect((await c.query('SELECT * FROM records')).rowCount).toBe(0);
      expect((await c.query('SELECT * FROM files')).rowCount).toBe(0);
      const { rows } = await c.query("SELECT id FROM users WHERE login_name = 'alice'");
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.user_id', $1, true)", [rows[0].id]);
      const visible = await c.query('SELECT user_id FROM records');
      expect(visible.rows.every((r) => r.user_id === rows[0].id)).toBe(true);
      // Ohne WHERE-Filter: UPDATE/DELETE trifft trotzdem nur eigene Zeilen
      await c.query("UPDATE records SET deleted = deleted WHERE store = 'grows'");
      const del = await c.query('DELETE FROM files WHERE user_id = $1', [bobId]);
      expect(del.rowCount).toBe(0);
      await expect(c.query("INSERT INTO records(user_id, store, id, version, payload) VALUES ($1, 'grows', 'x', 1, '\\x00')", [bobId])).rejects.toThrow(/row-level security/);
      await c.query('ROLLBACK');
      // App-Rolle darf RLS nicht abschalten oder Tabellen ändern
      await expect(c.query('ALTER TABLE records DISABLE ROW LEVEL SECURITY')).rejects.toThrow();
      const role = await c.query("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'terpgrid_app'");
      expect(role.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    } finally {
      await c.end();
    }
  });

  it('Kontolöschung von B entfernt nur B-Daten und B-Dateien', async () => {
    await bob.post('/api/auth/reauth', { password: 'sehr-sicheres-passwort-42' });
    expect((await bob.req('DELETE', '/api/account', { confirm: 'bob' })).status).toBe(200);
    // Bobs Blobs liegen bis zum Ablauf der Frist im Papierkorb – ohne Schlüssel (Konto gelöscht) nicht entschlüsselbar
    const { purgeTrash } = await import('../src/files.js');
    await env.ctx.db.query("UPDATE file_trash SET deleted_at = now() - interval '30 days'");
    expect(await purgeTrash(env.ctx.db, env.fileDir, 7)).toBe(1);
    expect(walk(env.fileDir)).toHaveLength(1);
    const owner = new pg.Client({ connectionString: env.superDbUrl });
    await owner.connect();
    const left = await owner.query('SELECT count(*)::int AS n FROM records WHERE user_id = $1', [bobId]);
    await owner.end();
    expect(left.rows[0].n).toBe(0);
    expect((await alice.get('/api/sync/changes?since=0')).json.changes.length).toBeGreaterThan(0);
  });
});
