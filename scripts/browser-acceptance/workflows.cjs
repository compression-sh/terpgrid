/**
 * Phase 5.9 – UI-Workflows über die echte Oberfläche (Preview-Build + echte API), je Engine.
 * ENGINE=chromium|firefox|webkit DEVENV=<server-env-datei> node workflows.cjs <out-dir> <img-dir>
 * <img-dir>: Verzeichnis mit plant1.jpg und plant2.jpg (beliebige JPEGs mit EXIF-Block, z. B. mit GPS).
 * Nur gegen eine lokale Entwicklungsinstanz ausführen (legt Testkonten an, ändert Rollen per CLI). Alle Daten synthetisch.
 */
const PW_ = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const ENGINE = process.env.ENGINE || 'chromium';
const [, , OUT, IMG] = process.argv;
const BASE = process.env.BASE || 'http://localhost:4173/';
// Zufälliges Passwort je Lauf (synthetische Testkonten, nichts Festes im Repository)
const PW = `t-${crypto.randomBytes(12).toString('hex')}`;
const SUF = Date.now().toString(36).slice(-5);
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` – ${extra}` : ''}`);
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    ok(name, false, e.message.split('\n')[0].slice(0, 200));
    if (curPage) await curPage.screenshot({ path: `${OUT}/fail-${name.replace(/[^\w]+/g, '-').slice(0, 40)}.jpg`, type: 'jpeg', quality: 70 }).catch(() => {});
  }
};
let curPage = null;
let photoIds = [];
const shot = (p, f) => p.screenshot({ path: `${OUT}/wf-${f}.jpg`, type: 'jpeg', quality: 78 });

function totp(secretB32, t = Date.now()) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32.replace(/[\s=]/g, '').toUpperCase()) bits += alpha.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

async function api(p, method, url, body) {
  return p.evaluate(
    async ({ method, url, body }) => {
      const s = await (await fetch('/api/auth/session')).json();
      const r = await fetch(url, { method, headers: { 'X-CSRF-Token': s.csrfToken ?? '', 'X-Requested-With': 'terpgrid', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      let json = null;
      try {
        json = await r.json();
      } catch {
        /* keine JSON-Antwort */
      }
      return { status: r.status, json };
    },
    { method, url, body },
  );
}

async function openNew(p, label) {
  await p.getByRole('button', { name: 'Neu', exact: true }).first().click();
  await p.getByRole('menuitem', { name: new RegExp(label) }).or(p.getByRole('button', { name: new RegExp(label) })).first().click();
}

(async () => {
  const br = await PW_[ENGINE].launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  // Ratenlimit der Registrierung je IP: im Test eine eigene Absenderadresse je Lauf (Proxy vertraut Loopback)
  const ip = `10.77.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
  await ctx.route('**/api/auth/register', (r) => r.continue({ headers: { ...r.request().headers(), 'x-forwarded-for': ip } }));
  const p = await ctx.newPage();
  curPage = p;
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|401|404|403/.test(m.text()) && errors.push('console: ' + m.text()));
  const user = `wf_${ENGINE.slice(0, 2)}_${SUF}`;

  // ── Authentifizierung über die Oberfläche
  await step('Registrierung über das Formular', async () => {
    await p.goto(BASE);
    await p.getByRole('button', { name: /Konto erstellen|Registrieren/ }).first().click();
    await p.getByLabel('Benutzername', { exact: true }).fill(user);
    await p.getByLabel('Passwort', { exact: true }).fill(PW);
    await p.getByLabel('Passwort wiederholen').fill(PW);
    await p.getByText('Ich bin volljährig').click();
    await p.getByRole('button', { name: 'Konto erstellen' }).last().click();
    await p.getByText('Ich habe Kennung und Wiederherstellungscodes sicher aufbewahrt.').waitFor({ timeout: 20000 });
    const codes = await p.locator('code, .font-mono').allInnerTexts();
    ok('Wiederherstellungscodes werden angezeigt', codes.join(' ').match(/[a-z0-9]{4}-[a-z0-9]{4}/i));
    await p.getByText('Ich habe Kennung und Wiederherstellungscodes sicher aufbewahrt.').click();
    await p.getByRole('button', { name: /Weiter|Los geht|Fertig|Zur App/ }).last().click();
    await p.getByText('Deine Übersicht').first().waitFor({ timeout: 15000 });
    ok('Registrierung über das Formular', true);
  });
  await p.getByRole('button', { name: 'Nicht jetzt' }).first().click({ timeout: 3000 }).catch(() => {});

  // ── Grow, Pflanze, Messung über Dialoge
  const GROW = `Abnahme-Grow ${SUF}`;
  await step('Grow über Dialog anlegen', async () => {
    await openNew(p, 'Neuer Grow');
    await p.getByLabel('Projektname').fill(GROW);
    await p.getByRole('dialog').getByRole('button', { name: /Speichern|Anlegen|Erstellen/ }).last().click();
    await p.getByText(GROW).first().waitFor({ timeout: 10000 });
    ok('Grow über Dialog anlegen', true);
  });
  await step('Pflanze über Dialog anlegen', async () => {
    await openNew(p, 'Pflanze');
    const dlg = p.getByRole('dialog');
    const sel = dlg.getByLabel(/^Grow/);
    if (await sel.count()) await sel.first().selectOption({ label: GROW }).catch(() => {});
    await dlg.getByLabel(/^Name/).first().fill('Testpflanze A');
    await dlg.getByRole('button', { name: /Speichern|Anlegen|Hinzufügen/ }).last().click();
    await p.waitForTimeout(800);
    await p.goto(BASE + '#/grows');
    await p.getByText(GROW).first().click();
    await p.getByText('Testpflanze A').first().waitFor({ timeout: 10000 });
    ok('Pflanze über Dialog anlegen', true);
  });
  const growUrl = p.url();
  await step('Messung (pH/EC) erfassen und im Diagramm sehen', async () => {
    for (const [ph, ec, d] of [['6.1', '1.2', 0], ['6.3', '1.4', 1], ['6.0', '1.6', 2]]) {
      await openNew(p, 'Messung');
      const dlg = p.getByRole('dialog');
      await dlg.getByRole('button', { name: 'Messung', exact: true }).click();
      await dlg.getByLabel(/^pH/).first().fill(ph);
      await dlg.getByLabel('EC / TDS').fill(ec);
      await dlg.getByLabel('Zeitpunkt').fill(`2026-11-${String(20 + d).padStart(2, '0')}T10:00`);
      await dlg.getByRole('button', { name: /Speichern|Erfassen/ }).last().click();
      await p.waitForTimeout(600);
    }
    await p.goto(growUrl.replace(/\?.*$/, '') + '?tab=measurements');
    await p.waitForTimeout(1500);
    const svg = await p.locator('svg.recharts-surface').count();
    ok('Messung (pH/EC) erfassen und im Diagramm sehen', svg > 0, `${svg} Diagramme`);
    await shot(p, 'messwerte');
  });

  // ── Foto-Upload, Galerie, Lightbox, EXIF
  await step('Foto hochladen (Datei-Auswahl)', async () => {
    await p.goto(growUrl.replace(/\?.*$/, ''));
    await p.waitForTimeout(800);
    await p.getByRole('button', { name: /Foto/ }).first().click();
    const input = p.locator('input[type="file"][multiple]').first();
    await input.setInputFiles([`${IMG}/plant1.jpg`, `${IMG}/plant2.jpg`]);
    await p.waitForTimeout(6000);
    await shot(p, 'upload');
    await p.getByRole('dialog').getByRole('button', { name: /Schließen|Fertig/ }).last().click().catch(() => {});
    await p.keyboard.press('Escape').catch(() => {});
    const ch = await api(p, 'GET', '/api/sync/changes?since=0&limit=500');
    photoIds = (ch.json?.changes ?? []).filter((c) => c.store === 'photos' && !c.deleted).map((c) => c.id);
    ok('Foto hochladen (Datei-Auswahl)', photoIds.length === 2, `${photoIds.length} Fotos synchronisiert`);
  });
  await step('Galerie und Lightbox', async () => {
    await p.goto(BASE + '#/photos');
    await p.waitForTimeout(2500);
    const imgs = p.locator('main img');
    const n = await imgs.count();
    ok('Fotogalerie zeigt Bilder', n >= 2, `${n} Bilder`);
    await imgs.first().click();
    await p.waitForTimeout(800);
    const dlg = await p.getByRole('dialog').count();
    ok('Lightbox öffnet als Dialog', dlg > 0);
    await shot(p, 'lightbox');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    ok('Lightbox schließt mit Escape', (await p.getByRole('dialog').count()) === 0);
  });
  await step('Hochgeladenes Foto enthält keine GPS-/EXIF-Metadaten', async () => {
    // Originale enthalten EXIF mit GPS (Testbilder); geprüft wird, was der Server ausliefert
    const orig = fs.readFileSync(`${IMG}/plant1.jpg`).toString('latin1');
    const res = await p.evaluate(async (ids) => {
      const out = [];
      for (const id of ids) {
        const b = new Uint8Array(await (await fetch(`/api/files/photo/${id}/full`)).arrayBuffer());
        let t = '';
        for (let i = 0; i < Math.min(b.length, 65536); i++) t += String.fromCharCode(b[i]);
        out.push({ bytes: b.length, exif: t.includes('Exif'), gps: t.includes('GPS') });
      }
      return out;
    }, photoIds);
    ok('Hochgeladenes Foto enthält keine GPS-/EXIF-Metadaten', orig.includes('Exif') && res.length === 2 && res.every((r) => r.bytes > 1000 && !r.exif && !r.gps), JSON.stringify(res));
  });

  // ── Journal mit Tags, Filter, CSV
  await step('Journal: Eintrag mit Tags, Filter, CSV-Export', async () => {
    await openNew(p, 'Journal');
    const dlg = p.getByRole('dialog');
    await dlg.getByLabel('Erfahrung & Notizen').fill('Abnahmetest Journal');
    await dlg.getByLabel('Tags (optional)').fill('abnahme, test');
    await dlg.getByRole('button', { name: /Speichern/ }).last().click();
    await p.goto(BASE + '#/journal');
    await p.getByText('Abnahmetest Journal').first().waitFor({ timeout: 8000 });
    const tagSel = p.getByLabel('Tag', { exact: true });
    if (await tagSel.count()) await tagSel.selectOption('abnahme').catch(() => {});
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.getByRole('button', { name: 'CSV' }).click()]);
    const path = await dl.path();
    const csv = fs.readFileSync(path, 'utf8');
    ok('Journal: Eintrag mit Tags, Filter, CSV-Export', csv.includes('Abnahmetest Journal') && csv.includes('abnahme'), dl.suggestedFilename());
  });

  // ── Aufgabe → Kalender, Sammlung, Laborbericht
  await step('Aufgabe erscheint im Kalender', async () => {
    await openNew(p, 'Aufgabe');
    const dlg = p.getByRole('dialog');
    await dlg.getByLabel(/^Titel/).first().fill('Abnahme-Erinnerung');
    await dlg.getByRole('button', { name: /Speichern|Anlegen/ }).last().click();
    await p.goto(BASE + '#/calendar');
    await p.waitForTimeout(1200);
    const list = p.getByRole('button', { name: /Liste/ });
    if (await list.count()) await list.first().click();
    ok('Aufgabe erscheint im Kalender', (await p.getByText('Abnahme-Erinnerung').count()) > 0);
  });
  await step('Sammlung: Eintrag anlegen und suchen', async () => {
    await openNew(p, 'Sammlungsnotiz');
    const dlg = p.getByRole('dialog');
    await dlg.getByLabel(/^Name/).first().fill('Abnahme-Samen');
    await dlg.getByRole('button', { name: /Speichern|Hinzufügen/ }).last().click();
    await p.goto(BASE + '#/collection');
    await p.getByText('Abnahme-Samen').first().waitFor({ timeout: 8000 });
    ok('Sammlung: Eintrag anlegen und suchen', true);
  });

  // ── Globale Suche
  await step('Globale Suche (Strg+K) findet den Grow', async () => {
    await p.goto(BASE + '#/');
    await p.waitForTimeout(800);
    await p.keyboard.press('Control+k');
    await p.getByPlaceholder(/Suchen oder Befehl/).fill('Abnahme-Grow');
    await p.waitForTimeout(800);
    const hit = p.getByRole('option', { name: new RegExp(GROW) });
    ok('Globale Suche (Strg+K) findet den Grow', (await hit.count()) > 0);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(800);
    ok('Suchtreffer navigiert zum Grow', /#\/grows\//.test(p.url()), p.url());
    await p.keyboard.press('Escape').catch(() => {});
  });

  // ── Discover, Genetik, Atlas, Academy, THC Lab, Analytics
  await step('Katalogsuche und Sortenseite', async () => {
    await p.goto(BASE + '#/discover?q=gelato');
    await p.waitForTimeout(2500);
    const first = p.locator('main a[href*="discover/cultivar/"]').first();
    await first.click();
    await p.waitForTimeout(2000);
    ok('Katalogsuche und Sortenseite', /cultivar\//.test(p.url()) && (await p.getByText(/Herkunft|Quelle/).count()) > 0, p.url());
  });
  await step('Genetik-Graph rendert', async () => {
    await p.goto(BASE + '#/discover/genetics');
    await p.waitForTimeout(2000);
    await p.locator('main button, main a').filter({ hasText: /×|Gelato|OG|Kush/ }).first().click().catch(() => {});
    await p.waitForTimeout(2000);
    ok('Genetik-Graph rendert', (await p.locator('main svg').count()) > 0);
  });
  await step('Terpen-Atlas und Academy', async () => {
    await p.goto(BASE + '#/discover/terpenes/myrcene');
    await p.waitForTimeout(1500);
    ok('Terpen-Atlas: Myrcen mit Strukturformel', (await p.getByRole('heading', { name: /Myrcen/ }).count()) > 0 && (await p.locator('main svg').count()) > 0);
    await p.goto(BASE + '#/discover/learn');
    await p.waitForTimeout(1200);
    await p.locator('main a[href*="learn/"]').first().click();
    await p.waitForTimeout(1200);
    ok('Academy: Artikel öffnet', (await p.locator('main h1, main h2').count()) > 0, p.url());
  });
  await step('THC Lab berechnet', async () => {
    await p.goto(BASE + '#/lab/edibles');
    await p.waitForTimeout(1500);
    const txt = await p.locator('main').innerText();
    ok('THC Lab berechnet (mg-Angaben sichtbar)', /\d+[,.]?\d*\s*mg/.test(txt));
  });
  await step('Analytics mit Diagrammen', async () => {
    await p.goto(BASE + '#/analytics');
    await p.waitForTimeout(2000);
    ok('Analytics mit Diagrammen', (await p.locator('svg.recharts-surface').count()) > 0);
  });
  await step('Daten-Export (JSON) lädt herunter', async () => {
    await p.goto(BASE + '#/data');
    await p.waitForTimeout(1200);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.getByRole('button', { name: /JSON/ }).first().click()]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ok('Daten-Export (JSON) lädt herunter', JSON.stringify(j).includes(GROW), dl.suggestedFilename());
  });

  // ── 2FA einrichten, Abmelden, Anmelden mit Code
  let secret = '';
  await step('2FA einrichten', async () => {
    await p.goto(BASE + '#/account');
    await p.waitForTimeout(1200);
    await p.getByRole('button', { name: 'Einrichten', exact: true }).first().click();
    const pw = p.getByLabel('Passwort', { exact: true });
    if (await pw.count()) {
      await pw.last().fill(PW);
      await p.getByRole('button', { name: /Bestätigen|Weiter/ }).last().click();
    }
    const code = p.locator('code').filter({ hasText: /^[A-Z2-7 ]{16,}$/ }).first();
    await code.waitFor({ timeout: 10000 });
    secret = (await code.innerText()).replace(/\s/g, '');
    await p.getByLabel('Bestätigungscode').fill(totp(secret));
    await p.getByRole('button', { name: /Aktivieren|Bestätigen/ }).last().click();
    await p.waitForTimeout(1500);
    const s = await p.evaluate(async () => (await fetch('/api/auth/session')).json());
    ok('2FA einrichten', s.user?.totpEnabled === true, JSON.stringify(s.user?.totpEnabled));
    await p.getByText('Ich habe Kennung und Wiederherstellungscodes sicher aufbewahrt.').click({ timeout: 3000 }).catch(() => {});
    await p.getByRole('button', { name: /Weiter|Fertig|Schließen/ }).last().click({ timeout: 3000 }).catch(() => {});
  });
  await step('Abmelden und Anmelden mit 2FA', async () => {
    await p.getByRole('button', { name: 'Abmelden', exact: true }).first().click();
    await p.getByRole('dialog').getByRole('button', { name: /Abmelden/ }).last().click({ timeout: 2500 }).catch(() => {});
    await p.getByLabel('Benutzername oder Konto-ID').waitFor({ timeout: 10000 });
    ok('Abmelden führt zur Anmeldung', true);
    await p.getByLabel('Benutzername oder Konto-ID').fill(user);
    await p.getByLabel('Passwort', { exact: true }).fill(PW);
    await p.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await p.getByLabel('Bestätigungscode').waitFor({ timeout: 10000 });
    await p.getByLabel('Bestätigungscode').fill('000000');
    await p.getByRole('button', { name: /Bestätigen|Anmelden/ }).last().click();
    await p.waitForTimeout(1000);
    ok('Falscher 2FA-Code wird abgelehnt', (await p.getByLabel('Bestätigungscode').count()) > 0);
    // neuer Zeitschritt, damit der Code nicht als „bereits benutzt“ gilt
    const wait = 30000 - (Date.now() % 30000) + 500;
    await p.waitForTimeout(wait);
    await p.getByLabel('Bestätigungscode').fill(totp(secret));
    await p.getByRole('button', { name: /Bestätigen|Anmelden/ }).last().click();
    await p.getByRole('button', { name: 'Abmelden', exact: true }).first().waitFor({ timeout: 15000 });
    ok('Anmelden mit 2FA', true);
  });

  // ── Sitzungen: alle anderen beenden
  await step('Andere Sitzung beenden', async () => {
    const c2 = await br.newContext();
    const p2 = await c2.newPage();
    await p2.goto(BASE);
    await p2.getByLabel('Benutzername oder Konto-ID').fill(user);
    await p2.getByLabel('Passwort', { exact: true }).fill(PW);
    await p2.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await p2.getByLabel('Bestätigungscode').waitFor({ timeout: 10000 });
    await p2.waitForTimeout(30000 - (Date.now() % 30000) + 500);
    await p2.getByLabel('Bestätigungscode').fill(totp(secret));
    await p2.getByRole('button', { name: /Bestätigen|Anmelden/ }).last().click();
    await p2.waitForTimeout(2500);
    const before = await p2.evaluate(async () => (await fetch('/api/auth/session')).status);
    await p.goto(BASE + '#/account');
    await p.waitForTimeout(1500);
    const sess = await api(p, 'GET', '/api/auth/sessions');
    const other = (sess.json?.sessions ?? []).find((s) => !s.current);
    // über die Oberfläche (Abschnitt „Sitzungen“): Knopf „Beenden“ der anderen Sitzung
    const btn = p.locator('#sitzungen').getByRole('button', { name: /Beenden|Abmelden/ }).first();
    let r = { status: 0 };
    if (other && (await btn.count())) {
      await btn.click();
      await p.getByRole('dialog').getByRole('button', { name: /Beenden|Abmelden|Bestätigen/ }).last().click({ timeout: 2500 }).catch(() => {});
      await p.waitForTimeout(1200);
      r = { status: 200 };
    } else if (other) r = await api(p, 'DELETE', `/api/auth/sessions/${other.handle}`);
    const after = await p2.evaluate(async () => (await fetch('/api/auth/session')).status);
    ok('Andere Sitzung beenden', before === 200 && r.status === 200 && after === 401, `${before} → ${r.status} → ${after}`);
    await c2.close();
  });

  // ── Administration
  await step('Administration nach Freigabe per CLI', async () => {
    execFileSync('bash', ['-c', `cd "${path.join(__dirname, '../../server')}" && set -a && . "${process.env.DEVENV}" && set +a && npx tsx src/cli.ts promote ${user}`], { stdio: 'pipe' });
    await p.reload();
    await p.waitForTimeout(1500);
    const login = p.getByLabel('Benutzername oder Konto-ID');
    ok('Rollenwechsel beendet die Sitzung', (await login.count()) > 0);
    await login.fill(user);
    await p.getByLabel('Passwort', { exact: true }).fill(PW);
    await p.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await p.getByLabel('Bestätigungscode').waitFor({ timeout: 10000 });
    await p.waitForTimeout(30000 - (Date.now() % 30000) + 500);
    await p.getByLabel('Bestätigungscode').fill(totp(secret));
    await p.getByRole('button', { name: /Bestätigen|Anmelden/ }).last().click();
    await p.waitForTimeout(2500);
    await p.goto(BASE + '#/admin');
    await p.waitForTimeout(2500);
    const t = await p.locator('main').innerText();
    ok('Administration: Systemzustand und Konten', /Systemzustand|System/.test(t) && /Konten/.test(t));
    await shot(p, 'admin');
  });

  ok('Keine JS-/Konsolenfehler', errors.length === 0, errors.slice(0, 4).join(' | '));
  fs.writeFileSync(`${OUT}/workflows.json`, JSON.stringify({ engine: ENGINE, version: br.version(), results }, null, 1));
  console.log(`${results.filter((r) => r.ok).length}/${results.length} bestanden (${ENGINE} ${br.version()})`);
  await br.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
