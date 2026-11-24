/**
 * Rotation des Datenschlüssels (DEK) eines Kontos – versioniert und fortsetzbar.
 *
 * Ablauf:
 *  1. start:    neue Generation erzeugen (mit aktuellem Master-Key verpackt) und als
 *               „active“ setzen; die bisherige wird „retiring“. Neue Schreibvorgänge
 *               nutzen sofort die neue Generation.
 *  2. continue: Datensätze, Dateien und 2FA-Geheimnis in kleinen Transaktionen
 *               umschlüsseln. Jede Zeile wechselt atomar (Inhalt + dek_gen). Ein Abbruch
 *               (Absturz, Neustart) ist jederzeit möglich: Zeilen tragen ihre Generation,
 *               alte Schlüssel bleiben erhalten, ein erneuter Aufruf setzt fort.
 *  3. finalize: wenn keine Zeile mehr eine alte Generation nutzt, alles mit der neuen
 *               Generation testweise entschlüsseln; erst dann alte Generationen „retired“.
 *  4. purge:    Schlüsselmaterial ausgemusterter Generationen wird nie automatisch
 *               gelöscht – nur per purgeRetiredKeys nach Ablauf der Backup-Aufbewahrung.
 */
import { randomBytes } from 'node:crypto';
import { audit } from './audit.js';
import type { AppContext } from './context.js';
import { canonicalJson, decrypt, encrypt, fileAad, hmac, recordAad, totpAad, wrapDekGen } from './crypto.js';
import { tx, withUser } from './db.js';
import { newStorageName, readBlob, removeBlob, trashBlob, writeBlob } from './files.js';
import { macKey } from './records.js';
import { loadUserKeys } from './userkeys.js';
import { verifyData } from './verify.js';

export interface RotationProgress {
  gen: number;
  records: number;
  files: number;
  totp: boolean;
  done: boolean;
  remaining: number;
}

/** Startet eine Rotation oder liefert die laufende Generation (idempotent). */
export async function startUserKeyRotation(ctx: AppContext, userId: string): Promise<number> {
  return tx(ctx.db, async (c) => {
    const u = await c.query('SELECT dek_gen FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!u.rows[0]) throw new Error('Benutzer nicht gefunden');
    const retiring = await c.query("SELECT 1 FROM user_keys WHERE user_id = $1 AND state = 'retiring'", [userId]);
    if (retiring.rowCount) return u.rows[0].dek_gen as number; // läuft bereits → fortsetzen
    // Vor dem Wechsel sicherstellen, dass der aktuelle Schlüssel entpackt werden kann
    const keys = await loadUserKeys(ctx, c, userId);
    keys.currentKey();
    keys.wipe();
    const max = await c.query('SELECT max(gen)::int AS g FROM user_keys WHERE user_id = $1', [userId]);
    const gen = (max.rows[0].g as number) + 1;
    const dek = randomBytes(32);
    const wrapped = wrapDekGen(ctx.keys.currentKey(), dek, userId, gen);
    dek.fill(0);
    await c.query("UPDATE user_keys SET state = 'retiring' WHERE user_id = $1 AND state = 'active'", [userId]);
    await c.query("INSERT INTO user_keys(user_id, gen, dek_wrapped, kek_version, state) VALUES ($1, $2, $3, $4, 'active')", [userId, gen, wrapped, ctx.keys.current]);
    await c.query('UPDATE users SET dek_gen = $2 WHERE id = $1', [userId, gen]);
    await audit(ctx, 'keys.rotate', { userId, meta: { phase: 'start', gen }, client: c });
    return gen;
  });
}

async function remaining(ctx: AppContext, userId: string, gen: number): Promise<number> {
  return withUser(ctx.db, userId, async (c) => {
    const r = await c.query('SELECT (SELECT count(*) FROM records WHERE user_id = $1 AND dek_gen <> $2) + (SELECT count(*) FROM files WHERE user_id = $1 AND dek_gen <> $2) AS n', [userId, gen]);
    const t = await c.query('SELECT 1 FROM users WHERE id = $1 AND totp_secret IS NOT NULL AND totp_dek_gen <> $2', [userId, gen]);
    return Number(r.rows[0].n) + (t.rowCount ?? 0);
  });
}

/**
 * Setzt die Rotation fort. `maxBatches` begrenzt die Arbeit je Aufruf (Tests/Unterbrechung).
 * Bei einem Fehler (z. B. fehlender/falscher Schlüssel) wird die aktuelle Transaktion
 * zurückgerollt; bereits umgeschlüsselte Zeilen bleiben gültig, nichts geht verloren.
 */
export async function continueUserKeyRotation(ctx: AppContext, userId: string, opts: { batch?: number; maxBatches?: number } = {}): Promise<RotationProgress> {
  const batch = opts.batch ?? 100;
  const maxBatches = opts.maxBatches ?? Number.POSITIVE_INFINITY;
  const progress: RotationProgress = { gen: 0, records: 0, files: 0, totp: false, done: false, remaining: 0 };
  let batches = 0;

  // Datensätze
  while (batches < maxBatches) {
    const n = await withUser(ctx.db, userId, async (c) => {
      const keys = await loadUserKeys(ctx, c, userId);
      progress.gen = keys.current;
      const { rows } = await c.query(
        'SELECT store, id, payload, deleted, dek_gen FROM records WHERE user_id = $1 AND dek_gen <> $2 ORDER BY store, id LIMIT $3 FOR UPDATE SKIP LOCKED',
        [userId, keys.current, batch],
      );
      for (const r of rows) {
        if (r.deleted || !r.payload) {
          await c.query('UPDATE records SET dek_gen = $4 WHERE user_id = $1 AND store = $2 AND id = $3', [userId, r.store, r.id, keys.current]);
          continue;
        }
        const plain = decrypt(keys.get(r.dek_gen), r.payload, recordAad(userId, r.store, r.id));
        const data = JSON.parse(plain.toString('utf8'));
        const payload = encrypt(keys.currentKey(), plain, recordAad(userId, r.store, r.id));
        const mac = hmac(macKey(keys.currentKey()), `${r.store}|${r.id}|${canonicalJson(data)}`);
        plain.fill(0);
        // Inhalt unverändert → Version und Sync-Sequenz bleiben gleich
        await c.query('UPDATE records SET payload = $4, payload_mac = $5, size = $6, dek_gen = $7 WHERE user_id = $1 AND store = $2 AND id = $3', [userId, r.store, r.id, payload, mac, payload.length, keys.current]);
      }
      keys.wipe();
      return rows.length;
    });
    progress.records += n;
    if (n === 0) break;
    batches++;
  }

  // Dateien: neuen Blob schreiben, Zeile umstellen, alten Blob in den Papierkorb
  while (batches < maxBatches) {
    const n = await withUser(ctx.db, userId, async (c) => {
      const keys = await loadUserKeys(ctx, c, userId);
      const { rows } = await c.query(
        'SELECT kind, id, variant, storage_name, dek_gen FROM files WHERE user_id = $1 AND dek_gen <> $2 ORDER BY kind, id, variant LIMIT $3 FOR UPDATE SKIP LOCKED',
        [userId, keys.current, Math.max(1, Math.floor(batch / 10))],
      );
      for (const f of rows) {
        const aad = fileAad(userId, f.kind, f.id, f.variant);
        const plain = decrypt(keys.get(f.dek_gen), await readBlob(ctx.config.fileDir, f.storage_name), aad);
        const name = newStorageName();
        await writeBlob(ctx.config.fileDir, name, encrypt(keys.currentKey(), plain, aad));
        plain.fill(0);
        try {
          await c.query('UPDATE files SET storage_name = $5, dek_gen = $6 WHERE user_id = $1 AND kind = $2 AND id = $3 AND variant = $4', [userId, f.kind, f.id, f.variant, name, keys.current]);
          await trashBlob(c, f.storage_name);
        } catch (e) {
          await removeBlob(ctx.config.fileDir, name).catch(() => {});
          throw e;
        }
      }
      keys.wipe();
      return rows.length;
    });
    progress.files += n;
    if (n === 0) break;
    batches++;
  }

  // 2FA-Geheimnis
  if (batches < maxBatches) {
    progress.totp = await tx(ctx.db, async (c) => {
      const { rows } = await c.query('SELECT totp_secret, totp_dek_gen, dek_gen FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const u = rows[0];
      if (!u.totp_secret || u.totp_dek_gen === u.dek_gen) return false;
      const keys = await loadUserKeys(ctx, c, userId);
      const plain = decrypt(keys.get(u.totp_dek_gen), u.totp_secret, totpAad(userId));
      await c.query('UPDATE users SET totp_secret = $2, totp_dek_gen = $3 WHERE id = $1', [userId, encrypt(keys.currentKey(), plain, totpAad(userId)), keys.current]);
      plain.fill(0);
      keys.wipe();
      return true;
    });
  }

  if (!progress.gen) progress.gen = (await ctx.db.query('SELECT dek_gen FROM users WHERE id = $1', [userId])).rows[0].dek_gen;
  progress.remaining = await remaining(ctx, userId, progress.gen);
  if (progress.remaining === 0) progress.done = await finalizeUserKeyRotation(ctx, userId);
  return progress;
}

/** Prüft alle Inhalte des Kontos und mustert alte Generationen erst danach aus. */
export async function finalizeUserKeyRotation(ctx: AppContext, userId: string): Promise<boolean> {
  const { rows } = await ctx.db.query('SELECT dek_gen FROM users WHERE id = $1', [userId]);
  const gen: number = rows[0].dek_gen;
  if ((await remaining(ctx, userId, gen)) > 0) return false;
  const report = await verifyData(ctx.db, ctx.keys, ctx.config.fileDir, userId);
  if (report.errors.length) throw new Error(`Prüfung nach Rotation fehlgeschlagen: ${report.errors[0]}`);
  const r = await ctx.db.query("UPDATE user_keys SET state = 'retired', retired_at = now() WHERE user_id = $1 AND state = 'retiring' RETURNING gen", [userId]);
  if (r.rowCount) await audit(ctx, 'keys.rotate', { userId, meta: { phase: 'finalize', gen, retired: r.rowCount } });
  return true;
}

/** Komplette Rotation (Start + Fortsetzen bis fertig). */
export async function rotateUserKey(ctx: AppContext, userId: string, opts: { batch?: number } = {}): Promise<RotationProgress> {
  await startUserKeyRotation(ctx, userId);
  return continueUserKeyRotation(ctx, userId, opts);
}

/**
 * Löscht Schlüsselmaterial ausgemusterter Generationen – nur wenn keine Zeile sie mehr
 * nutzt UND die Ausmusterung länger zurückliegt als `minAgeDays` (Backup-Aufbewahrung!).
 */
export async function purgeRetiredKeys(ctx: AppContext, minAgeDays: number): Promise<number> {
  if (!Number.isInteger(minAgeDays) || minAgeDays < 1) throw new Error('minAgeDays muss ≥ 1 sein');
  const { rows } = await ctx.db.query(
    "SELECT user_id, gen FROM user_keys WHERE state = 'retired' AND retired_at < now() - make_interval(days => $1)",
    [minAgeDays],
  );
  let n = 0;
  for (const k of rows) {
    const used = await withUser(ctx.db, k.user_id, async (c) => {
      const r = await c.query('SELECT (SELECT count(*) FROM records WHERE user_id = $1 AND dek_gen = $2) + (SELECT count(*) FROM files WHERE user_id = $1 AND dek_gen = $2) AS n', [k.user_id, k.gen]);
      const t = await c.query('SELECT 1 FROM users WHERE id = $1 AND totp_dek_gen = $2 AND totp_secret IS NOT NULL', [k.user_id, k.gen]);
      return Number(r.rows[0].n) + (t.rowCount ?? 0);
    });
    if (used > 0) continue;
    await ctx.db.query("DELETE FROM user_keys WHERE user_id = $1 AND gen = $2 AND state = 'retired'", [k.user_id, k.gen]);
    // Veraltete Kopie der Generation 1 in users ebenfalls entfernen
    if (k.gen === 1) await ctx.db.query('UPDATE users SET dek_wrapped = NULL, dek_key_version = NULL WHERE id = $1', [k.user_id]);
    n++;
  }
  return n;
}
