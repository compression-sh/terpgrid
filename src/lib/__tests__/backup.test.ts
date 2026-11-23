import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type BackupData,
  checkIntegrity,
  createFullBackup,
  deleteAllLocalData,
  emptyData,
  parseBackupZip,
  restoreBackup,
  sanitizeData,
} from '../backup';
import { count, deleteDatabase, getAll, getOne, useDatabaseName } from '../db/database';
import { addPhoto, createRecord, saveSettings } from '../db/repo';

let n = 0;
beforeEach(async () => {
  await deleteDatabase();
  useDatabaseName(`terpgrid-backup-${++n}`);
});

async function seed() {
  const grow = await createRecord('grows', {
    name: 'Zelt', description: '', startDate: '2026-01-01', setting: 'indoor', notes: '', status: 'active', phaseDates: {},
  });
  const plant = await createRecord('plants', { growId: grow.id, name: 'P1', startDate: '2026-01-01', type: 'autoflower', phaseDates: {}, notes: '' });
  const photo = await addPhoto(
    { growId: grow.id, plantId: plant.id, takenAt: '2026-01-05T10:00', note: 'erstes Blatt', width: 2, height: 2, size: 4, mime: 'image/jpeg' },
    { full: new Uint8Array([9, 8, 7, 6]).buffer, thumb: new Uint8Array([9]).buffer },
  );
  await createRecord('activities', { growId: grow.id, plantId: plant.id, type: 'photo', date: '2026-01-05T10:00', title: '', notes: '', photoIds: [photo.id] });
  await createRecord('calculations', { kind: 'smoking', name: 'Joint', input: {}, summary: {} });
  await saveSettings({ dashboardHidden: ['strains'] });
  return { grow, plant, photo };
}

describe('Backup Export/Import', () => {
  it('Roundtrip: Export → alles löschen → Import stellt Daten, Fotos und Beziehungen wieder her', async () => {
    const { grow, plant, photo } = await seed();
    const { bytes, manifest } = await createFullBackup();
    expect(manifest.counts.grows).toBe(1);
    expect(manifest.photoFiles).toHaveLength(1);

    await deleteAllLocalData();
    expect(await count('grows')).toBe(0);
    expect(await count('photoData')).toBe(0);

    const parsed = parseBackupZip(bytes);
    expect(parsed.errors).toEqual([]);
    expect(parsed.issues).toEqual([]);
    await restoreBackup(parsed, 'replace');

    expect((await getOne('plants', plant.id))?.growId).toBe(grow.id);
    expect((await getOne('photos', photo.id))?.note).toBe('erstes Blatt');
    expect(new Uint8Array((await getOne('photoData', photo.id))!.full)).toEqual(new Uint8Array([9, 8, 7, 6]));
    expect((await getAll('activities'))[0]?.photoIds).toEqual([photo.id]);
    expect(await count('calculations')).toBe(1);
    expect(((await getOne('settings', 'app'))?.value as { dashboardHidden: string[] }).dashboardHidden).toEqual(['strains']);
  });

  it('Laborberichte samt Originaldokument im Roundtrip (Format 2)', async () => {
    const { createRecord: cr } = await import('../db/repo');
    const { writeBatch } = await import('../db/database');
    await writeBatch({ put: { labDocs: [{ id: 'doc1', data: new Uint8Array([37, 80, 68, 70]).buffer, mime: 'application/pdf', name: 'coa.pdf', size: 4 }] } });
    await cr('labReports', { title: 'COA', unit: '%', origin: 'document', thca: 20, terpenes: [{ name: 'Limonen', value: 0.5 }], documentId: 'doc1', documentName: 'coa.pdf', documentMime: 'application/pdf', notes: '' });
    const { bytes, manifest } = await createFullBackup();
    expect(manifest.format).toBe(2);
    expect(manifest.docFiles).toHaveLength(1);
    await deleteAllLocalData();
    const parsed = parseBackupZip(bytes);
    expect(parsed.errors).toEqual([]);
    await restoreBackup(parsed, 'replace');
    expect(await count('labReports')).toBe(1);
    expect(new Uint8Array((await getOne('labDocs', 'doc1'))!.data)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('Format-1-Sicherungen bleiben importierbar', () => {
    const manifest = { app: 'TERPGRID', format: 1, schemaVersion: 1, data: { strains: [{ id: 's', name: 'Alt' }] }, photoFiles: [] };
    const parsed = parseBackupZip(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest.data.strains).toHaveLength(1);
    expect(parsed.manifest.data.labReports).toEqual([]);
  });

  it('Zusammenführen ergänzt statt zu ersetzen', async () => {
    await seed();
    const { bytes } = await createFullBackup();
    await createRecord('strains', { name: 'Neu', terpenes: [], aromas: [], flavorNotes: '', observations: '', favorite: false });
    await restoreBackup(parseBackupZip(bytes), 'merge');
    expect(await count('strains')).toBe(1);
    expect(await count('grows')).toBe(1);
  });

  it('lehnt fremde, beschädigte und neuere Dateien ab', () => {
    expect(parseBackupZip(new Uint8Array([1, 2, 3])).errors[0]).toMatch(/ZIP/);
    expect(parseBackupZip(zipSync({ 'x.txt': strToU8('x') })).errors[0]).toMatch(/manifest/);
    expect(parseBackupZip(zipSync({ 'manifest.json': strToU8('{kaputt') })).errors[0]).toMatch(/beschädigt/);
    expect(parseBackupZip(zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'Andere', format: 1, data: {} })) })).errors[0]).toMatch(/keine TERPGRID/);
    expect(
      parseBackupZip(zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'TERPGRID', format: 99, data: {} })) })).errors[0],
    ).toMatch(/nicht unterstützt/);
  });

  it('überspringt ungültige Datensätze mit Hinweis', () => {
    const manifest = { app: 'TERPGRID', format: 1, schemaVersion: 1, data: { grows: [{ id: 'g' }, { nope: true }], strains: [{ id: 's', name: 'OK' }] }, photoFiles: [] };
    const parsed = parseBackupZip(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest.data.grows).toHaveLength(0);
    expect(parsed.manifest.data.strains).toHaveLength(1);
    expect(parsed.issues.join(' ')).toMatch(/2 ungültige Einträge in „grows“/);
  });
});

describe('Beziehungsintegrität', () => {
  function broken(): BackupData {
    const d = emptyData();
    const t = '2026-01-01T00:00:00.000Z';
    d.plants.push({ id: 'p', growId: 'fehlt', name: 'Waise', startDate: '2026-01-01', type: 'unknown', phaseDates: {}, notes: '', createdAt: t, updatedAt: t });
    d.grows.push({ id: 'g', name: 'G', description: '', startDate: '2026-01-01', setting: 'indoor', notes: '', status: 'active', phaseDates: {}, coverPhotoId: 'weg', createdAt: t, updatedAt: t });
    d.activities.push({ id: 'a', growId: 'g', plantId: 'p', type: 'observation', date: '2026-01-02T10:00', title: '', notes: '', createdAt: t, updatedAt: t });
    d.journal.push({ id: 'j', date: '2026-01-02T10:00', method: 'joint', strainId: 'nix', notes: '', moods: [], durationNote: '', createdAt: t, updatedAt: t });
    return d;
  }
  it('findet verwaiste Verweise', () => {
    const issues = checkIntegrity(broken());
    expect(issues.some((i) => i.includes('Waise'))).toBe(true);
    expect(issues.some((i) => i.includes('fehlende Sorte'))).toBe(true);
    expect(issues.some((i) => i.includes('Titelbild'))).toBe(true);
  });
  it('bereinigt verwaiste Verweise konsistent', () => {
    const clean = sanitizeData(broken());
    expect(clean.plants).toHaveLength(0);
    expect(clean.activities[0]?.plantId).toBeUndefined();
    expect(clean.grows[0]?.coverPhotoId).toBeUndefined();
    expect(clean.journal[0]?.strainId).toBeUndefined();
    expect(checkIntegrity(clean)).toEqual([]);
  });
});
