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
        // Laufzeitrolle darf den Schemastand lesen (Start-Prüfung), aber nichts ändern
        await client.query("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'terpgrid_app') THEN GRANT SELECT ON schema_migrations TO terpgrid_app; END IF; END $$");
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

/** Bekannte Migrationen dieser Programmversion. */
export function knownMigrations(dir = migrationsDir()): string[] {
  return readdirSync(dir).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
}

export interface SchemaStatus {
  applied: string[];
  known: string[];
  /** In der DB, aber dieser Version unbekannt → DB ist neuer (z. B. Rollback ohne Restore) */
  unknown: string[];
  /** Bekannt, aber noch nicht angewendet → Migration ausstehend */
  pending: string[];
}

export async function schemaStatus(db: { query: (q: string) => Promise<{ rows: { version: string }[] }> }, dir = migrationsDir()): Promise<SchemaStatus> {
  const known = knownMigrations(dir);
  let applied: string[] = [];
  try {
    applied = (await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);
  } catch {
    applied = [];
  }
  return { applied, known, unknown: applied.filter((v) => !known.includes(v)), pending: known.filter((v) => !applied.includes(v)) };
}

/** Wirft mit verständlicher Meldung, wenn Datenbank und Programmversion nicht zusammenpassen. */
export function assertSchemaCompatible(s: SchemaStatus): void {
  if (s.unknown.length)
    throw new Error(`Die Datenbank ist neuer als diese TERPGRID-Version (unbekannte Migrationen: ${s.unknown.join(', ')}). Für ein Rollback zuerst das Backup von vor dem Upgrade wiederherstellen (docs/DEPLOYMENT.md → Rollback).`);
  if (s.pending.length) throw new Error(`Ausstehende Datenbank-Migrationen: ${s.pending.join(', ')}. Bitte zuerst „migrate“ ausführen.`);
}
