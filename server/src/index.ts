/** Einstiegspunkt der API (läuft hinter Caddy im internen Docker-Netz). */
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createContext } from './context.js';
import { purgeTrash } from './files.js';
import { assertSchemaCompatible, schemaStatus } from './migrate.js';
import { cleanupSessions } from './sessions.js';

const config = loadConfig();
const ctx = createContext(config);
// Nur starten, wenn Datenbank und Programmversion zusammenpassen (Schutz vor Rollback ohne Restore)
try {
  assertSchemaCompatible(await schemaStatus(ctx.db));
} catch (e) {
  console.error(`TERPGRID startet nicht: ${(e as Error).message}`);
  await ctx.db.end().catch(() => {});
  process.exit(1);
}
const app = await buildApp(ctx);

const timer = setInterval(() => {
  cleanupSessions(ctx).catch(() => ctx.tasks.fail('sessions'));
  ctx.db.query("DELETE FROM audit_events WHERE created_at < now() - interval '180 days'").catch(() => ctx.tasks.fail('audit'));
  purgeTrash(ctx.db, ctx.config.fileDir, ctx.config.fileTrashDays).catch(() => ctx.tasks.fail('trash'));
}, 60 * 60_000);
timer.unref();

const shutdown = async () => {
  clearInterval(timer);
  await app.close().catch(() => {});
  await ctx.db.end().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
