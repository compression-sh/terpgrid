/**
 * Integritätsprüfung (z. B. nach einem Restore): entpackt jeden Datenschlüssel,
 * entschlüsselt jeden Datensatz und jede Datei. Gibt nur Zählwerte aus – keine Inhalte.
 */
import { access } from 'node:fs/promises';
import { type KeyRing, decrypt, fileAad, recordAad, unwrapDek } from './crypto.js';
import { type Db, withUser } from './db.js';
import { readBlob, storagePath } from './files.js';

export interface VerifyReport {
  users: number;
  records: number;
  files: number;
  errors: string[];
}

export async function verifyData(db: Db, keys: KeyRing, fileDir: string): Promise<VerifyReport> {
  const report: VerifyReport = { users: 0, records: 0, files: 0, errors: [] };
  const { rows: users } = await db.query('SELECT id, login_name, dek_wrapped, dek_key_version FROM users ORDER BY created_at');
  for (const u of users) {
    report.users++;
    let dek: Buffer;
    try {
      dek = unwrapDek(keys.get(u.dek_key_version), u.dek_wrapped, u.id);
    } catch {
      report.errors.push(`Konto ${u.login_name}: Datenschlüssel nicht entschlüsselbar (falscher/fehlender Master-Key?)`);
      continue;
    }
    await withUser(db, u.id, async (c) => {
      const recs = await c.query('SELECT store, id, payload FROM records WHERE user_id = $1 AND NOT deleted', [u.id]);
      for (const r of recs.rows) {
        try {
          JSON.parse(decrypt(dek, r.payload, recordAad(u.id, r.store, r.id)).toString('utf8'));
          report.records++;
        } catch {
          report.errors.push(`Konto ${u.login_name}: Datensatz ${r.store}/${r.id} beschädigt`);
        }
      }
      const files = await c.query('SELECT kind, id, variant, storage_name FROM files WHERE user_id = $1', [u.id]);
      for (const f of files.rows) {
        try {
          await access(storagePath(fileDir, f.storage_name));
          decrypt(dek, await readBlob(fileDir, f.storage_name), fileAad(u.id, f.kind, f.id, f.variant));
          report.files++;
        } catch {
          report.errors.push(`Konto ${u.login_name}: Datei ${f.kind}/${f.id}/${f.variant} fehlt oder ist beschädigt`);
        }
      }
    });
    dek.fill(0);
  }
  return report;
}
