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
import { CISP, cispUrl, parseDataset } from './catalog/cisp.js';
import { importDataset } from './catalog/importer.js';
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
                              CI-Strains-Pro (CC BY 4.0) in den lokalen Katalog importieren.
                              Ohne --file: geprüfte Version von GitHub laden (Prüfsumme wird verglichen).
                              --dry-run: nur prüfen und Qualitätsbericht ausgeben, nichts schreiben.
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
        console.log(`Konten: ${r.users} · Datensätze entschlüsselt: ${r.records} · Dateien entschlüsselt: ${r.files} · Fehler: ${r.errors.length}`);
        for (const e of r.errors.slice(0, 50)) console.log(`  ✗ ${e}`);
        if (r.errors.length) process.exitCode = 2;
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

main().catch((e) => {
  console.error(`Fehler: ${(e as Error).message}`);
  process.exit(1);
});
