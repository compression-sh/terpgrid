/**
 * Schlüsselgenerationen je Konto. Alle Ver-/Entschlüsselungen privater Inhalte
 * laufen über diese Schicht: neu geschrieben wird mit der aktuellen Generation,
 * gelesen mit der Generation, die an der Zeile vermerkt ist.
 */
import type { AppContext } from './context.js';
import { CryptoError, unwrapDekGen } from './crypto.js';
import type { Db, Tx } from './db.js';

export interface UserKeys {
  /** Generation für neue Verschlüsselungen */
  current: number;
  /** Entpackter DEK einer Generation (wirft CryptoError bei fehlendem/falschem Schlüssel) */
  get(gen: number): Buffer;
  currentKey(): Buffer;
  /** Speicher der entpackten Schlüssel überschreiben */
  wipe(): void;
}

export async function loadUserKeys(ctx: AppContext, c: Tx | Db, userId: string): Promise<UserKeys> {
  const u = await c.query('SELECT dek_gen FROM users WHERE id = $1', [userId]);
  if (!u.rows[0]) throw new Error('Benutzer nicht gefunden');
  const current: number = u.rows[0].dek_gen;
  const { rows } = await c.query('SELECT gen, dek_wrapped, kek_version FROM user_keys WHERE user_id = $1', [userId]);
  const wrapped = new Map<number, { w: Buffer; v: number }>(rows.map((r) => [r.gen, { w: r.dek_wrapped, v: r.kek_version }]));
  const cache = new Map<number, Buffer>();
  const get = (gen: number) => {
    const hit = cache.get(gen);
    if (hit) return hit;
    const k = wrapped.get(gen);
    if (!k) throw new CryptoError(`Datenschlüssel-Generation ${gen} fehlt`);
    const dek = unwrapDekGen(ctx.keys.get(k.v), k.w, userId, gen);
    cache.set(gen, dek);
    return dek;
  };
  return {
    current,
    get,
    currentKey: () => get(current),
    wipe: () => {
      for (const k of cache.values()) k.fill(0);
      cache.clear();
    },
  };
}
