import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const key = Buffer.alloc(32, 7).toString('base64');
const base = { PUBLIC_ORIGIN: 'https://tg.example', DATABASE_URL: 'postgres://terpgrid_app@db:5432/terpgrid', MASTER_KEYS: `1:${key}`, HMAC_SECRET: key };

describe('Konfiguration', () => {
  it('liest Secrets aus Dateien und setzt das DB-Passwort URL-sicher ein', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-cfg-'));
    writeFileSync(join(dir, 'pw'), 'p@ss/wort:#1\n');
    writeFileSync(join(dir, 'keys'), `1:${key}\n`);
    const c = loadConfig({ ...base, MASTER_KEYS: undefined, MASTER_KEYS_FILE: join(dir, 'keys'), DATABASE_PASSWORD_FILE: join(dir, 'pw'), NODE_ENV: 'production' });
    expect(decodeURIComponent(new URL(c.databaseUrl).password)).toBe('p@ss/wort:#1');
    expect(c.masterKeys.get(1)?.length).toBe(32);
  });

  it('erzwingt in Produktion HTTPS und sichere Cookies', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://tg.example' })).toThrow(/HTTPS/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', COOKIE_INSECURE_DEV: 'true' })).toThrow(/HTTPS/);
  });

  it('lehnt fehlende/zu schwache Secrets und unsichere Argon2-Parameter ab', () => {
    expect(() => loadConfig({ ...base, HMAC_SECRET: Buffer.alloc(8).toString('base64') })).toThrow(/32 Byte/);
    expect(() => loadConfig({ ...base, MASTER_KEYS: undefined })).toThrow(/MASTER_KEYS/);
    expect(() => loadConfig({ ...base, ARGON2_MEMORY_KIB: '4096' })).toThrow(/ARGON2_MEMORY_KIB/);
    expect(() => loadConfig({ ...base, MASTER_KEY_CURRENT: '2' })).toThrow(/Schlüsselring/);
  });

  it('ist standardmäßig invite-only', () => {
    expect(loadConfig(base).inviteOnly).toBe(true);
  });
});
