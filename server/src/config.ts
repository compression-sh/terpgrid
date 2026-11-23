/**
 * Konfiguration aus Umgebungsvariablen. Secrets werden bevorzugt aus Dateien
 * gelesen (`<NAME>_FILE`, z. B. Docker Secrets), nie aus dem Code.
 */
import { readFileSync } from 'node:fs';

export interface Config {
  env: 'production' | 'development' | 'test';
  port: number;
  host: string;
  publicOrigin: string;
  databaseUrl: string;
  migrateDatabaseUrl: string;
  /** Master-Key-Ring: Version → 32-Byte-Schlüssel */
  masterKeys: Map<number, Buffer>;
  masterKeyCurrent: number;
  /** Separates Secret für HMAC-Ableitungen (Recovery-Codes, IP-Tags, Einladungen) */
  hmacSecret: Buffer;
  inviteOnly: boolean;
  sessionIdleMinutes: number;
  sessionAbsoluteDays: number;
  reauthMinutes: number;
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
  argon2MaxConcurrent: number;
  fileDir: string;
  maxUploadBytes: number;
  userQuotaBytes: number;
  trustProxy: string | boolean;
  cookieSecure: boolean;
  catalogEnabled: boolean;
  backupStatusFile?: string;
  version: string;
}

function readSecret(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const file = env[`${name}_FILE`];
  if (file) return readFileSync(file, 'utf8').trim();
  return env[name]?.trim() || undefined;
}

function int(env: NodeJS.ProcessEnv, name: string, def: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Ungültiger Wert für ${name}: ${raw} (erlaubt ${min}–${max})`);
  return n;
}

function bool(env: NodeJS.ProcessEnv, name: string, def: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  throw new Error(`Ungültiger Boolean für ${name}: ${raw}`);
}

/** Format: "1:<base64>,2:<base64>" – jede Version 32 Byte. */
export function parseKeyRing(raw: string): Map<number, Buffer> {
  const ring = new Map<number, Buffer>();
  for (const part of raw.split(/[,\n]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d{1,4}):([A-Za-z0-9+/=_-]+)$/.exec(part);
    if (!m) throw new Error('MASTER_KEYS: erwartetes Format "1:<base64>,2:<base64>"');
    const key = Buffer.from(m[2]!, 'base64');
    if (key.length !== 32) throw new Error(`MASTER_KEYS: Schlüssel ${m[1]} muss 32 Byte lang sein`);
    ring.set(Number(m[1]), key);
  }
  if (ring.size === 0) throw new Error('MASTER_KEYS ist leer');
  return ring;
}

/** Setzt ein separat (als Secret-Datei) übergebenes Passwort in die Verbindungs-URL ein. */
function withPassword(url: string | undefined, password: string | undefined): string | undefined {
  if (!url || !password) return url;
  const u = new URL(url);
  u.password = encodeURIComponent(password);
  return u.toString();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = (env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development') as Config['env'];
  const databaseUrl = withPassword(readSecret('DATABASE_URL', env), readSecret('DATABASE_PASSWORD', env));
  if (!databaseUrl) throw new Error('DATABASE_URL (oder DATABASE_URL_FILE) fehlt');
  const keysRaw = readSecret('MASTER_KEYS', env);
  if (!keysRaw) throw new Error('MASTER_KEYS (oder MASTER_KEYS_FILE) fehlt – siehe docs/DEPLOYMENT.md');
  const masterKeys = parseKeyRing(keysRaw);
  const masterKeyCurrent = int(env, 'MASTER_KEY_CURRENT', Math.max(...masterKeys.keys()), 1, 9999);
  if (!masterKeys.has(masterKeyCurrent)) throw new Error(`MASTER_KEY_CURRENT=${masterKeyCurrent} ist nicht im Schlüsselring`);
  const hmacRaw = readSecret('HMAC_SECRET', env);
  if (!hmacRaw) throw new Error('HMAC_SECRET (oder HMAC_SECRET_FILE) fehlt');
  const hmacSecret = Buffer.from(hmacRaw, 'base64');
  if (hmacSecret.length < 32) throw new Error('HMAC_SECRET muss mindestens 32 Byte (Base64) haben');
  const publicOrigin = (env.PUBLIC_ORIGIN ?? '').replace(/\/$/, '');
  if (!/^https?:\/\/[^/]+$/.test(publicOrigin)) throw new Error('PUBLIC_ORIGIN fehlt oder ist ungültig (z. B. https://terpgrid.example.org)');
  const cookieSecure = !bool(env, 'COOKIE_INSECURE_DEV', false);
  if (mode === 'production' && (!cookieSecure || !publicOrigin.startsWith('https://'))) {
    throw new Error('In Produktion sind HTTPS (PUBLIC_ORIGIN=https://…) und sichere Cookies Pflicht.');
  }
  const tp = env.TRUST_PROXY ?? 'loopback,uniquelocal';
  return {
    env: mode,
    port: int(env, 'PORT', 8080, 1, 65535),
    host: env.HOST ?? '0.0.0.0',
    publicOrigin,
    databaseUrl,
    migrateDatabaseUrl: withPassword(readSecret('DATABASE_MIGRATE_URL', env), readSecret('DATABASE_MIGRATE_PASSWORD', env)) ?? databaseUrl,
    masterKeys,
    masterKeyCurrent,
    hmacSecret,
    inviteOnly: bool(env, 'INVITE_ONLY', true),
    sessionIdleMinutes: int(env, 'SESSION_IDLE_MINUTES', 60 * 24 * 3, 5, 60 * 24 * 30),
    sessionAbsoluteDays: int(env, 'SESSION_ABSOLUTE_DAYS', 30, 1, 365),
    reauthMinutes: int(env, 'REAUTH_MINUTES', 10, 1, 60),
    argon2: {
      memoryCost: int(env, 'ARGON2_MEMORY_KIB', 19456, 19456, 1048576),
      timeCost: int(env, 'ARGON2_TIME_COST', 2, 2, 20),
      parallelism: int(env, 'ARGON2_PARALLELISM', 1, 1, 8),
    },
    argon2MaxConcurrent: int(env, 'ARGON2_MAX_CONCURRENT', 2, 1, 16),
    fileDir: env.FILE_STORAGE_DIR ?? '/data/files',
    maxUploadBytes: int(env, 'MAX_UPLOAD_MB', 20, 1, 100) * 1024 * 1024,
    userQuotaBytes: int(env, 'USER_QUOTA_MB', 2048, 10, 1_000_000) * 1024 * 1024,
    trustProxy: tp === 'false' ? false : tp === 'true' ? true : tp,
    cookieSecure,
    catalogEnabled: bool(env, 'CATALOG_PROXY_ENABLED', true),
    backupStatusFile: env.BACKUP_STATUS_FILE || undefined,
    version: env.APP_VERSION ?? '3.0.0',
  };
}
