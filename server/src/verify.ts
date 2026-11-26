/**
 * Integritätsprüfung (z. B. nach einem Restore oder einer Schlüsselrotation): entpackt
 * jede Schlüsselgeneration, entschlüsselt jeden Datensatz, jede Datei und jedes
 * TOTP-Geheimnis mit der an der Zeile vermerkten Generation. Nur Zählwerte, keine Inhalte.
 */
import { access } from 'node:fs/promises';
import { type KeyRing, blockLabelAad, decrypt, fileAad, nicknameAad, profileAad, profileKeyAad, recordAad, spaceCommentAad, spaceDekAad, spaceFileAad, spaceMetaAad, spaceRecordAad, totpAad, unwrapDekGen, unwrapKey } from './crypto.js';
import { type Db, withUser } from './db.js';
import { readBlob, storagePath } from './files.js';

export interface VerifyReport {
  users: number;
  records: number;
  files: number;
  /** Phase 5.5: gemeinsame Bereiche */
  spaces: number;
  spaceRecords: number;
  spaceFiles: number;
  errors: string[];
}

export async function verifyData(db: Db, keys: KeyRing, fileDir: string, onlyUserId?: string): Promise<VerifyReport> {
  const report: VerifyReport = { users: 0, records: 0, files: 0, spaces: 0, spaceRecords: 0, spaceFiles: 0, errors: [] };
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
      // Phase 5.5: Profil (eigener Profilschlüssel), Spitznamen und Blockierungs-Labels (Kontoschlüssel)
      const prof = await c.query('SELECT key_gen, key_wrapped, kek_version, payload FROM profiles WHERE user_id = $1', [u.id]);
      if (prof.rows[0]) {
        try {
          const p = prof.rows[0];
          const pk = unwrapKey(keys.get(p.kek_version), p.key_wrapped, profileKeyAad(u.id, p.key_gen));
          if (p.payload) JSON.parse(decrypt(pk, p.payload, profileAad(u.id)).toString('utf8'));
          pk.fill(0);
        } catch {
          report.errors.push(`Konto ${u.login_name}: Profil nicht entschlüsselbar`);
        }
      }
      const nicks = await c.query('SELECT friend_id, nickname, nickname_gen FROM friend_settings WHERE owner_id = $1 AND nickname IS NOT NULL', [u.id]);
      for (const n of nicks.rows) {
        try {
          decrypt(key(n.nickname_gen), n.nickname, nicknameAad(u.id, n.friend_id));
        } catch {
          report.errors.push(`Konto ${u.login_name}: Spitzname nicht entschlüsselbar`);
        }
      }
      const blocks = await c.query('SELECT blocked, label, label_gen FROM blocks WHERE blocker = $1 AND label IS NOT NULL', [u.id]);
      for (const b of blocks.rows) {
        try {
          decrypt(key(b.label_gen), b.label, blockLabelAad(u.id, b.blocked));
        } catch {
          report.errors.push(`Konto ${u.login_name}: Blockierungs-Label nicht entschlüsselbar`);
        }
      }
    });
    for (const k of deks.values()) k.fill(0);
  }
  if (!onlyUserId) await verifySpaces(db, keys, fileDir, report);
  return report;
}

/** Alle gemeinsamen Bereiche prüfen – je Bereich im Kontext des Eigentümers (RLS aktiv). */
async function verifySpaces(db: Db, keys: KeyRing, fileDir: string, report: VerifyReport): Promise<void> {
  const { rows: spaces } = await db.query('SELECT id, owner_id FROM tg_maint_spaces()');
  for (const sp of spaces) {
    report.spaces++;
    await withUser(db, sp.owner_id, async (c) => {
      const label = `Bereich ${String(sp.id).slice(0, 8)}`;
      const ks = new Map<number, Buffer>();
      for (const g of (await c.query('SELECT gen, dek_wrapped, kek_version FROM space_keys WHERE space_id = $1', [sp.id])).rows) {
        try {
          ks.set(g.gen, unwrapKey(keys.get(g.kek_version), g.dek_wrapped, spaceDekAad(sp.id, g.gen)));
        } catch {
          report.errors.push(`${label}: Schlüssel Generation ${g.gen} nicht entschlüsselbar (falscher/fehlender Master-Key?)`);
        }
      }
      const key = (gen: number) => {
        const k = ks.get(gen);
        if (!k) throw new Error(`Generation ${gen} fehlt`);
        return k;
      };
      try {
        const m = (await c.query('SELECT meta, meta_gen FROM spaces WHERE id = $1', [sp.id])).rows[0];
        JSON.parse(decrypt(key(m.meta_gen), m.meta, spaceMetaAad(sp.id)).toString('utf8'));
      } catch {
        report.errors.push(`${label}: Metadaten nicht entschlüsselbar`);
      }
      for (const r of (await c.query('SELECT store, id, payload, key_gen FROM space_records WHERE space_id = $1 AND NOT deleted', [sp.id])).rows) {
        try {
          JSON.parse(decrypt(key(r.key_gen), r.payload, spaceRecordAad(sp.id, r.store, r.id)).toString('utf8'));
          report.spaceRecords++;
        } catch {
          report.errors.push(`${label}: Datensatz ${r.store}/${r.id} beschädigt oder Schlüssel fehlt`);
        }
      }
      for (const f of (await c.query('SELECT kind, id, variant, storage_name, key_gen FROM space_files WHERE space_id = $1', [sp.id])).rows) {
        try {
          await access(storagePath(fileDir, f.storage_name));
          decrypt(key(f.key_gen), await readBlob(fileDir, f.storage_name), spaceFileAad(sp.id, f.kind, f.id, f.variant));
          report.spaceFiles++;
        } catch {
          report.errors.push(`${label}: Datei ${f.kind}/${f.id}/${f.variant} fehlt oder ist beschädigt`);
        }
      }
      for (const cm of (await c.query('SELECT id, payload, key_gen FROM space_comments WHERE space_id = $1 AND payload IS NOT NULL', [sp.id])).rows) {
        try {
          decrypt(key(cm.key_gen), cm.payload, spaceCommentAad(sp.id, cm.id));
        } catch {
          report.errors.push(`${label}: Kommentar ${cm.id} nicht entschlüsselbar`);
        }
      }
      for (const k of ks.values()) k.fill(0);
    });
  }
}
