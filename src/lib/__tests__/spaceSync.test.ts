/**
 * Synchronisation gemeinsamer Bereiche im Client: Konflikte, Drei-Wege-Merge, Entzug
 * (kein erneutes Senden), Rollenwechsel und Warteschlange je Konto.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { notificationText } from '../collab/labels';
import { SpaceSession } from '../collab/spaceSync';
import { setApiFetch } from '../server/api';

// Minimaler localStorage für die Node-Testumgebung
if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
  Object.defineProperty(globalThis.localStorage, 'keys', { value: () => [...m.keys()] });
}
const storageKeys = () => ((globalThis.localStorage as unknown as { keys?: () => string[] }).keys?.() ?? Object.keys(localStorage));

type Row = { store: string; id: string; version: number; seq: number; deleted: boolean; data: Record<string, unknown> | null; access: string };

class FakeSpaceServer {
  rows = new Map<string, Row>();
  seq = 0;
  member = true;
  role: 'owner' | 'editor' | 'commenter' | 'viewer' = 'editor';
  pushes = 0;
  fetch = (async (url: string, init: RequestInit) => {
    const u = new URL(url, 'https://t.test');
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (!this.member) return json({ error: 'Bereich nicht gefunden oder kein Zugriff' }, 404);
    if (u.pathname.endsWith('/push')) {
      this.pushes++;
      if (this.role === 'viewer' || this.role === 'commenter') return json({ error: 'Mit deiner Rolle kannst du Inhalte nur ansehen.' }, 403);
      const { changes } = JSON.parse(String(init.body));
      return json({
        role: this.role,
        results: changes.map((c: any) => {
          const k = `${c.store}:${c.id}`;
          const cur = this.rows.get(k);
          const v = cur?.version ?? 0;
          if (v !== c.baseVersion) return { store: c.store, id: c.id, status: 'conflict', server: { version: v, deleted: cur?.deleted ?? true, data: cur && !cur.deleted ? cur.data : null } };
          this.rows.set(k, { store: c.store, id: c.id, version: v + 1, seq: ++this.seq, deleted: !!c.deleted, data: c.deleted ? null : c.data, access: 'members' });
          return { store: c.store, id: c.id, status: 'ok', version: v + 1, seq: String(this.seq) };
        }),
      });
    }
    if (u.pathname.endsWith('/changes')) {
      const since = Number(u.searchParams.get('since'));
      const list = [...this.rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
      return json({ changes: list.map((r) => ({ ...r, seq: String(r.seq), origin: 'created' })), cursor: String(list.at(-1)?.seq ?? since), more: false, role: this.role });
    }
    return json({ error: 'nicht gefunden' }, 404);
  }) as typeof fetch;
  /** Änderung durch ein anderes Mitglied */
  external(store: string, id: string, data: Record<string, unknown>) {
    const k = `${store}:${id}`;
    const v = this.rows.get(k)?.version ?? 0;
    this.rows.set(k, { store, id, version: v + 1, seq: ++this.seq, deleted: false, data, access: 'members' });
  }
}

let server: FakeSpaceServer;
beforeEach(() => {
  server = new FakeSpaceServer();
  setApiFetch(server.fetch);
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe('Bereichs-Synchronisation', () => {
  it('lädt Inhalte, speichert lokal und bestätigt per Push', async () => {
    server.external('grows', 'g1', { id: 'g1', name: 'Gemeinsam' });
    const s = new SpaceSession('space-1', 'acc1');
    await s.syncNow();
    expect(s.get('grows', 'g1')?.data.name).toBe('Gemeinsam');
    s.save('plants', { id: 'p1', growId: 'g1', name: 'P' });
    expect(s.state.pending).toBe(1);
    await s.syncNow();
    expect(s.state.pending).toBe(0);
    expect(server.rows.get('plants:p1')?.version).toBe(1);
  });

  it('verschiedene Felder gleichzeitig geändert → automatisch zusammengeführt', async () => {
    server.external('grows', 'g1', { id: 'g1', name: 'Alt', notes: 'n' });
    const s = new SpaceSession('space-1', 'acc1');
    await s.syncNow();
    server.external('grows', 'g1', { id: 'g1', name: 'Alt', notes: 'vom anderen' });
    s.save('grows', { ...s.get('grows', 'g1')!.data, id: 'g1', name: 'Neu' });
    await s.syncNow();
    await s.syncNow();
    const row = server.rows.get('grows:g1')!;
    expect(row.data!.name).toBe('Neu');
    expect(row.data!.notes).toBe('vom anderen');
    expect(s.state.conflicts).toHaveLength(0);
  });

  it('gleiches Feld gleichzeitig geändert → Konflikt zur bewussten Entscheidung, nichts überschrieben', async () => {
    server.external('notes', 'n1', { id: 'n1', title: 'A' });
    const s = new SpaceSession('space-1', 'acc1');
    await s.syncNow();
    server.external('notes', 'n1', { id: 'n1', title: 'B (anderes Mitglied)' });
    s.save('notes', { id: 'n1', title: 'C (ich)' });
    await s.syncNow();
    expect(s.state.conflicts).toHaveLength(1);
    expect(server.rows.get('notes:n1')!.data!.title).toBe('B (anderes Mitglied)');
    s.resolve(s.state.conflicts[0]!.key, 'mine');
    await s.syncNow();
    expect(server.rows.get('notes:n1')!.data!.title).toBe('C (ich)');
  });

  it('Entzug: Zwischenspeicher verworfen, Offline-Änderungen werden NICHT erneut gesendet', async () => {
    server.external('notes', 'n1', { id: 'n1', title: 'geheim' });
    const s = new SpaceSession('space-1', 'acc1');
    await s.syncNow();
    s.save('notes', { id: 'n2', title: 'offline geschrieben' });
    server.member = false;
    await s.syncNow();
    expect(s.state.phase).toBe('revoked');
    expect(s.list('notes')).toHaveLength(0);
    expect(s.state.orphaned).toHaveLength(1);
    expect(localStorage.getItem('terpgrid.u.acc1.spaceOutbox.space-1')).toBeNull();
    // Wieder aufgenommen: alte Sitzung sendet nichts mehr
    server.member = true;
    const before = server.pushes;
    await s.syncNow();
    expect(server.pushes).toBe(before);
    expect(() => s.save('notes', { id: 'n3', title: 'x' })).toThrow();
  });

  it('Rollenwechsel auf „Ansehen“: ausstehende Änderungen verworfen statt endlos wiederholt', async () => {
    const s = new SpaceSession('space-1', 'acc1');
    await s.syncNow();
    s.save('notes', { id: 'n1', title: 'x' });
    server.role = 'viewer';
    await s.syncNow();
    expect(s.state.pending).toBe(0);
    expect(s.state.rejected.length).toBe(1);
    await s.syncNow();
    expect(server.pushes).toBe(1);
  });

  it('Warteschlange überlebt einen Neustart (kontobezogen) und wird genau einmal gesendet', async () => {
    const a = new SpaceSession('space-1', 'acc1');
    server.member = true;
    a.save('notes', { id: 'n1', title: 'gemerkt' });
    expect(localStorage.getItem('terpgrid.u.acc1.spaceOutbox.space-1')).toContain('gemerkt');
    const b = new SpaceSession('space-1', 'acc1');
    expect(b.state.pending).toBe(0); // Zustand wird beim ersten Emit aktualisiert
    await b.syncNow();
    expect(server.rows.get('notes:n1')?.version).toBe(1);
    expect(localStorage.getItem('terpgrid.u.acc1.spaceOutbox.space-1')).toBeNull();
    // Anderes Konto sieht die Warteschlange nicht
    expect(storageKeys().some((k) => k.includes('acc2'))).toBe(false);
  });
});

describe('Benachrichtigungstexte', () => {
  it('enthalten keine Inhalte und nie Anmeldenamen', () => {
    const t = notificationText({
      id: '1',
      category: 'comments',
      type: 'comment.new',
      actor: { ref: 'r', handle: 'alex', socialId: 'TG-AAAA-BBBB', displayName: 'Alex' },
      spaceId: 's',
      spaceName: 'Zelt',
      store: 'plants',
      targetId: 'p1',
      ref: 'c1',
      count: 2,
      createdAt: '',
      updatedAt: '',
      read: false,
    });
    expect(t).toBe('Alex hat in „Zelt“ kommentiert (2×).');
  });
});
