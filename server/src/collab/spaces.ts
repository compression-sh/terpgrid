/**
 * Gemeinsame Bereiche: Anlegen, Metadaten (verschlüsselt), Löschen und Schlüsselrotation.
 */
import { randomUUID } from 'node:crypto';
import type { AppContext } from '../context.js';
import { canonicalJson, decrypt, encrypt, hmac, spaceCommentAad, spaceFileAad, spaceMetaAad, spaceRecordAad } from '../crypto.js';
import { type Tx, withUser } from '../db.js';
import { newStorageName, readBlob, removeBlob, trashBlob, writeBlob } from '../files.js';
import { HttpError } from '../http.js';
import { CONTROL_CHARS } from '../identity.js';
import { recordActivity } from './activity.js';
import { createSpaceKey, loadSpaceKeys, type SpaceKeys } from './keys.js';
import { notify } from './notify.js';
import { spaceMacKey } from './records.js';

export const SPACE_KINDS = ['project', 'collection', 'general'] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];
export const SPACE_ACCENTS = ['emerald', 'teal', 'sky', 'violet', 'amber', 'rose', 'lime'] as const;

export interface SpaceMeta {
  name: string;
  description?: string;
  accent?: (typeof SPACE_ACCENTS)[number];
}

const CONTROL = CONTROL_CHARS;
export function cleanMeta(input: Partial<SpaceMeta>, current?: SpaceMeta): SpaceMeta {
  const next: SpaceMeta = { ...(current ?? { name: '' }) };
  if (input.name !== undefined) {
    const n = String(input.name).normalize('NFKC').trim();
    if (n.length < 2 || n.length > 60) throw new HttpError(400, 'Name: 2–60 Zeichen.');
    if (CONTROL.test(n)) throw new HttpError(400, 'Name enthält unzulässige Zeichen.');
    next.name = n;
  }
  if (input.description !== undefined) {
    const d = String(input.description ?? '').normalize('NFKC').trim();
    if (d.length > 600) throw new HttpError(400, 'Beschreibung: höchstens 600 Zeichen.');
    if (CONTROL.test(d.replace(/\n/g, ''))) throw new HttpError(400, 'Beschreibung enthält unzulässige Zeichen.');
    if (d) next.description = d;
    else delete next.description;
  }
  if (input.accent !== undefined) {
    if (input.accent && !(SPACE_ACCENTS as readonly string[]).includes(input.accent)) throw new HttpError(400, 'Unbekannte Akzentfarbe');
    if (input.accent) next.accent = input.accent;
    else delete next.accent;
  }
  if (!next.name) throw new HttpError(400, 'Bitte einen Namen angeben.');
  return next;
}

export const encodeMeta = (key: Buffer, spaceId: string, meta: SpaceMeta) => encrypt(key, Buffer.from(JSON.stringify(meta), 'utf8'), spaceMetaAad(spaceId));
export const decodeMeta = (key: Buffer, spaceId: string, blob: Buffer): SpaceMeta => JSON.parse(decrypt(key, blob, spaceMetaAad(spaceId)).toString('utf8'));

/** Neuen Bereich anlegen: eigener Schlüssel, Eigentümer als erstes Mitglied. */
export async function createSpace(ctx: AppContext, c: Tx, ownerId: string, kind: SpaceKind, meta: SpaceMeta): Promise<string> {
  const count = await c.query("SELECT count(*)::int AS n FROM space_members WHERE user_id = $1 AND role = 'owner'", [ownerId]);
  if (count.rows[0].n >= 50) throw new HttpError(429, 'Höchstens 50 eigene Bereiche.');
  const id = randomUUID();
  // Bereich zuerst mit Platzhalter anlegen (der Schlüssel referenziert den Bereich)
  await c.query('INSERT INTO spaces(id, owner_id, kind, meta) VALUES ($1, $2, $3, $4)', [id, ownerId, kind, Buffer.alloc(1)]);
  const key = await createSpaceKey(ctx, c, id, 1);
  await c.query("INSERT INTO space_members(space_id, user_id, role, added_by) VALUES ($1, $2, 'owner', $2)", [id, ownerId]);
  await c.query('UPDATE spaces SET meta = $2, meta_gen = 1 WHERE id = $1', [id, encodeMeta(key, id, meta)]);
  key.fill(0);
  await recordActivity(c, id, ownerId, 'space.created');
  return id;
}

export async function readMeta(c: Tx, keys: SpaceKeys, spaceId: string): Promise<SpaceMeta> {
  const { rows } = await c.query('SELECT meta, meta_gen FROM spaces WHERE id = $1', [spaceId]);
  return decodeMeta(keys.get(rows[0].meta_gen), spaceId, rows[0].meta);
}

/**
 * Bereich löschen (nur Eigentümer, Aufrufer prüft Re-Auth). Mitglieder werden vorher
 * benachrichtigt; Dateien kommen in den Papierkorb, der Speicher wird dem Eigentümer
 * gutgeschrieben. Die Schlüssel werden mitgelöscht (Krypto-Shredding verbleibender Blobs).
 */
export async function deleteSpace(c: Tx, spaceId: string, actorId: string): Promise<{ members: number; files: number }> {
  const members = await c.query('SELECT user_id FROM space_members WHERE space_id = $1 AND user_id <> $2', [spaceId, actorId]);
  for (const m of members.rows) await notify(c, { recipient: m.user_id, category: 'access', type: 'space.deleted', spaceId });
  const files = await c.query('SELECT storage_name FROM space_files WHERE space_id = $1', [spaceId]);
  for (const f of files.rows) await trashBlob(c, f.storage_name);
  const s = await c.query('SELECT owner_id, storage_bytes FROM spaces WHERE id = $1', [spaceId]);
  await c.query('UPDATE users SET storage_bytes = greatest(0, storage_bytes - $2) WHERE id = $1', [s.rows[0].owner_id, s.rows[0].storage_bytes]);
  const r = await c.query('DELETE FROM spaces WHERE id = $1', [spaceId]);
  if (!r.rowCount) throw new HttpError(404, 'Bereich nicht gefunden');
  return { members: members.rowCount ?? 0, files: files.rowCount ?? 0 };
}

export interface SpaceRotationProgress {
  gen: number;
  records: number;
  files: number;
  comments: number;
  done: boolean;
}

/**
 * Schlüsselrotation eines Bereichs (fortsetzbar wie bei Konten): neue Generation erzeugen,
 * alle Inhalte in kleinen Transaktionen umschlüsseln, danach testweise vollständig
 * entschlüsseln und erst dann die alte Generation ausmustern. Schlüsselmaterial
 * ausgemusterter Generationen bleibt bis zum Ablauf der Backup-Aufbewahrung erhalten.
 */
export async function rotateSpaceKey(ctx: AppContext, userId: string, spaceId: string, opts: { batch?: number } = {}): Promise<SpaceRotationProgress> {
  const batch = opts.batch ?? 100;
  const gen = await withUser(ctx.db, userId, async (c) => {
    const s = await c.query('SELECT key_gen FROM spaces WHERE id = $1 FOR UPDATE', [spaceId]);
    if (!s.rows[0]) throw new HttpError(404, 'Bereich nicht gefunden');
    const retiring = await c.query("SELECT 1 FROM space_keys WHERE space_id = $1 AND state = 'retiring'", [spaceId]);
    if (retiring.rowCount) return s.rows[0].key_gen as number;
    const keys = await loadSpaceKeys(ctx, c, spaceId);
    keys.currentKey();
    keys.wipe();
    const max = await c.query('SELECT max(gen)::int AS g FROM space_keys WHERE space_id = $1', [spaceId]);
    const next = (max.rows[0].g as number) + 1;
    await c.query("UPDATE space_keys SET state = 'retiring' WHERE space_id = $1 AND state = 'active'", [spaceId]);
    (await createSpaceKey(ctx, c, spaceId, next)).fill(0);
    await c.query('UPDATE spaces SET key_gen = $2 WHERE id = $1', [spaceId, next]);
    return next;
  });
  const p: SpaceRotationProgress = { gen, records: 0, files: 0, comments: 0, done: false };

  for (;;) {
    const n = await withUser(ctx.db, userId, async (c) => {
      const keys = await loadSpaceKeys(ctx, c, spaceId);
      const { rows } = await c.query('SELECT store, id, payload, deleted, key_gen FROM space_records WHERE space_id = $1 AND key_gen <> $2 LIMIT $3 FOR UPDATE', [spaceId, gen, batch]);
      for (const r of rows) {
        if (r.deleted || !r.payload) {
          await c.query('UPDATE space_records SET key_gen = $4 WHERE space_id = $1 AND store = $2 AND id = $3', [spaceId, r.store, r.id, gen]);
          continue;
        }
        const aad = spaceRecordAad(spaceId, r.store, r.id);
        const plain = decrypt(keys.get(r.key_gen), r.payload, aad);
        const mac = hmac(spaceMacKey(keys.currentKey()), `${r.store}|${r.id}|${canonicalJson(JSON.parse(plain.toString('utf8')))}`);
        const payload = encrypt(keys.currentKey(), plain, aad);
        plain.fill(0);
        await c.query('UPDATE space_records SET payload = $4, payload_mac = $5, size = $6, key_gen = $7 WHERE space_id = $1 AND store = $2 AND id = $3', [spaceId, r.store, r.id, payload, mac, payload.length, gen]);
      }
      keys.wipe();
      return rows.length;
    });
    p.records += n;
    if (!n) break;
  }
  for (;;) {
    const n = await withUser(ctx.db, userId, async (c) => {
      const keys = await loadSpaceKeys(ctx, c, spaceId);
      const { rows } = await c.query('SELECT kind, id, variant, storage_name, key_gen FROM space_files WHERE space_id = $1 AND key_gen <> $2 LIMIT $3 FOR UPDATE', [spaceId, gen, Math.max(1, Math.floor(batch / 10))]);
      for (const f of rows) {
        const aad = spaceFileAad(spaceId, f.kind, f.id, f.variant);
        const plain = decrypt(keys.get(f.key_gen), await readBlob(ctx.config.fileDir, f.storage_name), aad);
        const name = newStorageName();
        await writeBlob(ctx.config.fileDir, name, encrypt(keys.currentKey(), plain, aad));
        plain.fill(0);
        try {
          await c.query('UPDATE space_files SET storage_name = $5, key_gen = $6 WHERE space_id = $1 AND kind = $2 AND id = $3 AND variant = $4', [spaceId, f.kind, f.id, f.variant, name, gen]);
          await trashBlob(c, f.storage_name);
        } catch (e) {
          await removeBlob(ctx.config.fileDir, name).catch(() => {});
          throw e;
        }
      }
      keys.wipe();
      return rows.length;
    });
    p.files += n;
    if (!n) break;
  }
  for (;;) {
    const n = await withUser(ctx.db, userId, async (c) => {
      const keys = await loadSpaceKeys(ctx, c, spaceId);
      const { rows } = await c.query('SELECT id, payload, key_gen FROM space_comments WHERE space_id = $1 AND key_gen <> $2 AND payload IS NOT NULL LIMIT $3 FOR UPDATE', [spaceId, gen, batch]);
      for (const r of rows) {
        const payload = r.payload ? encrypt(keys.currentKey(), decrypt(keys.get(r.key_gen), r.payload, spaceCommentAad(spaceId, r.id)), spaceCommentAad(spaceId, r.id)) : null;
        await c.query('UPDATE space_comments SET payload = $2, key_gen = $3 WHERE id = $1', [r.id, payload, gen]);
      }
      keys.wipe();
      return rows.length;
    });
    p.comments += n;
    if (!n) break;
  }
  await withUser(ctx.db, userId, async (c) => {
    const keys = await loadSpaceKeys(ctx, c, spaceId);
    const meta = await readMeta(c, keys, spaceId);
    await c.query('UPDATE spaces SET meta = $2, meta_gen = $3 WHERE id = $1', [spaceId, encodeMeta(keys.currentKey(), spaceId, meta), gen]);
    // Prüfen: alles mit der neuen Generation lesbar?
    const left = await c.query(
      'SELECT (SELECT count(*) FROM space_records WHERE space_id = $1 AND key_gen <> $2) + (SELECT count(*) FROM space_files WHERE space_id = $1 AND key_gen <> $2) + (SELECT count(*) FROM space_comments WHERE space_id = $1 AND key_gen <> $2 AND payload IS NOT NULL) AS n',
      [spaceId, gen],
    );
    if (Number(left.rows[0].n) > 0) throw new Error('Rotation unvollständig');
    const recs = await c.query('SELECT store, id, payload FROM space_records WHERE space_id = $1 AND NOT deleted', [spaceId]);
    for (const r of recs.rows) decrypt(keys.currentKey(), r.payload, spaceRecordAad(spaceId, r.store, r.id));
    await c.query("UPDATE space_keys SET state = 'retired', retired_at = now() WHERE space_id = $1 AND state = 'retiring'", [spaceId]);
    await recordActivity(c, spaceId, userId, 'space.key.rotated', { meta: { gen } });
    keys.wipe();
  });
  p.done = true;
  return p;
}
