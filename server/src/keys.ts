import { type KeyRing, unwrapDek, wrapDek } from './crypto.js';
import { type Db, tx } from './db.js';

/** Verpackt alle Benutzer-DEKs mit der aktuellen Master-Key-Version neu (Inhalte bleiben unverändert). */
export async function rotateKeys(db: Db, ring: KeyRing): Promise<number> {
  return tx(db, async (t) => {
    const { rows } = await t.query('SELECT id, dek_wrapped, dek_key_version FROM users WHERE dek_key_version <> $1 FOR UPDATE', [ring.current]);
    for (const r of rows) {
      const dek = unwrapDek(ring.get(r.dek_key_version), r.dek_wrapped, r.id);
      await t.query('UPDATE users SET dek_wrapped = $2, dek_key_version = $3 WHERE id = $1', [r.id, wrapDek(ring.currentKey(), dek, r.id), ring.current]);
      dek.fill(0);
    }
    return rows.length;
  });
}
