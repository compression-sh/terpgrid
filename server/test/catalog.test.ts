import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type TestEnv, hasDb, setup } from './helpers.js';

describe.skipIf(!hasDb)('Katalog-Proxy', () => {
  let env: TestEnv;
  let c: Client;
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('fake.jpg')) return new Response('<svg onload=alert(1)>', { headers: { 'content-type': 'image/jpeg' } });
    if (url.includes('/wp-content/uploads/')) return new Response(Buffer.from([0xff, 0xd8, 0xff, 0x00]), { headers: { 'content-type': 'image/jpeg' } });
    if (url.includes('script')) return new Response('<!DOCTYPE html><html>WAF</html>', { status: 403, headers: { 'content-type': 'text/html' } });
    if (url.includes('evil')) return new Response('<html>', { headers: { 'content-type': 'text/html' } });
    return new Response(JSON.stringify({ data: [{ slug: 'og-kush' }] }), { headers: { 'content-type': 'application/json', 'x-wp-total': '1', 'set-cookie': 'tracking=1' } });
  }) as unknown as typeof fetch;

  beforeAll(async () => {
    env = await setup({}, { fetchImpl: fakeFetch });
    c = new Client(env.app);
    await c.register('kat_user');
  });
  afterAll(async () => env?.close());

  it('erfordert Anmeldung', async () => {
    expect((await new Client(env.app).get('/api/catalog/strainapi/strains')).status).toBe(401);
  });

  it('leitet nur an feste Ziele weiter, ohne Cookies/Benutzerdaten, mit Cache', async () => {
    const r = await c.get('/api/catalog/strainapi/search?q=og%20kush&page=2&per_page=500');
    expect(r.status).toBe(200);
    expect(r.headers['x-wp-total']).toBe('1');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(calls.at(-1)!.url).toBe('https://www.strainapi.com/wp-json/strainapi/v1/search?q=og%20kush&page=2&per_page=24');
    const headers = calls.at(-1)!.init.headers as Record<string, string>;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('cookie');
    expect(JSON.stringify(headers)).not.toContain('kat_user');
    expect(calls.at(-1)!.init.redirect).toBe('error');
    const n = calls.length;
    await c.get('/api/catalog/strainapi/search?q=og%20kush&page=2&per_page=500');
    expect(calls.length).toBe(n);
  });

  it('verhindert SSRF über Slugs und Bild-URLs', async () => {
    const n = calls.length;
    for (const slug of ['..%2F..%2Fadmin', 'a%3Fx%3D1', 'A_B', '%2F%2Fevil.example']) expect((await c.get(`/api/catalog/strainapi/strains/${slug}`)).status).toBe(400);
    for (const u of [
      'http://www.strainapi.com/wp-content/uploads/a.jpg',
      'https://evil.example/wp-content/uploads/a.jpg',
      'https://www.strainapi.com.evil.example/wp-content/uploads/a.jpg',
      'https://www.strainapi.com/wp-json/strainapi/v1/strains',
      'https://www.strainapi.com/wp-content/uploads/../../etc/passwd.jpg',
      'https://www.strainapi.com/wp-content/uploads/a.jpg?x=1',
      'https://user:pw@www.strainapi.com/wp-content/uploads/a.jpg',
      'https://www.strainapi.com:8443/wp-content/uploads/a.jpg',
      'https://169.254.169.254/latest/meta-data',
      'file:///etc/passwd',
    ]) expect((await c.get(`/api/catalog/image?u=${encodeURIComponent(u)}`)).status, u).toBe(400);
    expect(calls.length).toBe(n);
    const ok = await c.get(`/api/catalog/image?u=${encodeURIComponent('https://www.strainapi.com/wp-content/uploads/2024/05/og-kush.jpg')}`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('image/jpeg');
    expect(calls.at(-1)!.url).toBe('https://www.strainapi.com/wp-content/uploads/2024/05/og-kush.jpg');
  });

  it('liefert keine als Bild getarnten Nicht-Bilder aus (Magic Bytes)', async () => {
    const r = await c.get(`/api/catalog/image?u=${encodeURIComponent('https://www.strainapi.com/wp-content/uploads/fake.jpg')}`);
    expect(r.status).toBe(502);
  });

  it('schwärzt Einladungs-Token in Log-URLs', async () => {
    const { redactUrl } = await import('../src/app.js');
    expect(redactUrl('/api/auth/invite/abcDEF123_-xyz?x=1')).toBe('/api/auth/invite/[geschwärzt]');
    expect(redactUrl('/api/sync/changes?since=5')).toBe('/api/sync/changes');
  });

  it('teilt das CannaLib-Kontingent instanzweit', async () => {
    let last = 0;
    for (let i = 0; i < 19; i++) last = (await c.get(`/api/catalog/cannalib/v1/catalogs/strains?q=sorte${i}`)).status;
    expect(last).toBe(429);
  });

  it('übersetzt Ablehnungen der Quelle (z. B. Firewall 403 mit HTML) in eigenes JSON ohne Fremdinhalt', async () => {
    const r = await c.get(`/api/catalog/strainapi/search?q=${encodeURIComponent('"><script>')}`);
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.json.error).toMatch(/abgelehnt/);
    expect(Buffer.from(r.raw).toString()).not.toContain('<html');
  });

  it('lässt sich per Konfiguration abschalten', async () => {
    env.ctx.config.catalogEnabled = false;
    expect((await c.get('/api/catalog/strainapi/strains')).status).toBe(404);
    env.ctx.config.catalogEnabled = true;
  });
});
