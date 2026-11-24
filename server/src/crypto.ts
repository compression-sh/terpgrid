/**
 * Kryptografie-Bausteine (ausschließlich Node `crypto`/OpenSSL – keine Eigenbauten).
 *
 * Format verschlüsselter Daten (v1): 0x01 ‖ nonce(12) ‖ tag(16) ‖ ciphertext
 * Algorithmus: AES-256-GCM, 96-Bit-Zufalls-Nonce, Metadaten als AAD gebunden.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 0x01;
const NONCE = 12;
const TAG = 16;

export class CryptoError extends Error {
  constructor(message = 'Entschlüsselung fehlgeschlagen') {
    super(message);
    this.name = 'CryptoError';
  }
}

export function encrypt(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  if (key.length !== 32) throw new CryptoError('Schlüssel muss 32 Byte lang sein');
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), nonce, cipher.getAuthTag(), ct]);
}

export function decrypt(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (blob.length < 1 + NONCE + TAG || blob[0] !== VERSION) throw new CryptoError('Unbekanntes oder beschädigtes Format');
  const nonce = blob.subarray(1, 1 + NONCE);
  const tag = blob.subarray(1 + NONCE, 1 + NONCE + TAG);
  const ct = blob.subarray(1 + NONCE + TAG);
  try {
    const d = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG });
    d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
  } catch {
    throw new CryptoError();
  }
}

/** Verpackt einen Benutzer-Datenschlüssel (DEK) mit dem Master-Key (KEK). */
export function wrapDek(kek: Buffer, dek: Buffer, userId: string): Buffer {
  return encrypt(kek, dek, `dek|v1|${userId}`);
}
export function unwrapDek(kek: Buffer, wrapped: Buffer, userId: string): Buffer {
  const dek = decrypt(kek, wrapped, `dek|v1|${userId}`);
  if (dek.length !== 32) throw new CryptoError('Ungültiger Datenschlüssel');
  return dek;
}

/**
 * DEK-Verpackung mit Generation. Generation 1 nutzt das bisherige AAD-Format
 * (kompatibel mit bestehenden Daten), ab Generation 2 ist die Generation gebunden.
 */
const dekAad = (userId: string, gen: number) => (gen === 1 ? `dek|v1|${userId}` : `dek|v2|${userId}|${gen}`);
export function wrapDekGen(kek: Buffer, dek: Buffer, userId: string, gen: number): Buffer {
  return encrypt(kek, dek, dekAad(userId, gen));
}
export function unwrapDekGen(kek: Buffer, wrapped: Buffer, userId: string, gen: number): Buffer {
  const dek = decrypt(kek, wrapped, dekAad(userId, gen));
  if (dek.length !== 32) throw new CryptoError('Ungültiger Datenschlüssel');
  return dek;
}

export const recordAad = (userId: string, store: string, id: string) => `rec|v1|${userId}|${store}|${id}`;
export const fileAad = (userId: string, kind: string, id: string, variant: string) => `file|v1|${userId}|${kind}|${id}|${variant}`;
export const totpAad = (userId: string) => `totp|v1|${userId}`;

/** Unterschlüssel per HKDF-SHA-256 (getrennte Zwecke, ein Geheimnis). */
export function subkey(secret: Buffer, purpose: string, length = 32): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `terpgrid:${purpose}`, length));
}

export function hmac(key: Buffer, data: string | Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export function sha256(data: string | Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

export function safeEqual(a: Buffer | string, b: Buffer | string): boolean {
  const x = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const y = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** URL-sicheres Zufallstoken (Standard: 256 Bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Crockford-Base32 ohne verwechselbare Zeichen (I, L, O, U). */
const B32 = '0123456789abcdefghjkmnpqrstvwxyz';
export function randomBase32(chars: number): string {
  // Rejection-frei: 32 = 2^5, jedes Byte liefert über Maskierung gleichverteilte 5 Bit
  const bytes = randomBytes(chars);
  let out = '';
  for (let i = 0; i < chars; i++) out += B32[bytes[i]! & 31];
  return out;
}

/** Kanonisches JSON (sortierte Schlüssel) – für deterministische MACs. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

/**
 * Schlüsselring mit Versionen. Neue Verpackungen nutzen die aktuelle Version;
 * alte Versionen bleiben zum Entpacken verfügbar, bis rotiert wurde.
 */
export class KeyRing {
  constructor(
    private readonly keys: Map<number, Buffer>,
    readonly current: number,
  ) {
    if (!keys.has(current)) throw new Error('Aktuelle Key-Version fehlt im Schlüsselring');
  }
  get(version: number): Buffer {
    const k = this.keys.get(version);
    if (!k) throw new CryptoError(`Master-Key-Version ${version} nicht verfügbar`);
    return k;
  }
  currentKey(): Buffer {
    return this.get(this.current);
  }
}
