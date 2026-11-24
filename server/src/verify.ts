/**
 * Integritätsprüfung (z. B. nach einem Restore oder einer Schlüsselrotation): entpackt
 * jede Schlüsselgeneration, entschlüsselt jeden Datensatz, jede Datei und jedes
 * TOTP-Geheimnis mit der an der Zeile vermerkten Generation. Nur Zählwerte, keine Inhalte.
 */
import { access } from 'node:fs/promises';
import { type KeyRing, decrypt, fileAad, recordAad, totpAad, unwrapDekGen } from './crypto.js';
import { type Db, withUser } from './db.js';
import { readBlob, storagePath } from './files.js';

export interface VerifyReport {
  users: number;
  records: number;
  files: number;
  errors: string[];
}

export async function verifyData(db: Db, keys: KeyRing, fileDir: string, onlyUserId?: string): Promise<VerifyReport> {
  const report: VerifyReport = { users: 0, records: 0, files: 0, errors: [] };
  const { rows: users } = await db.query(
    `SELECT id, login_name, totp_secret, totp_dek_gen FROM users ${onlyUserId ? 'WHERE id = $1' : ''} ORDER BY created_at`,
    onlyUserId ? [onlyUserId] : [],
  );
  for (const u of users) {
    report.users++;
    const deks = new Map<number, Buffer>();
    const { rows: gens } = await db.query('SELECT gen, dek_wrapped, kek_version FROM user_keys WHERE user_id = $1', [u.id]);
    for (const g of gens) {
      try {
        deks.set(g.gen, unwrapDekGen(keys.get(g.kek_version), g.dek_wrapped, u.id, g.gen));
      } catch {
        report.errors.push(`Konto ${u.login_name}: Datenschlüssel Generation ${g.gen} nicht entschlüsselbar (falscher/fehlender Master-Key?)`);
      }
    }
    if (deks.size === 0) continue;
    const key = (gen: number) => {
      const k = deks.get(gen);
      if (!k) throw new Error(`Generation ${gen} fehlt`);
      return k;
    };
    if (u.totp_secret) {
      try {
        decrypt(key(u.totp_dek_gen), u.totp_secret, totpAad(u.id));
      } catch {
        report.errors.push(`Konto ${u.login_name}: 2FA-Geheimnis nicht entschlüsselbar`);
      }
    }
    await withUser(db, u.id, async (c) => {
      const recs = await c.query('SELECT store, id, payload, dek_gen FROM records WHERE user_id = $1 AND NOT deleted', [u.id]);
      for (const r of recs.rows) {
        try {
          JSON.parse(decrypt(key(r.dek_gen), r.payload, recordAad(u.id, r.store, r.id)).toString('utf8'));
          report.records++;
        } catch {
          report.errors.push(`Konto ${u.login_name}: Datensatz ${r.store}/${r.id} beschädigt oder Schlüssel fehlt`);
        }
      }
      const files = await c.query('SELECT kind, id, variant, storage_name, dek_gen FROM files WHERE user_id = $1', [u.id]);
      for (const f of files.rows) {
        try {
          await access(storagePath(fileDir, f.storage_name));
          decrypt(key(f.dek_gen), await readBlob(fileDir, f.storage_name), fileAad(u.id, f.kind, f.id, f.variant));
          report.files++;
        } catch {
          report.errors.push(`Konto ${u.login_name}: Datei ${f.kind}/${f.id}/${f.variant} fehlt oder ist beschädigt`);
        }
      }
    });
    for (const k of deks.values()) k.fill(0);
  }
  return report;
}
