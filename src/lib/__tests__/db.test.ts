import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_VERSION, count, deleteDatabase, getAll, getOne, subscribe, selectDatabase } from '../db/database';
import { runDataMigrations } from '../db/migrate';
import {
  addPhoto,
  createRecord,
  deleteGrow,
  deleteJournalEntry,
  deletePhotos,
  deletePlant,
  deleteStrain,
  loadSettings,
  normalizeSettings,
  saveSettings,
  toggleReminderCompletion,
  updateRecord,
} from '../db/repo';
import type { KeyValueStore } from '../storage';
import { STORAGE_KEY } from '../storage';

let n = 0;
beforeEach(async () => {
  await deleteDatabase();
  selectDatabase(`terpgrid-test-${++n}`);
});

const buf = (bytes: number[]) => new Uint8Array(bytes).buffer;

async function seedGrow() {
  const grow = await createRecord('grows', {
    name: 'Balkon 2026',
    description: '',
    startDate: '2026-04-01',
    setting: 'outdoor',
    notes: '',
    status: 'active',
    phaseDates: { germination: '2026-04-01' },
  });
  const plant = await createRecord('plants', {
    growId: grow.id,
    name: 'Pflanze 1',
    startDate: '2026-04-01',
    type: 'unknown',
    phaseDates: {},
    notes: '',
  });
  const photo = await addPhoto(
    { growId: grow.id, plantId: plant.id, takenAt: '2026-04-10T12:00', note: '', width: 10, height: 10, size: 3, mime: 'image/jpeg' },
    { full: buf([1, 2, 3]), thumb: buf([1]) },
  );
  const act = await createRecord('activities', {
    growId: grow.id,
    plantId: plant.id,
    type: 'measurement',
    date: '2026-04-10T12:00',
    title: '',
    notes: '',
    measurements: { heightCm: 4 },
    photoIds: [photo.id],
  });
  await updateRecord('grows', grow.id, { coverPhotoId: photo.id });
  return { grow, plant, photo, act };
}

describe('Datenbank & Schema', () => {
  it('legt alle Stores in der aktuellen Version an', async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(1);
    expect(await count('grows')).toBe(0);
    expect(await count('photoData')).toBe(0);
  });
});

describe('Grow- und Pflanzen-CRUD', () => {
  it('erstellt, aktualisiert und liest', async () => {
    const { grow, plant } = await seedGrow();
    expect((await getOne('grows', grow.id))?.name).toBe('Balkon 2026');
    const updated = await updateRecord('plants', plant.id, { name: 'Gelato #1', phaseDates: { seedling: '2026-04-05' } });
    expect(updated.name).toBe('Gelato #1');
    expect(updated.createdAt).toBe(plant.createdAt);
    await expect(updateRecord('plants', 'gibt-es-nicht', { name: 'x' })).rejects.toThrow();
  });

  it('benachrichtigt Abonnenten über Änderungen', async () => {
    const seen: string[] = [];
    const off = subscribe((s) => seen.push(...s));
    await seedGrow();
    off();
    expect(seen).toEqual(expect.arrayContaining(['grows', 'plants', 'photos', 'photoData', 'activities']));
  });

  it('Grow löschen entfernt alle abhängigen Daten, Inventar bleibt', async () => {
    const { grow } = await seedGrow();
    const inv = await createRecord('inventory', { name: 'Ernte', category: 'cannabis', unit: 'g', notes: '', growId: grow.id });
    await createRecord('expenses', { growId: grow.id, date: '2026-04-01', category: 'seeds', amount: 20, description: '' });
    await createRecord('reminders', {
      title: 'Gießen', date: '2026-04-02', category: 'watering', growId: grow.id, repeat: { kind: 'none' }, completedDates: [], notes: '',
    });
    await deleteGrow(grow.id);
    for (const s of ['grows', 'plants', 'activities', 'photos', 'photoData', 'expenses', 'reminders'] as const) {
      expect(await count(s)).toBe(0);
    }
    const kept = await getOne('inventory', inv.id);
    expect(kept?.growId).toBeUndefined();
  });

  it('Pflanze löschen entfernt Aktivitäten und Fotos und löst das Titelbild des Grows', async () => {
    const { grow, plant } = await seedGrow();
    await deletePlant(plant.id);
    expect(await count('plants')).toBe(0);
    expect(await count('activities')).toBe(0);
    expect(await count('photos')).toBe(0);
    expect((await getOne('grows', grow.id))?.coverPhotoId).toBeUndefined();
  });
});

describe('Fotos', () => {
  it('Hochladen speichert Metadaten und Binärdaten getrennt', async () => {
    const { photo } = await seedGrow();
    const data = await getOne('photoData', photo.id);
    expect(new Uint8Array(data!.full)).toEqual(new Uint8Array([1, 2, 3]));
  });
  it('Entfernen löscht Daten und alle Verweise', async () => {
    const { photo, grow, act } = await seedGrow();
    await deletePhotos([photo.id]);
    expect(await getOne('photos', photo.id)).toBeUndefined();
    expect(await getOne('photoData', photo.id)).toBeUndefined();
    expect((await getOne('grows', grow.id))?.coverPhotoId).toBeUndefined();
    expect((await getOne('activities', act.id))?.photoIds).toEqual([]);
  });
});

describe('Sorten, Journal, Erinnerungen', () => {
  it('Sorte löschen behält den Namen in Pflanzen und Journal', async () => {
    const { plant } = await seedGrow();
    const strain = await createRecord('strains', {
      name: 'Gelato', terpenes: [], aromas: [], flavorNotes: '', observations: '', favorite: false,
    });
    await updateRecord('plants', plant.id, { strainId: strain.id });
    const j = await createRecord('journal', { date: '2026-05-01T20:00', method: 'vaporizer', notes: '', moods: [], durationNote: '', strainId: strain.id });
    await deleteStrain(strain.id);
    expect((await getOne('plants', plant.id))).toMatchObject({ strainId: undefined, strainName: 'Gelato' });
    expect((await getOne('journal', j.id))).toMatchObject({ strainId: undefined, strainName: 'Gelato' });
  });

  it('Journal-Eintrag löschen entfernt eigene Fotos', async () => {
    const j = await createRecord('journal', { date: '2026-05-01T20:00', method: 'edible', notes: '', moods: [], durationNote: '' });
    await addPhoto({ journalId: j.id, takenAt: '2026-05-01T20:00', note: '', width: 1, height: 1, size: 1, mime: 'image/jpeg' }, { full: buf([1]), thumb: buf([1]) });
    await deleteJournalEntry(j.id);
    expect(await count('photos')).toBe(0);
    expect(await count('photoData')).toBe(0);
  });

  it('Erledigt-Status umschalten', async () => {
    const rem = await createRecord('reminders', { title: 'x', date: '2026-01-01', category: 'check', repeat: { kind: 'daily', interval: 1 }, completedDates: [], notes: '' });
    const a = await toggleReminderCompletion(rem, '2026-01-02');
    expect(a.completedDates).toEqual(['2026-01-02']);
    const b = await toggleReminderCompletion(a, '2026-01-02');
    expect(b.completedDates).toEqual([]);
  });
});

describe('Einstellungen', () => {
  it('normalisiert und ergänzt neue Widgets', () => {
    const s = normalizeSettings({ dashboardOrder: ['photos', 'unbekannt'], currency: 'xx' });
    expect(s.dashboardOrder[0]).toBe('photos');
    expect(s.dashboardOrder).toContain('grows');
    expect(s.dashboardOrder).not.toContain('unbekannt');
    expect(s.currency).toBe('EUR');
  });
  it('speichert dauerhaft', async () => {
    await saveSettings({ dashboardHidden: ['strains'] });
    expect((await loadSettings()).dashboardHidden).toEqual(['strains']);
  });
});

describe('Migration alter THC-Rechner-Daten', () => {
  function legacyStore(): KeyValueStore {
    const data = new Map<string, string>();
    data.set(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'c-1', kind: 'edibles', name: 'Alte Butter', createdAt: '2026-01-01T00:00:00.000Z', input: { a: 1 }, summary: { x: '1' } },
      ]),
    );
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  }

  it('übernimmt gespeicherte Berechnungen genau einmal und lässt das Original stehen', async () => {
    const store = legacyStore();
    expect(await runDataMigrations(store)).toHaveLength(1);
    expect(await runDataMigrations(store)).toHaveLength(0);
    const calcs = await getAll('calculations');
    expect(calcs).toHaveLength(1);
    expect(calcs[0]).toMatchObject({ id: 'c-1', name: 'Alte Butter', kind: 'edibles' });
    expect(store.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe('Gelöschte Arbeitskopie', () => {
  it('nachlaufende Zugriffe legen eine gelöschte Konto-Datenbank nicht leer neu an', async () => {
    const name = 'terpgrid-u-wipetest';
    selectDatabase(name);
    await createRecord('grows', { name: 'Privat', startDate: '2026-11-01', setting: 'indoor', medium: '', notes: '', status: 'active', phaseDates: {} } as never);
    expect((await indexedDB.databases()).some((d) => d.name === name)).toBe(true);
    await deleteDatabase();
    // z. B. ein Render nach dem Abmelden
    await expect(getAll('grows')).rejects.toThrow(/entfernt/);
    expect((await indexedDB.databases()).some((d) => d.name === name)).toBe(false);
    // erneute Anmeldung wählt die Datenbank wieder aus
    selectDatabase(name);
    expect(await getAll('grows')).toEqual([]);
    await deleteDatabase();
  });
});
