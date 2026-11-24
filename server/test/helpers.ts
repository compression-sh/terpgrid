/**
 * Integrationstest-Hilfen: echte PostgreSQL-Datenbank (TEST_PG_URL = Superuser-URL),
 * frisch angelegt je Testdatei, mit getrennter Owner- und App-Rolle wie in Produktion.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { type AppContext, createContext } from '../src/context.js';
import { migrate } from '../src/migrate.js';
import { WindowLimiter } from '../src/ratelimit.js';

export const SUPER_URL = process.env.TEST_PG_URL ?? '';
export const hasDb = !!SUPER_URL;

const withDb = (url: string, db: string, user?: string, pw?: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) {
    u.username = user;
    u.password = pw ?? '';
  }
  return u.toString();
};

export interface TestEnv {
  ctx: AppContext;
  app: FastifyInstance;
  dbName: string;
  appUrl: string;
  ownerUrl: string;
  superDbUrl: string;
  fileDir: string;
  close(): Promise<void>;
}

export const MASTER1 = randomBytes(32).toString('base64');
export const MASTER2 = randomBytes(32).toString('base64');

export async function setup(overrides: Record<string, string> = {}, opts: { fetchImpl?: typeof fetch; strictLimits?: boolean } = {}): Promise<TestEnv> {
  const dbName = `tg_test_${randomBytes(4).toString('hex')}`;
  const sup = new pg.Client({ connectionString: SUPER_URL });
  await sup.connect();
  for (const [role, pw] of [['terpgrid_owner', 'ownerpw'], ['terpgrid_app', 'apppw']]) {
    const { rowCount } = await sup.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    // Bestehende Rollen (z. B. aus einem vorherigen CI-Schritt) auf das Testpasswort setzen
    if (!rowCount) await sup.query(`CREATE ROLE ${role} LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS`);
    else await sup.query(`ALTER ROLE ${role} LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS`);
  }
  await sup.query(`CREATE DATABASE ${dbName} OWNER terpgrid_owner`);
  await sup.end();
  const ownerUrl = withDb(SUPER_URL, dbName, 'terpgrid_owner', 'ownerpw');
  const appUrl = withDb(SUPER_URL, dbName, 'terpgrid_app', 'apppw');
  await migrate(ownerUrl);
  const fileDir = mkdtempSync(join(tmpdir(), 'tg-files-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: 'https://terpgrid.test',
    DATABASE_URL: appUrl,
    DATABASE_MIGRATE_URL: ownerUrl,
    MASTER_KEYS: `1:${MASTER1}`,
    MASTER_KEY_CURRENT: '1',
    HMAC_SECRET: randomBytes(32).toString('base64'),
    FILE_STORAGE_DIR: fileDir,
    INVITE_ONLY: 'false',
    ...overrides,
  });
  const ctx = createContext(config, opts);
  if (!opts.strictLimits) {
    // Alle Test-Anfragen kommen von 127.0.0.1 – IP-Limits werden in eigenen Tests geprüft
    ctx.limits.register = new WindowLimiter(10_000, 60_000);
    ctx.limits.loginIp = new WindowLimiter(10_000, 60_000);
    ctx.limits.recoverIp = new WindowLimiter(10_000, 60_000);
    ctx.limits.api = new WindowLimiter(100_000, 60_000);
  }
  const app = await buildApp(ctx);
  return {
    ctx,
    app,
    dbName,
    appUrl,
    ownerUrl,
    superDbUrl: withDb(SUPER_URL, dbName),
    fileDir,
    async close() {
      await app.close();
      await ctx.db.end();
      rmSync(fileDir, { recursive: true, force: true });
      const s = new pg.Client({ connectionString: SUPER_URL });
      await s.connect();
      await s.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await s.end();
    },
  };
}

/** Browser-ähnlicher Client: Cookie-Jar + CSRF-Token + Pre-Auth-Header. */
export class Client {
  cookie = '';
  csrf = '';
  /** Simulierte Absender-IP (remoteAddress) */
  ip?: string;
  constructor(
    readonly app: FastifyInstance,
    readonly origin = 'https://terpgrid.test',
  ) {}

  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { origin: this.origin, 'x-requested-with': 'terpgrid', ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (this.csrf) h['x-csrf-token'] = this.csrf;
    let payload: string | Buffer | undefined;
    if (Buffer.isBuffer(body)) {
      payload = body;
      h['content-type'] ??= 'application/octet-stream';
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
    }
    const res = await this.app.inject({ method: method as 'GET', url, payload, headers: h, ...(this.ip ? { remoteAddress: this.ip } : {}) });
    const set = res.headers['set-cookie'];
    for (const c of Array.isArray(set) ? set : set ? [set] : []) {
      const [pair] = c.split(';');
      const [name, value] = pair!.split('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/.test(c) || value === '') this.cookie = '';
      else this.cookie = `${name}=${value}`;
    }
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    if (json?.csrfToken) this.csrf = json.csrfToken;
    return { status: res.statusCode, json, headers: res.headers, raw: res.rawPayload };
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body: unknown = {}) => this.req('POST', url, body);

  async register(username: string, password = 'sehr-sicheres-passwort-42', extra: Record<string, unknown> = {}) {
    const r = await this.post('/api/auth/register', { mode: 'username', username, password, ageConfirmed: true, ...extra });
    if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.json)}`);
    return r.json as { user: { loginName: string }; recoveryCodes: string[]; csrfToken: string };
  }
}
