/**
 * Versionierte SQL-Migrationen. Jede Datei läuft in einer eigenen Transaktion;
 * erfolgreiche Versionen werden in schema_migrations vermerkt.
 * Vor jedem Upgrade in Produktion: Backup (siehe docs/BACKUP.md).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'migrations');
}

export async function migrate(url: string, dir = migrationsDir(), log: (m: string) => void = () => {}): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    // Parallele Migrationen (z. B. zwei Container) verhindern
    await client.query('SELECT pg_advisory_lock(727420)');
    const done = new Set((await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const files = readdirSync(dir).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(join(dir, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied.push(f);
        log(`Migration angewendet: ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${f} fehlgeschlagen: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727420)').catch(() => {});
    await client.end();
  }
  return applied;
}
