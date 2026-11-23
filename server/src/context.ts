import type { Config } from './config.js';
import { KeyRing, hmac, subkey } from './crypto.js';
import { type Db, createPool } from './db.js';
import { PasswordHasher } from './passwords.js';
import { LoginBackoff, WindowLimiter } from './ratelimit.js';

export interface AppContext {
  config: Config;
  db: Db;
  keys: KeyRing;
  hasher: PasswordHasher;
  /** HMAC-Schlüssel je Zweck (aus HMAC_SECRET abgeleitet) */
  macKeys: { recovery: Buffer; invite: Buffer; ip: Buffer };
  limits: {
    loginIp: WindowLimiter;
    loginAccount: LoginBackoff;
    register: WindowLimiter;
    recoverIp: WindowLimiter;
    recoverAccount: LoginBackoff;
    probe: WindowLimiter;
    api: WindowLimiter;
    upload: WindowLimiter;
  };
  /** Zählt unerwartete Fehler für das Admin-Dashboard (ohne Inhalte) */
  errors: { count: number; last?: string };
  startedAt: Date;
  fetchImpl: typeof fetch;
}

export function createContext(config: Config, opts: { db?: Db; fetchImpl?: typeof fetch } = {}): AppContext {
  return {
    config,
    db: opts.db ?? createPool(config.databaseUrl),
    keys: new KeyRing(config.masterKeys, config.masterKeyCurrent),
    hasher: new PasswordHasher(config.argon2, config.argon2MaxConcurrent),
    macKeys: {
      recovery: subkey(config.hmacSecret, 'recovery-codes'),
      invite: subkey(config.hmacSecret, 'invitations'),
      ip: subkey(config.hmacSecret, 'ip-tags'),
    },
    limits: {
      loginIp: new WindowLimiter(30, 15 * 60_000),
      loginAccount: new LoginBackoff(5),
      register: new WindowLimiter(5, 60 * 60_000),
      recoverIp: new WindowLimiter(10, 60 * 60_000),
      recoverAccount: new LoginBackoff(3, 5000),
      probe: new WindowLimiter(60, 15 * 60_000),
      api: new WindowLimiter(600, 60_000),
      upload: new WindowLimiter(300, 60 * 60_000),
    },
    errors: { count: 0 },
    startedAt: new Date(),
    fetchImpl: opts.fetchImpl ?? fetch,
  };
}

/** Pseudonymisierter IP-Bezug für Logs (nicht umkehrbar ohne Secret, gekürzt). */
export function ipTag(ctx: AppContext, ip: string): string {
  return hmac(ctx.macKeys.ip, ip).subarray(0, 8).toString('hex');
}
