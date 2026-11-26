/**
 * Phase 5.5 – Private Zusammenarbeit: fünf Konten (Eigentümer, Bearbeiten, Kommentieren,
 * Ansehen, Außenstehend) gegen jede geschützte Operation; Isolation, Eskalation,
 * Widerruf, Einladungen, Enumeration, Medien, Export, Benachrichtigungen, Löschung,
 * Schlüsselrotation und direkte RLS-Prüfung auf Datenbankebene.
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KeyRing } from '../src/crypto.js';
import { rotateKeys } from '../src/keys.js';
import { verifyData } from '../src/verify.js';
import { Client, MASTER1, MASTER2, type TestEnv, hasDb, setup } from './helpers.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF-GEMEINSAM'), Buffer.alloc(300, 9)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 1)]);

describe.skipIf(!hasDb)('Phase 5.5 – Private Zusammenarbeit', () => {
  let env: TestEnv;
  const c: Record<'olga' | 'emil' | 'clara' | 'viktor' | 'otto', Client> = {} as never;
  const ref: Record<string, string> = {};
  let space = '';
  const seen: string[] = []; // alle Antworten an andere Konten (für die Anmeldenamen-Prüfung)
  const watch = <T extends { json: unknown }>(r: T) => (seen.push(JSON.stringify(r.json)), r);
  let privateHash = '';

  // Private Datensätze, die nie geteilt werden (Clara löscht später ihr Konto)
  const privHash = async () => {
    const { rows } = await env.ctx.db.query(
      "SELECT string_agg(user_id::text || store || id || version::text || encode(payload, 'hex') || encode(payload_mac, 'hex'), ',' ORDER BY user_id, store, id) AS h FROM records WHERE store = 'journal' AND id = ANY($1)",
      [['j-olga', 'j-emil', 'j-viktor', 'j-otto']],
    );
    return createHash('sha256').update(rows[0].h ?? '').digest('hex');
  };

  beforeAll(async () => {
    env = await setup();
    for (const n of ['olga', 'emil', 'clara', 'viktor', 'otto'] as const) {
      c[n] = new Client(env.app);
      await c[n].register(`login-${n}`);
      const { rows } = await env.ctx.db.query('SELECT id FROM users WHERE login_name = $1', [`login-${n}`]);
      ref[n] = rows[0].id;
    }
    // Private Ausgangsdaten (dürfen sich durch Zusammenarbeit nicht ändern)
    for (const n of ['olga', 'emil', 'clara', 'viktor', 'otto'] as const)
      await c[n].post('/api/sync/push', { changes: [{ store: 'journal', id: `j-${n}`, baseVersion: 0, data: { id: `j-${n}`, notes: `PRIVAT-${n}` } }] });
    privateHash = await privHash();
  });
  afterAll(async () => env?.close());

  /* ───────────── Profile & Freunde ───────────── */

  it('Profil ist standardmäßig privat; Handle darf nicht der Anmeldename sein', async () => {
    const p = await c.olga.get('/api/social/profile');
    expect(p.json.profile.visibility).toMatchObject({ displayName: 'friends', bio: 'private', avatar: 'private', interests: 'private' });
    expect(p.json.profile.socialId).toMatch(/^TG-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const bad = await c.olga.req('PATCH', '/api/social/profile', { handle: 'login-olga' });
    expect(bad.status).toBe(400);
    for (const n of ['olga', 'emil', 'clara', 'viktor', 'otto'] as const) {
      const r = await c[n].req('PATCH', '/api/social/profile', { handle: `${n}_tg`, displayName: n.toUpperCase(), bio: `Bio von ${n}`, interests: ['Terpene'] });
      expect(r.status).toBe(200);
    }
    const dup = await c.emil.req('PATCH', '/api/social/profile', { handle: 'olga_tg' });
    expect(dup.status).toBe(409);
  });

  it('Freundschaftsanfrage: keine Enumeration (existierend, unbekannt, abgeschaltet → gleiche Antwort)', async () => {
    const a = await c.otto.post('/api/social/requests', { target: '@gibt_es_nicht' });
    await c.viktor.req('PATCH', '/api/social/profile', { requestsEnabled: false });
    const b = await c.otto.post('/api/social/requests', { target: '@viktor_tg' });
    await c.viktor.req('PATCH', '/api/social/profile', { requestsEnabled: true });
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(a.json).toEqual(b.json);
    // Viktor sieht die Anfrage nicht (Anfragen waren abgeschaltet)
    const v = await c.viktor.get('/api/social/overview');
    expect(v.json.requests.incoming).toHaveLength(0);
  });

  it('Anfragen, Annahme, Ablehnen (für den Absender weiter „ausstehend“)', async () => {
    for (const n of ['emil', 'clara', 'viktor'] as const) expect((await c[n].post('/api/social/requests', { target: '@olga_tg' })).status).toBe(202);
    const inc = watch(await c.olga.get('/api/social/overview'));
    expect(inc.json.requests.incoming).toHaveLength(3);
    for (const r of inc.json.requests.incoming) await c.olga.post(`/api/social/requests/${r.id}/accept`);
    const fr = watch(await c.olga.get('/api/social/overview'));
    expect(fr.json.friends.map((f: any) => f.handle).sort()).toEqual(['clara_tg', 'emil_tg', 'viktor_tg']);
    // Otto fragt an, Olga lehnt ab → Otto sieht weiter „ausstehend“
    await c.otto.post('/api/social/requests', { target: '@olga_tg' });
    const o = (await c.olga.get('/api/social/overview')).json.requests.incoming[0];
    await c.olga.post(`/api/social/requests/${o.id}/decline`);
    const ot = await c.otto.get('/api/social/overview');
    expect(ot.json.requests.outgoing.find((x: any) => x.target === '@olga_tg').status).toBe('pending');
    expect(ot.json.friends).toHaveLength(0);
  });

  it('Freunde sehen nur freigegebene Profilfelder; Außenstehende nichts', async () => {
    const e = watch(await c.emil.get(`/api/social/users/${ref.olga}`));
    expect(e.json.profile.displayName).toBe('OLGA');
    expect(e.json.profile.bio).toBeUndefined(); // privat
    await c.olga.req('PATCH', '/api/social/profile', { visibility: { bio: 'friends' } });
    expect((await c.emil.get(`/api/social/users/${ref.olga}`)).json.profile.bio).toBe('Bio von olga');
    expect((await c.otto.get(`/api/social/users/${ref.olga}`)).status).toBe(404);
    // Profil vor einem einzelnen Freund verbergen
    await c.olga.req('PATCH', `/api/social/friends/${ref.emil}`, { profileHidden: true, nickname: 'Emi' });
    expect((await c.emil.get(`/api/social/users/${ref.olga}`)).json.profile.bio).toBeUndefined();
    await c.olga.req('PATCH', `/api/social/friends/${ref.emil}`, { profileHidden: false });
    const nick = (await c.olga.get('/api/social/overview')).json.friends.find((f: any) => f.ref === ref.emil);
    expect(nick.nickname).toBe('Emi');
  });

  it('Einladungscode: einmalig, Wiederholung und Widerruf ungültig, Durchprobieren gebremst', async () => {
    const inv = await c.otto.post('/api/social/invites', { days: 2 });
    expect(inv.json.token).toBeTruthy();
    const pv = await c.clara.post('/api/social/invites/preview', { token: inv.json.token });
    expect(pv.json.inviter.handle).toBe('otto_tg');
    expect((await c.clara.post('/api/social/invites/redeem', { token: inv.json.token })).status).toBe(200);
    expect((await c.clara.post('/api/social/invites/redeem', { token: inv.json.token })).status).toBe(404); // Replay
    expect((await c.emil.post('/api/social/invites/redeem', { token: inv.json.token })).status).toBe(404);
    const inv2 = await c.otto.post('/api/social/invites', {});
    await c.otto.req('DELETE', `/api/social/invites/${inv2.json.id}`);
    expect((await c.emil.post('/api/social/invites/redeem', { token: inv2.json.token })).status).toBe(404);
    // Abgelaufen
    const inv3 = await c.otto.post('/api/social/invites', {});
    const sup = new pg.Client({ connectionString: env.superDbUrl });
    await sup.connect();
    await sup.query("UPDATE friend_invites SET expires_at = now() - interval '1 minute' WHERE id = $1", [inv3.json.id]);
    await sup.end();
    expect((await c.emil.post('/api/social/invites/redeem', { token: inv3.json.token })).status).toBe(404);
  });

  /* ───────────── Bereiche & Rollen ───────────── */

  it('Bereich anlegen und Freunde mit Rollen einladen (nur Freunde einladbar)', async () => {
    const r = await c.olga.post('/api/spaces', { name: 'Zelt Nord', kind: 'project', description: 'Gemeinsamer Grow' });
    expect(r.status).toBe(201);
    space = r.json.id;
    expect((await c.olga.post(`/api/spaces/${space}/invites`, { ref: ref.otto, role: 'viewer' })).status).toBe(400);
    const roles = { emil: 'editor', clara: 'commenter', viktor: 'viewer' } as const;
    for (const [n, role] of Object.entries(roles)) {
      const i = await c.olga.post(`/api/spaces/${space}/invites`, { ref: ref[n], role });
      expect(i.status).toBe(201);
      const list = watch(await c[n as 'emil'].get('/api/spaces'));
      const inv = list.json.invites.find((x: any) => x.spaceId === space);
      expect(inv.name).toBe('Zelt Nord');
      expect((await c[n as 'emil'].post(`/api/space-invites/${inv.id}/accept`)).status).toBe(200);
      expect((await c[n as 'emil'].post(`/api/space-invites/${inv.id}/accept`)).status).toBe(404); // Replay
    }
    const d = watch(await c.viktor.get(`/api/spaces/${space}`));
    expect(d.json.members).toHaveLength(4);
    expect(d.json.permissions['resource.create']).toBe(false);
  });

  it('Außenstehender: Bereich existiert für ihn nicht (404 überall)', async () => {
    for (const url of [`/api/spaces/${space}`, `/api/spaces/${space}/changes`, `/api/spaces/${space}/comments`, `/api/spaces/${space}/activity`, `/api/spaces/${space}/export`])
      expect((await c.otto.get(url)).status).toBe(404);
    expect((await c.otto.post(`/api/spaces/${space}/push`, { changes: [] })).status).toBe(404);
    expect((await c.otto.get('/api/spaces')).json.spaces).toHaveLength(0);
  });

  it('Rechtematrix Inhalte: Eigentümer/Bearbeiten schreiben, Kommentieren/Ansehen nicht', async () => {
    const g = { store: 'grows', id: 'g1', baseVersion: 0, data: { id: 'g1', name: 'Gemeinsamer Grow' } };
    expect((await c.olga.post(`/api/spaces/${space}/push`, { changes: [g] })).json.results[0].status).toBe('ok');
    const plant = { store: 'plants', id: 'p1', baseVersion: 0, data: { id: 'p1', growId: 'g1', name: 'Pflanze 1' } };
    expect((await c.emil.post(`/api/spaces/${space}/push`, { changes: [plant] })).json.results[0].status).toBe('ok');
    expect((await c.clara.post(`/api/spaces/${space}/push`, { changes: [{ ...plant, id: 'p2', data: { ...plant.data, id: 'p2' } }] })).status).toBe(403);
    expect((await c.viktor.post(`/api/spaces/${space}/push`, { changes: [{ ...plant, id: 'p3', data: { ...plant.data, id: 'p3' } }] })).status).toBe(403);
    const v = watch(await c.viktor.get(`/api/spaces/${space}/changes?since=0`));
    expect(v.json.changes.map((x: any) => x.id).sort()).toEqual(['g1', 'p1']);
    // Idempotent: gleiche Änderung erneut → unverändert
    const again = await c.emil.post(`/api/spaces/${space}/push`, { changes: [{ ...plant, baseVersion: 1 }] });
    expect(again.json.results[0].status).toBe('unchanged');
  });

  it('Gleichzeitige Bearbeitung: zweite Änderung auf alter Version → Konflikt', async () => {
    const a = await c.olga.post(`/api/spaces/${space}/push`, { changes: [{ store: 'plants', id: 'p1', baseVersion: 1, data: { id: 'p1', growId: 'g1', name: 'Olgas Name' } }] });
    expect(a.json.results[0].status).toBe('ok');
    const b = await c.emil.post(`/api/spaces/${space}/push`, { changes: [{ store: 'plants', id: 'p1', baseVersion: 1, data: { id: 'p1', growId: 'g1', name: 'Emils Name' } }] });
    expect(b.json.results[0].status).toBe('conflict');
    expect(b.json.results[0].server.data.name).toBe('Olgas Name');
  });

  it('Elternbezug wird serverseitig geprüft: Kind ohne vorhandenen Eltern-Eintrag abgelehnt', async () => {
    const r = await c.emil.post(`/api/spaces/${space}/push`, { changes: [{ store: 'activities', id: 'a-x', baseVersion: 0, data: { id: 'a-x', growId: 'fremd', type: 'observation' } }] });
    expect(r.json.results[0].status).toBe('rejected');
  });

  it('Zugriffsstufe „Nur Bearbeitende“: Kinder erben, Ansehen/Kommentieren sehen nichts (auch keine Dateien)', async () => {
    await c.olga.post(`/api/spaces/${space}/push`, {
      changes: [
        { store: 'grows', id: 'g2', baseVersion: 0, data: { id: 'g2', name: 'Geheim-Grow' } },
        { store: 'plants', id: 'p20', baseVersion: 0, data: { id: 'p20', growId: 'g2', name: 'Geheim-Pflanze' } },
        { store: 'photos', id: 'ph20', baseVersion: 0, data: { id: 'ph20', plantId: 'p20', note: 'geheim' } },
      ],
    });
    expect((await c.olga.req('PUT', `/api/spaces/${space}/files/photo/ph20/full`, JPEG, { 'content-type': 'image/jpeg' })).status).toBe(201);
    expect((await c.emil.post(`/api/spaces/${space}/access`, { store: 'grows', id: 'g2', access: 'editors' })).status).toBe(403);
    expect((await c.olga.post(`/api/spaces/${space}/access`, { store: 'plants', id: 'p20', access: 'editors' })).status).toBe(400);
    const acc = await c.olga.post(`/api/spaces/${space}/access`, { store: 'grows', id: 'g2', access: 'editors' });
    expect(acc.json.changed).toBe(3);
    for (const n of ['clara', 'viktor'] as const) {
      const ch = await c[n].get(`/api/spaces/${space}/changes?since=0`);
      const visible = ch.json.changes.filter((x: any) => !x.hidden).map((x: any) => x.id);
      expect(visible).not.toContain('g2');
      expect(visible).not.toContain('p20');
      expect(JSON.stringify(ch.json)).not.toContain('Geheim');
      // Früher sichtbare Einträge kommen als inhaltslose Löschmarke
      expect(ch.json.changes.filter((x: any) => x.hidden).map((x: any) => x.id).sort()).toEqual(['g2', 'p20', 'ph20']);
      expect((await c[n].get(`/api/spaces/${space}/files/photo/ph20/full`)).status).toBe(404);
      expect((await c[n].get(`/api/spaces/${space}/comments?store=plants&target=p20`)).json.comments).toHaveLength(0);
    }
    expect((await c.clara.post(`/api/spaces/${space}/comments`, { store: 'plants', target: 'p20', text: 'darf nicht' })).status).toBe(404);
    expect((await c.emil.get(`/api/spaces/${space}/files/photo/ph20/full`)).status).toBe(200);
    // Bearbeiten darf ein Kind nicht in einen öffentlichen Grow umhängen (würde es offenlegen)
    const leak = await c.emil.post(`/api/spaces/${space}/push`, { changes: [{ store: 'plants', id: 'p20', baseVersion: 2, data: { id: 'p20', growId: 'g1', name: 'Geheim-Pflanze' } }] });
    expect(leak.json.results[0].status).toBe('rejected');
  });

  it('Zugriffsstufe „Schreibgeschützt“: nur Eigentümer ändert, auch keine neuen Kinder', async () => {
    await c.olga.post(`/api/spaces/${space}/access`, { store: 'grows', id: 'g1', access: 'readonly' });
    const upd = await c.emil.post(`/api/spaces/${space}/push`, { changes: [{ store: 'grows', id: 'g1', baseVersion: 1, data: { id: 'g1', name: 'geändert' } }] });
    expect(upd.json.results[0].status).toBe('rejected');
    const child = await c.emil.post(`/api/spaces/${space}/push`, { changes: [{ store: 'activities', id: 'a1', baseVersion: 0, data: { id: 'a1', growId: 'g1', type: 'observation' } }] });
    expect(child.json.results[0].status).toBe('rejected');
    await c.olga.post(`/api/spaces/${space}/access`, { store: 'grows', id: 'g1', access: 'members' });
  });

  it('Kommentare: Kommentieren darf, Ansehen nicht; eigene bearbeiten, fremde nur Eigentümer entfernen', async () => {
    const a = await c.clara.post(`/api/spaces/${space}/comments`, { store: 'plants', target: 'p1', text: 'Sieht gut aus!' });
    expect(a.status).toBe(201);
    expect((await c.viktor.post(`/api/spaces/${space}/comments`, { store: 'plants', target: 'p1', text: 'nein' })).status).toBe(403);
    const reply = await c.emil.post(`/api/spaces/${space}/comments`, { store: 'plants', target: 'p1', text: 'Danke', parentId: a.json.id });
    expect(reply.status).toBe(201);
    expect((await c.emil.req('PATCH', `/api/spaces/${space}/comments/${a.json.id}`, { text: 'fremd' })).status).toBe(404);
    expect((await c.emil.req('DELETE', `/api/spaces/${space}/comments/${a.json.id}`)).status).toBe(403);
    expect((await c.clara.req('PATCH', `/api/spaces/${space}/comments/${a.json.id}`, { text: 'Sieht sehr gut aus!' })).status).toBe(200);
    const list = watch(await c.viktor.get(`/api/spaces/${space}/comments?store=plants&target=p1`));
    expect(list.json.comments.map((x: any) => x.text)).toEqual(['Sieht sehr gut aus!', 'Danke']);
    expect((await c.olga.req('DELETE', `/api/spaces/${space}/comments/${reply.json.id}`)).status).toBe(200);
  });

  it('Mitgliederverwaltung: nur Eigentümer; keine Rechteausweitung über Rollen oder manipulierte Felder', async () => {
    expect((await c.emil.post(`/api/spaces/${space}/invites`, { ref: ref.olga, role: 'editor' })).status).toBe(403);
    expect((await c.emil.req('PATCH', `/api/spaces/${space}/members/${ref.clara}`, { role: 'editor' })).status).toBe(403);
    expect((await c.emil.req('DELETE', `/api/spaces/${space}/members/${ref.viktor}`)).status).toBe(403);
    expect((await c.olga.req('PATCH', `/api/spaces/${space}/members/${ref.emil}`, { role: 'owner' })).status).toBe(400);
    expect((await c.emil.req('PATCH', `/api/spaces/${space}`, { name: 'gekapert' })).status).toBe(403);
    expect((await c.emil.post(`/api/spaces/${space}/transfer`, { ref: ref.emil })).status).toBe(403);
  });

  it('Rollenwechsel während der Synchronisation greift sofort', async () => {
    await c.olga.req('PATCH', `/api/spaces/${space}/members/${ref.emil}`, { role: 'viewer' });
    const r = await c.emil.post(`/api/spaces/${space}/push`, { changes: [{ store: 'plants', id: 'p9', baseVersion: 0, data: { id: 'p9', growId: 'g1', name: 'zu spät' } }] });
    expect(r.status).toBe(403);
    await c.olga.req('PATCH', `/api/spaces/${space}/members/${ref.emil}`, { role: 'editor' });
  });

  it('Export: Rolle und Bereichsoption werden geprüft, nur lesbare Inhalte', async () => {
    await c.olga.req('PATCH', `/api/spaces/${space}`, { allowExport: false });
    expect((await c.viktor.get(`/api/spaces/${space}/export`)).status).toBe(403);
    expect((await c.emil.get(`/api/spaces/${space}/export`)).status).toBe(200);
    await c.olga.req('PATCH', `/api/spaces/${space}`, { allowExport: true });
    const v = await c.viktor.get(`/api/spaces/${space}/export`);
    expect(v.status).toBe(200);
    expect(v.raw.toString('latin1')).not.toContain('Geheim');
  });

  it('Teilen als Kopie: neue IDs, Original bleibt privat und unverändert, Kontoschlüssel bleibt beim Besitzer', async () => {
    await c.olga.post('/api/sync/push', {
      changes: [
        { store: 'grows', id: 'priv-g', baseVersion: 0, data: { id: 'priv-g', name: 'Privater Grow', notes: 'Notiz' } },
        { store: 'plants', id: 'priv-p', baseVersion: 0, data: { id: 'priv-p', growId: 'priv-g', name: 'Privat-Pflanze', spaceId: 'mein-zelt' } },
        { store: 'photos', id: 'priv-ph', baseVersion: 0, data: { id: 'priv-ph', growId: 'priv-g', note: 'Foto' } },
        { store: 'inventory', id: 'inv1', baseVersion: 0, data: { id: 'inv1', name: 'Samen', quantity: 12, cost: 40, category: 'seeds' } },
      ],
    });
    await c.olga.req('PUT', '/api/files/photo/priv-ph/full', JPEG, { 'content-type': 'image/jpeg' });
    const before = await c.olga.get('/api/sync/changes?since=0');
    const pv = await c.olga.post(`/api/spaces/${space}/share/preview`, { items: [{ store: 'grows', id: 'priv-g' }, { store: 'inventory', id: 'inv1' }], mode: 'copy' });
    expect(pv.json.summary.counts).toMatchObject({ grows: 1, plants: 1, photos: 1, inventory: 1 });
    expect(pv.json.summary.removed.join(' ')).toContain('Mengen');
    const sh = await c.olga.post(`/api/spaces/${space}/share`, { items: [{ store: 'grows', id: 'priv-g' }, { store: 'inventory', id: 'inv1' }], mode: 'copy' });
    expect(sh.json.created).toBe(4);
    const newGrow = sh.json.ids.find((x: any) => x.store === 'grows').id;
    expect(newGrow).not.toBe('priv-g');
    const v = await c.viktor.get(`/api/spaces/${space}/changes?since=0`);
    const copy = v.json.changes.find((x: any) => x.id === newGrow);
    expect(copy.origin).toBe('copy');
    const inv = v.json.changes.find((x: any) => x.store === 'inventory');
    expect(inv.data.quantity).toBeUndefined();
    expect(inv.data.cost).toBeUndefined();
    expect(JSON.stringify(v.json)).not.toContain('mein-zelt');
    const after = await c.olga.get('/api/sync/changes?since=0');
    expect(after.json.changes).toEqual(before.json.changes);
    const photo = v.json.changes.find((x: any) => x.store === 'photos' && x.origin === 'copy');
    expect((await c.viktor.get(`/api/spaces/${space}/files/photo/${photo.id}/full`)).raw.equals(JPEG)).toBe(true);
  });

  it('Verschieben: transaktional, privat entfernt (Löschmarke), Dateien übernommen; nicht verschiebbare Typen abgelehnt', async () => {
    await c.olga.post('/api/sync/push', { changes: [{ store: 'labReports', id: 'lr1', baseVersion: 0, data: { id: 'lr1', title: 'Analyse', documentId: 'doc1', terpenes: [], unit: 'percent', origin: 'lab', notes: '' } }] });
    await c.olga.req('PUT', '/api/files/labdoc/doc1/doc', PDF, { 'content-type': 'application/pdf' });
    expect((await c.olga.post(`/api/spaces/${space}/share`, { items: [{ store: 'inventory', id: 'inv1' }], mode: 'move' })).status).toBe(400);
    const mv = await c.olga.post(`/api/spaces/${space}/share`, { items: [{ store: 'labReports', id: 'lr1' }], mode: 'move' });
    expect(mv.json.created).toBe(1);
    const priv = await c.olga.get('/api/sync/changes?since=0');
    expect(priv.json.changes.find((x: any) => x.id === 'lr1').deleted).toBe(true);
    expect((await c.olga.get('/api/files/labdoc/doc1/doc')).status).toBe(404);
    expect((await c.viktor.get(`/api/spaces/${space}/files/labdoc/doc1/doc`)).raw.equals(PDF)).toBe(true);
    // Fehlgeschlagenes Verschieben lässt alles unverändert (Eintrag existiert im Bereich bereits)
    await c.olga.post('/api/sync/push', { changes: [{ store: 'journal', id: 'j-move', baseVersion: 0, data: { id: 'j-move', notes: 'x' } }] });
    await c.olga.post(`/api/spaces/${space}/share`, { items: [{ store: 'journal', id: 'j-move' }], mode: 'copy' });
    const priv2 = await c.olga.get('/api/sync/changes?since=0');
    expect(priv2.json.changes.find((x: any) => x.id === 'j-move').deleted).toBe(false);
  });

  it('Nur eigene, synchronisierte Datensätze teilbar – fremde IDs nicht', async () => {
    const r = await c.emil.post(`/api/spaces/${space}/share`, { items: [{ store: 'journal', id: 'j-olga' }], mode: 'copy' });
    expect(r.status).toBe(404);
    expect((await c.viktor.post(`/api/spaces/${space}/share`, { items: [{ store: 'journal', id: 'j-viktor' }], mode: 'copy' })).status).toBe(403);
    // Vorschau ohne Zielbereich liest ebenfalls nur eigene Daten
    expect((await c.emil.post('/api/share/preview', { items: [{ store: 'journal', id: 'j-olga' }], mode: 'copy' })).status).toBe(404);
    const own = await c.emil.post('/api/share/preview', { items: [{ store: 'journal', id: 'j-emil' }], mode: 'copy' });
    expect(own.json.summary.counts.journal).toBe(1);
    expect(JSON.stringify(own.json)).not.toContain('PRIVAT-olga');
  });

  it('Benachrichtigungen: ohne Inhalte, isoliert je Empfänger, gelesen/alle gelesen, Einstellungen', async () => {
    const n = await c.clara.get('/api/notifications');
    expect(n.json.notifications.length).toBeGreaterThan(0);
    expect(JSON.stringify(n.json)).not.toContain('Sieht');
    const u = await c.clara.get('/api/notifications/unread');
    expect(u.json.count).toBeGreaterThan(0);
    // Fremde IDs markieren nichts
    const otherIds = (await c.olga.get('/api/notifications')).json.notifications.map((x: any) => x.id);
    expect((await c.clara.post('/api/notifications/read', { ids: otherIds })).json.updated).toBe(0);
    expect((await c.clara.post('/api/notifications/read', { all: true })).json.updated).toBeGreaterThan(0);
    expect((await c.clara.get('/api/notifications/unread')).json.count).toBe(0);
    const prefs = await c.clara.req('PUT', '/api/notifications/prefs', { comments: false, access: false });
    expect(prefs.json.prefs).toMatchObject({ comments: false, access: true });
    await c.emil.post(`/api/spaces/${space}/comments`, { store: 'plants', target: 'p1', text: 'noch einer' });
    expect((await c.clara.get('/api/notifications/unread')).json.byCategory.comments ?? 0).toBe(0);
  });

  it('Widerruf: entferntes Mitglied verliert sofort Zugriff, auch für später eintreffende Offline-Änderungen', async () => {
    expect((await c.olga.req('DELETE', `/api/spaces/${space}/members/${ref.viktor}`)).status).toBe(200);
    expect((await c.viktor.get(`/api/spaces/${space}/changes?since=0`)).status).toBe(404);
    expect((await c.viktor.post(`/api/spaces/${space}/push`, { changes: [{ store: 'plants', id: 'off', baseVersion: 0, data: { id: 'off', growId: 'g1' } }] })).status).toBe(404);
    expect((await c.viktor.get(`/api/spaces/${space}/files/photo/ph20/full`)).status).toBe(404);
    const notes = await c.viktor.get('/api/notifications');
    expect(notes.json.notifications.some((x: any) => x.type === 'member.removed')).toBe(true);
    // Einladung widerrufen → Annahme unmöglich
    const i = await c.olga.post(`/api/spaces/${space}/invites`, { ref: ref.viktor, role: 'viewer' });
    await c.olga.req('DELETE', `/api/spaces/${space}/invites/${i.json.id}`);
    expect((await c.viktor.post(`/api/space-invites/${i.json.id}/accept`)).status).toBe(404);
  });

  it('Blockieren: beendet Freundschaft, verhindert neue Einladungen und Anfragen', async () => {
    await c.viktor.post('/api/social/blocks', { ref: ref.olga });
    expect((await c.olga.get('/api/social/overview')).json.friends.map((f: any) => f.ref)).not.toContain(ref.viktor);
    expect((await c.olga.post(`/api/spaces/${space}/invites`, { ref: ref.viktor, role: 'viewer' })).status).toBe(400);
    await c.olga.post('/api/social/requests', { target: '@viktor_tg' });
    expect((await c.viktor.get('/api/social/overview')).json.requests.incoming).toHaveLength(0);
    const b = await c.viktor.get('/api/social/overview');
    expect(b.json.blocks[0].label).toBe('OLGA');
    await c.viktor.req('DELETE', `/api/social/blocks/${ref.olga}`);
    // Nach dem Entsperren keine automatische Freundschaft – neu anfragen
    expect((await c.viktor.get('/api/social/overview')).json.friends).toHaveLength(0);
    await c.viktor.post('/api/social/requests', { target: '@olga_tg' });
    const inc = (await c.olga.get('/api/social/overview')).json.requests.incoming.find((r: any) => r.from.ref === ref.viktor);
    expect((await c.olga.post(`/api/social/requests/${inc.id}/accept`)).status).toBe(200);
  });

  it('Missbrauch: Freundschaftsanfragen sind je Konto begrenzt', async () => {
    let limited = false;
    for (let i = 0; i < 25 && !limited; i++) limited = (await c.otto.post('/api/social/requests', { target: `@spam_${i}` })).status === 429;
    expect(limited).toBe(true);
  });

  it('RLS auf Datenbankebene: App-Rolle sieht ohne Mitgliedschaft nichts und kann sich nicht selbst aufnehmen', async () => {
    const app = new pg.Client({ connectionString: env.appUrl });
    await app.connect();
    try {
      await app.query('BEGIN');
      await app.query("SELECT set_config('app.user_id', $1, true)", [ref.otto]);
      for (const t of ['spaces', 'space_keys', 'space_members', 'space_records', 'space_files', 'space_comments', 'space_activity']) expect((await app.query(`SELECT * FROM ${t}`)).rowCount).toBe(0);
      expect((await app.query('SELECT * FROM notifications WHERE user_id <> $1', [ref.otto])).rowCount).toBe(0);
      expect((await app.query('SELECT * FROM friend_settings')).rowCount).toBe(0);
      await expect(app.query("INSERT INTO space_members(space_id, user_id, role) VALUES ($1, $2, 'owner')", [space, ref.otto])).rejects.toThrow();
      await app.query('ROLLBACK');
      await app.query('BEGIN');
      await app.query("SELECT set_config('app.user_id', $1, true)", [ref.otto]);
      await expect(app.query("INSERT INTO space_members(space_id, user_id, role) VALUES ($1, $2, 'editor')", [space, ref.otto])).rejects.toThrow();
      await app.query('ROLLBACK');
      // Mitglied mit Rolle „Kommentieren“ kann Datensätze nicht direkt ändern und keine Benachrichtigung fälschen
      await app.query('BEGIN');
      await app.query("SELECT set_config('app.user_id', $1, true)", [ref.clara]);
      expect((await app.query("UPDATE space_records SET deleted = true WHERE space_id = $1", [space])).rowCount).toBe(0);
      await expect(app.query("INSERT INTO notifications(user_id, category, type) VALUES ($1, 'access', 'member.removed')", [ref.olga])).rejects.toThrow();
      await app.query('ROLLBACK');
      // Eingeladene können die Rolle ihrer Einladung nicht ändern
      const i = await c.olga.post(`/api/spaces/${space}/invites`, { ref: ref.viktor, role: 'viewer' });
      expect(`${i.status} ${JSON.stringify(i.json)}`).toBe(`201 ${JSON.stringify(i.json)}`);
      await app.query('BEGIN');
      await app.query("SELECT set_config('app.user_id', $1, true)", [ref.viktor]);
      const seen = await app.query('SELECT id, invitee, status, tg_uid() AS me FROM space_invites WHERE id = $1', [i.json.id]);
      const sup = new pg.Client({ connectionString: env.superDbUrl });
      await sup.connect();
      const raw = await sup.query('SELECT id, invitee, status, role FROM space_invites WHERE id = $1', [i.json.id]);
      await sup.end();
      expect(JSON.stringify({ seen: seen.rows, raw: raw.rows, viktor: ref.viktor })).toContain('"seen":[{');
      await expect(app.query("UPDATE space_invites SET role = 'editor' WHERE id = $1", [i.json.id])).rejects.toThrow();
      await app.query('ROLLBACK');
      await c.olga.req('DELETE', `/api/spaces/${space}/invites/${i.json.id}`);
    } finally {
      await app.end();
    }
  });

  it('Kein Cache: alle Antworten no-store', async () => {
    const r = await c.emil.req('GET', `/api/spaces/${space}/changes?since=0`);
    expect(r.headers['cache-control']).toContain('no-store');
    const f = await c.emil.req('GET', `/api/spaces/${space}/files/photo/ph20/full`);
    expect(f.headers['cache-control']).toContain('no-store');
    expect(f.headers['content-disposition']).toBe('attachment');
  });

  it('Schlüsselrotation des Bereichs und Master-Key-Rotation: alles bleibt lesbar, Prüfung fehlerfrei', async () => {
    const st = await c.olga.req('POST', `/api/spaces/${space}/rotate-key`);
    expect(st.status).toBe(200);
    expect(st.json.done).toBe(true);
    const ch = await c.emil.get(`/api/spaces/${space}/changes?since=0`);
    expect(ch.json.changes.find((x: any) => x.id === 'p1').data.name).toBe('Olgas Name');
    expect((await c.emil.get(`/api/spaces/${space}/comments?store=plants&target=p1`)).json.comments.some((x: any) => x.text === 'Sieht sehr gut aus!')).toBe(true);
    const ring = new KeyRing(new Map([[1, Buffer.from(MASTER1, 'base64')], [2, Buffer.from(MASTER2, 'base64')]]), 2);
    expect(await rotateKeys(env.ctx.db, ring)).toBeGreaterThan(0);
    const rep = await verifyData(env.ctx.db, ring, env.fileDir);
    expect(rep.errors).toEqual([]);
    expect(rep.spaces).toBe(1);
    expect(rep.spaceRecords).toBeGreaterThan(5);
    expect(rep.spaceFiles).toBeGreaterThan(1);
    // Zurück auf Version 1 (die laufende Test-App kennt nur diese)
    await rotateKeys(env.ctx.db, new KeyRing(ring['keys' as never] as Map<number, Buffer>, 1));
    expect((await verifyData(env.ctx.db, new KeyRing(new Map([[1, Buffer.from(MASTER1, 'base64')]]), 1), env.fileDir)).errors).toEqual([]);
  });

  it('Eigentum übertragen: nur nach Annahme durch das Ziel', async () => {
    expect((await c.olga.post(`/api/spaces/${space}/transfer`, { ref: ref.emil })).status).toBe(200);
    expect((await c.clara.post(`/api/spaces/${space}/transfer/accept`)).status).toBe(404);
    expect((await c.emil.post(`/api/spaces/${space}/transfer/accept`)).status).toBe(200);
    const d = await c.emil.get(`/api/spaces/${space}`);
    expect(d.json.space.role).toBe('owner');
    expect(d.json.members.find((m: any) => m.ref === ref.olga).role).toBe('editor');
  });

  it('Kontolöschung: Eigentümer mit Mitgliedern blockiert; Mitglied löschbar, Beiträge bleiben', async () => {
    const del = await c.emil.req('DELETE', '/api/account', { confirm: 'login-emil' });
    expect(del.status).toBe(409);
    const clara = await c.clara.req('DELETE', '/api/account', { confirm: 'login-clara' });
    expect(clara.status).toBe(200);
    const cm = await c.emil.get(`/api/spaces/${space}/comments?store=plants&target=p1`);
    expect(cm.json.comments.find((x: any) => x.text === 'Sieht sehr gut aus!').author.ref).toBe('');
    expect((await c.emil.get(`/api/spaces/${space}`)).json.members).toHaveLength(2);
  });

  it('Bereich löschen: Bestätigung per Name, Mitglieder benachrichtigt, danach überall 404', async () => {
    expect((await c.emil.req('DELETE', `/api/spaces/${space}`, { confirm: 'falsch' })).status).toBe(400);
    expect((await c.olga.req('DELETE', `/api/spaces/${space}`, { confirm: 'Zelt Nord' })).status).toBe(403);
    expect((await c.emil.req('DELETE', `/api/spaces/${space}`, { confirm: 'Zelt Nord' })).status).toBe(200);
    expect((await c.olga.get(`/api/spaces/${space}`)).status).toBe(404);
    const n = await c.olga.get('/api/notifications');
    expect(n.json.notifications.some((x: any) => x.type === 'space.deleted')).toBe(true);
    const { rows } = await env.ctx.db.query('SELECT count(*)::int AS n FROM space_records');
    expect(rows[0].n).toBe(0);
  });

  it('Private Datensätze, die nicht geteilt oder verschoben wurden, sind unverändert; Anmeldenamen nie preisgegeben', async () => {
    expect(await privHash()).toBe(privateHash);
    const all = seen.join('\n');
    for (const n of ['olga', 'emil', 'clara', 'viktor', 'otto']) expect(all).not.toContain(`login-${n}`);
  });
});
