import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearPhotoUrlCache, watchPhotoUrl } from '../../components/photos/usePhotoUrl';
import { deleteDatabase, selectDatabase, writeBatch } from '../db/database';

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('Fotos nach Anmeldung auf neuem Gerät', () => {
  beforeEach(async () => {
    selectDatabase('foto-test');
  });
  afterEach(async () => {
    clearPhotoUrlCache();
    await deleteDatabase('foto-test');
  });

  it('meldet zuerst „nicht vorhanden“ und lädt nach, sobald die Bilddaten gespeichert sind', async () => {
    const seen: (string | null)[] = [];
    const off = watchPhotoUrl('ph1', 'thumb', (u) => seen.push(u));
    await tick();
    expect(seen).toEqual([null]);
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
    await writeBatch({ put: { photos: [{ id: 'ph1', createdAt: '', updatedAt: '', takenAt: '2026-11-01T10:00', note: '', width: 1, height: 1, size: 3, mime: 'image/jpeg' }], photoData: [{ id: 'ph1', full: bytes, thumb: bytes, mime: 'image/jpeg' }] } }, { fromSync: true });
    await tick();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatch(/^blob:/);
    off();
  });

  it('nach dem Abmelden der Ansicht wird nicht mehr gemeldet', async () => {
    const seen: (string | null)[] = [];
    const off = watchPhotoUrl('ph2', 'thumb', (u) => seen.push(u));
    await tick();
    off();
    const bytes = new Uint8Array([1]).buffer;
    await writeBatch({ put: { photos: [{ id: 'ph2', createdAt: '', updatedAt: '', takenAt: '2026-11-01T10:00', note: '', width: 1, height: 1, size: 1, mime: 'image/jpeg' }], photoData: [{ id: 'ph2', full: bytes, thumb: bytes, mime: 'image/jpeg' }] } }, { fromSync: true });
    await tick();
    expect(seen).toEqual([null]);
  });
});
