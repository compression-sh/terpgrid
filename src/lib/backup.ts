/**
 * Lokale Datensicherung als ZIP:
 *   manifest.json            versioniertes JSON mit allen Datensätzen
 *   photos/<id>.jpg          Fotos (komprimiert, ohne Metadaten)
 *   photos/thumbs/<id>.jpg   Vorschaubilder
 *
 * Import prüft Format, Version, Datensatz-Struktur und Beziehungen zwischen
 * Datensätzen, bevor etwas geschrieben wird.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { DB_VERSION, RECORD_STORES, type StoreMap, getAll, getOne, writeBatch } from './db/database';
import { normalizeSettings } from './db/repo';
import type { AppSettings, LabDocument, PhotoData } from './db/types';

export const BACKUP_APP = 'TERPGRID';
/** Format 2: zusätzlich Laborberichte inkl. Originaldokumente (Format 1 bleibt importierbar). */
export const BACKUP_FORMAT = 2;

export type RecordStore = (typeof RECORD_STORES)[number];
export type BackupData = { [S in RecordStore]: StoreMap[S][] };

export interface BackupManifest {
  app: typeof BACKUP_APP;
  format: number;
  schemaVersion: number;
  exportedAt: string;
  counts: Record<RecordStore, number>;
  settings?: AppSettings;
  data: BackupData;
  photoFiles: { id: string; full: string; thumb: string; mime: string }[];
  docFiles?: { id: string; path: string; mime: string; name: string }[];
}

export interface ParsedBackup {
  manifest: BackupManifest;
  photoData: Map<string, PhotoData>;
  docData: Map<string, LabDocument>;
  issues: string[];
  /** Schwerwiegende Fehler – Import nicht möglich. */
  errors: string[];
}

export function emptyData(): BackupData {
  return Object.fromEntries(RECORD_STORES.map((s) => [s, []])) as unknown as BackupData;
}

const toU8 = (buf: ArrayBuffer) => new Uint8Array(buf);
const toBuf = (u8: Uint8Array): ArrayBuffer => u8.slice().buffer as ArrayBuffer;
const ext = (mime: string) => (mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg');

/* ───────────── Export ───────────── */

export async function readAllData(): Promise<BackupData> {
  const entries = await Promise.all(RECORD_STORES.map(async (s) => [s, await getAll(s)] as const));
  return Object.fromEntries(entries) as unknown as BackupData;
}

export function buildManifest(data: BackupData, photoData: PhotoData[], settings?: AppSettings, exportedAt = new Date(), docs: LabDocument[] = []): BackupManifest {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schemaVersion: DB_VERSION,
    exportedAt: exportedAt.toISOString(),
    counts: Object.fromEntries(RECORD_STORES.map((s) => [s, data[s].length])) as Record<RecordStore, number>,
    settings,
    data,
    photoFiles: photoData.map((p) => ({
      id: p.id,
      full: `photos/${p.id}.${ext(p.mime)}`,
      thumb: `photos/thumbs/${p.id}.${ext(p.mime)}`,
      mime: p.mime,
    })),
    docFiles: docs.map((d) => ({ id: d.id, path: `documents/${d.id}`, mime: d.mime, name: d.name })),
  };
}

export function zipBackup(manifest: BackupManifest, photoData: PhotoData[], docs: LabDocument[] = []): Uint8Array {
  const files: Zippable = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)) };
  const byId = new Map(photoData.map((p) => [p.id, p]));
  for (const f of manifest.photoFiles) {
    const p = byId.get(f.id);
    if (!p) continue;
    // Bilder sind bereits komprimiert → speichern statt deflate (level 0) spart Zeit.
    files[f.full] = [toU8(p.full), { level: 0 }];
    files[f.thumb] = [toU8(p.thumb), { level: 0 }];
  }
  const docById = new Map(docs.map((d) => [d.id, d]));
  for (const f of manifest.docFiles ?? []) {
    const d = docById.get(f.id);
    if (d) files[f.path] = [toU8(d.data), { level: 6 }];
  }
  files['LIESMICH.txt'] = strToU8(
    [
      'TERPGRID – lokale Datensicherung',
      `Erstellt: ${manifest.exportedAt}`,
      `Format ${manifest.format}, Schema ${manifest.schemaVersion}`,
      '',
      'manifest.json enthält alle Datensätze (Grows, Pflanzen, Aktivitäten, Sorten, Journal, Sammlung, …).',
      'Der Ordner photos/ enthält die Fotos ohne Metadaten.',
      'Wiederherstellen: TERPGRID → Daten → Backup importieren.',
      'Diese Datei ist NICHT verschlüsselt. Bitte sicher aufbewahren.',
    ].join('\n'),
  );
  return zipSync(files, { level: 6 });
}

export async function createFullBackup(options: { includePhotos?: boolean } = {}): Promise<{ bytes: Uint8Array; manifest: BackupManifest }> {
  const data = await readAllData();
  const settingsRow = await getOne('settings', 'app');
  const photoData = options.includePhotos === false ? [] : await getAll('photoData');
  const docs = options.includePhotos === false ? [] : await getAll('labDocs');
  const manifest = buildManifest(data, photoData, normalizeSettings(settingsRow?.value), new Date(), docs);
  return { bytes: zipBackup(manifest, photoData, docs), manifest };
}

/** Nur strukturierte Daten als JSON (ohne Bilder). */
export async function exportStructuredJson(): Promise<string> {
  const data = await readAllData();
  return JSON.stringify({ app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Alle Fotos in voller Auflösung als ZIP, Dateiname nach Aufnahmedatum. */
export async function exportPhotosZip(): Promise<Uint8Array> {
  const [photos, data, plants, grows] = await Promise.all([getAll('photos'), getAll('photoData'), getAll('plants'), getAll('grows')]);
  const byId = new Map(data.map((d) => [d.id, d]));
  const plantName = new Map(plants.map((p) => [p.id, p.name]));
  const growName = new Map(grows.map((g) => [g.id, g.name]));
  const files: Zippable = {};
  const used = new Set<string>();
  for (const p of [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt))) {
    const d = byId.get(p.id);
    if (!d) continue;
    const label = [p.growId && growName.get(p.growId), p.plantId && plantName.get(p.plantId)].filter(Boolean).join('_');
    const base = `${p.takenAt.replace(/[:T]/g, '-')}${label ? `_${label}` : ''}`.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 90);
    let name = `${base}.${ext(d.mime)}`;
    for (let i = 2; used.has(name); i++) name = `${base}-${i}.${ext(d.mime)}`;
    used.add(name);
    files[name] = [toU8(d.full), { level: 0 }];
  }
  return zipSync(files);
}

/* ───────────── Validierung ───────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** Pflichtfelder je Store (minimal, aber ausreichend gegen fremde/beschädigte Dateien). */
const REQUIRED: Record<RecordStore, string[]> = {
  grows: ['name', 'startDate', 'status'],
  plants: ['growId', 'name', 'startDate'],
  activities: ['growId', 'type', 'date'],
  photos: ['takenAt', 'mime'],
  reminders: ['title', 'date', 'category'],
  strains: ['name'],
  journal: ['date', 'method'],
  inventory: ['name', 'category'],
  expenses: ['date', 'category'],
  calculations: ['kind', 'name'],
  labReports: ['title', 'unit', 'origin'],
};

/**
 * Prüft Beziehungen zwischen Datensätzen. Gibt verständliche Meldungen zurück.
 */
export function checkIntegrity(data: BackupData, photoIdsWithData?: Set<string>): string[] {
  const issues: string[] = [];
  const set = <T extends { id: string }>(rows: T[]) => new Set(rows.map((r) => r.id));
  const grows = set(data.grows);
  const plants = set(data.plants);
  const strains = set(data.strains);
  const journal = set(data.journal);
  const inventory = set(data.inventory);
  const photos = set(data.photos);

  for (const p of data.plants) if (!grows.has(p.growId)) issues.push(`Pflanze „${p.name}“ verweist auf einen fehlenden Grow.`);
  for (const a of data.activities) {
    if (!grows.has(a.growId)) issues.push(`Aktivität vom ${a.date.slice(0, 10)} verweist auf einen fehlenden Grow.`);
    if (a.plantId && !plants.has(a.plantId)) issues.push(`Aktivität vom ${a.date.slice(0, 10)} verweist auf eine fehlende Pflanze.`);
  }
  for (const p of data.photos) {
    if (p.growId && !grows.has(p.growId)) issues.push('Ein Foto verweist auf einen fehlenden Grow.');
    if (p.plantId && !plants.has(p.plantId)) issues.push('Ein Foto verweist auf eine fehlende Pflanze.');
    if (p.strainId && !strains.has(p.strainId)) issues.push('Ein Foto verweist auf eine fehlende Sorte.');
    if (p.journalId && !journal.has(p.journalId)) issues.push('Ein Foto verweist auf einen fehlenden Journal-Eintrag.');
    if (p.inventoryId && !inventory.has(p.inventoryId)) issues.push('Ein Foto verweist auf einen fehlenden Sammlungs-Eintrag.');
    if (photoIdsWithData && !photoIdsWithData.has(p.id)) issues.push(`Für ein Foto vom ${p.takenAt.slice(0, 10)} fehlen die Bilddaten.`);
  }
  for (const j of data.journal) if (j.strainId && !strains.has(j.strainId)) issues.push(`Journal-Eintrag vom ${j.date.slice(0, 10)} verweist auf eine fehlende Sorte.`);
  for (const p of data.plants) if (p.strainId && !strains.has(p.strainId)) issues.push(`Pflanze „${p.name}“ verweist auf eine fehlende Sorte.`);
  for (const l of data.labReports ?? []) if (l.strainId && !strains.has(l.strainId)) issues.push(`Laborbericht „${l.title}“ verweist auf eine fehlende Sorte.`);
  for (const r of data.reminders) if (r.growId && !grows.has(r.growId)) issues.push(`Erinnerung „${r.title}“ verweist auf einen fehlenden Grow.`);
  for (const e of data.expenses) if (e.growId && !grows.has(e.growId)) issues.push('Eine Ausgabe verweist auf einen fehlenden Grow.');
  const covers: { label: string; rows: { coverPhotoId?: string }[] }[] = [
    { label: 'Grow', rows: data.grows },
    { label: 'Pflanze', rows: data.plants },
    { label: 'Sorte', rows: data.strains },
    { label: 'Sammlungs-Eintrag', rows: data.inventory },
  ];
  for (const c of covers) for (const r of c.rows) if (r.coverPhotoId && !photos.has(r.coverPhotoId)) issues.push(`${c.label}: Titelbild fehlt.`);
  return [...new Set(issues)];
}

/**
 * Entfernt bzw. löst verwaiste Verknüpfungen, damit ein Import konsistent bleibt.
 * Pflanzen/Aktivitäten ohne Grow werden verworfen, optionale Verweise gelöst.
 */
export function sanitizeData(data: BackupData, photoIdsWithData?: Set<string>): BackupData {
  const grows = new Set(data.grows.map((g) => g.id));
  const plantsKept = data.plants.filter((p) => grows.has(p.growId));
  const plants = new Set(plantsKept.map((p) => p.id));
  const strains = new Set(data.strains.map((s) => s.id));
  const journal = new Set(data.journal.map((s) => s.id));
  const inventory = new Set(data.inventory.map((s) => s.id));
  const photosKept = data.photos
    .filter((p) => !photoIdsWithData || photoIdsWithData.has(p.id))
    .map((p) => ({
      ...p,
      growId: p.growId && grows.has(p.growId) ? p.growId : undefined,
      plantId: p.plantId && plants.has(p.plantId) ? p.plantId : undefined,
      strainId: p.strainId && strains.has(p.strainId) ? p.strainId : undefined,
      journalId: p.journalId && journal.has(p.journalId) ? p.journalId : undefined,
      inventoryId: p.inventoryId && inventory.has(p.inventoryId) ? p.inventoryId : undefined,
    }));
  const photos = new Set(photosKept.map((p) => p.id));
  const cover = <T extends { coverPhotoId?: string }>(r: T): T => (r.coverPhotoId && !photos.has(r.coverPhotoId) ? { ...r, coverPhotoId: undefined } : r);
  return {
    ...data,
    grows: data.grows.map((g) => cover(g.experiments ? { ...g, experiments: g.experiments.map((x) => ({ ...x, plantIds: x.plantIds.filter((id) => plants.has(id)) })) } : g)),
    plants: plantsKept.map((p) => cover({ ...p, strainId: p.strainId && strains.has(p.strainId) ? p.strainId : undefined, spaceId: p.spaceId && inventory.has(p.spaceId) ? p.spaceId : undefined })),
    activities: data.activities
      .filter((a) => grows.has(a.growId))
      .map((a) => ({
        ...a,
        plantId: a.plantId && plants.has(a.plantId) ? a.plantId : undefined,
        photoIds: a.photoIds?.filter((id) => photos.has(id)),
      })),
    photos: photosKept,
    reminders: data.reminders.map((r) => ({
      ...r,
      growId: r.growId && grows.has(r.growId) ? r.growId : undefined,
      plantId: r.plantId && plants.has(r.plantId) ? r.plantId : undefined,
    })),
    strains: data.strains.map(cover),
    journal: data.journal.map((j) => ({ ...j, strainId: j.strainId && strains.has(j.strainId) ? j.strainId : undefined })),
    inventory: data.inventory.map((i) =>
      cover({
        ...i,
        growId: i.growId && grows.has(i.growId) ? i.growId : undefined,
        strainId: i.strainId && strains.has(i.strainId) ? i.strainId : undefined,
        spaceId: i.spaceId && inventory.has(i.spaceId) && i.spaceId !== i.id ? i.spaceId : undefined,
      }),
    ),
    expenses: data.expenses.map((e) => ({ ...e, growId: e.growId && grows.has(e.growId) ? e.growId : undefined })),
    labReports: (data.labReports ?? []).map((l) => ({ ...l, strainId: l.strainId && strains.has(l.strainId) ? l.strainId : undefined })),
  };
}

/** Prüft und normalisiert das Manifest. */
export function validateManifest(raw: unknown): { manifest?: BackupManifest; errors: string[]; issues: string[] } {
  const errors: string[] = [];
  const issues: string[] = [];
  if (!isObj(raw)) return { errors: ['Die Datei enthält kein gültiges Manifest.'], issues };
  if (raw.app !== BACKUP_APP) errors.push('Dies ist keine TERPGRID-Sicherung.');
  if (typeof raw.format !== 'number' || raw.format > BACKUP_FORMAT)
    errors.push(`Das Backup-Format (${String(raw.format)}) wird von dieser Version nicht unterstützt. Bitte TERPGRID aktualisieren.`);
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > DB_VERSION)
    errors.push('Die Sicherung stammt aus einer neueren TERPGRID-Version.');
  if (!isObj(raw.data)) errors.push('Die Sicherung enthält keine Daten.');
  if (errors.length) return { errors, issues };

  const data = emptyData();
  const rawData = raw.data as Record<string, unknown>;
  for (const store of RECORD_STORES) {
    const rows = rawData[store];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      errors.push(`„${store}“ ist kein gültiger Datenblock.`);
      continue;
    }
    let skipped = 0;
    const seen = new Set<string>();
    for (const row of rows) {
      if (!isObj(row) || !isStr(row.id) || seen.has(row.id) || !REQUIRED[store].every((k) => row[k] !== undefined && row[k] !== null)) {
        skipped++;
        continue;
      }
      seen.add(row.id);
      (data[store] as unknown[]).push(row);
    }
    if (skipped) issues.push(`${skipped} ungültige Einträge in „${store}“ werden übersprungen.`);
  }
  const photoFiles = Array.isArray(raw.photoFiles)
    ? (raw.photoFiles as unknown[]).filter(
        (f): f is BackupManifest['photoFiles'][number] => isObj(f) && isStr(f.id) && isStr(f.full) && isStr(f.thumb) && isStr(f.mime),
      )
    : [];
  return {
    manifest: {
      app: BACKUP_APP,
      format: raw.format as number,
      schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1,
      exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
      counts: Object.fromEntries(RECORD_STORES.map((s) => [s, data[s].length])) as Record<RecordStore, number>,
      settings: raw.settings ? normalizeSettings(raw.settings) : undefined,
      data,
      photoFiles,
      docFiles: Array.isArray(raw.docFiles)
        ? (raw.docFiles as unknown[]).filter((f): f is NonNullable<BackupManifest['docFiles']>[number] => isObj(f) && isStr(f.id) && isStr(f.path) && isStr(f.mime) && isStr(f.name))
        : [],
    },
    errors,
    issues,
  };
}

export function parseBackupZip(bytes: Uint8Array): ParsedBackup {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { manifest: undefined as never, photoData: new Map(), docData: new Map(), issues: [], errors: ['Die Datei ist kein gültiges ZIP-Archiv.'] };
  }
  const manifestFile = files['manifest.json'];
  if (!manifestFile) return { manifest: undefined as never, photoData: new Map(), docData: new Map(), issues: [], errors: ['manifest.json fehlt im Archiv.'] };
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(manifestFile));
  } catch {
    return { manifest: undefined as never, photoData: new Map(), docData: new Map(), issues: [], errors: ['manifest.json ist beschädigt.'] };
  }
  const { manifest, errors, issues } = validateManifest(raw);
  const photoData = new Map<string, PhotoData>();
  const docData = new Map<string, LabDocument>();
  if (manifest) {
    for (const f of manifest.docFiles ?? []) {
      const bytes = files[f.path];
      if (bytes) docData.set(f.id, { id: f.id, data: toBuf(bytes), mime: f.mime, name: f.name, size: bytes.byteLength });
    }
    for (const f of manifest.photoFiles) {
      const full = files[f.full];
      const thumb = files[f.thumb] ?? full;
      if (full && thumb) photoData.set(f.id, { id: f.id, full: toBuf(full), thumb: toBuf(thumb), mime: f.mime });
    }
    issues.push(...checkIntegrity(manifest.data, new Set(photoData.keys())));
  }
  return { manifest: manifest as BackupManifest, photoData, docData, issues, errors };
}

/* ───────────── Wiederherstellen ───────────── */

export type RestoreMode = 'replace' | 'merge';

/**
 * Schreibt eine geprüfte Sicherung in einer Transaktion.
 * - replace: alle vorhandenen Daten werden ersetzt
 * - merge:   Datensätze werden ergänzt; gleiche IDs werden überschrieben
 */
export async function restoreBackup(parsed: ParsedBackup, mode: RestoreMode): Promise<Record<RecordStore, number>> {
  if (parsed.errors.length || !parsed.manifest) throw new Error('Die Sicherung ist ungültig und kann nicht importiert werden.');
  let data = parsed.manifest.data;
  if (mode === 'merge') {
    // Beim Zusammenführen gelten bestehende Datensätze als Referenzziele.
    const existing = await readAllData();
    const merged = emptyData();
    for (const s of RECORD_STORES) {
      const ids = new Set((data[s] as { id: string }[]).map((r) => r.id));
      (merged[s] as unknown[]) = [...(existing[s] as { id: string }[]).filter((r) => !ids.has(r.id)), ...data[s]];
    }
    const existingPhotoIds = new Set(existing.photos.map((p) => p.id));
    const clean = sanitizeData(merged, new Set([...parsed.photoData.keys(), ...existingPhotoIds]));
    // Nur die importierten Datensätze schreiben (bereinigte Version).
    data = emptyData();
    for (const s of RECORD_STORES) {
      const importIds = new Set((parsed.manifest.data[s] as { id: string }[]).map((r) => r.id));
      (data[s] as unknown[]) = (clean[s] as { id: string }[]).filter((r) => importIds.has(r.id));
    }
  } else {
    data = sanitizeData(data, new Set(parsed.photoData.keys()));
  }
  const photoRows = data.photos.map((p) => parsed.photoData.get(p.id)).filter((p): p is PhotoData => !!p);
  const docRows = (data.labReports ?? []).map((l) => (l.documentId ? parsed.docData?.get(l.documentId) : undefined)).filter((d): d is LabDocument => !!d);
  await writeBatch({
    clear: mode === 'replace' ? [...RECORD_STORES, 'photoData', 'labDocs'] : undefined,
    put: {
      ...(data as unknown as Partial<{ [S in RecordStore]: StoreMap[S][] }>),
      photoData: photoRows,
      labDocs: docRows,
      ...(mode === 'replace' && parsed.manifest.settings ? { settings: [{ key: 'app', value: parsed.manifest.settings }] } : {}),
    },
  });
  return Object.fromEntries(RECORD_STORES.map((s) => [s, data[s].length])) as Record<RecordStore, number>;
}

/** Löscht ALLE lokalen TERPGRID-Daten inkl. der alten THC-Rechner-Schlüssel. */
export async function deleteAllLocalData(): Promise<void> {
  await writeBatch({ clear: [...RECORD_STORES, 'photoData', 'settings', 'labDocs', 'apiCache'] });
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('cannabisrechner.') || k.startsWith('terpgrid.'))) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* localStorage nicht verfügbar */
  }
}
