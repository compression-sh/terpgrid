/**
 * Verschlüsselte Datensätze je Benutzer. Jede Funktion erwartet eine
 * Transaktion aus withUser() (RLS aktiv) und filtert zusätzlich explizit nach user_id.
 */
import { canonicalJson, decrypt, encrypt, hmac, recordAad, subkey } from './crypto.js';
import type { Tx } from './db.js';
import { HttpError } from './http.js';
import { ID_RE, MAX_RECORD_BYTES, type SyncStore, isSyncStore } from './stores.js';

export interface Change {
  store: string;
  id: string;
  baseVersion: number;
  deleted?: boolean;
  data?: unknown;
  mode?: 'import';
}

export type ChangeResult =
  | { store: string; id: string; status: 'ok'; version: number; seq: string }
  | { store: string; id: string; status: 'unchanged'; version: number }
  | { store: string; id: string; status: 'conflict'; server: { version: number; deleted: boolean; data: unknown | null } }
  | { store: string; id: string; status: 'rejected'; error: string };

export function macKey(dek: Buffer): Buffer {
  return subkey(dek, 'record-mac');
}

export function decodePayload(dek: Buffer, userId: string, store: string, id: string, payload: Buffer | null): unknown | null {
  if (!payload) return null;
  return JSON.parse(decrypt(dek, payload, recordAad(userId, store, id)).toString('utf8'));
}

export async function applyChange(c: Tx, userId: string, dek: Buffer, ch: Change): Promise<ChangeResult> {
  const { store, id } = ch;
  if (!isSyncStore(store) || typeof id !== 'string' || !ID_RE.test(id)) return { store: String(store), id: String(id), status: 'rejected', error: 'Ungültiger Bereich oder ID' };
  if (!Number.isInteger(ch.baseVersion) || ch.baseVersion < 0) return { store, id, status: 'rejected', error: 'Ungültige Version' };
  const deleted = ch.deleted === true;
  let json = '';
  if (!deleted) {
    if (ch.data === null || typeof ch.data !== 'object' || Array.isArray(ch.data)) return { store, id, status: 'rejected', error: 'Ungültige Daten' };
    // Die ID im Inhalt muss zur Datensatz-ID passen (verhindert Verwechslungen)
    const inner = (ch.data as Record<string, unknown>).id ?? (ch.data as Record<string, unknown>).key;
    if (inner !== undefined && inner !== id) return { store, id, status: 'rejected', error: 'ID passt nicht zum Inhalt' };
    json = JSON.stringify(ch.data);
    if (Buffer.byteLength(json) > MAX_RECORD_BYTES) return { store, id, status: 'rejected', error: 'Datensatz zu groß' };
  }
  const mac = deleted ? null : hmac(macKey(dek), `${store}|${id}|${canonicalJson(ch.data)}`);

  const { rows } = await c.query('SELECT version, deleted, payload, payload_mac FROM records WHERE user_id = $1 AND store = $2 AND id = $3 FOR UPDATE', [userId, store, id]);
  const cur = rows[0] as { version: number; deleted: boolean; payload: Buffer | null; payload_mac: Buffer | null } | undefined;

  // Idempotenter Import: identischer Inhalt → nichts tun
  if (cur && !cur.deleted && mac && cur.payload_mac && cur.payload_mac.equals(mac)) return { store, id, status: 'unchanged', version: cur.version };
  if (cur && cur.deleted && deleted) return { store, id, status: 'unchanged', version: cur.version };

  const curVersion = cur?.version ?? 0;
  if (curVersion !== ch.baseVersion) {
    return { store, id, status: 'conflict', server: { version: curVersion, deleted: cur?.deleted ?? true, data: cur && !cur.deleted ? decodePayload(dek, userId, store, id, cur.payload) : null } };
  }
  if (!cur && deleted) return { store, id, status: 'unchanged', version: 0 };

  const payload = deleted ? null : encrypt(dek, Buffer.from(json, 'utf8'), recordAad(userId, store, id));
  const size = payload?.length ?? 0;
  const version = curVersion + 1;
  const r = cur
    ? await c.query(
        `UPDATE records SET version = $4, deleted = $5, payload = $6, payload_mac = $7, size = $8, seq = nextval('records_seq'), updated_at = now()
          WHERE user_id = $1 AND store = $2 AND id = $3 RETURNING seq`,
        [userId, store, id, version, deleted, payload, mac, size],
      )
    : await c.query(
        `INSERT INTO records(user_id, store, id, version, deleted, payload, payload_mac, size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING seq`,
        [userId, store, id, version, deleted, payload, mac, size],
      );
  return { store, id, status: 'ok', version, seq: String(r.rows[0].seq) };
}

export async function listChanges(c: Tx, userId: string, dek: Buffer, since: bigint, limit: number) {
  const { rows } = await c.query(
    'SELECT store, id, version, seq, deleted, payload, updated_at FROM records WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3',
    [userId, since.toString(), limit],
  );
  return rows.map((r) => ({
    store: r.store as SyncStore,
    id: r.id as string,
    version: r.version as number,
    seq: String(r.seq),
    deleted: r.deleted as boolean,
    data: r.deleted ? null : decodePayload(dek, userId, r.store, r.id, r.payload),
    updatedAt: r.updated_at,
  }));
}

export function assertChanges(body: unknown): Change[] {
  const changes = (body as { changes?: unknown })?.changes;
  if (!Array.isArray(changes) || changes.length > 200) throw new HttpError(400, 'Ungültige Änderungsliste (max. 200)');
  return changes as Change[];
}
