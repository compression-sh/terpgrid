import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoError, KeyRing, canonicalJson, decrypt, encrypt, recordAad, unwrapDek, wrapDek } from '../src/crypto.js';
import { parseKeyRing } from '../src/config.js';

const key = () => randomBytes(32);

describe('AES-256-GCM (Model A)', () => {
  it('verschlüsselt und entschlüsselt mit passender AAD', () => {
    const k = key();
    const ct = encrypt(k, Buffer.from('Journal: geheim'), recordAad('u1', 'journal', 'j1'));
    expect(ct[0]).toBe(1);
    expect(ct.includes(Buffer.from('geheim'))).toBe(false);
    expect(decrypt(k, ct, recordAad('u1', 'journal', 'j1')).toString()).toBe('Journal: geheim');
  });

  it('erkennt Manipulation am Chiffrat, Tag und Nonce', () => {
    const k = key();
    const aad = recordAad('u1', 'journal', 'j1');
    const ct = encrypt(k, Buffer.from('Inhalt'), aad);
    for (const pos of [1, 13, 29, ct.length - 1]) {
      const t = Buffer.from(ct);
      t[pos]! ^= 0x01;
      expect(() => decrypt(k, t, aad)).toThrow(CryptoError);
    }
    expect(() => decrypt(k, ct.subarray(0, 20), aad)).toThrow(CryptoError);
    const badVersion = Buffer.from(ct);
    badVersion[0] = 2;
    expect(() => decrypt(k, badVersion, aad)).toThrow(CryptoError);
  });

  it('lehnt falschen Schlüssel ab', () => {
    const ct = encrypt(key(), Buffer.from('x'), 'a');
    expect(() => decrypt(key(), ct, 'a')).toThrow(CryptoError);
  });

  it('bindet Benutzer, Bereich und ID (Chiffrat nicht übertragbar)', () => {
    const k = key();
    const ct = encrypt(k, Buffer.from('x'), recordAad('userA', 'journal', 'j1'));
    expect(() => decrypt(k, ct, recordAad('userB', 'journal', 'j1'))).toThrow(CryptoError);
    expect(() => decrypt(k, ct, recordAad('userA', 'grows', 'j1'))).toThrow(CryptoError);
    expect(() => decrypt(k, ct, recordAad('userA', 'journal', 'j2'))).toThrow(CryptoError);
  });

  it('verwendet für jede Verschlüsselung eine neue Nonce', () => {
    const k = key();
    const nonces = new Set<string>();
    for (let i = 0; i < 1000; i++) nonces.add(encrypt(k, Buffer.from('gleich'), 'a').subarray(1, 13).toString('hex'));
    expect(nonces.size).toBe(1000);
  });

  it('verpackt DEKs benutzergebunden', () => {
    const kek = key();
    const dek = key();
    const w = wrapDek(kek, dek, 'u1');
    expect(unwrapDek(kek, w, 'u1').equals(dek)).toBe(true);
    expect(() => unwrapDek(kek, w, 'u2')).toThrow(CryptoError);
    expect(() => unwrapDek(key(), w, 'u1')).toThrow(CryptoError);
  });

  it('Schlüsselring: Versionen, fehlende Version, Parser-Validierung', () => {
    const ring = new KeyRing(new Map([[1, key()], [2, key()]]), 2);
    expect(ring.current).toBe(2);
    expect(() => ring.get(3)).toThrow(CryptoError);
    expect(() => new KeyRing(new Map([[1, key()]]), 2)).toThrow();
    expect(parseKeyRing(`1:${key().toString('base64')},2:${key().toString('base64')}`).size).toBe(2);
    expect(() => parseKeyRing('1:kurz')).toThrow();
    expect(() => parseKeyRing(`x:${key().toString('base64')}`)).toThrow();
  });

  it('kanonisches JSON ist unabhängig von der Schlüsselreihenfolge', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });
});
