/**
 * Anmeldezustand und Betriebsmodus.
 *
 * - Servermodus: Die eigene Instanz antwortet auf /api/auth/config. Login ist Pflicht;
 *   Daten liegen je Konto in einer eigenen IndexedDB (`terpgrid-u-<kontoschlüssel>`)
 *   und werden mit dem Server synchronisiert.
 * - Offline im Servermodus: Mit dem zuletzt angemeldeten Konto kann auf diesem Gerät
 *   weitergearbeitet werden; Änderungen bleiben in der Outbox, bis der Server bestätigt.
 * - Lokalmodus: Kein Backend vorhanden (z. B. reine Vite-Entwicklung) – bisheriges
 *   Verhalten mit der lokalen Datenbank `terpgrid`, gekennzeichnet als „nur auf diesem Gerät“.
 */
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setCatalogProxy } from '../lib/catalog/endpoint';
import { DB_NAME, closeDatabase, deleteDatabase, getAll, setSyncTracking, useDatabaseName } from '../lib/db/database';
import { type AuthConfig, type ServerUser, type SessionResponse, ApiError, api, setCsrfToken, setOnUnauthorized } from '../lib/server/api';
import { SyncEngine, type SyncStatus } from '../lib/sync/engine';

const MODE_KEY = 'terpgrid.mode';
const LAST_ACCOUNT_KEY = 'terpgrid.lastAccount';

export type AuthState =
  | { kind: 'checking' }
  | { kind: 'local' }
  | { kind: 'anonymous'; config: AuthConfig; offline?: boolean }
  | { kind: 'authenticated'; config: AuthConfig | null; user: ServerUser; offline: boolean; reauthUntil: string | null };

export interface LastAccount {
  accountKey: string;
  loginName: string;
  displayName: string | null;
}

export type LoginResult = { status: 'ok' } | { status: 'mfa'; mfaToken: string };

interface AuthApi {
  state: AuthState;
  sync: SyncStatus;
  engine: SyncEngine | null;
  lastAccount: LastAccount | null;
  login(login: string, password: string): Promise<LoginResult>;
  completeMfa(mfaToken: string, code: string): Promise<void>;
  /** Registriert; das Konto wird erst mit enter() geöffnet (nachdem die Recovery-Codes gesichert wurden). */
  register(body: { mode: 'username' | 'generated'; username?: string; displayName?: string; password: string; invite?: string; ageConfirmed: boolean }): Promise<{ user: ServerUser; recoveryCodes: string[] }>;
  enter(user: ServerUser): void;
  recover(login: string, recoveryCode: string, newPassword: string): Promise<{ remainingRecoveryCodes: number }>;
  logout(opts?: { wipeLocal?: boolean }): Promise<void>;
  continueOffline(): void;
  refresh(): Promise<void>;
  reauth(password: string, code?: string): Promise<void>;
  setUser(patch: Partial<ServerUser>): void;
}

const Ctx = createContext<AuthApi | null>(null);

const readJson = <T,>(k: string): T | null => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const writeJson = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* localStorage nicht verfügbar */
  }
};

export const accountDbName = (accountKey: string) => `terpgrid-u-${accountKey.replace(/[^a-f0-9]/g, '').slice(0, 32)}`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: 'checking' });
  const [sync, setSync] = useState<SyncStatus>({ phase: 'stopped', pending: 0, conflicts: 0 });
  const [lastAccount, setLastAccount] = useState<LastAccount | null>(() => readJson<LastAccount>(LAST_ACCOUNT_KEY));
  const engineRef = useRef<SyncEngine | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const configRef = useRef<AuthConfig | null>(null);

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setEngine(null);
  }, []);

  /** Konto-Datenbank aktivieren (vor dem Rendern der Daten) und Synchronisation starten. */
  const activate = useCallback(
    (user: ServerUser, offline: boolean, reauthUntil: string | null) => {
      stopEngine();
      useDatabaseName(accountDbName(user.accountKey));
      setSyncTracking(true);
      setCatalogProxy(window.location.origin);
      const la = { accountKey: user.accountKey, loginName: user.loginName, displayName: user.displayName };
      writeJson(LAST_ACCOUNT_KEY, la);
      setLastAccount(la);
      const e = new SyncEngine();
      engineRef.current = e;
      setEngine(e);
      e.subscribe(setSync);
      e.start();
      setState({ kind: 'authenticated', config: configRef.current, user, offline, reauthUntil });
    },
    [stopEngine],
  );

  const toAnonymous = useCallback(
    (offline = false) => {
      stopEngine();
      setCsrfToken('');
      // Keine Konto-Datenbank geöffnet lassen
      void closeDatabase();
      setSyncTracking(false);
      setState({ kind: 'anonymous', config: configRef.current ?? { inviteOnly: true, minPasswordLength: 12, version: '' }, offline });
    },
    [stopEngine],
  );

  const refresh = useCallback(async () => {
    let config: AuthConfig;
    try {
      config = await api<AuthConfig>('GET', '/api/auth/config');
      if (typeof config?.inviteOnly !== 'boolean') throw new Error('kein TERPGRID-Server');
    } catch (e) {
      const knownServer = readJson<string>(MODE_KEY) === 'server';
      if (knownServer && (!(e instanceof ApiError) || e.status === 0 || e.status >= 500)) {
        // Server bekannt, aber gerade nicht erreichbar
        configRef.current = null;
        setState({ kind: 'anonymous', config: { inviteOnly: true, minPasswordLength: 12, version: '' }, offline: true });
        return;
      }
      useDatabaseName(DB_NAME);
      setSyncTracking(false);
      setCatalogProxy(null);
      setState({ kind: 'local' });
      return;
    }
    configRef.current = config;
    writeJson(MODE_KEY, 'server');
    try {
      const s = await api<SessionResponse>('GET', '/api/auth/session');
      activate(s.user, false, s.reauthUntil);
    } catch {
      toAnonymous(false);
    }
  }, [activate, toAnonymous]);

  useEffect(() => {
    void refresh();
    // Session serverseitig abgelaufen/widerrufen → zurück zum Login (lokale Outbox bleibt erhalten)
    setOnUnauthorized(() => {
      setState((s) => (s.kind === 'authenticated' ? { kind: 'anonymous', config: configRef.current ?? { inviteOnly: true, minPasswordLength: 12, version: '' } } : s));
      engineRef.current?.stop();
    });
    return () => setOnUnauthorized(null);
  }, [refresh]);

  const login = useCallback(
    async (login: string, password: string): Promise<LoginResult> => {
      const r = await api<{ status: 'ok' | 'mfa'; mfaToken?: string; user?: ServerUser }>('POST', '/api/auth/login', { login, password });
      if (r.status === 'mfa' && r.mfaToken) return { status: 'mfa', mfaToken: r.mfaToken };
      activate(r.user!, false, new Date(Date.now() + 10 * 60_000).toISOString());
      return { status: 'ok' };
    },
    [activate],
  );

  const completeMfa = useCallback(
    async (mfaToken: string, code: string) => {
      const r = await api<{ user: ServerUser }>('POST', '/api/auth/login/mfa', { mfaToken, code });
      activate(r.user, false, new Date(Date.now() + 10 * 60_000).toISOString());
    },
    [activate],
  );

  const register = useCallback(
    async (body: Parameters<AuthApi['register']>[0]) => {
      return api<{ user: ServerUser; recoveryCodes: string[] }>('POST', '/api/auth/register', body);
    },
    [],
  );
  const enter = useCallback((user: ServerUser) => activate(user, false, new Date(Date.now() + 10 * 60_000).toISOString()), [activate]);

  const recover = useCallback(
    async (login: string, recoveryCode: string, newPassword: string) => {
      const r = await api<{ user: ServerUser; remainingRecoveryCodes: number }>('POST', '/api/auth/recover', { login, recoveryCode, newPassword });
      activate(r.user, false, new Date(Date.now() + 10 * 60_000).toISOString());
      return { remainingRecoveryCodes: r.remainingRecoveryCodes };
    },
    [activate],
  );

  const logout = useCallback(
    async (opts: { wipeLocal?: boolean } = {}) => {
      const current = state.kind === 'authenticated' ? state.user : null;
      await api('POST', '/api/auth/logout').catch(() => {});
      stopEngine();
      if (opts.wipeLocal && current) {
        useDatabaseName(accountDbName(current.accountKey));
        await deleteDatabase().catch(() => {});
      } else {
        await closeDatabase();
      }
      writeJson(LAST_ACCOUNT_KEY, null);
      setLastAccount(null);
      // Sitzungsbezogene Ablagen (z. B. Vergleichsablage) nicht ins nächste Konto mitnehmen
      try {
        for (const k of Object.keys(sessionStorage)) if (k.startsWith('terpgrid')) sessionStorage.removeItem(k);
      } catch {
        /* ignorieren */
      }
      toAnonymous(false);
    },
    [state, stopEngine, toAnonymous],
  );

  const continueOffline = useCallback(() => {
    if (!lastAccount) return;
    activate({ accountKey: lastAccount.accountKey, loginName: lastAccount.loginName, displayName: lastAccount.displayName, role: 'user', totpEnabled: false, loginKind: 'username' }, true, null);
  }, [activate, lastAccount]);

  const reauth = useCallback(async (password: string, code?: string) => {
    const r = await api<{ reauthUntil: string }>('POST', '/api/auth/reauth', { password, ...(code ? { code } : {}) });
    setState((s) => (s.kind === 'authenticated' ? { ...s, reauthUntil: r.reauthUntil } : s));
  }, []);

  const setUser = useCallback((patch: Partial<ServerUser>) => {
    setState((s) => (s.kind === 'authenticated' ? { ...s, user: { ...s.user, ...patch } } : s));
  }, []);

  const value = useMemo<AuthApi>(
    () => ({ state, sync, engine, lastAccount, login, completeMfa, register, enter, recover, logout, continueOffline, refresh, reauth, setUser }),
    [state, sync, engine, lastAccount, login, completeMfa, register, enter, recover, logout, continueOffline, refresh, reauth, setUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth außerhalb von AuthProvider');
  return v;
}

/** Ausstehende lokale Änderungen (für Warnung vor dem Abmelden). */
export async function pendingChanges(): Promise<number> {
  try {
    return (await getAll('outbox')).length;
  } catch {
    return 0;
  }
}

/** true im Servermodus (angemeldet, auch offline) – für korrekte Datenschutz-Hinweise. */
export function useIsServerMode(): boolean {
  const { state } = useAuth();
  return state.kind === 'authenticated';
}
