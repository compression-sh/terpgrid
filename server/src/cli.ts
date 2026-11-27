/**
 * Betriebs-Werkzeuge (im Container: `node dist/cli.js <befehl>`).
 * Keine versteckten Funktionen: alle Befehle sind in docs/DEPLOYMENT.md dokumentiert.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { loadConfig } from './config.js';
import { KeyRing, hmac, randomToken, subkey } from './crypto.js';
import { createPool } from './db.js';
import { rotateKeys } from './keys.js';
import { verifyData } from './verify.js';
import { createContext } from './context.js';
import { purgeTrash } from './files.js';
import { purgeRetiredKeys, rotateUserKey } from './rotation.js';
import { migrate, schemaStatus } from './migrate.js';
import { readFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { CISP, cispUrl, parseDataset } from './catalog/cisp.js';
import { importDataset } from './catalog/importer.js';
import { SMITH2022, importSamples, parseSmith2022, sampleUrl } from './catalog/samples.js';
import { catalogAudit } from './catalog/audit.js';
import { catalogQuality } from './catalog/quality.js';
import { catalogHealth } from './routes/admin.js';
import { MAX_BATCH, PROVIDERS, type Provider, enrichBatch, enrichFromStrainApiIndex, purgeExpiredClaims, refreshStrainApi } from './catalog/enrich.js';
import pg from 'pg';

const [cmd, ...args] = process.argv.slice(2);

function help(): never {
  console.log(`TERPGRID Server-CLI

  migrate                     Datenbank-Migrationen ausführen (Owner-Rolle, DATABASE_MIGRATE_URL)
  generate-key                Neuen 32-Byte-Schlüssel (Base64) ausgeben – für MASTER_KEYS oder HMAC_SECRET
  rotate-keys                 Alle Benutzer-Datenschlüssel mit MASTER_KEY_CURRENT neu verpacken
  invite [tage] [notiz]       Einladungslink erzeugen (Standard 7 Tage)
  promote <kennung>           Konto zur Administration machen
  demote <kennung>            Administrationsrechte entziehen
  bench-argon2                Argon2id-Laufzeit mit den aktuellen Parametern messen
  verify-data                 Alle Datensätze und Dateien testweise entschlüsseln (z. B. nach Restore)
  rotate-user-keys <kennung>|--all [--batch N]
                              Datenschlüssel je Konto erneuern (fortsetzbar, prüft danach alles)
  key-status                  Schlüsselgenerationen und laufende Rotationen anzeigen
  purge-retired-keys [--min-age-days N]
                              Ausgemusterte Schlüssel löschen (Standard 200 Tage; nur ohne Verwendung)
  cleanup                     Abgelaufene Sessions löschen, Datei-Papierkorb leeren
  import-catalog [--file PFAD | --commit SHA] [--dry-run] [--force] [--report DATEI]
  catalog-validate [--json DATEI]  Datenqualitätsprüfung des Katalogs (nur lesend, Schweregrade)
  import-samples [--file PFAD] [--dry-run] [--force]  Öffentliche Laborproben (Smith et al. 2022, CC0) – je Probe, ohne Breeder
                              CI-Strains-Pro (CC BY 4.0) in den lokalen Katalog importieren.
                              Ohne --file: geprüfte Version von GitHub laden (Prüfsumme wird verglichen).
                              --dry-run: nur prüfen und Qualitätsbericht ausgeben, nichts schreiben.
  catalog-audit [--json DATEI] Vollständigkeit des Sortenkatalogs je Feld (Belegart, Widersprüche, verworfene Werte)
  enrich-catalog --provider strainapi [--index | --limit N | --ids a,b] [--dry-run] [--resume RUN]
                              Kleine Charge des Katalogs aus einer weiteren Quelle anreichern (max. 50 Sorten,
                              Ratenlimit, nur Name+Breeder-Treffer). --index: StrainAPI-Liste (8 Seiten) im Speicher
                              abgleichen, nur Treffer speichern. Kein Spiegeln der Quelle (Nutzungsbedingungen).
  enrich-catalog --provider strainapi --refresh [--within-days 7] [--force]
                              Gedrosselte Aktualisierung (für einen täglichen Timer): ruft nur ab, wenn Angaben
                              in N Tagen ablaufen und der letzte Abruf mindestens 20 h zurückliegt.
  status [--verify]           Betriebsdiagnose (nur lesend, ohne Konten- und Schlüsseldaten): Version, Datenbank,
                              Schema, Speicher, Backup-Status, Katalog, Laborproben, Schlüsselstand.
                              --verify: zusätzlich alle Daten testweise entschlüsseln (nur Anzahlen ausgeben)
  schema-status               Schemastand prüfen (Exit 0 = passend, 3 = DB neuer als Programm, 4 = Migration ausstehend)`);
  process.exit(cmd ? 1 : 0);
}

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help') help();
  switch (cmd) {
    case 'generate-key':
      console.log(randomBytes(32).toString('base64'));
      return;
    case 'bench-argon2': {
      const c = loadConfig();
      const runs = 5;
      const t0 = performance.now();
      for (let i = 0; i < runs; i++) await hash(`bench-${i}-${randomToken(8)}`, { algorithm: 2, ...c.argon2, outputLen: 32 });
      const ms = (performance.now() - t0) / runs;
      console.log(`Argon2id m=${c.argon2.memoryCost} KiB, t=${c.argon2.timeCost}, p=${c.argon2.parallelism}: ${ms.toFixed(0)} ms je Hash`);
      console.log(ms < 150 ? 'Hinweis: unter ~150 ms – ARGON2_MEMORY_KIB oder ARGON2_TIME_COST kann erhöht werden.' : ms > 1000 ? 'Hinweis: über 1 s – Login wird träge, Parameter ggf. senken (min. OWASP-Werte beachten).' : 'OK');
      return;
    }
    case 'enrich-catalog': {
      const c = loadConfig();
      const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
      const provider = opt('--provider') as Provider | undefined;
      if (!provider || !(provider in PROVIDERS)) throw new Error('--provider strainapi|findmyseeds angeben');
      const limit = Math.min(MAX_BATCH, Number(opt('--limit') ?? 10) || 10);
      const pool = createPool(c.migrateDatabaseUrl, 2);
      if (args.includes('--refresh')) {
        if (provider !== 'strainapi') throw new Error('--refresh gibt es nur für strainapi');
        try {
          const r = await refreshStrainApi(pool, { withinDays: Number(opt('--within-days') ?? 7) || 7, force: args.includes('--force'), log: (m) => console.log(m) });
          const why = { run: 'abgerufen', 'nothing-due': 'nichts fällig', 'too-soon': 'letzter Abruf zu kurz her' }[r.action];
          console.log(`Aktualisierung: ${why} · ${r.expiring} Angaben laufen bald ab · letzter Abruf ${r.lastRunAt ?? '–'} · ${r.purged} abgelaufene entfernt`);
          if (r.run) console.log(`Lauf ${r.run.runId}: ${r.run.processed} Datensätze · ${r.run.matched} exakt · ${r.run.claims} Angaben · Fehler ${r.run.errors.length}`);
          if (r.run && r.run.errors.length) process.exitCode = 1;
        } finally {
          await pool.end();
        }
        return;
      }
      try {
        const purged = await purgeExpiredClaims(pool);
        if (purged) console.log(`${purged} abgelaufene Angaben entfernt (Cache-Pflege).`);
        const r = args.includes('--index') && provider === 'strainapi'
          ? await enrichFromStrainApiIndex(pool, { dryRun: args.includes('--dry-run'), log: (m) => console.log(m) })
          : await enrichBatch(pool, {
          provider,
          limit,
          dryRun: args.includes('--dry-run'),
          cultivarIds: opt('--ids')?.split(',').filter(Boolean),
          resumeRunId: opt('--resume') ? Number(opt('--resume')) : undefined,
          log: (m) => console.log(m),
        });
        console.log(`Lauf ${r.runId}: ${r.processed} Sorten abgefragt · ${r.matched} exakte Zuordnungen · ${r.claims} Angaben · Entscheidungen ${JSON.stringify(r.decisions)} · Fehler ${r.errors.length}`);
      } finally {
        await pool.end();
      }
      return;
    }
    case 'catalog-validate': {
      const c = loadConfig();
      const pool = createPool(c.migrateDatabaseUrl, 2);
      try {
        const r = await catalogQuality(pool);
        const i = args.indexOf('--json');
        if (i >= 0 && args[i + 1]) {
          const { writeFileSync } = await import('node:fs');
          writeFileSync(args[i + 1]!, JSON.stringify(r, null, 2));
        }
        const LABEL = { critical: 'KRITISCH', high: 'HOCH', medium: 'MITTEL', low: 'NIEDRIG', info: 'INFO' } as const;
        for (const f of r.findings) {
          console.log(`${LABEL[f.severity].padEnd(9)} ${String(f.count).padStart(6)}  ${f.title}`);
          if (f.count && f.examples.length) console.log(`                 z. B. ${f.examples.slice(0, 4).map((e) => e.label).join(' · ')}`);
        }
        console.log(`Zusammenfassung (Regeln mit Befund): ${JSON.stringify(r.summary)}`);
      } finally {
        await pool.end();
      }
      return;
    }
    case 'catalog-audit': {
      const c = loadConfig();
      const pool = createPool(c.migrateDatabaseUrl, 2);
      try {
        const r = await catalogAudit(pool);
        const i = args.indexOf('--json');
        if (i >= 0 && args[i + 1]) {
          const { writeFileSync } = await import('node:fs');
          writeFileSync(args[i + 1]!, JSON.stringify(r, null, 2));
        }
        console.log(`Sorten: ${r.cultivars} · Breeder: ${r.breeders} · Angebote: ${r.listings}`);
        console.log('Feld'.padEnd(50) + 'vorhanden'.padStart(16) + 'widersprüchl.'.padStart(15) + 'verworfen'.padStart(11) + '  Belegart (Breeder/Seedbank/Datenbank/Labor/Wissenschaft)');
        for (const f of r.fields) {
          const pct = r.cultivars ? ((f.present / r.cultivars) * 100).toFixed(1) : '0';
          console.log(`${f.label.slice(0, 50).padEnd(50)}${`${f.present} (${pct} %)`.padStart(16)}${String(f.conflicting).padStart(15)}${String(f.questionable).padStart(11)}  ${f.evidence.breeder}/${f.evidence.seedbank}/${f.evidence.database}/${f.evidence.lab}/${f.evidence.science ?? 0}${f.nameOnly ? '  (nur Namensgleichheit)' : ''}`);
        }
        if (r.samples)
          console.log(`Laborproben ${r.samples.source} (${r.samples.version.slice(0, 12)}): ${r.samples.samples} Proben, ${r.samples.terpeneSamples} mit Terpenen, ${r.samples.names} Produktnamen · im Katalog: ${r.samples.linkedNames} Namen, ${r.samples.linkedCultivars} Sorten, ${r.samples.linkedSamples} Proben · Namen mit mehreren Breedern: ${r.samples.ambiguousNames}`);
        for (const p of r.providers) console.log(`Quelle ${p.provider}: ${p.matchedCultivars} Sorten mit Angaben, ${p.claims} Angaben · Abgleich ${JSON.stringify(p.byStatus)}`);
      } finally {
        await pool.end();
      }
      return;
    }
    case 'import-catalog': {
      const c = loadConfig();
      const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
      const file = opt('--file');
      const commit = opt('--commit') ?? CISP.commit;
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('--commit erwartet einen 40-stelligen Commit-Hash');
      let buf: Buffer;
      if (file) buf = readFileSync(file);
      else {
        console.log(`Lade ${cispUrl(commit)} …`);
        const res = await fetch(cispUrl(commit), { redirect: 'error', signal: AbortSignal.timeout(120_000) });
        if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
        buf = Buffer.from(await res.arrayBuffer());
      }
      const data = parseDataset(buf, commit);
      const r = data.report;
      if (commit === CISP.commit && !r.checksumMatches && !args.includes('--force')) {
        throw new Error(`Prüfsumme weicht von der geprüften Version ab (${r.sha256}). Abbruch – mit --force trotzdem importieren.`);
      }
      console.log(`Quelle: ${CISP.name} · Commit ${commit.slice(0, 12)} · SHA-256 ${r.sha256.slice(0, 16)}…${r.checksumMatches ? ' (geprüft)' : ' (nicht geprüfte Version)'}`);
      console.log(`Zeilen: ${r.rawRows} · übernommen: ${r.accepted} · abgelehnt: ${r.rejectedRows} · Sorten: ${r.cultivars} · Breeder: ${r.breeders}`);
      console.log(`Abdeckung: ${Object.entries(r.coverage).map(([k, v]) => `${k} ${v.percent} %`).join(' · ')}`);
      const rep = opt('--report');
      if (rep) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(rep, JSON.stringify({ report: r, errors: data.errors.slice(0, 500) }, null, 2));
        console.log(`Bericht geschrieben: ${rep}`);
      }
      if (args.includes('--dry-run')) {
        console.log('Probelauf – es wurde nichts geschrieben.');
        return;
      }
      const client = new pg.Client({ connectionString: c.migrateDatabaseUrl });
      await client.connect();
      try {
        const t0 = Date.now();
        const res = await importDataset(client as unknown as pg.PoolClient, data, { force: args.includes('--force'), log: (m) => console.log(`  ${m}`) });
        if (res.status === 'unchanged') console.log('Diese Version ist bereits aktiv – nichts zu tun (mit --force erneut importieren).');
        else console.log(`✓ Import ${res.importId} aktiv (${((Date.now() - t0) / 1000).toFixed(1)} s) · entfernt: ${res.removed?.cultivars ?? 0} Sorten, ${res.removed?.listings ?? 0} Angebote, ${res.removed?.breeders ?? 0} Breeder`);
      } finally {
        await client.end();
      }
      return;
    }
    case 'import-samples': {
      const c = loadConfig();
      const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
      const file = opt('--file');
      let buf: Buffer;
      if (file) buf = readFileSync(file);
      else {
        console.log(`Lade ${sampleUrl(SMITH2022)} …`);
        const res = await fetch(sampleUrl(SMITH2022), { redirect: 'error', signal: AbortSignal.timeout(180_000) });
        if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
        const len = Number(res.headers.get('content-length') ?? 0);
        if (len > 50_000_000) throw new Error('Datei unerwartet groß – Abbruch');
        buf = Buffer.from(await res.arrayBuffer());
      }
      const data = parseSmith2022(buf);
      if (!data.checksumMatches && !args.includes('--force')) throw new Error(`Prüfsumme weicht von der geprüften Version ab (${data.sha256}). Abbruch – mit --force trotzdem importieren.`);
      console.log(`Quelle: ${SMITH2022.name} · Lizenz ${SMITH2022.license} · Commit ${SMITH2022.commit.slice(0, 12)} · SHA-256 ${data.sha256.slice(0, 16)}…${data.checksumMatches ? ' (geprüft)' : ' (NICHT geprüfte Version)'}`);
      const withName = data.samples.filter((s) => s.nameKey).length;
      const withTerp = data.samples.filter((s) => s.terpenes).length;
      console.log(`Zeilen: ${data.rows} · übernommen: ${data.samples.length} (mit Produktname ${withName}, mit Terpenwerten ${withTerp}) · abgelehnt: ${data.rows - data.samples.length} ${JSON.stringify(data.rejected)}`);
      if (args.includes('--dry-run')) {
        console.log('Probelauf – es wurde nichts geschrieben.');
        return;
      }
      const client = new pg.Client({ connectionString: c.migrateDatabaseUrl });
      await client.connect();
      try {
        const t0 = Date.now();
        const r = await importSamples(client as unknown as pg.PoolClient, data, { force: args.includes('--force'), log: (m) => console.log(`  ${m}`) });
        if (r.status === 'unchanged') console.log('Diese Version ist bereits aktiv – nichts zu tun (mit --force erneut importieren).');
        else console.log(`✓ Probenimport ${r.importId} aktiv (${((Date.now() - t0) / 1000).toFixed(1)} s) · ${r.samples} Proben · ${r.names} Produktnamen`);
      } finally {
        await client.end();
      }
      return;
    }
    case 'migrate': {
      const c = loadConfig();
      const applied = await migrate(c.migrateDatabaseUrl, undefined, (m) => console.log(m));
      console.log(applied.length ? `Angewendet: ${applied.join(', ')}` : 'Datenbank ist aktuell.');
      return;
    }
  }

  const c = loadConfig();
  const db = createPool(c.databaseUrl, 2);
  try {
    switch (cmd) {
      case 'rotate-keys': {
        const ring = new KeyRing(c.masterKeys, c.masterKeyCurrent);
        const n = await rotateKeys(db, ring);
        console.log(`${n} Datenschlüssel auf Version ${ring.current} umgestellt. Alte Versionen können danach aus MASTER_KEYS entfernt werden.`);
        return;
      }
      case 'invite': {
        const days = Math.min(30, Math.max(1, Number(args[0]) || 7));
        const token = randomToken(24);
        await db.query('INSERT INTO invitations(id, token_hash, note, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))', [
          randomUUID(),
          hmac(subkey(c.hmacSecret, 'invitations'), token),
          args.slice(1).join(' ').slice(0, 120) || 'CLI',
          days,
        ]);
        console.log(`Einladung (gültig ${days} Tage, einmalig):\n${c.publicOrigin}/#/register?invite=${token}`);
        return;
      }
      case 'promote':
      case 'demote': {
        const login = (args[0] ?? '').trim().toLowerCase();
        if (!login) help();
        const r = await db.query('UPDATE users SET role = $2 WHERE login_name = $1', [login, cmd === 'promote' ? 'admin' : 'user']);
        if (r.rowCount === 0) throw new Error('Konto nicht gefunden');
        await db.query('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE login_name = $1)', [login]);
        console.log(`${login}: Rolle ${cmd === 'promote' ? 'admin' : 'user'} gesetzt (Sessions beendet, bitte neu anmelden).`);
        return;
      }
      case 'verify-data': {
        const r = await verifyData(db, new KeyRing(c.masterKeys, c.masterKeyCurrent), c.fileDir);
        console.log(`Konten: ${r.users} · Datensätze entschlüsselt: ${r.records} · Dateien entschlüsselt: ${r.files} · Gemeinsame Bereiche: ${r.spaces} (Datensätze ${r.spaceRecords}, Dateien ${r.spaceFiles}) · Fehler: ${r.errors.length}`);
        for (const e of r.errors.slice(0, 50)) console.log(`  ✗ ${e}`);
        if (r.errors.length) process.exitCode = 2;
        return;
      }
      case 'status': {
        await printStatus(db, c, args.includes('--verify'));
        return;
      }
      case 'schema-status': {
        const st = await schemaStatus(db);
        console.log(`Angewendet: ${st.applied.join(', ') || '–'}\nDiese Version kennt: ${st.known.join(', ')}`);
        if (st.unknown.length) {
          console.log(`✗ Datenbank ist neuer als diese Version (unbekannt: ${st.unknown.join(', ')}) – Rollback nur mit Restore.`);
          process.exitCode = 3;
        } else if (st.pending.length) {
          console.log(`• Ausstehend: ${st.pending.join(', ')}`);
          process.exitCode = 4;
        } else console.log('✓ Schema passt zu dieser Version.');
        return;
      }
      case 'rotate-user-keys': {
        const ctx = createContext(c, { db });
        const batch = Number(args[args.indexOf('--batch') + 1]) || 100;
        const target = args[0];
        if (!target) help();
        const users = target === '--all' ? (await db.query('SELECT id, login_name FROM users ORDER BY created_at')).rows : (await db.query('SELECT id, login_name FROM users WHERE login_name = $1', [target.toLowerCase()])).rows;
        if (!users.length) throw new Error('Konto nicht gefunden');
        for (const u of users) {
          const p = await rotateUserKey(ctx, u.id, { batch });
          console.log(`${u.login_name}: Generation ${p.gen} · ${p.records} Datensätze · ${p.files} Dateien${p.totp ? ' · 2FA' : ''} · ${p.done ? 'abgeschlossen und geprüft' : `${p.remaining} offen – erneut ausführen`}`);
        }
        return;
      }
      case 'key-status': {
        const { rows } = await db.query(
          `SELECT u.login_name, u.dek_gen, string_agg(k.gen || ':' || k.state || ':v' || k.kek_version, ' ' ORDER BY k.gen) AS gens
             FROM users u JOIN user_keys k ON k.user_id = u.id GROUP BY u.login_name, u.dek_gen ORDER BY u.login_name`,
        );
        for (const r of rows) console.log(`${r.login_name}: aktuell Gen ${r.dek_gen} · ${r.gens}`);
        return;
      }
      case 'purge-retired-keys': {
        const i = args.indexOf('--min-age-days');
        const days = i >= 0 ? Number(args[i + 1]) : 200;
        const n = await purgeRetiredKeys(createContext(c, { db }), days);
        console.log(`${n} ausgemusterte Schlüsselgeneration(en) gelöscht (älter als ${days} Tage, ohne Verwendung).`);
        return;
      }
      case 'cleanup': {
        const r = await db.query('DELETE FROM sessions WHERE expires_at < now() OR last_seen_at < now() - make_interval(mins => $1)', [c.sessionIdleMinutes]);
        const t = await purgeTrash(db, c.fileDir, c.fileTrashDays);
        console.log(`${r.rowCount ?? 0} abgelaufene Sessions gelöscht · ${t} Blobs aus dem Papierkorb entfernt.`);
        return;
      }
      default:
        help();
    }
  } finally {
    await db.end();
  }
}

/** Betriebsdiagnose: nur Kennzahlen – keine Anmeldenamen, Inhalte oder Schlüssel. Exit 0 = ok, 2 = Problem. */
async function printStatus(db: pg.Pool, c: ReturnType<typeof loadConfig>, verify: boolean) {
  let problems = 0;
  const line = (ok: boolean | null, text: string) => {
    if (ok === false) problems++;
    console.log(`${ok === null ? '•' : ok ? '✓' : '✗'} ${text}`);
  };
  const mib = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MiB`;
  console.log(`TERPGRID-Status – ${new Date().toISOString()}`);
  line(null, `Programmversion ${c.version} · Node ${process.version}`);
  const t0 = performance.now();
  const dbi = (await db.query<{ size: string; v: string }>("SELECT pg_database_size(current_database())::text AS size, current_setting('server_version') AS v")).rows[0]!;
  line(true, `Datenbank erreichbar (${Math.round(performance.now() - t0)} ms) · PostgreSQL ${dbi.v} · Größe ${mib(Number(dbi.size))}`);
  const st = await schemaStatus(db);
  if (st.unknown.length) line(false, `Schema neuer als dieses Programm (unbekannt: ${st.unknown.join(', ')})`);
  else if (st.pending.length) line(false, `Migrationen ausstehend: ${st.pending.join(', ')}`);
  else line(true, `Schema aktuell (${st.applied.length} Migrationen, zuletzt ${st.applied.at(-1) ?? '–'})`);
  const u = (await db.query<{ n: number; active: number; storage: string }>("SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'active')::int AS active, coalesce(sum(storage_bytes), 0)::text AS storage FROM users")).rows[0]!;
  line(null, `Konten ${u.n} (aktiv ${u.active}) · Nutzerdateien ${mib(Number(u.storage))}`);
  try {
    const fs = await statfs(c.fileDir);
    const free = fs.bavail * fs.bsize;
    const total = fs.blocks * fs.bsize;
    line(free / total > 0.1, `Dateispeicher ${c.fileDir}: frei ${mib(free)} von ${mib(total)} (${Math.round((free / total) * 100)} %)`);
  } catch {
    line(false, `Dateispeicher ${c.fileDir} nicht lesbar`);
  }
  const trash = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM file_trash')).rows[0]!;
  line(null, `Datei-Papierkorb ${trash.n} Blobs (Leerung mit „cleanup“)`);
  if (c.backupStatusFile) {
    try {
      const raw = JSON.parse(readFileSync(c.backupStatusFile, 'utf8')) as { ok?: boolean; lastSuccess?: string | null; lastCheck?: string | null };
      const ageH = raw.lastSuccess ? (Date.now() - Date.parse(raw.lastSuccess)) / 3600e3 : Infinity;
      if (!raw.lastCheck && !raw.lastSuccess) line(false, 'Backup: noch kein Lauf (backup/backup.sh einrichten bzw. ausführen)');
      else line(raw.ok === true && ageH < 36, `Backup: ${raw.ok ? (ageH < 36 ? 'zuletzt erfolgreich' : 'VERALTET (über 36 h)') : 'letzter Lauf FEHLGESCHLAGEN'} · letzter Erfolg ${raw.lastSuccess ?? 'nie'} (${Number.isFinite(ageH) ? `${Math.round(ageH)} h her` : '–'})`);
    } catch {
      line(false, 'Backup-Status nicht lesbar (noch nie gelaufen?)');
    }
  } else line(null, 'Backup-Status: BACKUP_STATUS_FILE nicht gesetzt');
  const cat = await catalogHealth(db);
  const br = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM catalog_breeders')).rows[0]!;
  line(cat.dataset !== null, cat.dataset ? `Katalog ${cat.dataset.version}: ${cat.dataset.cultivars} Sorten, ${br.n} Breeder (importiert ${new Date(cat.dataset.importedAt).toISOString().slice(0, 10)})` : 'Kein Sortenkatalog importiert (deploy/import-catalog.sh)');
  line(null, `Anreicherung: ${cat.claims.active} aktive Angaben, ${cat.claims.expired} abgelaufen · Status ${cat.status}`);
  const smp = (await db.query<{ n: number; matched: number }>('SELECT count(*)::int AS n, count(*) FILTER (WHERE name_key IS NOT NULL)::int AS matched FROM catalog_samples')).rows[0]!;
  line(null, `Laborproben ${smp.n} (mit Namensschlüssel ${smp.matched}) – Namensabgleich, keine Breeder-Messwerte`);
  const keys = (await db.query<{ kek: number; n: number }>("SELECT kek_version AS kek, count(*)::int AS n FROM user_keys WHERE state <> 'retired' GROUP BY kek_version ORDER BY kek_version")).rows;
  const ring = new KeyRing(c.masterKeys, c.masterKeyCurrent);
  const missing = keys.filter((k) => !c.masterKeys.has(k.kek));
  line(missing.length === 0, `Schlüsselring: aktuelle Master-Key-Version ${ring.current} · Datenschlüssel je Version: ${keys.map((k) => `v${k.kek}=${k.n}`).join(', ') || '–'}${missing.length ? ` · FEHLENDE Versionen im Ring: ${missing.map((k) => k.kek).join(', ')}` : ''}`);
  const rot = (await db.query<{ n: number }>("SELECT count(DISTINCT user_id)::int AS n FROM user_keys WHERE state = 'retiring'")).rows[0]!;
  line(rot.n === 0 ? true : null, `Laufende Schlüsselrotationen: ${rot.n}`);
  if (verify) {
    const r = await verifyData(db, ring, c.fileDir);
    line(r.errors.length === 0, `Entschlüsselungsprüfung: ${r.records} Datensätze, ${r.files} Dateien, ${r.spaceRecords} Bereichsdatensätze, ${r.spaceFiles} Bereichsdateien · Fehler ${r.errors.length}${r.errors.length ? ' (Details: verify-data)' : ''}`);
  } else line(null, 'Entschlüsselungsprüfung übersprungen (status --verify oder verify-data)');
  console.log(problems ? `\n✗ ${problems} Problem(e)` : '\n✓ Keine Probleme gefunden');
  if (problems) process.exitCode = 2;
}

main().catch((e) => {
  console.error(`Fehler: ${(e as Error).message}`);
  process.exit(1);
});
