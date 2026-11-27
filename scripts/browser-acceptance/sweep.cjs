// Phase 5.9 – alle Hauptseiten × 6 Breiten je Engine: horizontaler Überlauf, JS-/Konsolenfehler, Screenshots.
// ENGINE=chromium|firefox|webkit node sweep.cjs <anmeldename> <outdir> [shotWidths=390,1440]
// Das Konto (Passwort in TEST_PASSWORD) sollte Daten enthalten, u. a. einen Grow mit der ID g1, und für /admin Admin-Rechte haben.
const PW_ = require('playwright');
const fs = require('fs');
const ENGINE = process.env.ENGINE || 'chromium';
const [, , USER, OUT, SW = '390,1440'] = process.argv;
const SHOT_W = SW.split(',').map(Number);
const BASE = process.env.BASE || 'http://localhost:4173/';
const PASSWORD = process.env.TEST_PASSWORD; // Passwort des Testkontos (nicht im Repository)
if (!PASSWORD) throw new Error('TEST_PASSWORD fehlt');
const WIDTHS = [360, 390, 430, 768, 1024, 1440];
const ROUTES = ['', 'grows', 'grows/g1', 'grows/g1?tab=measurements', 'grows/g1?tab=photos', 'grows/g1?tab=calendar', 'grows/compare', 'grows/g1/report', 'grows/g1/experiments', 'photos', 'strains', 'journal', 'collection', 'calendar', 'analytics', 'timeline', 'lab/edibles', 'lab/smoking', 'lab-reports', 'tools', 'data', 'discover', 'discover/cultivar/barneysfarm--gelato', 'discover/breeders', 'discover/genetics', 'discover/terpenes', 'discover/terpenes/myrcene', 'discover/learn', 'discover/compare', 'together', 'together/notifications', 'settings', 'account', 'admin'];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const br = await PW_[ENGINE].launch();
  const report = { engine: ENGINE, version: br.version(), overflow: [], errors: [], pages: 0 };
  for (const w of WIDTHS) {
    const mobile = w < 768;
    const ctx = await br.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, ...(ENGINE !== 'firefox' ? { isMobile: mobile } : {}), hasTouch: w < 1024, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => report.errors.push(`${w} ${p.url().split('#')[1]}: ${e.message.slice(0, 160)}`));
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|status of 40[134]/.test(m.text()) && report.errors.push(`${w} ${p.url().split('#')[1]}: console ${m.text().slice(0, 160)}`));
    await p.goto(BASE);
    await p.evaluate(async (u) => fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'terpgrid' }, body: JSON.stringify({ login: u.user, password: u.pw }) }), { user: USER, pw: PASSWORD });
    await p.reload();
    await p.waitForTimeout(3000);
    await p.getByRole('button', { name: 'Nicht jetzt' }).first().click({ timeout: 1500 }).catch(() => {});
    for (const r of ROUTES) {
      await p.goto(BASE + '#/' + r);
      await p.waitForTimeout(r.startsWith('discover') ? 2200 : 1500);
      report.pages++;
      const of = await p.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth - W;
        if (sw <= 1) return null;
        const els = [];
        for (const el of document.querySelectorAll('body *')) {
          const b = el.getBoundingClientRect();
          if (b.right > W + 1 && b.width > 0 && !el.closest('[class*="overflow-x-auto"],[class*="overflow-auto"],[class*="overflow-x-scroll"]')) els.push(`${el.tagName}.${String(el.className).slice(0, 50)}`);
        }
        return { sw, els: els.slice(0, 3) };
      });
      if (of) report.overflow.push({ w, route: r || 'dashboard', ...of });
      if (SHOT_W.includes(w)) await p.screenshot({ path: `${OUT}/${w}-${(r || 'dashboard').replace(/[/?=]/g, '_')}.jpg`, type: 'jpeg', quality: 72, fullPage: false });
    }
    await ctx.close();
  }
  fs.writeFileSync(`${OUT}/sweep.json`, JSON.stringify(report, null, 1));
  console.log(`${ENGINE} ${report.version}: ${report.pages} Seitenaufrufe · Überlauf ${report.overflow.length} · Fehler ${report.errors.length}`);
  for (const o of report.overflow) console.log('  Überlauf', o.w, o.route, o.sw, o.els.join(' | '));
  for (const e of report.errors.slice(0, 15)) console.log('  Fehler', e);
  await br.close();
})();
