/** Einstiegspunkt der API (läuft hinter Caddy im internen Docker-Netz). */
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createContext } from './context.js';
import { cleanupSessions } from './sessions.js';

const config = loadConfig();
const ctx = createContext(config);
const app = await buildApp(ctx);

const timer = setInterval(() => {
  cleanupSessions(ctx).catch(() => {});
  ctx.db.query("DELETE FROM audit_events WHERE created_at < now() - interval '180 days'").catch(() => {});
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
