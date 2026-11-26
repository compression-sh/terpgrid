import { type KeyRing, profileKeyAad, spaceDekAad, unwrapDek, unwrapDekGen, unwrapKey, wrapDek, wrapDekGen, wrapKey } from './crypto.js';
import { type Db, tx, withUser } from './db.js';

/**
 * KEK-Rotation: verpackt alle Datenschlüssel aller Generationen (auch ausgemusterte)
 * mit der aktuellen Master-Key-Version neu. Inhalte bleiben unverändert.
 */
export async function rotateKeys(db: Db, ring: KeyRing): Promise<number> {
  const main = await tx(db, async (t) => {
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
  // Phase 5.5: Bereichs- und Profilschlüssel – je Bereich/Konto mit aktivem RLS-Kontext
  let more = 0;
  const spaces = await db.query('SELECT id, owner_id FROM tg_maint_spaces()');
  for (const sp of spaces.rows)
    more += await withUser(db, sp.owner_id, async (t) => {
      const sk = await t.query('SELECT gen, dek_wrapped, kek_version FROM space_keys WHERE space_id = $1 AND kek_version <> $2 FOR UPDATE', [sp.id, ring.current]);
      for (const r of sk.rows) {
        const k = unwrapKey(ring.get(r.kek_version), r.dek_wrapped, spaceDekAad(sp.id, r.gen));
        await t.query('UPDATE space_keys SET dek_wrapped = $3, kek_version = $4 WHERE space_id = $1 AND gen = $2', [sp.id, r.gen, wrapKey(ring.currentKey(), k, spaceDekAad(sp.id, r.gen)), ring.current]);
        k.fill(0);
      }
      return sk.rows.length;
    });
  const users = await db.query('SELECT id FROM users');
  for (const u of users.rows)
    more += await withUser(db, u.id, async (t) => {
      const pk = await t.query('SELECT key_gen, key_wrapped, kek_version FROM profiles WHERE user_id = $1 AND kek_version <> $2 FOR UPDATE', [u.id, ring.current]);
      const r = pk.rows[0];
      if (!r) return 0;
      const k = unwrapKey(ring.get(r.kek_version), r.key_wrapped, profileKeyAad(u.id, r.key_gen));
      await t.query('UPDATE profiles SET key_wrapped = $2, kek_version = $3 WHERE user_id = $1', [u.id, wrapKey(ring.currentKey(), k, profileKeyAad(u.id, r.key_gen)), ring.current]);
      k.fill(0);
      return 1;
    });
  return main + more;
}