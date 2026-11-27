/**
 * Phase 5.7 – Sicherheits-Regressionstests (mehrere unabhängige Konten, direkte API-Aufrufe
 * unabhängig vom Frontend). Jeder bestätigte Befund aus docs/PHASE5-7-SECURITY-REPORT.md hat
 * hier einen Test; zusätzlich Gegenproben für Angriffsklassen ohne Befund.
 */
import * as OTPAuth from 'otpauth';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';

const PW = 'sehr-sicheres-passwort-42';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

async function superQuery(url: string, sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

describe.skipIf(!hasDb)('Phase 5.7 Sicherheit', () => {
  let env: TestEnv;
  let a: Client;
  let b: Client;

  beforeAll(async () => {
    env = await setup();
    a = new Client(env.app);
    b = new Client(env.app);
    await a.register('sec_anna');
    await b.register('sec_ben');
  });
  afterAll(async () => env?.close());

  const login = async (name: string, pw = PW) => {
    const c = new Client(env.app);
    const r = await c.post('/api/auth/login', { login: name, password: pw });
    return { c, r };
  };
  const freshReauth = (c: Client) => c.post('/api/auth/reauth', { password: PW });

  /* ───── Sitzungen ───── */

  it('S1 Sitzungsfixierung: ein mitgebrachtes Cookie wird bei der Anmeldung nie übernommen', async () => {
    const c = new Client(env.app);
    c.cookie = 'tg_session_dev=' + 'a'.repeat(64);
    const r = await c.post('/api/auth/login', { login: 'sec_anna', password: PW });
    expect(r.status).toBe(200);
    expect(c.cookie).not.toContain('a'.repeat(64));
    // Angemeldet bleibt nur das neue Cookie
    const fix = new Client(env.app);
    fix.cookie = 'tg_session_dev=' + 'a'.repeat(64);
    expect((await fix.get('/api/auth/session')).status).toBe(401);
  });

  it('S2 Sitzungsübersicht zeigt die Anmeldemethode und nur eigene Sitzungen', async () => {
    const { c } = await login('sec_anna');
    const r = await c.get('/api/auth/sessions');
    expect(r.status).toBe(200);
    const cur = r.json.sessions.find((s: { current: boolean }) => s.current);
    expect(cur.authMethod).toBe('password');
    const bs = await b.get('/api/auth/sessions');
    for (const s of bs.json.sessions) expect(r.json.sessions.some((x: { handle: string }) => x.handle === s.handle)).toBe(false);
  });

  it('S3 Fremde Sitzung über ihren Kurzbezeichner beenden: nicht möglich (404)', async () => {
    const bs = await b.get('/api/auth/sessions');
    const handle = bs.json.sessions[0].handle;
    expect((await a.req('DELETE', `/api/auth/sessions/${handle}`)).status).toBe(404);
    expect((await b.get('/api/auth/session')).status).toBe(200);
  });

  it('S4 „Alle Sitzungen beenden“ beendet auch die aktuelle und löscht das Cookie', async () => {
    const one = await login('sec_ben');
    const two = await login('sec_ben');
    const r = await one.c.post('/api/auth/sessions/revoke-all');
    expect(r.status).toBe(200);
    expect(r.json.revoked).toBeGreaterThanOrEqual(2);
    expect((await one.c.get('/api/auth/session')).status).toBe(401);
    expect((await two.c.get('/api/auth/session')).status).toBe(401);
    // b neu anmelden für spätere Tests
    b = (await login('sec_ben')).c;
  });

  it('S5 Abmelden löscht die Sitzung serverseitig – ein kopiertes Cookie ist danach wertlos', async () => {
    const { c } = await login('sec_anna');
    const stolen = c.cookie;
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    const t = new Client(env.app);
    t.cookie = stolen;
    expect((await t.get('/api/auth/session')).status).toBe(401);
  });

  it('S6 2FA einschalten beendet alle anderen Sitzungen (Befund F-03)', async () => {
    const owner = new Client(env.app);
    await owner.register('sec_totp');
    const other = (await login('sec_totp')).c;
    expect((await other.get('/api/auth/session')).status).toBe(200);
    const setupRes = await owner.post('/api/auth/totp/setup');
    expect(setupRes.status).toBe(200);
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setupRes.json.secret), digits: 6, period: 30 });
    expect((await owner.post('/api/auth/totp/enable', { code: totp.generate() })).status).toBe(200);
    expect((await owner.get('/api/auth/session')).status).toBe(200);
    expect((await other.get('/api/auth/session')).status).toBe(401);
    // Rotation behält die Anmeldemethode
    const s = await owner.get('/api/auth/sessions');
    expect(s.json.sessions).toHaveLength(1);
    expect(s.json.sessions[0].authMethod).toBe('register');
  });

  it('S7 Gesperrtes Konto: bestehende Sitzungen enden sofort', async () => {
    const victim = new Client(env.app);
    await victim.register('sec_susp');
    const { rows } = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'sec_susp'");
    await env.ctx.db.query("UPDATE users SET status = 'suspended' WHERE id = $1", [rows[0].id]);
    expect((await victim.get('/api/auth/session')).status).toBe(401);
    expect((await victim.get('/api/sync/changes')).status).toBe(401);
  });

  /* ───── Anmeldung & Wiederherstellung ───── */

  it('A1 Keine Kontoenumeration: gleiche Antwort für unbekannte Kennung und falsches Passwort', async () => {
    const x = await login('sec_anna', 'falsches-passwort-123');
    const y = await login('gibt_es_nicht_42', 'falsches-passwort-123');
    expect(x.r.status).toBe(401);
    expect(y.r.status).toBe(401);
    expect(x.r.json).toEqual(y.r.json);
  });

  it('A2 Massenzuweisung bei der Registrierung (Rolle, Status) wird abgelehnt', async () => {
    const c = new Client(env.app);
    const r = await c.post('/api/auth/register', { mode: 'username', username: 'sec_mass', password: PW, ageConfirmed: true, role: 'admin' });
    expect(r.status).toBe(400);
    const { rowCount } = await env.ctx.db.query("SELECT 1 FROM users WHERE login_name = 'sec_mass'");
    expect(rowCount).toBe(0);
  });

  it('A3 Wiederherstellungscode: einmalig, beendet alle Sitzungen, entfernt Passkeys und 2FA', async () => {
    const c = new Client(env.app);
    const reg = await c.register('sec_rec');
    const other = (await login('sec_rec')).c;
    const code = reg.recoveryCodes[0]!;
    const r = await new Client(env.app).post('/api/auth/recover', { login: 'sec_rec', recoveryCode: code, newPassword: 'ganz-neues-passwort-77' });
    expect(r.status).toBe(200);
    expect(r.json.passkeysRemoved).toBe(true);
    expect((await other.get('/api/auth/session')).status).toBe(401);
    expect((await c.get('/api/auth/session')).status).toBe(401);
    const again = await new Client(env.app).post('/api/auth/recover', { login: 'sec_rec', recoveryCode: code, newPassword: 'noch-ein-passwort-88' });
    expect(again.status).toBe(401);
    // Codes liegen nur als HMAC vor
    const { rows } = await env.ctx.db.query("SELECT code_hash FROM recovery_codes rc JOIN users u ON u.id = rc.user_id WHERE u.login_name = 'sec_rec'");
    for (const row of rows) expect(Buffer.from(row.code_hash).toString('utf8')).not.toContain(code.replace(/-/g, ''));
  });

  it('A4 Passwortwechsel beendet alle anderen Sitzungen', async () => {
    const c = new Client(env.app);
    await c.register('sec_pw');
    const other = (await login('sec_pw')).c;
    const r = await c.post('/api/auth/password', { currentPassword: PW, newPassword: 'ein-ganz-anderes-pw-55' });
    expect(r.status).toBe(200);
    expect((await other.get('/api/auth/session')).status).toBe(401);
    expect((await c.get('/api/auth/session')).status).toBe(200);
  });

  /* ───── CSRF, Herkunft, Inhaltstypen, Größen ───── */

  it('C1 CSRF: schreibende Anfrage ohne oder mit falschem Token wird abgelehnt', async () => {
    const save = a.csrf;
    a.csrf = '';
    expect((await a.req('PATCH', '/api/account', { displayName: 'X' })).status).toBe(403);
    a.csrf = 'f'.repeat(64);
    expect((await a.req('PATCH', '/api/account', { displayName: 'X' })).status).toBe(403);
    a.csrf = save;
    expect((await a.req('PATCH', '/api/account', { displayName: 'Anna' })).status).toBe(200);
  });

  it('C2 Fremde Herkunft (Origin) und fehlender Pre-Auth-Header werden abgelehnt', async () => {
    const evil = new Client(env.app, 'https://evil.example');
    expect((await evil.post('/api/auth/login', { login: 'sec_anna', password: PW })).status).toBe(403);
    const noHdr = await env.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'sec_anna', password: PW }, headers: { origin: 'https://terpgrid.test' } });
    expect(noHdr.statusCode).toBe(403);
  });

  it('C3 Falscher Inhaltstyp und übergroße Anfragen werden abgelehnt', async () => {
    const t = await a.req('PATCH', '/api/account', 'displayName=x', { 'content-type': 'text/plain' });
    expect([400, 415]).toContain(t.status);
    const big = await a.req('POST', '/api/sync/push', Buffer.alloc(9 * 1024 * 1024, 0x20), { 'content-type': 'application/json' });
    expect(big.status).toBe(413);
  });

  it('C4 Fehlerantworten enthalten keine internen Details', async () => {
    const r = await a.req('POST', '/api/sync/push', '{"changes": [', { 'content-type': 'application/json' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).not.toMatch(/at \w+ \(|node_modules|\/src\//);
  });

  /* ───── Dateien ───── */

  it('D1 Dateien: fremde Datei nicht lesbar/löschbar, Pfadmanipulation und falsche Typen abgelehnt', async () => {
    expect((await a.req('PUT', '/api/files/photo/p-sec-1/full', PNG, { 'content-type': 'image/png' })).status).toBe(201);
    expect((await b.get('/api/files/photo/p-sec-1/full')).status).toBe(404);
    expect((await b.req('DELETE', '/api/files/photo/p-sec-1/full')).status).toBe(200);
    expect((await a.get('/api/files/photo/p-sec-1/full')).status).toBe(200); // nicht gelöscht
    for (const url of ['/api/files/photo/..%2F..%2Fetc/full', '/api/files/photo/p-sec-1/..%2Ffull', '/api/files/secret/p1/full', '/api/files/photo/p1/original'])
      expect((await a.get(url)).status).toBe(404);
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect((await a.req('PUT', '/api/files/photo/p-sec-2/full', html, { 'content-type': 'image/png' })).status).toBe(415);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect((await a.req('PUT', '/api/files/photo/p-sec-3/full', svg, { 'content-type': 'image/png' })).status).toBe(415);
  });

  it('D2 Private Dateien: attachment, no-store, Sandbox-CSP; im Speicher nur Chiffrat', async () => {
    const r = await a.get('/api/files/photo/p-sec-1/full');
    expect(r.headers['content-disposition']).toBe('attachment');
    expect(String(r.headers['cache-control'])).toContain('no-store');
    expect(String(r.headers['content-security-policy'])).toContain('sandbox');
    const { rows } = await superQuery(env.superDbUrl, "SELECT storage_name FROM files WHERE id = 'p-sec-1'");
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const name = rows[0].storage_name as string;
    const blob = readFileSync(join(env.fileDir, name.slice(0, 2), name));
    expect(blob.includes(PNG.subarray(0, 8))).toBe(false);
  });

  /* ───── Admin ───── */

  it('V1 Verwaltungsendpunkte: normale Konten erhalten 403', async () => {
    for (const [m, url, body] of [
      ['GET', '/api/admin/overview'],
      ['GET', '/api/admin/system'],
      ['GET', '/api/admin/users'],
      ['GET', '/api/admin/invites'],
      ['POST', '/api/admin/invites', { days: 7 }],
      ['GET', '/api/admin/catalog/quality'],
      ['GET', '/api/admin/catalog/sources'],
      ['GET', '/api/admin/catalog/runs'],
      ['GET', '/api/admin/catalog/matches'],
      ['POST', '/api/admin/catalog/enrich', { provider: 'strainapi', limit: 1, dryRun: true }],
    ] as [string, string, unknown?][]) {
      const r = await a.req(m, url, body);
      expect(r.status, `${m} ${url}`).toBe(403);
    }
  });

  it('V2 Verwaltungsantworten enthalten keine Passwort-Hashes, Schlüssel, Tokens oder Recovery-Codes', async () => {
    const { rows } = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'sec_anna'");
    await env.ctx.db.query("UPDATE users SET role = 'admin' WHERE id = $1", [rows[0].id]);
    const adm = (await login('sec_anna')).c;
    for (const url of ['/api/admin/overview', '/api/admin/system', '/api/admin/users', '/api/admin/invites']) {
      const r = await adm.get(url);
      expect(r.status, url).toBe(200);
      const text = JSON.stringify(r.json);
      expect(text, url).not.toMatch(/\$argon2|password_hash|totp_secret|wrapped|csrf|code_hash|token_hash/i);
    }
    await env.ctx.db.query("UPDATE users SET role = 'user' WHERE id = $1", [rows[0].id]);
  });

  /* ───── Sicherheitsverlauf ───── */

  it('E1 Sicherheitsverlauf: Passkey- und Sitzungsereignisse sichtbar, ohne IP-Adresse oder Inhalte', async () => {
    const { c } = await login('sec_anna');
    await freshReauth(c);
    const ov = await c.get('/api/account/overview');
    expect(ov.status).toBe(200);
    const types = ov.json.securityEvents.map((e: { type: string }) => e.type);
    expect(types).toContain('login.success');
    expect(types).toContain('login.failure');
    expect(JSON.stringify(ov.json.securityEvents)).not.toMatch(/127\.0\.0\.1|ip_tag/);
    const { rows } = await env.ctx.db.query('SELECT ip_tag FROM audit_events WHERE ip_tag IS NOT NULL LIMIT 5');
    for (const r of rows) expect(r.ip_tag).not.toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  /* ───── Datenbank (RLS, direkt als App-Rolle) ───── */

  it('R1 RLS: App-Rolle ohne Kontext sieht keine privaten Datensätze und Dateien; mit fremdem Kontext keine fremden', async () => {
    await a.post('/api/sync/push', { changes: [{ store: 'journal', id: 'j-sec-1', baseVersion: 0, data: { id: 'j-sec-1', notes: 'GEHEIM-ANNA', createdAt: 't', updatedAt: 't' } }] });
    const c = new pg.Client({ connectionString: env.appUrl });
    await c.connect();
    try {
      expect((await c.query('SELECT count(*)::int AS n FROM records')).rows[0].n).toBe(0);
      expect((await c.query('SELECT count(*)::int AS n FROM files')).rows[0].n).toBe(0);
      const { rows } = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'sec_ben'");
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.user_id', $1, true)", [rows[0].id]);
      expect((await c.query("SELECT count(*)::int AS n FROM records WHERE id = 'j-sec-1'")).rows[0].n).toBe(0);
      // Einfügen unter fremder user_id scheitert an WITH CHECK
      const anna = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'sec_anna'");
      await expect(c.query("INSERT INTO records(user_id, store, id, version, seq, payload, deleted, dek_gen) VALUES ($1, 'journal', 'evil', 1, 1, '\\x00', false, 1)", [anna.rows[0].id])).rejects.toThrow();
      await c.query('ROLLBACK');
      // Chiffrat in der DB enthält den Klartext nicht
      const raw = await superQuery(env.superDbUrl, "SELECT payload FROM records WHERE id = 'j-sec-1'");
      expect(Buffer.from(raw.rows[0].payload).includes(Buffer.from('GEHEIM-ANNA'))).toBe(false);
    } finally {
      await c.end();
    }
  });

  it('R2 Laufzeitrolle hat keine Rechte auf Schema-Änderungen und keine BYPASSRLS', async () => {
    const c = new pg.Client({ connectionString: env.appUrl });
    await c.connect();
    try {
      const { rows } = await c.query('SELECT rolbypassrls, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user');
      expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false, rolcreaterole: false, rolcreatedb: false });
      await expect(c.query('ALTER TABLE records DISABLE ROW LEVEL SECURITY')).rejects.toThrow();
      await expect(c.query('DROP TABLE records')).rejects.toThrow();
    } finally {
      await c.end();
    }
  });
});

describe.skipIf(!hasDb)('Phase 5.7 Profilbild-Metadaten', () => {
  it('M1 Profilbild mit EXIF (z. B. GPS) wird serverseitig abgelehnt, ohne Metadaten angenommen (Befund F-05)', async () => {
    const env = await setup();
    try {
      const c = new Client(env.app);
      await c.register('sec_avatar');
      const soi = Buffer.from([0xff, 0xd8, 0xff]);
      const exif = Buffer.concat([soi, Buffer.from([0xe1, 0x00, 0x20]), Buffer.from('Exif\0\0', 'latin1'), Buffer.from('GPS-48.1N-11.5E'), Buffer.alloc(16)]);
      const clean = Buffer.concat([soi, Buffer.from([0xe0, 0x00, 0x10]), Buffer.from('JFIF\0', 'latin1'), Buffer.alloc(32)]);
      const bad = await c.req('PATCH', '/api/social/profile', { avatar: `data:image/jpeg;base64,${exif.toString('base64')}` });
      expect(bad.status).toBe(415);
      const ok = await c.req('PATCH', '/api/social/profile', { avatar: `data:image/jpeg;base64,${clean.toString('base64')}` });
      expect(ok.status).toBe(200);
    } finally {
      await env.close();
    }
  });
});

describe.skipIf(!hasDb)('Phase 5.7 Rotation unter Last', () => {
  it('K1 Gleichzeitige Schreibvorgänge während der Kontoschlüssel-Rotation: nichts geht verloren, alles lesbar', async () => {
    const { startUserKeyRotation, continueUserKeyRotation, finalizeUserKeyRotation } = await import('../src/rotation.js');
    const { verifyData } = await import('../src/verify.js');
    const env = await setup();
    try {
      const c = new Client(env.app);
      await c.register('sec_rot');
      const ids = Array.from({ length: 60 }, (_, i) => `r${i}`);
      await c.post('/api/sync/push', { changes: ids.map((id) => ({ store: 'journal', id, baseVersion: 0, data: { id, notes: `v1-${id}` } })) });
      const { rows } = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'sec_rot'");
      const uid = rows[0].id as string;
      await startUserKeyRotation(env.ctx, uid);
      const before = (await c.get('/api/sync/changes?since=0&limit=500')).json.changes as { id: string; version: number }[];
      const ver = new Map(before.map((x) => [x.id, x.version]));
      // Umschlüsseln und gleichzeitig ändern/neu anlegen
      const writers = Array.from({ length: 6 }, (_, w) =>
        c.post('/api/sync/push', {
          changes: [
            ...ids.slice(w * 10, w * 10 + 5).map((id) => ({ store: 'journal', id, baseVersion: ver.get(id), data: { id, notes: `v2-${id}` } })),
            { store: 'journal', id: `neu-${w}`, baseVersion: 0, data: { id: `neu-${w}`, notes: `neu-${w}` } },
          ],
        }),
      );
      const [prog, ...res] = await Promise.all([continueUserKeyRotation(env.ctx, uid, { batch: 5 }), ...writers]);
      for (const r of res) expect(r.json.results.every((x: { status: string }) => x.status === 'ok' || x.status === 'applied' || x.status === 'merged')).toBe(true);
      let p = prog;
      while (!p.done) p = await continueUserKeyRotation(env.ctx, uid, { batch: 50 });
      expect(await finalizeUserKeyRotation(env.ctx, uid)).toBe(true);
      const after = (await c.get('/api/sync/changes?since=0&limit=500')).json.changes as { id: string; data: { notes: string } }[];
      expect(after).toHaveLength(66);
      const notes = new Map(after.map((x) => [x.id, x.data.notes]));
      for (let w = 0; w < 6; w++) {
        for (const id of ids.slice(w * 10, w * 10 + 5)) expect(notes.get(id)).toBe(`v2-${id}`);
        expect(notes.get(`neu-${w}`)).toBe(`neu-${w}`);
      }
      const rep = await verifyData(env.ctx.db as never, env.ctx.keys, env.fileDir, uid);
      expect(rep.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });
});

describe.skipIf(!hasDb)('Phase 5.8 Profil-Erstanlage', () => {
  it('P1 Parallele Erstaufrufe legen das Profil genau einmal an (vorher 500 durch Wettlauf)', async () => {
    const env = await setup();
    try {
      const c = new Client(env.app);
      await c.register('sec_race');
      const res = await Promise.all([c.get('/api/social/overview'), c.get('/api/spaces'), c.get('/api/social/profile'), c.get('/api/social/overview'), c.get('/api/spaces')]);
      for (const r of res) expect(r.status).toBe(200);
    } finally {
      await env.close();
    }
  });
});
