import { beforeEach, describe, expect, it } from 'vitest';

// localStorage-Ersatz mit echten Eigenschaften (Object.keys funktioniert wie im Browser)
const store: Record<string, string> = {};
for (const [k, v] of Object.entries({
  getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k]! : null),
  setItem: (k: string, v: string) => void (store[k] = String(v)),
  removeItem: (k: string) => void delete store[k],
  clear: () => Object.keys(store).forEach((k) => delete store[k]),
}))
  Object.defineProperty(store, k, { value: v, enumerable: false });
(globalThis as { localStorage?: unknown }).localStorage = store;

const { accountKeyFromDb, clearOfflineChoices, isOfflineEnabled, markOfflineAsked, offlineAsked, pendingSpaceOps, selectPurgeable, setOfflineEnabled } = await import('../offline');
const { setSharedDevice } = await import('../device');

const A = 'terpgrid-u-aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'terpgrid-u-bbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'terpgrid-u-cccccccccccccccccccccccc';

beforeEach(() => (store as unknown as Storage).clear());

describe('Offline-Freigabe (Opt-in)', () => {
  it('ist standardmäßig aus und wird je Konto gespeichert', () => {
    expect(isOfflineEnabled(A)).toBe(false);
    setOfflineEnabled(A, true);
    expect(isOfflineEnabled(A)).toBe(true);
    expect(isOfflineEnabled(B)).toBe(false);
    expect(offlineAsked(A)).toBe(true);
    setOfflineEnabled(A, false);
    expect(isOfflineEnabled(A)).toBe(false);
  });
  it('„Geteiltes Gerät“ erzwingt aus und vergisst Freigaben', () => {
    setOfflineEnabled(A, true);
    setSharedDevice(true);
    expect(isOfflineEnabled(A)).toBe(false);
    setSharedDevice(false);
    expect(isOfflineEnabled(A)).toBe(false); // Freigabe wurde entfernt, nicht nur verdeckt
  });
  it('„Nicht jetzt“ merkt nur die Antwort, schaltet nichts ein', () => {
    markOfflineAsked(B);
    expect(offlineAsked(B)).toBe(true);
    expect(isOfflineEnabled(B)).toBe(false);
    setOfflineEnabled(C, true);
    clearOfflineChoices();
    expect(isOfflineEnabled(C)).toBe(false);
  });
  it('liest den Kontoschlüssel nur aus gültigen Konto-Datenbanknamen', () => {
    expect(accountKeyFromDb(A)).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(accountKeyFromDb('terpgrid')).toBeNull();
    expect(accountKeyFromDb('terpgrid-u-../x')).toBeNull();
  });
  it('zählt ausstehende Bereichsänderungen eines Kontos', () => {
    store['terpgrid.u.aaaaaaaaaaaaaaaaaaaaaaaa.spaceOutbox.s1'] = JSON.stringify([{ id: 1 }, { id: 2 }]);
    store['terpgrid.u.bbbbbbbbbbbbbbbbbbbbbbbb.spaceOutbox.s1'] = JSON.stringify([{ id: 1 }]);
    expect(pendingSpaceOps('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(2);
    expect(pendingSpaceOps('cccccccccccccccccccccccc')).toBe(0);
  });
});

describe('Bereinigung beim Kontowechsel', () => {
  const cands = [
    { name: A, pending: 0 },
    { name: B, pending: 0 },
    { name: C, pending: 3 },
    { name: 'terpgrid', pending: 0 },
  ];
  it('entfernt nur fremde, nicht freigegebene Kopien ohne ausstehende Änderungen', () => {
    expect(selectPurgeable(cands, { current: A, enabled: [], shared: false })).toEqual([B]);
  });
  it('behält freigegebene Konten', () => {
    expect(selectPurgeable(cands, { current: A, enabled: [B], shared: false })).toEqual([]);
  });
  it('auf geteilten Geräten zählt keine Freigabe – ausstehende Änderungen bleiben trotzdem', () => {
    expect(selectPurgeable(cands, { current: null, enabled: [A, B, C], shared: true })).toEqual([A, B]);
  });
  it('rührt die Datenbank des Lokalmodus nie an', () => {
    expect(selectPurgeable(cands, { current: null, enabled: [], shared: false })).not.toContain('terpgrid');
  });
});
