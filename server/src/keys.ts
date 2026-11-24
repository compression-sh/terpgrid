import { type KeyRing, unwrapDek, unwrapDekGen, wrapDek, wrapDekGen } from './crypto.js';
import { type Db, tx } from './db.js';

/**
 * KEK-Rotation: verpackt alle Datenschlüssel aller Generationen (auch ausgemusterte)
 * mit der aktuellen Master-Key-Version neu. Inhalte bleiben unverändert.
 */
export async function rotateKeys(db: Db, ring: KeyRing): Promise<number> {
  return tx(db, async (t) => {
    const { rows } = await t.query('SELECT user_id, gen, dek_wrapped, kek_version FROM user_keys WHERE kek_version <> $1 FOR UPDATE', [ring.current]);
    for (const r of rows) {
      const dek = unwrapDekGen(ring.get(r.kek_version), r.dek_wrapped, r.user_id, r.gen);
      await t.query('UPDATE user_keys SET dek_wrapped = $3, kek_version = $4 WHERE user_id = $1 AND gen = $2', [r.user_id, r.gen, wrapDekGen(ring.currentKey(), dek, r.user_id, r.gen), ring.current]);
      dek.fill(0);
    }
    // Veraltete Spalten aus Schema v1 (Generation 1) konsistent halten
    const legacy = await t.query('SELECT id, dek_wrapped, dek_key_version FROM users WHERE dek_wrapped IS NOT NULL AND dek_key_version <> $1 FOR UPDATE', [ring.current]);
    for (const r of legacy.rows) {
      const dek = unwrapDek(ring.get(r.dek_key_version), r.dek_wrapped, r.id);
      await t.query('UPDATE users SET dek_wrapped = $2, dek_key_version = $3 WHERE id = $1', [r.id, wrapDek(ring.currentKey(), dek, r.id), ring.current]);
      dek.fill(0);
    }
    return rows.length;
  });
}
