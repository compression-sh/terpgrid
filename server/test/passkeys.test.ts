import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';
import { SoftAuthenticator, type SoftCredential } from './webauthn-authenticator.js';

const PW = 'sehr-sicheres-passwort-42';
const ORIGIN = 'https://terpgrid.test';

describe.skipIf(!hasDb)('Passkeys (WebAuthn)', () => {
  let env: TestEnv;
  const authn = new SoftAuthenticator(ORIGIN, 'terpgrid.test');
  let alice: Client;
  let aliceCred: SoftCredential;

  beforeAll(async () => {
    env = await setup();
    alice = new Client(env.app);
    await alice.register('pk_alice');
  });
  afterAll(async () => env?.close());

  async function registerPasskey(c: Client, name = 'Laptop', opts: Parameters<SoftAuthenticator['register']>[1] = {}) {
    const o = await c.post('/api/auth/passkeys/register/options');
    expect(o.status).toBe(200);
    const { cred, response } = authn.register(o.json, opts);
    const v = await c.post('/api/auth/passkeys/register/verify', { response, name });
    return { cred, v, options: o.json };
  }

  async function passkeyLogin(cred: SoftCredential, opts: Parameters<SoftAuthenticator['assert']>[2] = {}) {
    const c = new Client(env.app);
    const o = await c.post('/api/auth/passkeys/login/options');
    const r = await c.post('/api/auth/passkeys/login/verify', { flowId: o.json.flowId, response: authn.assert(cred, o.json.options.challenge, opts) });
    return { c, r, o };
  }

  it('Registrierung: Optionen verlangen User Verification und auffindbare Credentials, ohne interne IDs', async () => {
    const { cred, v, options } = await registerPasskey(alice);
    expect(v.status).toBe(200);
    aliceCred = cred;
    expect(options.rp.id).toBe('terpgrid.test');
    expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
    const { rows } = await env.ctx.db.query("SELECT id FROM users WHERE login_name = 'pk_alice'");
    expect(Buffer.from(options.user.id, 'base64url').toString('hex')).not.toContain(rows[0].id.replace(/-/g, ''));
    expect(v.json.passkeys).toHaveLength(1);
    expect(v.json.passkeys[0]).toMatchObject({ name: 'Laptop', deviceType: 'singleDevice' });
    expect(JSON.stringify(v.json)).not.toMatch(/public_?key|credential_id/i);
  });

  it('Anmeldung mit Passkey ohne Kennung, mit Session-Rotation und Zähler', async () => {
    const { r, c } = await passkeyLogin(aliceCred);
    expect(r.status).toBe(200);
    expect(r.json.user.loginName).toBe('pk_alice');
    expect(String(r.headers['set-cookie'])).toMatch(/^__Host-tg_session=/);
    expect((await c.get('/api/auth/session')).status).toBe(200);
    const { rows } = await env.ctx.db.query('SELECT counter, last_used_at FROM webauthn_credentials');
    expect(Number(rows[0].counter)).toBe(aliceCred.counter);
    expect(rows[0].last_used_at).not.toBeNull();
  });

  it('Replay: dieselbe Assertion bzw. Challenge funktioniert nur einmal', async () => {
    const c = new Client(env.app);
    const o = await c.post('/api/auth/passkeys/login/options');
    const assertion = authn.assert(aliceCred, o.json.options.challenge);
    expect((await c.post('/api/auth/passkeys/login/verify', { flowId: o.json.flowId, response: assertion })).status).toBe(200);
    expect((await c.post('/api/auth/passkeys/login/verify', { flowId: o.json.flowId, response: assertion })).status).toBe(401);
    // Alte Assertion mit neuer Challenge-Flow-ID → Challenge passt nicht
    const o2 = await c.post('/api/auth/passkeys/login/options');
    expect((await c.post('/api/auth/passkeys/login/verify', { flowId: o2.json.flowId, response: assertion })).status).toBe(401);
  });

  it('lehnt falsche Origin, falsche RP-ID, fehlende User Verification und Zähler-Rückschritt ab', async () => {
    expect((await passkeyLogin(aliceCred, { origin: 'https://evil.example' })).r.status).toBe(401);
    expect((await passkeyLogin(aliceCred, { rpID: 'evil.example' })).r.status).toBe(401);
    expect((await passkeyLogin(aliceCred, { uv: false })).r.status).toBe(401);
    expect((await passkeyLogin(aliceCred, { counter: 1 })).r.status).toBe(401);
    aliceCred.counter = 1000;
    expect((await passkeyLogin(aliceCred)).r.status).toBe(200);
  });

  it('Credential-Substitution: Assertion mit fremdem Schlüssel für Alices Credential-ID wird abgelehnt', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect((await passkeyLogin(aliceCred, { signWith: privateKey })).r.status).toBe(401);
    const unknown: SoftCredential = { id: Buffer.alloc(32, 7), privateKey, counter: 0 };
    const r = (await passkeyLogin(unknown)).r;
    expect(r.status).toBe(401);
    // Unbekannte Credential und falsche Signatur liefern dieselbe Meldung
    expect(r.json).toEqual((await passkeyLogin(aliceCred, { signWith: privateKey })).r.json);
  });

  it('Registrierung prüft Origin, RP-ID, User Verification und Challenge-Bindung an die Session', async () => {
    expect((await registerPasskey(alice, 'X', { origin: 'https://evil.example' })).v.status).toBe(400);
    expect((await registerPasskey(alice, 'X', { rpID: 'evil.example' })).v.status).toBe(400);
    expect((await registerPasskey(alice, 'X', { uv: false })).v.status).toBe(400);
    // Challenge aus Alices Session kann nicht in Bobs Session verwendet werden
    const bob = new Client(env.app);
    await bob.register('pk_bob');
    const o = await alice.post('/api/auth/passkeys/register/options');
    const { response } = authn.register(o.json);
    expect((await bob.post('/api/auth/passkeys/register/verify', { response, name: 'Fremd' })).status).toBe(400);
  });

  it('mehrere Passkeys, umbenennen und entfernen – nur mit Re-Auth und nur eigene', async () => {
    const second = await registerPasskey(alice, 'Handy');
    expect(second.v.json.passkeys).toHaveLength(2);
    const id = second.v.json.passkeys.find((p: any) => p.name === 'Handy').id;
    expect((await alice.req('PATCH', `/api/auth/passkeys/${id}`, { name: 'iPhone' })).json.passkeys.map((p: any) => p.name)).toContain('iPhone');
    // Bob kann Alices Passkey weder umbenennen noch löschen
    const bob = new Client(env.app);
    await bob.post('/api/auth/login', { login: 'pk_bob', password: PW });
    expect((await bob.req('PATCH', `/api/auth/passkeys/${id}`, { name: 'Hack' })).status).toBe(404);
    expect((await bob.req('DELETE', `/api/auth/passkeys/${id}`)).status).toBe(404);
    expect((await bob.get('/api/auth/passkeys')).json.passkeys).toHaveLength(0);
    // Ohne frische Re-Auth keine Änderungen
    await env.ctx.db.query("UPDATE sessions SET reauth_at = now() - interval '1 hour'");
    expect((await alice.post('/api/auth/passkeys/register/options')).status).toBe(403);
    expect((await alice.req('PATCH', `/api/auth/passkeys/${id}`, { name: 'Neu' })).status).toBe(403);
    expect((await alice.req('DELETE', `/api/auth/passkeys/${id}`)).status).toBe(403);
    await alice.post('/api/auth/reauth', { password: PW });
    expect((await alice.req('DELETE', `/api/auth/passkeys/${id}`)).json.passkeys).toHaveLength(1);
    expect((await passkeyLogin(second.cred)).r.status).toBe(401);
  });

  it('gesperrte Konten können sich nicht per Passkey anmelden; Passwort-Login bleibt verfügbar', async () => {
    expect((await new Client(env.app).post('/api/auth/login', { login: 'pk_alice', password: PW })).status).toBe(200);
    await env.ctx.db.query("UPDATE users SET status = 'suspended' WHERE login_name = 'pk_alice'");
    expect((await passkeyLogin(aliceCred)).r.status).toBe(403);
    await env.ctx.db.query("UPDATE users SET status = 'active' WHERE login_name = 'pk_alice'");
  });

  it('Wiederherstellung per Recovery-Code entfernt alle Passkeys', async () => {
    const c = new Client(env.app);
    const reg = await c.register('pk_recover');
    const pk = await registerPasskey(c, 'Alt');
    expect(pk.v.status).toBe(200);
    const r = await new Client(env.app).post('/api/auth/recover', { login: 'pk_recover', recoveryCode: reg.recoveryCodes[0], newPassword: 'ganz-neues-passwort-55' });
    expect(r.json.passkeysRemoved).toBe(true);
    expect((await passkeyLogin(pk.cred)).r.status).toBe(401);
  });

  it('Passkey-Login verlangt den Pre-Auth-Header und die richtige Origin', async () => {
    const evil = new Client(env.app, 'https://evil.example');
    expect((await evil.post('/api/auth/passkeys/login/options')).status).toBe(403);
  });
});
