/**
 * Schlüssel gemeinsamer Bereiche und Profile (Phase 5.5).
 *
 * - Jeder Bereich hat einen eigenen, zufälligen 256-Bit-Schlüssel je Generation, mit dem
 *   Master-Key (KEK) verpackt. Kein Bereichsschlüssel wird je an einen Client gegeben;
 *   Mitglieder erhalten nur entschlüsselte Inhalte, die sie laut Rechtematrix lesen dürfen.
 * - Kontoschlüssel (user_keys) werden für Bereiche nie verwendet: Teilen entschlüsselt im
 *   Kontext des Besitzers und verschlüsselt neu mit dem Bereichsschlüssel.
 * - Profile haben einen eigenen Profilschlüssel; Freunde lesen damit nur das Profil.
 */
import { randomBytes } from 'node:crypto';
import type { AppContext } from '../context.js';
import { CryptoError, profileKeyAad, spaceDekAad, unwrapKey, wrapKey } from '../crypto.js';
import type { Db, Tx } from '../db.js';

export interface SpaceKeys {
  spaceId: string;
  current: number;
  get(gen: number): Buffer;
  currentKey(): Buffer;
  wipe(): void;
}

/** Erzeugt Generation `gen` eines Bereichsschlüssels und legt sie (verpackt) an. */
export async function createSpaceKey(ctx: AppContext, c: Tx, spaceId: string, gen: number, state: 'active' | 'retiring' = 'active'): Promise<Buffer> {
  const key = randomBytes(32);
  const wrapped = wrapKey(ctx.keys.currentKey(), key, spaceDekAad(spaceId, gen));
  await c.query('INSERT INTO space_keys(space_id, gen, dek_wrapped, kek_version, state) VALUES ($1, $2, $3, $4, $5)', [spaceId, gen, wrapped, ctx.keys.current, state]);
  return key;
}

/**
 * Lädt die Schlüssel eines Bereichs. RLS: nur Mitglieder (bzw. der Eigentümer) sehen die
 * verpackten Schlüssel; der Aufrufer muss die Mitgliedschaft vorher geprüft haben.
 */
export async function loadSpaceKeys(ctx: AppContext, c: Tx | Db, spaceId: string): Promise<SpaceKeys> {
  const s = await c.query('SELECT key_gen FROM spaces WHERE id = $1', [spaceId]);
  if (!s.rows[0]) throw new CryptoError('Bereich nicht gefunden');
  const current: number = s.rows[0].key_gen;
  const { rows } = await c.query('SELECT gen, dek_wrapped, kek_version FROM space_keys WHERE space_id = $1', [spaceId]);
  const wrapped = new Map<number, { w: Buffer; v: number }>(rows.map((r) => [r.gen, { w: r.dek_wrapped, v: r.kek_version }]));
  const cache = new Map<number, Buffer>();
  const get = (gen: number) => {
    const hit = cache.get(gen);
    if (hit) return hit;
    const k = wrapped.get(gen);
    if (!k) throw new CryptoError(`Bereichsschlüssel-Generation ${gen} fehlt`);
    const key = unwrapKey(ctx.keys.get(k.v), k.w, spaceDekAad(spaceId, gen));
    cache.set(gen, key);
    return key;
  };
  return {
    spaceId,
    current,
    get,
    currentKey: () => get(current),
    wipe: () => {
      for (const k of cache.values()) k.fill(0);
      cache.clear();
    },
  };
}

/** Bereichsschlüssel aus einer bereits gelesenen, verpackten Generation (z. B. Einladungsvorschau). */
export function unwrapSpaceKey(ctx: AppContext, spaceId: string, gen: number, wrapped: Buffer, kekVersion: number): Buffer {
  return unwrapKey(ctx.keys.get(kekVersion), wrapped, spaceDekAad(spaceId, gen));
}

/** Neuer Profilschlüssel (verpackt). */
export function newProfileKey(ctx: AppContext, userId: string, gen: number): { key: Buffer; wrapped: Buffer; kekVersion: number } {
  const key = randomBytes(32);
  return { key, wrapped: wrapKey(ctx.keys.currentKey(), key, profileKeyAad(userId, gen)), kekVersion: ctx.keys.current };
}

export function unwrapProfileKey(ctx: AppContext, userId: string, gen: number, wrapped: Buffer, kekVersion: number): Buffer {
  return unwrapKey(ctx.keys.get(kekVersion), wrapped, profileKeyAad(userId, gen));
}
