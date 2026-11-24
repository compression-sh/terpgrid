import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CryptoError, KeyRing } from '../src/crypto.js';
import { continueUserKeyRotation, purgeRetiredKeys, rotateUserKey, startUserKeyRotation } from '../src/rotation.js';
import { verifyData } from '../src/verify.js';
import { Client, MASTER1, type TestEnv, hasDb, setup } from './helpers.js';

const PW = 'sehr-sicheres-passwort-42';
const PNG = (tag: string) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(tag), Buffer.alloc(64, 3)]);

describe.skipIf(!hasDb)('Rotation des Datenschlüssels je Konto', () => {
  let env: TestEnv;
  const uid = async (login: string) => (await env.ctx.db.query('SELECT id FROM users WHERE login_name = $1', [login])).rows[0].id as string;
  const gens = async (id: string) => (await env.ctx.db.query('SELECT gen, state FROM user_keys WHERE user_id = $1 ORDER BY gen', [id])).rows;
  /** Als Superuser (RLS würde der App-Rolle ohne Kontext zu Recht nichts zeigen) */
  const sql = async (q: string, p: unknown[] = []) => {
    const pg = (await import('pg')).default;
    const cl = new pg.Client({ connectionString: env.superDbUrl });
    await cl.connect();
    try {
      return (await cl.query(q, p)).rows;
    } finally {
      await cl.end();
    }
  };
  const rowGens = (id: string) =>
    sql('SELECT dek_gen, count(*)::int AS n FROM (SELECT dek_gen FROM records WHERE user_id = $1 UNION ALL SELECT dek_gen FROM files WHERE user_id = $1) x GROUP BY dek_gen ORDER BY dek_gen', [id]);

  async function seed(login: string, n = 12) {
    const c = new Client(env.app);
    await c.register(login);
    const changes = Array.from({ length: n }, (_, i) => ({ store: 'journal', id: `j${i}`, baseVersion: 0, data: { id: `j${i}`, notes: `Notiz ${i} von ${login}` } }));
    changes.push({ store: 'grows', id: 'tomb', baseVersion: 0, data: { id: 'tomb', notes: 'weg' } } as never);
    await c.post('/api/sync/push', { changes });
    await c.post('/api/sync/push', { changes: [{ store: 'grows', id: 'tomb', baseVersion: 1, deleted: true }] });
    for (const id of ['p1', 'p2']) {
      await c.req('PUT', `/api/files/photo/${id}/full`, PNG(`${login}-${id}`), { 'content-type': 'image/png' });
      await c.req('PUT', `/api/files/photo/${id}/thumb`, PNG(`${login}-${id}-t`), { 'content-type': 'image/png' });
    }
    return c;
  }
  const snapshot = async (c: Client) => {
    const ch = (await c.get('/api/sync/changes?since=0&limit=500')).json.changes.map((x: any) => [x.store, x.id, x.version, x.deleted, JSON.stringify(x.data)]);
    const f = Buffer.from((await c.get('/api/files/photo/p1/full')).raw).toString('hex');
    return JSON.stringify({ ch, f });
  };

  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  it('vollständige Rotation: alle Inhalte inkl. Dateien und 2FA umgeschlüsselt, unverändert lesbar, geprüft', async () => {
    const c = await seed('rot_full');
    const s = await c.post('/api/auth/totp/setup');
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(s.json.secret) });
    await c.post('/api/auth/totp/enable', { code: totp.generate() });
    const id = await uid('rot_full');
    const before = await snapshot(c);
    const p = await rotateUserKey(env.ctx, id, { batch: 5 });
    expect(p).toMatchObject({ gen: 2, records: 13, files: 4, totp: true, done: true, remaining: 0 });
    expect(await gens(id)).toEqual([{ gen: 1, state: 'retired' }, { gen: 2, state: 'active' }]);
    expect(await rowGens(id)).toEqual([{ dek_gen: 2, n: 17 }]);
    expect(await snapshot(c)).toBe(before); // Inhalt, Versionen und Dateien identisch
    // Idempotenter Import funktioniert mit neuen MACs weiter
    const imp = await c.post('/api/sync/push', { changes: [{ store: 'journal', id: 'j3', baseVersion: 0, data: { notes: 'Notiz 3 von rot_full', id: 'j3' }, mode: 'import' }] });
    expect(imp.json.results[0].status).toBe('unchanged');
    // 2FA funktioniert nach der Rotation
    await env.ctx.db.query('UPDATE users SET totp_last_step = totp_last_step - 10 WHERE id = $1', [id]);
    const l = new Client(env.app);
    const st = await l.post('/api/auth/login', { login: 'rot_full', password: PW });
    expect((await l.post('/api/auth/login/mfa', { mfaToken: st.json.mfaToken, code: totp.generate() })).status).toBe(200);
    // Alte Blobs im Papierkorb, nicht sofort gelöscht
    expect((await env.ctx.db.query('SELECT count(*)::int AS n FROM file_trash')).rows[0].n).toBeGreaterThanOrEqual(4);
    const v = await verifyData(env.ctx.db, env.ctx.keys, env.fileDir, id);
    expect(v).toMatchObject({ records: 12, files: 4, errors: [] });
  });

  it('unterbrochene Rotation bleibt jederzeit lesbar und lässt sich fortsetzen', async () => {
    const c = await seed('rot_int', 20);
    const id = await uid('rot_int');
    const before = await snapshot(c);
    await startUserKeyRotation(env.ctx, id);
    // „Absturz“ nach einem Teil der Arbeit
    const part = await continueUserKeyRotation(env.ctx, id, { batch: 4, maxBatches: 2 });
    expect(part.done).toBe(false);
    expect(part.records).toBe(8);
    expect(await rowGens(id)).toEqual([{ dek_gen: 1, n: 17 }, { dek_gen: 2, n: 8 }]);
    expect(await gens(id)).toEqual([{ gen: 1, state: 'retiring' }, { gen: 2, state: 'active' }]);
    // Mischzustand: alles lesbar, neue Schreibvorgänge nutzen die neue Generation
    expect(await snapshot(c)).toBe(before);
    await c.post('/api/sync/push', { changes: [{ store: 'journal', id: 'neu', baseVersion: 0, data: { id: 'neu', notes: 'während Rotation' } }] });
    expect((await sql("SELECT dek_gen FROM records WHERE user_id = $1 AND id = 'neu'", [id]))[0].dek_gen).toBe(2);
    // Erneuter Start ist idempotent (keine dritte Generation)
    expect(await startUserKeyRotation(env.ctx, id)).toBe(2);
    const rest = await continueUserKeyRotation(env.ctx, id, { batch: 4 });
    expect(rest.done).toBe(true);
    expect(await rowGens(id)).toEqual([{ dek_gen: 2, n: 26 }]);
    expect((await c.get('/api/sync/changes?since=0&limit=500')).json.changes).toHaveLength(22);
  });

  it('falscher oder beschädigter Schlüssel: Rotation bricht ohne Datenverlust ab und lässt sich nach Reparatur fortsetzen', async () => {
    const c = await seed('rot_bad', 6);
    const id = await uid('rot_bad');
    const before = await snapshot(c);
    // Ohne passenden Master-Key startet keine Rotation (keine neue Generation)
    const good = env.ctx.keys;
    env.ctx.keys = new KeyRing(new Map([[1, Buffer.alloc(32, 9)]]), 1);
    await expect(startUserKeyRotation(env.ctx, id)).rejects.toBeInstanceOf(CryptoError);
    env.ctx.keys = good;
    expect(await gens(id)).toEqual([{ gen: 1, state: 'active' }]);
    // Alte Generation während der Rotation beschädigt → Abbruch, Zeilen unverändert
    await startUserKeyRotation(env.ctx, id);
    const orig = (await env.ctx.db.query('SELECT dek_wrapped FROM user_keys WHERE user_id = $1 AND gen = 1', [id])).rows[0].dek_wrapped as Buffer;
    const broken = Buffer.from(orig);
    broken[broken.length - 1]! ^= 1;
    await env.ctx.db.query('UPDATE user_keys SET dek_wrapped = $2 WHERE user_id = $1 AND gen = 1', [id, broken]);
    await expect(continueUserKeyRotation(env.ctx, id)).rejects.toBeInstanceOf(CryptoError);
    expect(await rowGens(id)).toEqual([{ dek_gen: 1, n: 11 }]);
    expect(await gens(id)).toEqual([{ gen: 1, state: 'retiring' }, { gen: 2, state: 'active' }]);
    // Lesen meldet einen Fehler statt falscher Daten
    expect((await c.get('/api/sync/changes?since=0')).status).toBe(500);
    // Reparatur (z. B. Restore des Schlüssels) → Fortsetzen gelingt
    await env.ctx.db.query('UPDATE user_keys SET dek_wrapped = $2 WHERE user_id = $1 AND gen = 1', [id, orig]);
    expect((await continueUserKeyRotation(env.ctx, id)).done).toBe(true);
    expect(await snapshot(c)).toBe(before);
  });

  it('Rotation eines Kontos lässt andere Konten unberührt', async () => {
    const other = await seed('rot_other', 3);
    const otherId = await uid('rot_other');
    const before = await snapshot(other);
    await rotateUserKey(env.ctx, await uid('rot_full'));
    expect(await gens(otherId)).toEqual([{ gen: 1, state: 'active' }]);
    expect(await snapshot(other)).toBe(before);
  });

  it('ausgemusterte Schlüssel werden nur nach Ablauf der Frist und ohne Verwendung gelöscht', async () => {
    const id = await uid('rot_int');
    expect(await purgeRetiredKeys(env.ctx, 200)).toBe(0); // zu jung (Backups!)
    await env.ctx.db.query("UPDATE user_keys SET retired_at = now() - interval '300 days' WHERE user_id = $1 AND state = 'retired'", [id]);
    // Künstlich eine Zeile auf alte Generation setzen → darf nicht gelöscht werden
    await sql("UPDATE records SET dek_gen = 1 WHERE user_id = $1 AND id = 'j0'", [id]);
    expect(await purgeRetiredKeys(env.ctx, 200)).toBe(0);
    await sql("UPDATE records SET dek_gen = 2 WHERE user_id = $1 AND id = 'j0'", [id]);
    expect(await purgeRetiredKeys(env.ctx, 200)).toBe(1);
    expect(await gens(id)).toEqual([{ gen: 2, state: 'active' }]);
    expect((await env.ctx.db.query('SELECT dek_wrapped FROM users WHERE id = $1', [id])).rows[0].dek_wrapped).toBeNull();
    await expect(purgeRetiredKeys(env.ctx, 0)).rejects.toThrow();
  });

  it('nach dem Purge funktionieren Lesen, Schreiben, weitere Rotation und KEK-Rotation', async () => {
    const id = await uid('rot_int');
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'rot_int', password: PW });
    expect((await c.get('/api/sync/changes?since=0&limit=500')).json.changes.length).toBeGreaterThan(0);
    const p = await rotateUserKey(env.ctx, id);
    expect(p).toMatchObject({ gen: 3, done: true });
    const { rotateKeys } = await import('../src/keys.js');
    const ring = new KeyRing(new Map([[1, Buffer.from(MASTER1, 'base64')], [2, Buffer.alloc(32, 5)]]), 2);
    expect(await rotateKeys(env.ctx.db, ring)).toBeGreaterThan(0);
    env.ctx.keys = ring;
    const v = await verifyData(env.ctx.db, ring, env.fileDir);
    expect(v.errors).toEqual([]);
    expect((await c.get('/api/files/photo/p2/thumb')).status).toBe(200);
  });
});
