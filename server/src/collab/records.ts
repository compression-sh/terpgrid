/**
 * Datensätze gemeinsamer Bereiche – gleiche Semantik wie private Datensätze (records.ts):
 * optimistische Versionen, Konflikte statt stillem Überschreiben, idempotente
 * Wiederholungen (MAC-Vergleich). Zusätzlich:
 *
 * - Jede Änderung prüft Rolle UND Zugriffsstufe der Ressource neu (keine Rechte im Client).
 * - Elternbezüge (z. B. Pflanze → Grow) leitet der Server aus dem Inhalt ab; Kinder erben
 *   die Zugriffsstufe ihrer Wurzel. So kann über verschachtelte Ressourcen keine
 *   eingeschränkte Ressource gelesen oder verändert werden.
 * - Löschen einer Ressource entfernt ihre Unterressourcen und Dateien mit.
 */
import { canonicalJson, decrypt, encrypt, hmac, spaceRecordAad, subkey } from '../crypto.js';
import type { Tx } from '../db.js';
import { trashBlob } from '../files.js';
import { ID_RE, MAX_RECORD_BYTES, SPACE_PARENTS, SPACE_PARENT_REQUIRED, type SpaceStore, isSpaceStore } from '../stores.js';
import { recordActivity } from './activity.js';
import type { SpaceAccess } from './authz.js';
import type { SpaceKeys } from './keys.js';
import { type Access, can, isAccess } from './permissions.js';

export interface SpaceChange {
  store: string;
  id: string;
  baseVersion: number;
  deleted?: boolean;
  data?: unknown;
}

export type SpaceChangeResult =
  | { store: string; id: string; status: 'ok'; version: number; seq: string }
  | { store: string; id: string; status: 'unchanged'; version: number }
  | { store: string; id: string; status: 'conflict'; server: { version: number; deleted: boolean; data: unknown | null } }
  | { store: string; id: string; status: 'rejected'; error: string };

export const spaceMacKey = (key: Buffer) => subkey(key, 'space-record-mac');

export function decodeSpacePayload(key: Buffer, spaceId: string, store: string, id: string, payload: Buffer | null): unknown | null {
  if (!payload) return null;
  return JSON.parse(decrypt(key, payload, spaceRecordAad(spaceId, store, id)).toString('utf8'));
}

/** Elternbezug aus dem Inhalt ableiten (erste gesetzte Referenz in Prioritätsreihenfolge). */
export function deriveParent(store: SpaceStore, data: Record<string, unknown>): { store: SpaceStore; id: string } | null {
  for (const [field, pstore] of SPACE_PARENTS[store]) {
    const v = data[field];
    if (typeof v === 'string' && v !== '') return { store: pstore, id: v };
  }
  return null;
}

interface CurRow {
  version: number;
  deleted: boolean;
  payload: Buffer | null;
  payload_mac: Buffer | null;
  key_gen: number;
  access: Access;
  parent_store: string | null;
  parent_id: string | null;
}

export interface ApplyOptions {
  origin?: 'created' | 'copy' | 'move';
  /** Kein Aktivitätseintrag (z. B. Sammelaktion „geteilt“ schreibt einen eigenen) */
  silent?: boolean;
  /** Zugriffsstufe für neue Wurzel-Ressourcen (nur Eigentümer darf ≠ members setzen) */
  access?: Access;
}

const rejected = (store: string, id: string, error: string): SpaceChangeResult => ({ store, id, status: 'rejected', error });

export async function applySpaceChange(c: Tx, sa: SpaceAccess, userId: string, keys: SpaceKeys, ch: SpaceChange, opts: ApplyOptions = {}): Promise<SpaceChangeResult> {
  const { store, id } = ch ?? ({} as SpaceChange);
  if (!isSpaceStore(store) || typeof id !== 'string' || !ID_RE.test(id)) return rejected(String(store), String(id), 'Ungültiger Bereich oder ID');
  if (!Number.isInteger(ch.baseVersion) || ch.baseVersion < 0) return rejected(store, id, 'Ungültige Version');
  // Ohne Schreibrecht im Bereich gar nicht erst lesen (Kommentieren/Ansehen)
  if (!can(sa.role, 'resource.create') && !can(sa.role, 'resource.update')) return rejected(store, id, 'Keine Berechtigung');

  const deleted = ch.deleted === true;
  let json = '';
  let data: Record<string, unknown> = {};
  if (!deleted) {
    if (ch.data === null || typeof ch.data !== 'object' || Array.isArray(ch.data)) return rejected(store, id, 'Ungültige Daten');
    data = ch.data as Record<string, unknown>;
    if (data.id !== undefined && data.id !== id) return rejected(store, id, 'ID passt nicht zum Inhalt');
    json = JSON.stringify(data);
    if (Buffer.byteLength(json) > MAX_RECORD_BYTES) return rejected(store, id, 'Datensatz zu groß');
  }

  // Zuerst ohne Sperre lesen: SELECT … FOR UPDATE wendet die UPDATE-Policy an und würde einen
  // nur lesbaren Eintrag (z. B. „Schreibgeschützt“) verbergen – er sähe dann wie neu aus.
  const COLS = 'version, deleted, payload, payload_mac, key_gen, access, parent_store, parent_id';
  const peek = await c.query(`SELECT ${COLS} FROM space_records WHERE space_id = $1 AND store = $2 AND id = $3`, [sa.spaceId, store, id]);
  if (peek.rows[0] && !can(sa.role, deleted ? 'resource.delete' : 'resource.update', { access: peek.rows[0].access })) return rejected(store, id, 'Keine Berechtigung');
  const { rows } = peek.rows[0] ? await c.query(`SELECT ${COLS} FROM space_records WHERE space_id = $1 AND store = $2 AND id = $3 FOR UPDATE`, [sa.spaceId, store, id]) : peek;
  const cur = rows[0] as CurRow | undefined;

  // Elternbezug und geerbte Zugriffsstufe
  let parent: { store: SpaceStore; id: string } | null = null;
  let access: Access = cur?.access ?? (opts.access && isAccess(opts.access) ? opts.access : 'members');
  if (!deleted) {
    parent = deriveParent(store, data);
    if (!parent && SPACE_PARENT_REQUIRED.includes(store)) return rejected(store, id, 'Übergeordneter Eintrag fehlt');
    if (parent) {
      if (parent.store === store && parent.id === id) return rejected(store, id, 'Ungültiger Bezug');
      const p = await c.query('SELECT access, deleted FROM space_records WHERE space_id = $1 AND store = $2 AND id = $3', [sa.spaceId, parent.store, parent.id]);
      if (!p.rows[0] || p.rows[0].deleted) return rejected(store, id, 'Übergeordneter Eintrag ist in diesem Bereich nicht vorhanden');
      access = p.rows[0].access;
    } else if (!cur && opts.access && opts.access !== 'members' && sa.role !== 'owner') return rejected(store, id, 'Keine Berechtigung');
  }

  // Berechtigung (alte UND neue Zugriffsstufe müssen schreibbar sein)
  const action = !cur ? 'resource.create' : deleted ? 'resource.delete' : 'resource.update';
  if (cur && !can(sa.role, action, { access: cur.access })) return rejected(store, id, 'Keine Berechtigung');
  // Umhängen zwischen Zugriffsstufen ändert die Sichtbarkeit – das darf nur der Eigentümer
  if (cur && !cur.deleted && !deleted && cur.access !== access && sa.role !== 'owner') return rejected(store, id, 'Nur der Eigentümer kann Einträge zwischen Zugriffsstufen verschieben');
  if (!can(sa.role, action, { access })) return rejected(store, id, 'Keine Berechtigung');

  const canon = deleted ? '' : `${store}|${id}|${canonicalJson(data)}`;
  const mac = deleted ? null : hmac(spaceMacKey(keys.currentKey()), canon);
  if (cur && !cur.deleted && !deleted && cur.payload_mac && cur.payload_mac.equals(cur.key_gen === keys.current ? mac! : hmac(spaceMacKey(keys.get(cur.key_gen)), canon)))
    return { store, id, status: 'unchanged', version: cur.version };
  if (cur && cur.deleted && deleted) return { store, id, status: 'unchanged', version: cur.version };

  const curVersion = cur?.version ?? 0;
  if (curVersion !== ch.baseVersion)
    return { store, id, status: 'conflict', server: { version: curVersion, deleted: cur?.deleted ?? true, data: cur && !cur.deleted ? decodeSpacePayload(keys.get(cur.key_gen), sa.spaceId, store, id, cur.payload) : null } };
  if (!cur && deleted) return { store, id, status: 'unchanged', version: 0 };

  const payload = deleted ? null : encrypt(keys.currentKey(), Buffer.from(json, 'utf8'), spaceRecordAad(sa.spaceId, store, id));
  const version = curVersion + 1;
  const pStore = deleted ? (cur?.parent_store ?? null) : (parent?.store ?? null);
  const pId = deleted ? (cur?.parent_id ?? null) : (parent?.id ?? null);
  const r = cur
    ? await c.query(
        `UPDATE space_records SET version = $4, deleted = $5, payload = $6, payload_mac = $7, size = $8, key_gen = $9, access = $10,
                parent_store = $11, parent_id = $12, updated_by = $13, seq = nextval('space_records_seq'), updated_at = now()
          WHERE space_id = $1 AND store = $2 AND id = $3 RETURNING seq`,
        [sa.spaceId, store, id, version, deleted, payload, mac, payload?.length ?? 0, keys.current, access, pStore, pId, userId],
      )
    : await c.query(
        `INSERT INTO space_records(space_id, store, id, version, deleted, payload, payload_mac, size, key_gen, access, parent_store, parent_id, origin, created_by, updated_by)
         VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13) RETURNING seq`,
        [sa.spaceId, store, id, version, payload, mac, payload!.length, keys.current, access, pStore, pId, opts.origin ?? 'created', userId],
      );

  if (deleted) await deleteDescendants(c, sa, userId, store, id);
  else if (cur && cur.access !== access) await propagateAccess(c, sa.spaceId, store, id, access);
  if (deleted || store === 'photos' || store === 'labReports') await removeOrphanFiles(c, sa.spaceId, store, id, deleted, data);

  if (!opts.silent) await recordActivity(c, sa.spaceId, userId, !cur ? 'resource.created' : deleted ? 'resource.deleted' : 'resource.updated', { store, id });
  return { store, id, status: 'ok', version, seq: String(r.rows[0].seq) };
}

/** Alle (nicht gelöschten) Nachkommen einer Ressource – rekursiv über serverseitige Elternbezüge. */
async function descendants(c: Tx, spaceId: string, store: string, id: string): Promise<{ store: string; id: string; access: Access }[]> {
  const { rows } = await c.query(
    `WITH RECURSIVE d(store, id, access, depth) AS (
       SELECT store, id, access, 1 FROM space_records WHERE space_id = $1 AND parent_store = $2 AND parent_id = $3 AND NOT deleted
       UNION
       SELECT r.store, r.id, r.access, d.depth + 1 FROM space_records r JOIN d ON r.parent_store = d.store AND r.parent_id = d.id
        WHERE r.space_id = $1 AND NOT r.deleted AND d.depth < 6)
     SELECT store, id, access FROM d`,
    [spaceId, store, id],
  );
  return rows;
}

async function deleteDescendants(c: Tx, sa: SpaceAccess, userId: string, store: string, id: string): Promise<void> {
  for (const d of await descendants(c, sa.spaceId, store, id)) {
    await c.query(
      `UPDATE space_records SET deleted = true, payload = NULL, payload_mac = NULL, size = 0, version = version + 1, updated_by = $4,
              seq = nextval('space_records_seq'), updated_at = now()
        WHERE space_id = $1 AND store = $2 AND id = $3 AND NOT deleted`,
      [sa.spaceId, d.store, d.id, userId],
    );
    await removeOrphanFiles(c, sa.spaceId, d.store, d.id, true, {});
  }
}

/** Zugriffsstufe auf alle Nachkommen übertragen (neue Sequenz → Clients erfahren davon). */
export async function propagateAccess(c: Tx, spaceId: string, store: string, id: string, access: Access): Promise<number> {
  let n = 0;
  for (const d of await descendants(c, spaceId, store, id)) {
    if (d.access === access) continue;
    await c.query("UPDATE space_records SET access = $4, seq = nextval('space_records_seq'), updated_at = now() WHERE space_id = $1 AND store = $2 AND id = $3", [spaceId, d.store, d.id, access]);
    n++;
  }
  return n;
}

/** Dateien gelöschter Fotos/Berichte bzw. ersetzter Berichtsdokumente in den Papierkorb. */
async function removeOrphanFiles(c: Tx, spaceId: string, store: string, id: string, deleted: boolean, data: Record<string, unknown>): Promise<void> {
  if (store !== 'photos' && store !== 'labReports') return;
  const keepDoc = !deleted && store === 'labReports' && typeof data.documentId === 'string' ? data.documentId : null;
  const { rows } = await c.query(
    `DELETE FROM space_files WHERE space_id = $1 AND record_store = $2 AND record_id = $3 AND ($4::text IS NULL OR id <> $4) AND ($5 OR $2 = 'labReports')
     RETURNING size, storage_name`,
    [spaceId, store, id, keepDoc, deleted],
  );
  if (!rows.length) return;
  const total = rows.reduce((s, r) => s + Number(r.size), 0);
  await c.query('UPDATE spaces SET storage_bytes = greatest(0, storage_bytes - $2) WHERE id = $1', [spaceId, total]);
  await c.query('UPDATE users SET storage_bytes = greatest(0, storage_bytes - $2) WHERE id = (SELECT owner_id FROM spaces WHERE id = $1)', [spaceId, total]);
  for (const r of rows) await trashBlob(c, r.storage_name);
}

export interface SpaceRemoteChange {
  store: string;
  id: string;
  version: number;
  seq: string;
  deleted: boolean;
  data: unknown | null;
  access: Access;
  origin: string;
  /** Für dich nicht (mehr) sichtbar – lokal entfernen */
  hidden?: boolean;
  updatedAt?: string;
  updatedBy?: string | null;
}

/**
 * Änderungen seit `since`. Sichtbare Zeilen liefert die RLS-gefilterte Tabelle; Zeilen, die
 * der Anfragende nicht (mehr) lesen darf (z. B. nach Einschränkung der Zugriffsstufe),
 * kommen als „hidden“-Löschmarke ohne Inhalt, damit Clients sie entfernen.
 */
export async function listSpaceChanges(c: Tx, spaceId: string, keys: SpaceKeys, since: bigint, limit: number): Promise<{ changes: SpaceRemoteChange[]; more: boolean }> {
  const vis = await c.query(
    `SELECT store, id, version, seq, deleted, payload, key_gen, access, origin, updated_at, updated_by
       FROM space_records WHERE space_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
    [spaceId, since.toString(), limit + 1],
  );
  const hid = await c.query('SELECT store, id, seq FROM tg_hidden_space_changes($1, $2, $3)', [spaceId, since.toString(), limit + 1]);
  const all: SpaceRemoteChange[] = [
    ...vis.rows.map((r) => ({
      store: r.store,
      id: r.id,
      version: r.version,
      seq: String(r.seq),
      deleted: r.deleted,
      data: r.deleted ? null : decodeSpacePayload(keys.get(r.key_gen), spaceId, r.store, r.id, r.payload),
      access: r.access,
      origin: r.origin,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    })),
    ...hid.rows.map((r) => ({ store: r.store, id: r.id, version: 0, seq: String(r.seq), deleted: true, data: null, access: 'editors' as Access, origin: 'created', hidden: true })),
  ].sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1));
  return { changes: all.slice(0, limit), more: all.length > limit };
}

/** Zugriffsstufe einer Wurzel-Ressource ändern (nur Eigentümer; Kinder folgen). */
export async function setResourceAccess(c: Tx, sa: SpaceAccess, userId: string, store: string, id: string, access: Access): Promise<{ changed: number }> {
  const { rows } = await c.query('SELECT access, parent_id, deleted FROM space_records WHERE space_id = $1 AND store = $2 AND id = $3 FOR UPDATE', [sa.spaceId, store, id]);
  const r = rows[0];
  if (!r || r.deleted) return { changed: -1 };
  if (r.parent_id) return { changed: -2 };
  if (r.access === access) return { changed: 0 };
  await c.query("UPDATE space_records SET access = $4, seq = nextval('space_records_seq'), updated_at = now(), updated_by = $5 WHERE space_id = $1 AND store = $2 AND id = $3", [
    sa.spaceId,
    store,
    id,
    access,
    userId,
  ]);
  const n = await propagateAccess(c, sa.spaceId, store, id, access);
  await recordActivity(c, sa.spaceId, userId, 'resource.access', { store, id, meta: { access } });
  return { changed: n + 1 };
}
