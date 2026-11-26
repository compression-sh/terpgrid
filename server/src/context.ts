import type { Config } from './config.js';
import { KeyRing, hmac, subkey } from './crypto.js';
import { type Db, createPool } from './db.js';
import { PasswordHasher } from './passwords.js';
import { Metrics } from './metrics.js';
import { LoginBackoff, WindowLimiter } from './ratelimit.js';

export interface AppContext {
  config: Config;
  db: Db;
  keys: KeyRing;
  hasher: PasswordHasher;
  /** HMAC-Schlüssel je Zweck (aus HMAC_SECRET abgeleitet) */
  macKeys: { recovery: Buffer; invite: Buffer; ip: Buffer; account: Buffer };
  limits: {
    loginIp: WindowLimiter;
    /** Backoff je Kennung UND IP – Fehlversuche von einer Adresse sperren das Opfer nicht überall aus */
    loginAccount: LoginBackoff;
    /** Kontoweiter Backoff mit hoher Schwelle – bremst verteilte Angriffe über viele IPs */
    loginGlobal: LoginBackoff;
    /** Falsche 2FA-Codes je Konto (über alle Anmeldevorgänge, Re-Auth und 2FA-Aktivierung) */
    mfa: LoginBackoff;
    register: WindowLimiter;
    recoverIp: WindowLimiter;
    recoverAccount: LoginBackoff;
    probe: WindowLimiter;
    api: WindowLimiter;
    upload: WindowLimiter;
    /** Freundschaftsanfragen je Konto (Missbrauchsschutz) */
    friendRequests: WindowLimiter;
    /** Einladungscodes prüfen/einlösen je Konto (gegen Durchprobieren) */
    inviteProbe: WindowLimiter;
    /** Schreibende Aktionen in gemeinsamen Bereichen je Konto (Einladungen, Kommentare) */
    social: WindowLimiter;
  };
  /** Zählt unerwartete Fehler für das Admin-Dashboard (ohne Inhalte) */
  errors: { count: number; last?: string };
  startedAt: Date;
  fetchImpl: typeof fetch;
  /** Fehlgeschlagene Hintergrundaufgaben (für System Health; keine Inhalte) */
  tasks: { failures: Record<string, number>; lastFailure?: string; fail(name: string): void };
  metrics: Metrics;
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
      account: subkey(config.hmacSecret, 'account-key'),
    },
    limits: {
      loginIp: new WindowLimiter(30, 15 * 60_000),
      loginAccount: new LoginBackoff(5),
      loginGlobal: new LoginBackoff(50),
      mfa: new LoginBackoff(5, 2000),
      register: new WindowLimiter(5, 60 * 60_000),
      recoverIp: new WindowLimiter(10, 60 * 60_000),
      recoverAccount: new LoginBackoff(3, 5000),
      probe: new WindowLimiter(60, 15 * 60_000),
      api: new WindowLimiter(600, 60_000),
      upload: new WindowLimiter(300, 60 * 60_000),
      friendRequests: new WindowLimiter(20, 60 * 60_000),
      inviteProbe: new WindowLimiter(20, 15 * 60_000),
      social: new WindowLimiter(300, 60 * 60_000),
    },
    errors: { count: 0 },
    startedAt: new Date(),
    fetchImpl: opts.fetchImpl ?? fetch,
    metrics: new Metrics(),
    tasks: {
      failures: {},
      fail(name: string) {
        this.failures[name] = (this.failures[name] ?? 0) + 1;
        this.lastFailure = new Date().toISOString();
      },
    },
  };
}

/** Pseudonymisierter IP-Bezug für Logs (nicht umkehrbar ohne Secret, gekürzt). */
export function ipTag(ctx: AppContext, ip: string): string {
  return hmac(ctx.macKeys.ip, ip).subarray(0, 8).toString('hex');
}

/**
 * Stabiler, nicht umkehrbarer Kontoschlüssel für den Client (Name der lokalen
 * Konto-Datenbank). Verrät nicht die interne Benutzer-ID; ein neu angelegtes
 * Konto mit gleichem Namen erhält einen anderen Schlüssel.
 */
export function accountKey(ctx: AppContext, userId: string): string {
  return hmac(ctx.macKeys.account, userId).subarray(0, 12).toString('hex');
}
