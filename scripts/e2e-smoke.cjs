/**
 * Browser-Smoke-Test für TERPGRID (Desktop + Mobil).
 *
 * Voraussetzung: `npm run build && npm run preview` (Port 4173) und ein
 * installiertes Playwright mit Chromium (`require('playwright')`).
 *   npm run e2e            → gegen http://localhost:4173
 *   E2E_URL=… npm run e2e  → andere Adresse
 *
 * Prüft: Grow/Pflanze/Messung anlegen, Foto-Upload (lokal, Metadaten entfernt),
 * Backup-Export → Löschen → Import, keine externen Requests, keine JS-Fehler,
 * kein horizontaler Überlauf auf 375 px.
 */
const { chromium } = require('playwright');
const BASE = (process.env.E2E_URL || 'http://localhost:4173').replace(/\/$/, '');
const fail = (msg) => {
  console.error('✗', msg);
  process.exitCode = 1;
};

async function makeJpeg(page, color) {
  const b64 = await page.evaluate((c) => {
    const cv = document.createElement('canvas');
    cv.width = 1600;
    cv.height = 1200;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1600, 1200);
    return cv.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, color);
  return Buffer.from(b64, 'base64');
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('blob:') && !u.startsWith('data:')) errors.push('Externer Request: ' + u);
  });
  const save = () => p.getByRole('button', { name: 'Speichern', exact: true }).click();

  await p.goto(BASE + '/#/');
  await p.waitForSelector('text=Willkommen bei TERPGRID');
  await p.getByRole('button', { name: 'Ersten Grow anlegen' }).click();
  await p.getByLabel('Projektname').fill('Smoke-Test Grow');
  await p.getByLabel('Startdatum').fill('2026-01-01');
  await p.locator('#phase-vegetative').fill('2026-01-15');
  await save();
  await p.waitForURL(/#\/grows\/./);
  const growUrl = p.url();

  await p.getByRole('button', { name: 'Pflanze', exact: true }).first().click();
  await p.getByRole('textbox', { name: /^Name/ }).fill('Pflanze A');
  await save();
  await p.waitForTimeout(300);

  await p.getByRole('button', { name: 'Eintrag', exact: true }).first().click();
  await p.getByRole('radio', { name: 'Messung' }).click();
  await p.getByLabel('Pflanze').selectOption({ label: 'Pflanze A' });
  await p.getByLabel('Höhe').fill('12,5');
  await save();
  await p.waitForTimeout(300);

  await p.getByRole('button', { name: 'Fotos', exact: true }).first().click();
  const imgs = [await makeJpeg(p, '#2f6f3e'), await makeJpeg(p, '#4f9f5e')];
  await p.locator('input[type=file]').setInputFiles(imgs.map((buffer, i) => ({ name: `foto${i}.jpg`, mimeType: 'image/jpeg', buffer })));
  await p.waitForSelector('text=2 Fotos gespeichert', { timeout: 20000 });
  await p.getByRole('button', { name: 'Fertig' }).click();

  // Backup → alles löschen → Import
  await p.goto(BASE + '/#/data');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Vollständiges Backup' }).click()]);
  const zip = await dl.path();
  await p.getByRole('button', { name: 'Alles löschen …' }).click();
  await p.getByLabel(/Zur Bestätigung/).fill('LÖSCHEN');
  await p.getByRole('button', { name: 'Endgültig löschen' }).click();
  await p.waitForTimeout(500);
  await p.locator('input[type=file]').setInputFiles(zip);
  await p.waitForSelector('text=Struktur und Verknüpfungen sind konsistent');
  await p.getByRole('button', { name: 'Importieren', exact: true }).click();
  await p.getByRole('button', { name: 'Importieren', exact: true }).last().click();
  await p.waitForTimeout(600);
  await p.goto(growUrl);
  await p.waitForTimeout(500);
  if ((await p.locator('text=Pflanze A').count()) === 0) fail('Pflanze nach Wiederherstellung nicht gefunden');
  if ((await p.locator('img[src^="blob:"]').count()) === 0) fail('Fotos nach Wiederherstellung nicht sichtbar');

  // Mobil: kein horizontaler Überlauf
  const m = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('Mobil: ' + e.message));
  const routes = ['', 'grows', 'photos', 'strains', 'journal', 'collection', 'calendar', 'analytics', 'tools', 'data', 'settings', 'lab/edibles', 'lab/smoking', 'lab/dosage', 'lab/timeline', 'lab/tools', 'lab/compare', 'lab/saved', 'lab/sources'];
  for (const r of routes) {
    await mp.goto(`${BASE}/#/${r}`);
    await mp.waitForTimeout(350);
    const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (sw > 375) fail(`Horizontaler Überlauf auf #/${r}: ${sw}px`);
  }

  for (const e of errors) fail(e);
  await browser.close();
  if (!process.exitCode) console.log(`✓ Smoke-Test bestanden (${routes.length} Routen mobil geprüft)`);
})().catch((e) => {
  fail(e.message);
});
