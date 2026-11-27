import { afterEach, describe, expect, it } from 'vitest';
import { api, ApiError, setApiFetch } from './api';

const respond = (body: BodyInit | null, status = 200) => setApiFetch(async () => new Response(body, { status }));

afterEach(() => setApiFetch((...a) => fetch(...a)));

describe('api()', () => {
  it('liefert JSON erfolgreicher Antworten', async () => {
    respond(JSON.stringify({ user: { id: 'u1' } }));
    await expect(api('GET', '/api/auth/session')).resolves.toEqual({ user: { id: 'u1' } });
  });

  it('liefert null bei leerer bzw. Nicht-JSON-Antwort (Erkennung „kein TERPGRID-Server“)', async () => {
    respond(null, 204);
    await expect(api('POST', '/api/x')).resolves.toBeNull();
    respond('<!doctype html><title>x</title>');
    await expect(api('GET', '/api/auth/config')).resolves.toBeNull();
  });

  it('wirft einen Verbindungsfehler, wenn das Lesen einer 200-Antwort abbricht (statt still null)', async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"user":'));
        c.error(new TypeError('NetworkError when attempting to fetch resource.'));
      },
    });
    respond(body);
    const err = await api('GET', '/api/auth/session').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });

  it('übernimmt Fehlermeldung und Zusatzfelder bei Fehlerstatus', async () => {
    respond(JSON.stringify({ error: 'Nein', reauthRequired: true }), 403);
    const err = (await api('GET', '/api/x').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(403);
    expect(err.message).toBe('Nein');
    expect(err.reauthRequired).toBe(true);
  });
});
