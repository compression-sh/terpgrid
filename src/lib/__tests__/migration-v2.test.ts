import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_VERSION, SCHEMA_MIGRATIONS, closeDatabase, count, deleteDatabase, getAll, getOne, openDatabase, useDatabaseName } from '../db/database';
import { createRecord, deleteStrain, ensureStrainForExternal, findByExternal, updateRecord } from '../db/repo';

let n = 0;
let name = '';
beforeEach(async () => {
  await deleteDatabase();
  name = `terpgrid-mig-${++n}`;
  useDatabaseName(name);
});

/** Erstellt eine Datenbank im Zustand von Schema v1 mit Bestandsdaten. */
async function createV1(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => SCHEMA_MIGRATIONS[0]!(req.result, req.transaction!);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['strains', 'grows'], 'readwrite');
      tx.objectStore('strains').put({ id: 's1', name: 'Alte Sorte', terpenes: [], aromas: [], flavorNotes: '', observations: '', favorite: true, createdAt: 't', updatedAt: 't' });
      tx.objectStore('grows').put({ id: 'g1', name: 'Alter Grow', description: '', startDate: '2026-01-01', setting: 'indoor', notes: '', status: 'active', phaseDates: {}, createdAt: 't', updatedAt: 't' });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('Schema-Migration v1 → v3', () => {
  it('behält Bestandsdaten und legt neue Stores/Indizes an', async () => {
    expect(DB_VERSION).toBe(3);
    await createV1();
    await closeDatabase();
    const db = await openDatabase();
    expect(db.version).toBe(3);
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['outbox', 'syncState', 'syncConflicts']));
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['labReports', 'labDocs', 'apiCache']));
    expect((await getOne('strains', 's1'))?.name).toBe('Alte Sorte');
    expect((await getOne('grows', 'g1'))?.name).toBe('Alter Grow');
    expect(db.transaction('strains').objectStore('strains').indexNames.contains('externalKey')).toBe(true);
    expect(await count('labReports')).toBe(0);
  });
});

describe('Externe Sorten ohne Duplikate', () => {
  it('legt je provider:id nur einen Eintrag an und kennzeichnet Herkunft', async () => {
    const seed = { provider: 'strainapi' as const, id: 'peach-destiny', name: 'Peach Destiny', breeder: 'Fresh Coast Genetics', terpenes: ['Limonene'], thc: { value: 22 } };
    const a = await ensureStrainForExternal(seed, { favorite: true });
    const b = await ensureStrainForExternal(seed);
    expect(b.id).toBe(a.id);
    expect(await count('strains')).toBe(1);
    expect(a.thc).toEqual({ value: 22, source: 'reported' });
    expect(a.terpenes).toEqual([{ name: 'Limonene', source: 'reported' }]);
    expect(a.externalKey).toBe('strainapi:peach-destiny');
    expect((await findByExternal('strainapi', 'peach-destiny'))?.id).toBe(a.id);
    const c = await ensureStrainForExternal(seed, { favorite: false });
    expect(c.favorite).toBe(false);
    expect(await count('strains')).toBe(1);
  });

  it('Sorte löschen löst Verknüpfung in Laborberichten', async () => {
    const s = await ensureStrainForExternal({ provider: 'strainapi', id: 'x', name: 'X' });
    const r = await createRecord('labReports', { title: 'COA', strainId: s.id, unit: '%', origin: 'manual', terpenes: [], notes: '' });
    await deleteStrain(s.id);
    expect((await getOne('labReports', r.id))?.strainId).toBeUndefined();
    expect(await getAll('strains')).toEqual([]);
    await updateRecord('labReports', r.id, { title: 'COA 2' });
  });
});
