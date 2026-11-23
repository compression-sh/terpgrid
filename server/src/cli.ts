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
import { migrate } from './migrate.js';

const [cmd, ...args] = process.argv.slice(2);

function help(): never {
  console.log(`TERPGRID Server-CLI

  migrate                     Datenbank-Migrationen ausführen (Owner-Rolle, DATABASE_MIGRATE_URL)
  generate-key                Neuen 32-Byte-Schlüssel (Base64) ausgeben – für MASTER_KEYS oder HMAC_SECRET
  rotate-keys                 Alle Benutzer-Datenschlüssel mit MASTER_KEY_CURRENT neu verpacken
  invite [tage] [notiz]       Einladungslink erzeugen (Standard 7 Tage)
  promote <kennung>           Konto zur Administration machen
  demote <kennung>            Administrationsrechte entziehen
  bench-argon2                Argon2id-Laufzeit mit den aktuellen Parametern messen`);
  process.exit(cmd ? 1 : 0);
}

async function main() {
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
