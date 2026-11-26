/**
 * Teilen privater Inhalte in einen gemeinsamen Bereich (Phase 5.5).
 *
 * Zwei ausdrücklich verschiedene Modi:
 * - **Kopie (Standard):** Unabhängige Kopie mit neuen IDs; das Original bleibt privat und
 *   unverändert. Spätere private Änderungen werden NICHT übertragen. Die Kopie ist als
 *   „geteilte Kopie“ gekennzeichnet (origin = copy).
 * - **Verschieben:** Nur für Grows (mit Pflanzen, Aktivitäten, Fotos), Journal-Einträge und
 *   Laborberichte. Eine Transaktion: Inhalte samt Dateien werden mit dem Bereichsschlüssel
 *   neu verschlüsselt, die privaten Datensätze als gelöscht markiert (Sync entfernt sie auf
 *   allen Geräten). Bei jedem Fehler bleibt alles unverändert.
 *
 * Alles läuft serverseitig im Kontext des Besitzers: Nur dessen eigene, synchronisierte
 * Daten können geteilt werden; der Kontoschlüssel verlässt nie diesen Ablauf, Mitglieder
 * erhalten nur mit dem Bereichsschlüssel verschlüsselte Kopien.
 */
import { randomUUID } from 'node:crypto';
import type { AppContext } from '../context.js';
import { decrypt, encrypt, fileAad, spaceFileAad } from '../crypto.js';
import type { Tx } from '../db.js';
import { newStorageName, readBlob, removeBlob, trashBlob, writeBlob } from '../files.js';
import { HttpError } from '../http.js';
import { applyChange, decodePayload } from '../records.js';
import type { SpaceStore } from '../stores.js';
import type { UserKeys } from '../userkeys.js';
import { recordActivity } from './activity.js';
import { type SpaceAccess, assertCan } from './authz.js';
import type { SpaceKeys } from './keys.js';
import { notifyMembers } from './notify.js';
import { applySpaceChange } from './records.js';

export const SHAREABLE = ['grows', 'plants', 'strains', 'journal', 'inventory', 'labReports'] as const;
export type Shareable = (typeof SHAREABLE)[number];
export const MOVABLE: readonly Shareable[] = ['grows', 'journal', 'labReports'];

export interface ShareOptions {
  /** Fotos mitteilen (Standard: ja) */
  photos?: boolean;
  /** Erinnerungen eines Grows als Aufgaben mitteilen (Standard: ja) */
  tasks?: boolean;
  /** Sammlung: Mengen/Verlauf mitteilen (Standard: nein) */
  quantities?: boolean;
  /** Sammlung: Kosten, Kaufdatum, Garantie mitteilen (Standard: nein) */
  costs?: boolean;
  /** Persönliche Notizen mitteilen (Standard: ja) */
  notes?: boolean;
  /** Laborbericht: Originaldokument mitteilen (Standard: ja) */
  documents?: boolean;
}

export interface ShareItem {
  store: Shareable;
  id: string;
}

type Rec = Record<string, unknown> & { id: string };
const PRIVATE_TO_SPACE: Record<string, SpaceStore> = {
  grows: 'grows',
  plants: 'plants',
  activities: 'activities',
  photos: 'photos',
  strains: 'strains',
  journal: 'journal',
  inventory: 'inventory',
  labReports: 'labReports',
  reminders: 'tasks',
};
/** Einfügereihenfolge: Eltern vor Kindern */
const ORDER: SpaceStore[] = ['grows', 'strains', 'journal', 'inventory', 'labReports', 'plants', 'activities', 'photos', 'tasks', 'notes'];
const REF_FIELDS: Record<string, string> = { growId: 'grows', plantId: 'plants', strainId: 'strains', journalId: 'journal', inventoryId: 'inventory', coverPhotoId: 'photos' };

interface PlanRecord {
  fromStore: string;
  fromId: string;
  fromVersion: number;
  store: SpaceStore;
  id: string;
  data: Rec;
}
interface PlanFile {
  kind: 'photo' | 'labdoc';
  fromId: string;
  id: string;
  recordStore: SpaceStore;
  recordId: string;
}
export interface SharePlan {
  mode: 'copy' | 'move';
  records: PlanRecord[];
  files: PlanFile[];
  summary: {
    counts: Partial<Record<SpaceStore, number>>;
    titles: { store: SpaceStore; title: string }[];
    photos: number;
    documents: number;
    bytes: number;
    removed: string[];
    warnings: string[];
  };
}

const title = (store: string, d: Rec): string => {
  const t = (d.name ?? d.title ?? d.strainName ?? d.note ?? '') as string;
  if (t) return String(t).slice(0, 80);
  if (store === 'journal') return `Eintrag vom ${String(d.date ?? '').slice(0, 10)}`;
  return 'Ohne Titel';
};

/** Lädt alle (nicht gelöschten) privaten Datensätze der benötigten Bereiche des Besitzers. */
async function loadPrivate(c: Tx, userId: string, keys: UserKeys, stores: string[]): Promise<Map<string, Map<string, { data: Rec; version: number }>>> {
  const out = new Map<string, Map<string, { data: Rec; version: number }>>(stores.map((s) => [s, new Map()]));
  const { rows } = await c.query('SELECT store, id, version, payload, dek_gen FROM records WHERE user_id = $1 AND store = ANY($2::text[]) AND NOT deleted', [userId, stores]);
  for (const r of rows) out.get(r.store)!.set(r.id, { data: decodePayload(keys.get(r.dek_gen), userId, r.store, r.id, r.payload) as Rec, version: r.version });
  return out;
}

function sanitize(store: SpaceStore, d: Rec, o: Required<ShareOptions>, removed: Set<string>): Rec {
  const x: Rec = { ...d };
  const drop = (keys: string[], reason: string) => {
    for (const k of keys)
      if (k in x) {
        delete x[k];
        removed.add(reason);
      }
  };
  if (store === 'inventory') {
    if (!o.quantities) drop(['quantity', 'quantityLog'], 'Mengen und Mengenverlauf der Sammlung');
    if (!o.costs) drop(['cost', 'purchaseDate', 'warrantyUntil'], 'Kosten, Kaufdatum und Garantie');
    if (!o.notes) drop(['maintenanceLog'], 'Wartungsprotokoll');
  }
  if (!o.notes)
    for (const k of ['notes', 'observations', 'flavorNotes'])
      if (typeof x[k] === 'string' && x[k]) {
        x[k] = '';
        removed.add('Persönliche Notizen');
      }
  // Rein lokale Zuordnungen (eigene Grow-Bereiche/Räume) nie mitteilen
  drop(['spaceId'], 'Zuordnung zu eigenen Räumen/Zelten');
  return x;
}

/**
 * Plan erstellen (für Vorschau und Ausführung identisch). Prüft Eigentum: Es werden nur
 * Datensätze des angemeldeten Kontos gelesen (RLS + expliziter user_id-Filter).
 */
export async function planShare(c: Tx, userId: string, keys: UserKeys, items: ShareItem[], mode: 'copy' | 'move', opts: ShareOptions = {}): Promise<SharePlan> {
  const o: Required<ShareOptions> = { photos: opts.photos !== false, tasks: opts.tasks !== false, quantities: opts.quantities === true, costs: opts.costs === true, notes: opts.notes !== false, documents: opts.documents !== false };
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new HttpError(400, 'Bitte 1–200 Einträge auswählen.');
  for (const it of items) {
    if (!(SHAREABLE as readonly string[]).includes(it?.store) || typeof it.id !== 'string') throw new HttpError(400, 'Ungültige Auswahl');
    if (mode === 'move' && !MOVABLE.includes(it.store)) throw new HttpError(400, 'Verschieben ist nur für Grows, Journal-Einträge und Laborberichte möglich.');
  }
  const priv = await loadPrivate(c, userId, keys, ['grows', 'plants', 'activities', 'photos', 'strains', 'journal', 'inventory', 'labReports', 'reminders']);
  const chosen = new Map<string, { store: string; id: string }>(); // key store:id
  const add = (store: string, id: string) => chosen.set(`${store}:${id}`, { store, id });
  for (const it of items) {
    if (!priv.get(it.store)!.has(it.id)) throw new HttpError(404, 'Ein ausgewählter Eintrag wurde nicht gefunden – bitte zuerst synchronisieren.');
    add(it.store, it.id);
  }
  // Zugehörige Inhalte einsammeln
  const growIds = new Set(items.filter((i) => i.store === 'grows').map((i) => i.id));
  const plantIds = new Set(items.filter((i) => i.store === 'plants').map((i) => i.id));
  for (const [id, p] of priv.get('plants')!)
    if (growIds.has(p.data.growId as string)) {
      add('plants', id);
      plantIds.add(id);
    }
  for (const [id, a] of priv.get('activities')!) if (growIds.has(a.data.growId as string) || plantIds.has(a.data.plantId as string)) add('activities', id);
  if (o.tasks) for (const [id, r] of priv.get('reminders')!) if (growIds.has(r.data.growId as string)) add('reminders', id);
  if (o.photos) {
    for (const [id, ph] of priv.get('photos')!) {
      const d = ph.data;
      const hit =
        growIds.has(d.growId as string) ||
        plantIds.has(d.plantId as string) ||
        (typeof d.journalId === 'string' && chosen.has(`journal:${d.journalId}`)) ||
        (typeof d.strainId === 'string' && chosen.has(`strains:${d.strainId}`) && !d.growId && !d.plantId) ||
        (typeof d.inventoryId === 'string' && chosen.has(`inventory:${d.inventoryId}`));
      if (hit) add('photos', id);
    }
  }

  // ID-Zuordnung: Kopie → neue IDs, Verschieben → gleiche IDs
  const idMap = new Map<string, string>(); // "store:old" → new
  for (const k of chosen.keys()) {
    const [store, id] = k.split(/:(.*)/s) as [string, string];
    idMap.set(k, mode === 'copy' ? randomUUID() : id);
    void store;
  }
  const mapRef = (store: string, id: unknown): string | undefined => (typeof id === 'string' ? idMap.get(`${store}:${id}`) : undefined);

  const removed = new Set<string>();
  const records: PlanRecord[] = [];
  const files: PlanFile[] = [];
  const docIds = new Map<string, string>();
  for (const { store: from, id } of chosen.values()) {
    const src = priv.get(from)!.get(id)!;
    const store = PRIVATE_TO_SPACE[from]!;
    let d = sanitize(store, { ...src.data }, o, removed);
    const newId = idMap.get(`${from}:${id}`)!;
    d.id = newId;
    // Bezüge umschreiben bzw. entfernen, wenn das Ziel nicht mitgeteilt wird
    for (const [field, refStore] of Object.entries(REF_FIELDS)) {
      if (!(field in d)) continue;
      const mapped = mapRef(refStore, d[field]);
      if (mapped) d[field] = mapped;
      else {
        delete d[field];
        if (field === 'strainId' && from !== 'labReports') removed.add('Verknüpfungen zu nicht geteilten Sorten (Sortenname bleibt erhalten)');
      }
    }
    if (Array.isArray(d.photoIds)) d.photoIds = (d.photoIds as unknown[]).map((p) => mapRef('photos', p)).filter(Boolean);
    if (Array.isArray(d.experiments))
      d.experiments = (d.experiments as Rec[]).map((e) => ({ ...e, plantIds: Array.isArray(e.plantIds) ? (e.plantIds as unknown[]).map((p) => mapRef('plants', p)).filter(Boolean) : [] }));
    if (from === 'reminders') {
      // Erinnerung → Aufgabe (Erledigt-Status bleibt erhalten)
      d = { id: newId, title: d.title, date: d.date, time: d.time, category: d.category, growId: d.growId, plantId: d.plantId, repeat: d.repeat, completedDates: d.completedDates ?? [], notes: d.notes ?? '', createdAt: d.createdAt, updatedAt: d.updatedAt };
      if (!d.plantId) delete d.plantId;
    }
    if (store === 'labReports' && typeof src.data.documentId === 'string') {
      if (o.documents) {
        const docId = mode === 'copy' ? randomUUID() : (src.data.documentId as string);
        docIds.set(src.data.documentId as string, docId);
        d.documentId = docId;
        files.push({ kind: 'labdoc', fromId: src.data.documentId as string, id: docId, recordStore: 'labReports', recordId: newId });
      } else {
        delete d.documentId;
        delete d.documentName;
        delete d.documentMime;
        removed.add('Originaldokumente der Laborberichte');
      }
    }
    if (store === 'photos') files.push({ kind: 'photo', fromId: id, id: newId, recordStore: 'photos', recordId: newId });
    records.push({ fromStore: from, fromId: id, fromVersion: src.version, store, id: newId, data: d });
  }
  records.sort((a, b) => ORDER.indexOf(a.store) - ORDER.indexOf(b.store));

  const counts: Partial<Record<SpaceStore, number>> = {};
  for (const r of records) counts[r.store] = (counts[r.store] ?? 0) + 1;
  const warnings: string[] = [];
  if (mode === 'move') {
    let dangling = 0;
    for (const st of ['reminders', 'inventory', 'expenses'] as const) {
      if (st === 'expenses') continue;
      for (const [rid, r] of priv.get(st) ?? []) if (growIds.has(r.data.growId as string) && !chosen.has(`${st}:${rid}`)) dangling++;
    }
    if (dangling) warnings.push(`${dangling} private Einträge (z. B. Erinnerungen, Sammlung) bleiben privat und verlieren die Verknüpfung zum verschobenen Grow.`);
    warnings.push('Die verschobenen Inhalte gehören danach zum Bereich: Der Bereichseigentümer verwaltet sie, Mitglieder sehen sie gemäß ihrer Rolle. In deinen privaten Daten sind sie nicht mehr vorhanden.');
  }
  return {
    mode,
    records,
    files,
    summary: {
      counts,
      titles: records.filter((r) => ['grows', 'plants', 'strains', 'journal', 'inventory', 'labReports'].includes(r.store)).slice(0, 50).map((r) => ({ store: r.store, title: title(r.store, r.data) })),
      photos: files.filter((f) => f.kind === 'photo').length,
      documents: files.filter((f) => f.kind === 'labdoc').length,
      bytes: 0,
      removed: [...removed],
      warnings,
    },
  };
}

/** Größe der mitgeteilten Dateien (für Vorschau und Kontingent). */
export async function planBytes(c: Tx, userId: string, plan: SharePlan): Promise<number> {
  if (!plan.files.length) return 0;
  const { rows } = await c.query(
    `SELECT coalesce(sum(size), 0)::bigint AS n FROM files WHERE user_id = $1 AND (kind, id) IN (SELECT * FROM unnest($2::text[], $3::text[]))`,
    [userId, plan.files.map((f) => f.kind), plan.files.map((f) => f.fromId)],
  );
  return Number(rows[0].n);
}

/**
 * Plan ausführen – eine Transaktion (Aufrufer: withUser). Neue Blobs werden vor dem Commit
 * geschrieben und bei einem Fehler wieder entfernt; alte Blobs (Verschieben) kommen in den
 * Papierkorb derselben Transaktion.
 */
export async function executeShare(ctx: AppContext, c: Tx, sa: SpaceAccess, userId: string, userKeys: UserKeys, spaceKeys: SpaceKeys, plan: SharePlan): Promise<{ created: number; files: number }> {
  assertCan(sa, 'resource.shareInto');
  const written: string[] = [];
  try {
    // Kontingent: Dateien zählen beim Bereichseigentümer
    const bytes = await planBytes(c, userId, plan);
    if (bytes) {
      const u = await c.query('SELECT storage_bytes FROM users WHERE id = $1 FOR UPDATE', [sa.ownerId]);
      if (Number(u.rows[0].storage_bytes) + bytes > ctx.config.userQuotaBytes) throw new HttpError(413, 'Das Speicherkontingent des Bereichseigentümers reicht dafür nicht aus.');
    }
    for (const r of plan.records) {
      const res = await applySpaceChange(c, sa, userId, spaceKeys, { store: r.store, id: r.id, baseVersion: 0, data: r.data }, { origin: plan.mode, silent: true });
      if (res.status !== 'ok') throw new HttpError(409, res.status === 'rejected' ? `Teilen abgebrochen: ${res.error}` : 'Teilen abgebrochen: Ein Eintrag existiert im Bereich bereits.');
    }
    let fileCount = 0;
    let total = 0;
    for (const f of plan.files) {
      const { rows } = await c.query('SELECT variant, mime, size, storage_name, dek_gen FROM files WHERE user_id = $1 AND kind = $2 AND id = $3', [userId, f.kind, f.fromId]);
      for (const src of rows) {
        const plain = decrypt(userKeys.get(src.dek_gen), await readBlob(ctx.config.fileDir, src.storage_name), fileAad(userId, f.kind, f.fromId, src.variant));
        const name = newStorageName();
        await writeBlob(ctx.config.fileDir, name, encrypt(spaceKeys.currentKey(), plain, spaceFileAad(sa.spaceId, f.kind, f.id, src.variant)));
        plain.fill(0);
        written.push(name);
        await c.query(
          `INSERT INTO space_files(space_id, kind, id, variant, mime, size, storage_name, key_gen, record_store, record_id, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [sa.spaceId, f.kind, f.id, src.variant, src.mime, src.size, name, spaceKeys.current, f.recordStore, f.recordId, userId],
        );
        total += Number(src.size);
        fileCount++;
        if (plan.mode === 'move') {
          await c.query('DELETE FROM files WHERE user_id = $1 AND kind = $2 AND id = $3 AND variant = $4', [userId, f.kind, f.fromId, src.variant]);
          await c.query('UPDATE users SET storage_bytes = greatest(0, storage_bytes - $2) WHERE id = $1', [userId, src.size]);
          await trashBlob(c, src.storage_name);
        }
      }
    }
    if (total) {
      await c.query('UPDATE spaces SET storage_bytes = storage_bytes + $2 WHERE id = $1', [sa.spaceId, total]);
      await c.query('UPDATE users SET storage_bytes = storage_bytes + $2 WHERE id = $1', [sa.ownerId, total]);
    }
    if (plan.mode === 'move') {
      // Private Originale als gelöscht markieren (Version + 1 → alle Geräte entfernen sie)
      for (const r of plan.records) {
        const res = await applyChange(c, userId, userKeys, { store: r.fromStore, id: r.fromId, baseVersion: r.fromVersion, deleted: true });
        if (res.status !== 'ok') throw new HttpError(409, 'Verschieben abgebrochen: Ein privater Eintrag wurde zwischenzeitlich geändert. Bitte synchronisieren und erneut versuchen.');
      }
    }
    const roots = plan.records.filter((r) => ['grows', 'plants', 'strains', 'journal', 'inventory', 'labReports'].includes(r.store));
    await recordActivity(c, sa.spaceId, userId, plan.mode === 'move' ? 'resource.moved' : 'resource.shared', {
      store: roots.length === 1 ? roots[0]!.store : undefined,
      id: roots.length === 1 ? roots[0]!.id : undefined,
      meta: { items: plan.records.length, files: fileCount },
    });
    await notifyMembers(c, sa.spaceId, userId, { category: 'updates', type: 'space.update' });
    return { created: plan.records.length, files: fileCount };
  } catch (e) {
    for (const n of written) await removeBlob(ctx.config.fileDir, n).catch(() => {});
    throw e;
  }
}
