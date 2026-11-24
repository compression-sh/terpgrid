import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDatabase, getAll, getOne, putOne, setSyncTracking, selectDatabase, writeBatch } from '../db/database';
import { setApiFetch, setCsrfToken } from '../server/api';
import { SyncEngine } from '../sync/engine';
import { deleteLegacy, importLegacy, legacyExists, readImportMark, readLegacy } from '../sync/legacy';

const canon = (v: unknown): string => (v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(',')}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as any)[k])}`).join(',')}}`);

/** Minimaler Server mit denselben Versionsregeln wie die echte API (server/src/records.ts). */
class FakeServer {
  rows = new Map<string, { store: string; id: string; version: number; seq: number; deleted: boolean; data: unknown }>();
  files = new Map<string, ArrayBuffer>();
  seq = 0;
  online = true;
  csrfSeen: string[] = [];
  fetch = (async (url: string, init: RequestInit) => {
    if (!this.online) throw new TypeError('offline');
    this.csrfSeen.push((init.headers as Record<string, string>)['X-CSRF-Token'] ?? '');
    const u = new URL(url, 'https://t.test');
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/api/sync/push') {
      const { changes } = JSON.parse(String(init.body));
      return json({
        results: changes.map((c: any) => {
          const k = `${c.store}:${c.id}`;
          const cur = this.rows.get(k);
          const v = cur?.version ?? 0;
          // Wie server/src/records.ts: identischer Inhalt → unverändert (idempotenter Import)
          if (cur && !cur.deleted && !c.deleted && canon(cur.data) === canon(c.data)) return { store: c.store, id: c.id, status: 'unchanged', version: v };
          if (v !== c.baseVersion) return { store: c.store, id: c.id, status: 'conflict', server: { version: v, deleted: cur?.deleted ?? true, data: cur && !cur.deleted ? cur.data : null } };
          if (!cur && c.deleted) return { store: c.store, id: c.id, status: 'unchanged', version: 0 };
          this.rows.set(k, { store: c.store, id: c.id, version: v + 1, seq: ++this.seq, deleted: !!c.deleted, data: c.deleted ? null : c.data });
          return { store: c.store, id: c.id, status: 'ok', version: v + 1, seq: String(this.seq) };
        }),
      });
    }
    if (u.pathname === '/api/sync/changes') {
      const since = Number(u.searchParams.get('since'));
      const list = [...this.rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
      return json({ changes: list.map((r) => ({ ...r, seq: String(r.seq) })), cursor: String(list.at(-1)?.seq ?? since), more: false });
    }
    if (u.pathname === '/api/sync/summary') {
      const records: Record<string, number> = {};
      for (const r of this.rows.values()) if (!r.deleted) records[r.store] = (records[r.store] ?? 0) + 1;
      const files = [...this.files.keys()].map((k) => k.split('/')).map(([, , , kind, , variant]) => ({ kind, variant, n: 1 }));
      const merged: Record<string, { kind: string; variant: string; n: number }> = {};
      for (const f of files) merged[`${f.kind}/${f.variant}`] = { ...f, n: (merged[`${f.kind}/${f.variant}`]?.n ?? 0) + 1 } as any;
      return json({ records, files: Object.values(merged) });
    }
    if (u.pathname.startsWith('/api/files/')) {
      if (init.method === 'PUT') {
        this.files.set(u.pathname, init.body as ArrayBuffer);
        return json({ ok: true }, 201);
      }
      if (init.method === 'DELETE') {
        this.files.delete(u.pathname);
        return json({ ok: true });
      }
      const f = this.files.get(u.pathname);
      return f ? new Response(f) : json({ error: 'Nicht gefunden' }, 404);
    }
    return json({ error: 'x' }, 404);
  }) as unknown as typeof fetch;
  /** Änderung durch ein anderes Gerät */
  remoteWrite(store: string, id: string, data: unknown) {
    const k = `${store}:${id}`;
    const v = this.rows.get(k)?.version ?? 0;
    this.rows.set(k, { store, id, version: v + 1, seq: ++this.seq, deleted: false, data });
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, String(v)), removeItem: (k: string) => m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

let n = 0;
let server: FakeServer;
let engine: SyncEngine;
const grow = (id: string, name: string) => ({ id, name, description: '', startDate: '2026-01-01', setting: 'indoor', notes: '', status: 'active', phaseDates: {}, createdAt: 't', updatedAt: 't' }) as any;

beforeEach(async () => {
  await deleteDatabase();
  selectDatabase(`terpgrid-u-test${++n}`);
  setSyncTracking(true);
  server = new FakeServer();
  setApiFetch(server.fetch);
  setCsrfToken('csrf-abc');
  engine = new SyncEngine();
});
afterEach(() => {
  engine.stop();
  setSyncTracking(false);
});

describe('Sync-Engine', () => {
  it('legt lokale Änderungen in die Outbox und leert sie erst nach Serverbestätigung', async () => {
    await putOne('grows', grow('g1', 'Erster'));
    expect((await getAll('outbox')).map((o) => o.key)).toEqual(['grows:g1']);
    server.online = false;
    await engine.syncNow();
    expect(engine.getStatus().phase).toBe('offline');
    expect(engine.getStatus().pending).toBe(1);
    server.online = true;
    await engine.syncNow();
    expect(engine.getStatus()).toMatchObject({ phase: 'idle', pending: 0, conflicts: 0 });
    expect(server.rows.get('grows:g1')?.version).toBe(1);
    expect((await getOne('syncState', 'grows:g1'))?.version).toBe(1);
    expect(server.csrfSeen.every((c) => c === 'csrf-abc')).toBe(true);
  });

  it('überträgt Löschungen (auch „Alles löschen“ per clear)', async () => {
    await writeBatch({ put: { grows: [grow('a', 'A'), grow('b', 'B')] } });
    await engine.syncNow();
    await writeBatch({ clear: ['grows'] });
    expect((await getAll('outbox')).length).toBe(2);
    await engine.syncNow();
    expect(server.rows.get('grows:a')?.deleted).toBe(true);
    expect(server.rows.get('grows:b')?.deleted).toBe(true);
  });

  it('übernimmt Änderungen anderer Geräte ohne neue Outbox-Einträge', async () => {
    server.remoteWrite('grows', 'r1', grow('r1', 'Vom Handy'));
    await engine.syncNow();
    expect((await getOne('grows', 'r1'))?.name).toBe('Vom Handy');
    expect(await getAll('outbox')).toHaveLength(0);
  });

  it('überschreibt nie still: gleichzeitige Änderung erzeugt einen Konflikt mit beiden Versionen', async () => {
    await putOne('grows', grow('g1', 'Basis'));
    await engine.syncNow();
    server.remoteWrite('grows', 'g1', grow('g1', 'Anderes Gerät'));
    await putOne('grows', grow('g1', 'Dieses Gerät'));
    await engine.syncNow();
    expect(engine.getStatus().conflicts).toBe(1);
    const [c] = await getAll('syncConflicts');
    expect((c!.local as any).name).toBe('Dieses Gerät');
    expect((c!.server!.data as any).name).toBe('Anderes Gerät');
    // Lokal bleibt die eigene Version sichtbar, Server behält seine
    expect((await getOne('grows', 'g1'))?.name).toBe('Dieses Gerät');
    expect((server.rows.get('grows:g1')!.data as any).name).toBe('Anderes Gerät');
    await engine.keepMine(c!.key);
    await engine.syncNow();
    expect((server.rows.get('grows:g1')!.data as any).name).toBe('Dieses Gerät');
    expect(engine.getStatus().conflicts).toBe(0);
  });

  it('verschiedene Felder auf zwei Geräten geändert → automatisch zusammengeführt, ohne Konflikt', async () => {
    await putOne('grows', { ...grow('m1', 'Basis'), notes: 'alt' });
    await engine.syncNow();
    server.remoteWrite('grows', 'm1', { ...grow('m1', 'Basis'), notes: 'vom Handy' });
    await putOne('grows', { ...grow('m1', 'Neuer Name'), notes: 'alt' });
    await engine.syncNow();
    await engine.syncNow();
    expect(engine.getStatus().conflicts).toBe(0);
    expect(await getOne('grows', 'm1')).toMatchObject({ name: 'Neuer Name', notes: 'vom Handy' });
    expect(server.rows.get('grows:m1')!.data).toMatchObject({ name: 'Neuer Name', notes: 'vom Handy' });
    expect(await getAll('outbox')).toHaveLength(0);
  });

  it('echter Feldkonflikt nennt das betroffene Feld', async () => {
    await putOne('grows', grow('m2', 'Basis'));
    await engine.syncNow();
    server.remoteWrite('grows', 'm2', grow('m2', 'Server'));
    await putOne('grows', grow('m2', 'Lokal'));
    await engine.syncNow();
    const [c] = await getAll('syncConflicts');
    expect(c!.fields).toEqual(['name']);
  });

  it('wiederholt fehlgeschlagene Synchronisation mit wachsendem Abstand und verliert nichts', async () => {
    const delays: number[] = [];
    const orig = engine.schedule.bind(engine);
    engine.schedule = (d: number) => {
      delays.push(d);
    };
    server.online = false;
    await putOne('grows', grow('r1', 'X'));
    await engine.syncNow();
    await engine.syncNow();
    await engine.syncNow();
    expect(delays.filter((d) => d >= 5000)).toEqual([5000, 10000, 20000]);
    expect(await getAll('outbox')).toHaveLength(1);
    engine.schedule = orig;
    server.online = true;
    await engine.syncNow();
    expect(engine.getStatus()).toMatchObject({ phase: 'idle', pending: 0 });
  });

  it('„Server-Version übernehmen“ ersetzt die lokale Version', async () => {
    await putOne('grows', grow('g1', 'Basis'));
    await engine.syncNow();
    server.remoteWrite('grows', 'g1', grow('g1', 'Server'));
    await putOne('grows', grow('g1', 'Lokal'));
    await engine.syncNow();
    const [c] = await getAll('syncConflicts');
    await engine.takeServer(c!.key);
    expect((await getOne('grows', 'g1'))?.name).toBe('Server');
    await engine.syncNow();
    expect(server.rows.get('grows:g1')!.version).toBe(2);
  });

  it('lädt Fotos hoch und auf einem zweiten Gerät bei Bedarf wieder herunter', async () => {
    const full = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]).buffer;
    const thumb = new Uint8Array([0xff, 0xd8, 0xff, 9]).buffer;
    await writeBatch({ put: { photos: [{ id: 'p1', takenAt: 't', note: '', width: 1, height: 1, size: 6, mime: 'image/jpeg', createdAt: 't', updatedAt: 't' } as any], photoData: [{ id: 'p1', full, thumb, mime: 'image/jpeg' }] } });
    await engine.syncNow();
    expect(server.files.has('/api/files/photo/p1/full')).toBe(true);
    expect(server.files.has('/api/files/photo/p1/thumb')).toBe(true);
    // Zweites Gerät
    engine.stop();
    selectDatabase(`terpgrid-u-device2-${n}`);
    const e2 = new SyncEngine();
    await e2.syncNow();
    await new Promise((r) => setTimeout(r, 50));
    expect(await getOne('photos', 'p1')).toBeDefined();
    const pd = await getOne('photoData', 'p1');
    expect(pd && new Uint8Array(pd.full)[3]).toBe(1);
    expect(await getAll('outbox')).toHaveLength(0);
    e2.stop();
  });

  it('Konto-Datenbanken sind getrennt: Outbox eines Kontos wird nie im anderen hochgeladen', async () => {
    await putOne('grows', grow('nur-a', 'Konto A'));
    engine.stop();
    selectDatabase(`terpgrid-u-other-${n}`);
    const eb = new SyncEngine();
    await eb.syncNow();
    expect(server.rows.has('grows:nur-a')).toBe(false);
    eb.stop();
  });
});

async function createLegacy(rows: { grows?: any[]; photos?: any[]; photoData?: any[] }) {
  selectDatabase('terpgrid');
  setSyncTracking(false);
  await writeBatch({ put: { grows: rows.grows ?? [], photos: rows.photos ?? [], photoData: rows.photoData ?? [], settings: [{ key: 'app', value: { theme: 'x' } }] } as any });
  const { closeDatabase } = await import('../db/database');
  await closeDatabase();
  selectDatabase(`terpgrid-u-import${n}`);
  setSyncTracking(true);
}

describe('Übernahme lokaler Altdaten', () => {
  afterEach(async () => {
    await deleteLegacy();
  });

  it('erkennt, zeigt Vorschau, importiert idempotent, prüft und behält die alte Datenbank', async () => {
    const full = new Uint8Array([0xff, 0xd8, 0xff, 5]).buffer;
    await createLegacy({
      grows: [grow('g1', 'Alt 1'), grow('g2', 'Alt 2')],
      photos: [{ id: 'ph', growId: 'g1', takenAt: 't', note: '', width: 1, height: 1, size: 4, mime: 'image/jpeg', createdAt: 't', updatedAt: 't' }],
      photoData: [{ id: 'ph', full, thumb: full, mime: 'image/jpeg' }],
    });
    expect(await legacyExists()).toBe(true);
    const snap = await readLegacy();
    expect(snap.counts.grows).toBe(2);
    expect(snap.counts.photos).toBe(1);
    expect(snap.counts.settings).toBe(1);
    expect(snap.photoData).toHaveLength(1);
    const target = { accountKey: 'abc', loginName: 'alice' };
    const r1 = await importLegacy(snap, target, () => {});
    expect(r1).toMatchObject({ created: 4, unchanged: 0, conflicts: 0, files: 1, verified: true });
    expect(server.files.has('/api/files/photo/ph/full')).toBe(true);
    expect((await getOne('grows', 'g1'))?.name).toBe('Alt 1');
    expect(await getAll('outbox')).toHaveLength(0);
    // Zweiter Durchlauf: nichts doppelt
    const r2 = await importLegacy(snap, target, () => {});
    expect(r2).toMatchObject({ created: 0, unchanged: 4, conflicts: 0 });
    expect([...server.rows.values()].filter((r) => r.store === 'grows')).toHaveLength(2);
    expect(readImportMark()).toMatchObject({ accountKey: 'abc', loginName: 'alice', verified: true });
    // Alte Datenbank ist weiterhin vorhanden
    expect(await legacyExists()).toBe(true);
    await deleteLegacy();
    expect(await legacyExists()).toBe(false);
  });

  it('überschreibt keine abweichenden Serverdaten, sondern meldet Konflikte', async () => {
    server.remoteWrite('grows', 'g1', grow('g1', 'Schon auf dem Server'));
    await createLegacy({ grows: [grow('g1', 'Lokal alt')] });
    const r = await importLegacy(await readLegacy(), { accountKey: 'k', loginName: 'x' }, () => {});
    expect(r.conflicts).toBe(1);
    expect((server.rows.get('grows:g1')!.data as any).name).toBe('Schon auf dem Server');
    const [c] = await getAll('syncConflicts');
    expect((c!.local as any).name).toBe('Lokal alt');
  });
});

describe('Datenmigrationen im Servermodus', () => {
  it('übernehmen gerätegebundene localStorage-Daten nicht still in ein Konto', async () => {
    const { runDataMigrations } = await import('../db/migrate');
    const store = { getItem: () => JSON.stringify([{ id: 'c1', kind: 'edible', name: 'Fremd', input: {}, summary: '', createdAt: 't' }]), setItem() {}, removeItem() {} };
    expect(await runDataMigrations(store as any)).toEqual([]);
    expect(await getAll('calculations')).toHaveLength(0);
    expect(await getAll('outbox')).toHaveLength(0);
  });
});
