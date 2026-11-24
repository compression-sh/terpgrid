import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';

const PW = 'sehr-sicheres-passwort-42';

describe.skipIf(!hasDb)('Authentifizierung (echte PostgreSQL-DB)', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  it('registriert mit Benutzername, setzt __Host-Cookie und liefert 10 Recovery-Codes', async () => {
    const c = new Client(env.app);
    const r = await c.post('/api/auth/register', { mode: 'username', username: 'Alice_1', password: PW, ageConfirmed: true });
    expect(r.status).toBe(201);
    expect(r.json.user.loginName).toBe('alice_1');
    expect(r.json.recoveryCodes).toHaveLength(10);
    expect(r.json.recoveryCodes[0]).toMatch(/^[0-9a-z]{4}(-[0-9a-z]{4}){3}$/);
    const set = String(r.headers['set-cookie']);
    expect(set).toMatch(/^__Host-tg_session=/);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/SameSite=Strict/);
    expect(set).toMatch(/Path=\//);
    expect(r.json).not.toHaveProperty('user.passwordHash');
    const s = await c.get('/api/auth/session');
    expect(s.status).toBe(200);
    expect(s.json.user.loginName).toBe('alice_1');
  });

  it('liefert einen stabilen, kontospezifischen accountKey ohne interne ID', async () => {
    const a = new Client(env.app);
    const l1 = await a.post('/api/auth/login', { login: 'alice_1', password: PW });
    const s = await a.get('/api/auth/session');
    expect(l1.json.user.accountKey).toMatch(/^[a-f0-9]{24}$/);
    expect(s.json.user.accountKey).toBe(l1.json.user.accountKey);
    const { rows } = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'alice_1'");
    expect(JSON.stringify(s.json)).not.toContain(rows[0].id);
    const other = await new Client(env.app).post('/api/auth/register', { mode: 'generated', password: PW, ageConfirmed: true });
    expect(other.json.user.accountKey).not.toBe(l1.json.user.accountKey);
  });

  it('setzt Sicherheits-Header auf API-Antworten', async () => {
    const r = await new Client(env.app).get('/api/auth/config');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('speichert kein Klartext-Passwort, sondern Argon2id; Recovery-Codes nur als HMAC', async () => {
    const { rows } = await env.ctx.db.query("SELECT password_hash FROM users WHERE login_name = 'alice_1'");
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(rows[0].password_hash).not.toContain(PW);
    const rc = await env.ctx.db.query("SELECT code_hash FROM recovery_codes r JOIN users u ON u.id = r.user_id WHERE u.login_name = 'alice_1'");
    expect(rc.rows).toHaveLength(10);
    for (const r of rc.rows) expect(r.code_hash.length).toBe(32);
  });

  it('registriert mit generierter Konto-ID und optionalem Anzeigenamen', async () => {
    const c = new Client(env.app);
    const r = await c.post('/api/auth/register', { mode: 'generated', displayName: 'Grüner Daumen', password: PW, ageConfirmed: true });
    expect(r.status).toBe(201);
    expect(r.json.user.loginName).toMatch(/^tg-[0-9a-z]{5}(-[0-9a-z]{5}){3}$/);
    expect(r.json.user.displayName).toBe('Grüner Daumen');
    expect(r.json.user.loginKind).toBe('generated');
  });

  it('lehnt doppelte Benutzernamen (auch andere Schreibweise) ab', async () => {
    const r = await new Client(env.app).post('/api/auth/register', { mode: 'username', username: 'ALICE_1', password: PW, ageConfirmed: true });
    expect(r.status).toBe(409);
  });

  it('lehnt schwache Passwörter, fehlende Altersbestätigung und reservierte Namen ab', async () => {
    const c = new Client(env.app);
    expect((await c.post('/api/auth/register', { mode: 'username', username: 'bob', password: 'kurz', ageConfirmed: true })).status).toBe(400);
    expect((await c.post('/api/auth/register', { mode: 'username', username: 'bob', password: 'password1234', ageConfirmed: true })).status).toBe(400);
    expect((await c.post('/api/auth/register', { mode: 'username', username: 'bob', password: 'bob-bob-bob-bob', ageConfirmed: true })).status).toBe(400);
    expect((await c.post('/api/auth/register', { mode: 'username', username: 'bob', password: PW, ageConfirmed: false })).status).toBe(400);
    expect((await c.post('/api/auth/register', { mode: 'username', username: 'admin', password: PW, ageConfirmed: true })).status).toBe(400);
    expect((await c.post('/api/auth/register', { mode: 'username', username: 'tg-abc', password: PW, ageConfirmed: true })).status).toBe(400);
    // Zusätzliche Felder (z. B. role, email) werden abgelehnt
    expect((await c.post('/api/auth/register', { mode: 'username', username: 'bob', password: PW, ageConfirmed: true, role: 'admin' })).status).toBe(400);
  });

  it('meldet sich an und ab; Session ist danach serverseitig ungültig', async () => {
    const c = new Client(env.app);
    const r = await c.post('/api/auth/login', { login: 'Alice_1', password: PW });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('ok');
    const oldCookie = c.cookie;
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    // Altes Cookie erneut verwenden → abgelehnt
    const replay = new Client(env.app);
    replay.cookie = oldCookie;
    expect((await replay.get('/api/auth/session')).status).toBe(401);
  });

  it('liefert für falsches Passwort und unbekanntes Konto dieselbe Antwort', async () => {
    const a = await new Client(env.app).post('/api/auth/login', { login: 'alice_1', password: 'falsches-passwort-123' });
    const b = await new Client(env.app).post('/api/auth/login', { login: 'gibtesnicht', password: 'falsches-passwort-123' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json).toEqual(b.json);
  });

  it('bremst wiederholte Fehlversuche je Konto (progressives Backoff) ohne dauerhafte Sperre', async () => {
    await new Client(env.app).register('carol');
    const c = new Client(env.app);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await c.post('/api/auth/login', { login: 'carol', password: `falsch-falsch-${i}` })).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses).toContain(429);
    const t = await c.post('/api/auth/login', { login: 'carol', password: PW });
    expect(t.status).toBe(429);
    expect(Number(t.headers['retry-after'])).toBeGreaterThan(0);
    // Nach Ablauf (hier: Zustand zurückgesetzt) funktioniert das richtige Passwort wieder
    env.ctx.limits.loginAccount = new (env.ctx.limits.loginAccount.constructor as any)(5);
    expect((await c.post('/api/auth/login', { login: 'carol', password: PW })).status).toBe(200);
  });

  it('Fehlversuche von einer IP sperren das Konto nicht für andere IPs (kein Aussperren durch Angreifer)', async () => {
    await new Client(env.app).register('opfer_dos');
    const attacker = new Client(env.app);
    attacker.ip = '10.66.0.1';
    const st: number[] = [];
    for (let i = 0; i < 8; i++) st.push((await attacker.post('/api/auth/login', { login: 'opfer_dos', password: `falsch-falsch-${i}` })).status);
    expect(st).toContain(429);
    const victim = new Client(env.app);
    victim.ip = '10.66.0.2';
    expect((await victim.post('/api/auth/login', { login: 'opfer_dos', password: PW })).status).toBe(200);
  });

  it('bremst verteilte Angriffe über viele IPs kontoweit', async () => {
    await new Client(env.app).register('opfer_verteilt');
    let blocked = false;
    for (let i = 0; i < 60 && !blocked; i++) {
      const c = new Client(env.app);
      c.ip = `10.77.${Math.floor(i / 200)}.${(i % 200) + 1}`;
      blocked = (await c.post('/api/auth/login', { login: 'opfer_verteilt', password: `falsch-falsch-${i}` })).status === 429;
    }
    expect(blocked).toBe(true);
  });

  it('erzwingt Origin-Prüfung, Pre-Auth-Header und CSRF-Token', async () => {
    const evil = new Client(env.app, 'https://evil.example');
    expect((await evil.post('/api/auth/login', { login: 'alice_1', password: PW })).status).toBe(403);
    const noHeader = await env.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'alice_1', password: PW } });
    expect(noHeader.statusCode).toBe(403);
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'alice_1', password: PW });
    const csrf = c.csrf;
    c.csrf = '';
    expect((await c.post('/api/auth/sessions/revoke-others')).status).toBe(403);
    c.csrf = 'falsch';
    expect((await c.post('/api/auth/sessions/revoke-others')).status).toBe(403);
    c.csrf = csrf;
    expect((await c.post('/api/auth/sessions/revoke-others')).status).toBe(200);
  });

  it('rotiert die Session beim Login (neues Token, altes ungültig)', async () => {
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'alice_1', password: PW });
    const first = c.cookie;
    await c.post('/api/auth/login', { login: 'alice_1', password: PW });
    expect(c.cookie).not.toBe(first);
    const old = new Client(env.app);
    old.cookie = first;
    expect((await old.get('/api/auth/session')).status).toBe(401);
  });

  it('beendet Sessions nach Idle- und absolutem Timeout', async () => {
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'alice_1', password: PW });
    const s = await c.get('/api/auth/session');
    await env.ctx.db.query("UPDATE sessions SET last_seen_at = now() - interval '4 days' WHERE encode(substring(id from 1 for 8), 'hex') = $1", [s.json.session.handle]);
    expect((await c.get('/api/auth/session')).status).toBe(401);
    const d = new Client(env.app);
    await d.post('/api/auth/login', { login: 'alice_1', password: PW });
    const s2 = await d.get('/api/auth/session');
    await env.ctx.db.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE encode(substring(id from 1 for 8), 'hex') = $1", [s2.json.session.handle]);
    expect((await d.get('/api/auth/session')).status).toBe(401);
  });

  it('listet Sessions und widerruft einzelne / alle anderen; fremde Sessions sind nicht widerrufbar', async () => {
    const a1 = new Client(env.app);
    const a2 = new Client(env.app);
    await a1.post('/api/auth/login', { login: 'alice_1', password: PW });
    await a2.post('/api/auth/login', { login: 'alice_1', password: PW });
    const list = await a1.get('/api/auth/sessions');
    expect(list.json.sessions.length).toBeGreaterThanOrEqual(2);
    const other = list.json.sessions.find((x: any) => !x.current);
    expect(JSON.stringify(list.json)).not.toMatch(/csrf/i);
    // Carol versucht, Alices Session zu widerrufen
    const carol = new Client(env.app);
    await carol.post('/api/auth/login', { login: 'carol', password: PW });
    expect((await carol.req('DELETE', `/api/auth/sessions/${other.handle}`)).status).toBe(404);
    expect((await a1.req('DELETE', `/api/auth/sessions/${other.handle}`)).status).toBe(200);
    await a1.post('/api/auth/sessions/revoke-others');
    expect((await a2.get('/api/auth/session')).status).toBe(401);
    expect((await a1.get('/api/auth/session')).status).toBe(200);
  });

  it('Passwortänderung erfordert das aktuelle Passwort und beendet andere Sessions', async () => {
    await new Client(env.app).register('dave');
    const d1 = new Client(env.app);
    const d2 = new Client(env.app);
    await d1.post('/api/auth/login', { login: 'dave', password: PW });
    await d2.post('/api/auth/login', { login: 'dave', password: PW });
    expect((await d1.post('/api/auth/password', { currentPassword: 'falsch-falsch-1', newPassword: 'ganz-neues-passwort-7' })).status).toBe(401);
    expect((await d1.post('/api/auth/password', { currentPassword: PW, newPassword: 'ganz-neues-passwort-7' })).status).toBe(200);
    expect((await d2.get('/api/auth/session')).status).toBe(401);
    expect((await d1.get('/api/auth/session')).status).toBe(200);
    expect((await new Client(env.app).post('/api/auth/login', { login: 'dave', password: PW })).status).toBe(401);
    expect((await new Client(env.app).post('/api/auth/login', { login: 'dave', password: 'ganz-neues-passwort-7' })).status).toBe(200);
  });

  it('Recovery: Code setzt Passwort zurück, beendet Sessions, ist nicht wiederverwendbar', async () => {
    const reg = await new Client(env.app).register('erin');
    const e1 = new Client(env.app);
    await e1.post('/api/auth/login', { login: 'erin', password: PW });
    const code = reg.recoveryCodes[3]!;
    const r = await new Client(env.app).post('/api/auth/recover', { login: 'erin', recoveryCode: code.toUpperCase(), newPassword: 'wiederhergestellt-123' });
    expect(r.status).toBe(200);
    expect(r.json.remainingRecoveryCodes).toBe(9);
    expect((await e1.get('/api/auth/session')).status).toBe(401);
    const again = await new Client(env.app).post('/api/auth/recover', { login: 'erin', recoveryCode: code, newPassword: 'nochmal-anders-456' });
    expect(again.status).toBe(401);
    const unknown = await new Client(env.app).post('/api/auth/recover', { login: 'niemand', recoveryCode: code, newPassword: 'nochmal-anders-456' });
    expect(unknown.status).toBe(401);
    expect(unknown.json).toEqual(again.json);
    expect((await new Client(env.app).post('/api/auth/login', { login: 'erin', password: 'wiederhergestellt-123' })).status).toBe(200);
  });

  it('sensible Aktionen erfordern Re-Authentifizierung', async () => {
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'alice_1', password: PW });
    // Re-Auth-Zeitpunkt künstlich ablaufen lassen
    await env.ctx.db.query("UPDATE sessions SET reauth_at = now() - interval '1 hour'");
    const r = await c.post('/api/auth/recovery-codes');
    expect(r.status).toBe(403);
    expect(r.json.reauthRequired).toBe(true);
    expect((await c.post('/api/auth/totp/setup')).status).toBe(403);
    expect((await c.req('DELETE', '/api/account', { confirm: 'alice_1' })).status).toBe(403);
    expect((await c.post('/api/auth/reauth', { password: 'falsch-falsch-9' })).status).toBe(401);
    expect((await c.post('/api/auth/reauth', { password: PW })).status).toBe(200);
    const codes = await c.post('/api/auth/recovery-codes');
    expect(codes.status).toBe(200);
    expect(codes.json.recoveryCodes).toHaveLength(10);
  });

  it('nicht angemeldete Anfragen an geschützte Endpunkte werden abgelehnt', async () => {
    const c = new Client(env.app);
    for (const [m, u] of [
      ['GET', '/api/auth/sessions'],
      ['POST', '/api/auth/password'],
      ['POST', '/api/auth/totp/setup'],
      ['GET', '/api/sync/changes'],
      ['GET', '/api/files'],
      ['GET', '/api/account/export'],
      ['GET', '/api/admin/overview'],
      ['GET', '/api/catalog/strainapi/strains'],
    ] as const) {
      const r = await c.req(m, u, m === 'POST' ? {} : undefined);
      expect([401, 400], `${m} ${u}`).toContain(r.status);
      expect(r.status === 401 || u === '/api/auth/password').toBe(true);
    }
  });

  it('TOTP: Einrichtung, Login mit zweitem Faktor, Replay-Schutz, Deaktivierung', async () => {
    await new Client(env.app).register('frank');
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'frank', password: PW });
    const setupRes = await c.post('/api/auth/totp/setup');
    expect(setupRes.status).toBe(200);
    expect(setupRes.json.qrSvg).toContain('<svg');
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setupRes.json.secret), digits: 6, period: 30 });
    const { rows } = await env.ctx.db.query("SELECT totp_secret FROM users WHERE login_name = 'frank'");
    expect(rows[0].totp_secret.includes(Buffer.from(OTPAuth.Secret.fromBase32(setupRes.json.secret).buffer))).toBe(false);
    expect((await c.post('/api/auth/totp/enable', { code: '000000' })).status).toBe(400);
    const code1 = totp.generate();
    expect((await c.post('/api/auth/totp/enable', { code: code1 })).status).toBe(200);

    const l = new Client(env.app);
    const step1 = await l.post('/api/auth/login', { login: 'frank', password: PW });
    expect(step1.json.status).toBe('mfa');
    expect(l.cookie).toBe('');
    // Derselbe Code wurde bereits verwendet → Replay abgelehnt
    expect((await l.post('/api/auth/login/mfa', { mfaToken: step1.json.mfaToken, code: code1 })).status).toBe(401);
    // Nächster Zeitschritt
    const next = totp.generate({ timestamp: Date.now() + 30_000 });
    const ok = await l.post('/api/auth/login/mfa', { mfaToken: step1.json.mfaToken, code: next });
    expect(ok.status).toBe(200);
    expect((await l.get('/api/auth/session')).json.user.totpEnabled).toBe(true);
    // Reauth verlangt jetzt auch TOTP
    await env.ctx.db.query("UPDATE sessions SET reauth_at = NULL");
    const re = await l.post('/api/auth/reauth', { password: PW });
    expect(re.status).toBe(401);
    expect(re.json.totpRequired).toBe(true);
    // Zeitablauf simulieren: letzter verwendeter Zeitschritt liegt in der Vergangenheit
    await env.ctx.db.query("UPDATE users SET totp_last_step = totp_last_step - 10 WHERE login_name = 'frank'");
    expect((await l.post('/api/auth/reauth', { password: PW, code: totp.generate() })).status).toBe(200);
    expect((await l.post('/api/auth/totp/disable')).status).toBe(200);
    expect((await new Client(env.app).post('/api/auth/login', { login: 'frank', password: PW })).json.status).toBe('ok');
  });

  it('begrenzt MFA-Versuche je Anmeldevorgang', async () => {
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'frank', password: PW });
    const s = await c.post('/api/auth/totp/setup');
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(s.json.secret) });
    expect((await c.post('/api/auth/totp/enable', { code: totp.generate() })).status).toBe(200);
    const l = new Client(env.app);
    const st = await l.post('/api/auth/login', { login: 'frank', password: PW });
    for (let i = 0; i < 5; i++) await l.post('/api/auth/login/mfa', { mfaToken: st.json.mfaToken, code: '123456' });
    const final = await l.post('/api/auth/login/mfa', { mfaToken: st.json.mfaToken, code: totp.generate({ timestamp: Date.now() + 30_000 }) });
    expect(final.status).toBe(401);
  });

  it('begrenzt falsche 2FA-Codes kontoweit über mehrere Anmeldevorgänge hinweg', async () => {
    await new Client(env.app).register('mfa_brute');
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'mfa_brute', password: PW });
    const s = await c.post('/api/auth/totp/setup');
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(s.json.secret) });
    expect((await c.post('/api/auth/totp/enable', { code: totp.generate() })).status).toBe(200);
    const statuses: number[] = [];
    // Je Anmeldevorgang höchstens 2 Versuche – ein Angreifer startet einfach neue Vorgänge
    for (let round = 0; round < 4; round++) {
      const l = new Client(env.app);
      const st = await l.post('/api/auth/login', { login: 'mfa_brute', password: PW });
      for (let i = 0; i < 2; i++) statuses.push((await l.post('/api/auth/login/mfa', { mfaToken: st.json.mfaToken, code: '000000' })).status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toContain(429);
  });

  it('Kontolöschung entfernt Konto und Sessions endgültig', async () => {
    await new Client(env.app).register('gina');
    const c = new Client(env.app);
    await c.post('/api/auth/login', { login: 'gina', password: PW });
    expect((await c.req('DELETE', '/api/account', { confirm: 'falsch' })).status).toBe(400);
    expect((await c.req('DELETE', '/api/account', { confirm: 'gina' })).status).toBe(200);
    const { rowCount } = await env.ctx.db.query("SELECT 1 FROM users WHERE login_name = 'gina'");
    expect(rowCount).toBe(0);
    expect((await new Client(env.app).post('/api/auth/login', { login: 'gina', password: PW })).status).toBe(401);
  });

  it('protokolliert keine Passwörter oder Codes im Audit-Log', async () => {
    const { rows } = await env.ctx.db.query('SELECT type, meta::text AS meta, ip_tag FROM audit_events');
    const all = JSON.stringify(rows);
    expect(all).not.toContain(PW);
    expect(all).not.toContain('wiederhergestellt');
    expect(all).not.toMatch(/127\.0\.0\.1/);
    expect(rows.some((r) => r.type === 'login.failure')).toBe(true);
  });
});

describe.skipIf(!hasDb)('Einladungen (invite-only)', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setup({ INVITE_ONLY: 'true' });
  });
  afterAll(async () => env?.close());

  it('verweigert Registrierung ohne Einladung', async () => {
    const r = await new Client(env.app).post('/api/auth/register', { mode: 'username', username: 'heidi', password: PW, ageConfirmed: true });
    expect(r.status).toBe(403);
    expect((await new Client(env.app).get('/api/auth/username-available?name=heidi')).status).toBe(403);
  });

  it('Admin erzeugt Einladung; einmalig nutzbar; widerrufbar; abgelaufen ungültig', async () => {
    // Erstes Konto über eine direkt in der DB erzeugte Einladung (entspricht `cli invite`)
    const { hmac } = await import('../src/crypto.js');
    const { randomUUID } = await import('node:crypto');
    await env.ctx.db.query("INSERT INTO invitations(id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')", [randomUUID(), hmac(env.ctx.macKeys.invite, 'boot-token-boot-token')]);
    const admin = new Client(env.app);
    await admin.register('root_user', PW, { invite: 'boot-token-boot-token' });
    await env.ctx.db.query("UPDATE users SET role = 'admin' WHERE login_name = 'root_user'");
    await admin.post('/api/auth/login', { login: 'root_user', password: PW });

    const normal = new Client(env.app);
    const inv0 = await admin.post('/api/admin/invites', { days: 3 });
    expect(inv0.status).toBe(200);
    await normal.register('ivan', PW, { invite: inv0.json.token });
    // Normaler Benutzer darf keine Einladungen erstellen
    expect((await normal.post('/api/admin/invites', { days: 3 })).status).toBe(403);
    expect((await normal.get('/api/admin/users')).status).toBe(403);
    // Einladung bereits verwendet
    expect((await new Client(env.app).post('/api/auth/register', { mode: 'username', username: 'judy', password: PW, ageConfirmed: true, invite: inv0.json.token })).status).toBe(403);
    // Widerruf
    const inv1 = await admin.post('/api/admin/invites', {});
    expect((await admin.req('DELETE', `/api/admin/invites/${inv1.json.id}`)).status).toBe(200);
    expect((await new Client(env.app).get(`/api/auth/invite/${inv1.json.token}`)).json.valid).toBe(false);
    // Ablauf
    const inv2 = await admin.post('/api/admin/invites', {});
    await env.ctx.db.query("UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [inv2.json.id]);
    expect((await new Client(env.app).post('/api/auth/register', { mode: 'username', username: 'judy', password: PW, ageConfirmed: true, invite: inv2.json.token })).status).toBe(403);
    // Token liegt nur gehasht in der DB
    const { rows } = await env.ctx.db.query('SELECT token_hash FROM invitations');
    expect(JSON.stringify(rows)).not.toContain(inv0.json.token);
  });

  it('das letzte Administrationskonto kann sich nicht selbst löschen oder sperren', async () => {
    const admin = new Client(env.app);
    await admin.post('/api/auth/login', { login: 'root_user', password: PW });
    expect((await admin.req('DELETE', '/api/account', { confirm: 'root_user' })).status).toBe(409);
    const users = await admin.get('/api/admin/users');
    const self = users.json.users.find((u: any) => u.login_name === 'root_user');
    expect((await admin.post(`/api/admin/users/${self.id}/status`, { status: 'suspended' })).status).toBe(409);
  });

  it('Admin sieht nur Metadaten, keine Inhalte; Sperre beendet Sessions', async () => {
    const admin = new Client(env.app);
    await admin.post('/api/auth/login', { login: 'root_user', password: PW });
    const ivan = new Client(env.app);
    await ivan.post('/api/auth/login', { login: 'ivan', password: PW });
    await ivan.post('/api/sync/push', { changes: [{ store: 'journal', id: 'j1', baseVersion: 0, data: { id: 'j1', notes: 'GEHEIMER-INHALT' } }] });
    const users = await admin.get('/api/admin/users');
    const ov = await admin.get('/api/admin/overview');
    expect(JSON.stringify(users.json) + JSON.stringify(ov.json)).not.toContain('GEHEIMER-INHALT');
    expect(JSON.stringify(users.json)).not.toMatch(/argon2|password_hash|dek/);
    const ivanId = users.json.users.find((u: any) => u.login_name === 'ivan').id;
    expect((await admin.post(`/api/admin/users/${ivanId}/status`, { status: 'suspended' })).status).toBe(200);
    expect((await ivan.get('/api/auth/session')).status).toBe(401);
    expect((await new Client(env.app).post('/api/auth/login', { login: 'ivan', password: PW })).status).toBe(403);
  });
});

describe.skipIf(!hasDb)('IP-Ratenbegrenzung', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setup({}, { strictLimits: true });
  });
  afterAll(async () => env?.close());

  it('begrenzt Registrierungen je IP (5/Std.)', async () => {
    const st: number[] = [];
    for (let i = 0; i < 6; i++) st.push((await new Client(env.app).post('/api/auth/register', { mode: 'generated', password: PW, ageConfirmed: true })).status);
    expect(st.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(st[5]).toBe(429);
  });

  it('begrenzt Login-Versuche je IP über viele Konten (30/15 Min.)', async () => {
    const st: number[] = [];
    for (let i = 0; i < 31; i++) st.push((await new Client(env.app).post('/api/auth/login', { login: `konto${i}`, password: 'falsch-falsch-1' })).status);
    expect(st.filter((s) => s === 401)).toHaveLength(30);
    expect(st[30]).toBe(429);
  });

  it('begrenzt Recovery-Versuche je Konto', async () => {
    const st: number[] = [];
    for (let i = 0; i < 5; i++) st.push((await new Client(env.app).post('/api/auth/recover', { login: 'opfer', recoveryCode: 'aaaa-bbbb-cccc-dddd', newPassword: 'neues-passwort-999' })).status);
    expect(st.slice(0, 3)).toEqual([401, 401, 401]);
    expect(st).toContain(429);
  });
});

describe.skipIf(!hasDb)('Schema-Schutz und System Health', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  it('erkennt passende, neuere und ausstehende Schemastände', async () => {
    const { schemaStatus, assertSchemaCompatible } = await import('../src/migrate.js');
    const ok = await schemaStatus(env.ctx.db);
    expect(ok.pending).toEqual([]);
    expect(() => assertSchemaCompatible(ok)).not.toThrow();
    expect(() => assertSchemaCompatible({ ...ok, unknown: ['999_zukunft.sql'] })).toThrow(/neuer als diese TERPGRID-Version/);
    expect(() => assertSchemaCompatible({ ...ok, pending: ['005_neu.sql'] })).toThrow(/Ausstehende/);
  });

  it('System Health nur für Admins, ohne personenbezogene Daten', async () => {
    const u = new Client(env.app);
    await u.register('health_user');
    expect((await u.get('/api/admin/system')).status).toBe(403);
    await env.ctx.db.query("UPDATE users SET role = 'admin' WHERE login_name = 'health_user'");
    await u.post('/api/auth/login', { login: 'health_user', password: PW });
    const r = await u.get('/api/admin/system');
    expect(r.status).toBe(200);
    expect(r.json.db.ok).toBe(true);
    expect(r.json.http.requestsTotal).toBeGreaterThan(0);
    expect(r.json.schema.pending).toEqual([]);
    expect(JSON.stringify(r.json)).not.toMatch(/health_user|127\.0\.0\.1|login|password/);
  });
});
