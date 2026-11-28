import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, errorCode } from '../src/error-codes.js';

/** Alle Quelltexte des Servers (ohne Tests). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('Fehlercodes (6.1)', () => {
  const src = sources(join(__dirname, '../src')).map((p) => readFileSync(p, 'utf8')).join('\n');
  const literal = (re: RegExp) => [...src.matchAll(re)].map((m) => m[1]!.replace(/\\'/g, "'"));
  const messages = new Set([
    ...literal(/HttpError\(\s*\d+\s*,\s*'((?:[^'\\]|\\.)*)'/g),
    ...literal(/error:\s*'((?:[^'\\]|\\.)*)'/g),
    ...literal(/throttle\([^,()]*,\s*'((?:[^'\\]|\\.)*)'/g),
    ...literal(/message = '((?:[^'\\]|\\.)*)'/g),
  ]);

  it('jede feste Fehlermeldung hat einen Code', () => {
    const missing = [...messages].filter((m) => !ERROR_CODES[m]);
    expect(missing).toEqual([]);
  });

  it('Codes sind eindeutig und stabil formatiert', () => {
    const codes = Object.values(ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[a-z0-9_]{3,48}$/);
  });

  it('errorCode liefert Codes nur für bekannte Meldungen', () => {
    expect(errorCode('Nicht angemeldet')).toBe(ERROR_CODES['Nicht angemeldet']);
    expect(errorCode('Name: höchstens 60 Zeichen.')).toBeUndefined();
    expect(errorCode(undefined)).toBeUndefined();
  });

  it('das Frontend-Wörterbuch kennt alle Codes in beiden Sprachen', () => {
    const de = JSON.parse(readFileSync(join(__dirname, '../../src/i18n/locales/de/errors.json'), 'utf8')) as Record<string, string>;
    const en = JSON.parse(readFileSync(join(__dirname, '../../src/i18n/locales/en/errors.json'), 'utf8')) as Record<string, string>;
    for (const [msg, code] of Object.entries(ERROR_CODES)) {
      expect(de[code]).toBe(msg);
      expect(en[code], code).toBeTruthy();
    }
  });
});
