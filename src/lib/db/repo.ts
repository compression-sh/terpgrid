/**
 * Fachliche Datenoperationen mit referenzieller Integrität.
 * Löschoperationen räumen abhängige Datensätze in EINER Transaktion auf.
 */
import {
  type StoreMap,
  type StoreName,
  type WriteBatch,
  getAll,
  getAllByIndex,
  getOne,
  newId,
  nowIso,
  putOne,
  writeBatch,
} from './database';
import {
  type AppSettings,
  type BaseRecord,
  type DashboardWidget,
  DASHBOARD_WIDGETS,
  type Photo,
  type Reminder,
  type Strain,
} from './types';

type EntityStore = Exclude<StoreName, 'settings' | 'photoData' | 'labDocs' | 'apiCache'>;
type Entity<S extends EntityStore> = StoreMap[S];
export type NewRecord<T extends BaseRecord> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function createRecord<S extends EntityStore>(store: S, data: NewRecord<Entity<S>>): Promise<Entity<S>> {
  const now = nowIso();
  const record = { ...data, id: data.id ?? newId(), createdAt: now, updatedAt: now } as Entity<S>;
  return putOne(store, record);
}

export async function updateRecord<S extends EntityStore>(
  store: S,
  id: string,
  patch: Partial<Omit<Entity<S>, 'id' | 'createdAt'>>,
): Promise<Entity<S>> {
  const current = await getOne(store, id);
  if (!current) throw new Error('Datensatz nicht gefunden – evtl. wurde er bereits gelöscht.');
  const next = { ...current, ...patch, id, updatedAt: nowIso() } as Entity<S>;
  return putOne(store, next);
}

/* ───────────── Löschen mit Abhängigkeiten ───────────── */

function ids<T extends { id: string }>(rows: T[]): string[] {
  return rows.map((r) => r.id);
}

/** Entfernt Referenzen auf gelöschte Fotos (Titelbilder, Aktivitäten). */
async function photoReferenceCleanup(photoIds: Set<string>, batch: WriteBatch, skip: Partial<Record<StoreName, Set<string>>> = {}) {
  if (photoIds.size === 0) return;
  const now = nowIso();
  const put = (batch.put ??= {}) as Record<string, { id: string }[]>;
  const merge = <T extends { id: string }>(store: StoreName, rows: T[], change: (row: T) => T | null) => {
    const pending = new Map<string, T>(((put[store] as T[] | undefined) ?? []).map((r) => [r.id, r]));
    for (const row of rows) {
      if (skip[store]?.has(row.id)) continue;
      const base = pending.get(row.id) ?? row;
      const next = change(base);
      if (next) pending.set(row.id, { ...next, updatedAt: now });
    }
    if (pending.size) put[store] = [...pending.values()];
  };
  for (const s of ['grows', 'plants', 'strains', 'inventory'] as const) {
    const rows = (await getAll(s)) as { id: string; coverPhotoId?: string }[];
    merge(s, rows, (r) => (r.coverPhotoId && photoIds.has(r.coverPhotoId) ? { ...r, coverPhotoId: undefined } : null));
  }
  merge('activities', await getAll('activities'), (a) =>
    a.photoIds?.some((p) => photoIds.has(p)) ? { ...a, photoIds: a.photoIds.filter((p) => !photoIds.has(p)) } : null,
  );
}

export async function deletePhotos(photoIdList: string[]): Promise<void> {
  const set = new Set(photoIdList);
  const batch: WriteBatch = { delete: { photos: photoIdList, photoData: photoIdList } };
  await photoReferenceCleanup(set, batch);
  await writeBatch(batch);
}

/** Grow löschen inkl. Pflanzen, Aktivitäten, Fotos, Ausgaben und verknüpfter Erinnerungen. */
export async function deleteGrow(growId: string): Promise<void> {
  const [plants, activities, photos, expenses, reminders, inventory] = await Promise.all([
    getAllByIndex('plants', 'growId', growId),
    getAllByIndex('activities', 'growId', growId),
    getAllByIndex('photos', 'growId', growId),
    getAllByIndex('expenses', 'growId', growId),
    getAllByIndex('reminders', 'growId', growId),
    getAll('inventory'),
  ]);
  const photoIds = ids(photos);
  const now = nowIso();
  const batch: WriteBatch = {
    delete: {
      grows: [growId],
      plants: ids(plants),
      activities: ids(activities),
      photos: photoIds,
      photoData: photoIds,
      expenses: ids(expenses),
      reminders: ids(reminders),
    },
    put: {
      // Inventar bleibt erhalten, nur die Verknüpfung wird gelöst.
      inventory: inventory.filter((i) => i.growId === growId).map((i) => ({ ...i, growId: undefined, updatedAt: now })),
    },
  };
  await photoReferenceCleanup(new Set(photoIds), batch, {
    grows: new Set([growId]),
    plants: new Set(ids(plants)),
    activities: new Set(ids(activities)),
  });
  await writeBatch(batch);
}

/** Pflanze löschen inkl. ihrer Aktivitäten, Fotos und Erinnerungen. */
export async function deletePlant(plantId: string): Promise<void> {
  const [activities, photos, reminders] = await Promise.all([
    getAllByIndex('activities', 'plantId', plantId),
    getAllByIndex('photos', 'plantId', plantId),
    getAll('reminders'),
  ]);
  const photoIds = ids(photos);
  const batch: WriteBatch = {
    delete: {
      plants: [plantId],
      activities: ids(activities),
      photos: photoIds,
      photoData: photoIds,
      reminders: ids(reminders.filter((r) => r.plantId === plantId)),
    },
  };
  await photoReferenceCleanup(new Set(photoIds), batch, { plants: new Set([plantId]), activities: new Set(ids(activities)) });
  await writeBatch(batch);
}

/** Sorte löschen; Pflanzen/Journal/Inventar behalten den Namen als Freitext. */
export async function deleteStrain(strainId: string): Promise<void> {
  const strain = await getOne('strains', strainId);
  const [plants, journal, inventory, photos, labReports] = await Promise.all([
    getAllByIndex('plants', 'strainId', strainId),
    getAllByIndex('journal', 'strainId', strainId),
    getAll('inventory'),
    getAllByIndex('photos', 'strainId', strainId),
    getAllByIndex('labReports', 'strainId', strainId),
  ]);
  const now = nowIso();
  const name = strain?.name;
  // Fotos, die zusätzlich an einem Grow/einer Pflanze hängen, bleiben erhalten.
  const ownPhotos = photos.filter((p) => !p.growId && !p.plantId);
  const sharedPhotos = photos.filter((p) => p.growId || p.plantId).map((p) => ({ ...p, strainId: undefined, updatedAt: now }));
  const batch: WriteBatch = {
    delete: { strains: [strainId], photos: ids(ownPhotos), photoData: ids(ownPhotos) },
    put: {
      plants: plants.map((p) => ({ ...p, strainId: undefined, strainName: p.strainName || name, updatedAt: now })),
      journal: journal.map((j) => ({ ...j, strainId: undefined, strainName: j.strainName || name, updatedAt: now })),
      inventory: inventory.filter((i) => i.strainId === strainId).map((i) => ({ ...i, strainId: undefined, updatedAt: now })),
      photos: sharedPhotos,
      labReports: labReports.map((l) => ({ ...l, strainId: undefined, updatedAt: now })),
    },
  };
  await photoReferenceCleanup(new Set(ids(ownPhotos)), batch, { strains: new Set([strainId]) });
  await writeBatch(batch);
}

async function deleteWithOwnPhotos(store: 'journal' | 'inventory', id: string, key: 'journalId' | 'inventoryId') {
  const photos = (await getAll('photos')).filter((p) => p[key] === id);
  const own = photos.filter((p) => !p.growId && !p.plantId && !p.strainId);
  const now = nowIso();
  const shared = photos.filter((p) => !own.includes(p)).map((p) => ({ ...p, [key]: undefined, updatedAt: now }));
  const batch: WriteBatch = { delete: { [store]: [id], photos: ids(own), photoData: ids(own) }, put: { photos: shared } };
  await photoReferenceCleanup(new Set(ids(own)), batch, { [store]: new Set([id]) });
  await writeBatch(batch);
}

export const deleteJournalEntry = (id: string) => deleteWithOwnPhotos('journal', id, 'journalId');
export const deleteInventoryItem = (id: string) => deleteWithOwnPhotos('inventory', id, 'inventoryId');

export async function deleteSimple(store: 'activities' | 'expenses' | 'reminders' | 'calculations', id: string): Promise<void> {
  await writeBatch({ delete: { [store]: [id] } });
}

/* ───────────── Fotos ───────────── */

export async function addPhoto(meta: NewRecord<Photo>, data: { full: ArrayBuffer; thumb: ArrayBuffer }): Promise<Photo> {
  const now = nowIso();
  const photo: Photo = { ...meta, id: meta.id ?? newId(), createdAt: now, updatedAt: now };
  await writeBatch({
    put: { photos: [photo], photoData: [{ id: photo.id, full: data.full, thumb: data.thumb, mime: photo.mime }] },
  });
  return photo;
}

/* ───────────── Erinnerungen ───────────── */

export async function toggleReminderCompletion(reminder: Reminder, date: string): Promise<Reminder> {
  const done = reminder.completedDates.includes(date);
  return updateRecord('reminders', reminder.id, {
    completedDates: done ? reminder.completedDates.filter((d) => d !== date) : [...reminder.completedDates, date].sort(),
  });
}

/* ───────────── Einstellungen ───────────── */

export const DEFAULT_SETTINGS: AppSettings = {
  dashboardOrder: [...DASHBOARD_WIDGETS],
  dashboardHidden: [],
  currency: 'EUR',
  showHarmReduction: true,
  onlineCatalog: true,
  cannalibEnabled: true,
  discoverNoticeSeen: false,
  kbFavorites: [],
  kbProgress: {},
};

export function normalizeSettings(raw: unknown): AppSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppSettings>;
  const valid = (w: unknown): w is DashboardWidget => DASHBOARD_WIDGETS.includes(w as DashboardWidget);
  const order = Array.isArray(s.dashboardOrder) ? s.dashboardOrder.filter(valid) : [];
  // Neue Widgets (nach Updates) hinten anhängen.
  for (const w of DASHBOARD_WIDGETS) if (!order.includes(w)) order.push(w);
  return {
    dashboardOrder: [...new Set(order)],
    dashboardHidden: Array.isArray(s.dashboardHidden) ? s.dashboardHidden.filter(valid) : [],
    currency: typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency) ? s.currency : 'EUR',
    showHarmReduction: typeof s.showHarmReduction === 'boolean' ? s.showHarmReduction : true,
    lastBackupAt: typeof s.lastBackupAt === 'string' ? s.lastBackupAt : undefined,
    onlineCatalog: typeof s.onlineCatalog === 'boolean' ? s.onlineCatalog : true,
    cannalibEnabled: typeof s.cannalibEnabled === 'boolean' ? s.cannalibEnabled : true,
    discoverNoticeSeen: s.discoverNoticeSeen === true,
    kbFavorites: Array.isArray(s.kbFavorites) ? s.kbFavorites.filter((x): x is string => typeof x === 'string').slice(0, 200) : [],
    kbProgress:
      s.kbProgress && typeof s.kbProgress === 'object' && !Array.isArray(s.kbProgress)
        ? Object.fromEntries(Object.entries(s.kbProgress).filter(([k, v]) => typeof k === 'string' && typeof v === 'number' && v >= 0 && v <= 1))
        : {},
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const row = await getOne('settings', 'app');
  return normalizeSettings(row?.value);
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await putOne('settings', { key: 'app', value: next });
  return next;
}

/* ───────────── Laborberichte ───────────── */

export async function deleteLabReport(id: string): Promise<void> {
  const r = await getOne('labReports', id);
  await writeBatch({ delete: { labReports: [id], labDocs: r?.documentId ? [r.documentId] : [] } });
}

/* ───────────── Externe Sorten (Online-Katalog) ───────────── */

export interface ExternalStrainSeed {
  provider: 'strainapi' | 'cannalib';
  id: string;
  name: string;
  breeder?: string;
  genetics?: string;
  url?: string;
  reportedType?: Strain['reportedType'];
  thc?: { value: number };
  cbd?: { value: number };
  terpenes?: string[];
  aromas?: string[];
}

export const externalKey = (provider: string, id: string) => `${provider}:${id}`;

export async function findByExternal(provider: string, id: string): Promise<Strain | undefined> {
  const rows = await getAllByIndex('strains', 'externalKey', externalKey(provider, id));
  return rows[0];
}

/**
 * Persönliche Sorte für einen externen Katalogeintrag holen oder anlegen.
 * Höchstens EIN Eintrag je provider:id – keine Duplikate.
 * Übernommene Werte werden als „Herstellerangabe/Quelle“ gekennzeichnet.
 */
export async function ensureStrainForExternal(seed: ExternalStrainSeed, patch: Partial<Strain> = {}): Promise<Strain> {
  const existing = await findByExternal(seed.provider, seed.id);
  if (existing) {
    if (Object.keys(patch).length === 0) return existing;
    return updateRecord('strains', existing.id, patch);
  }
  const now = nowIso();
  return createRecord('strains', {
    name: seed.name,
    breeder: seed.breeder,
    genetics: seed.genetics,
    reportedType: seed.reportedType,
    thc: seed.thc ? { value: seed.thc.value, source: 'reported' } : undefined,
    cbd: seed.cbd ? { value: seed.cbd.value, source: 'reported' } : undefined,
    terpenes: (seed.terpenes ?? []).map((name) => ({ name, source: 'reported' as const })),
    aromas: seed.aromas ?? [],
    flavorNotes: '',
    observations: '',
    favorite: false,
    external: { provider: seed.provider, id: seed.id, name: seed.name, breeder: seed.breeder, url: seed.url, linkedAt: now },
    externalKey: externalKey(seed.provider, seed.id),
    ...patch,
  });
}
