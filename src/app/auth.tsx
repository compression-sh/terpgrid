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
import { clearPhotoUrlCache } from '../components/photos/usePhotoUrl';
import { setCatalogProxy } from '../lib/catalog/endpoint';
import { clearAccountLocalStorage, isSharedDevice } from '../lib/device';
import { isOfflineEnabled, pendingSpaceOps, purgeStaleAccountData, setOfflineEnabled } from '../lib/offline';
import { resetSpaceSessions } from '../lib/collab/spaceSync';
import { DB_NAME, closeDatabase, deleteDatabase, getAll, requestPersistentStorage, setSyncTracking, selectDatabase } from '../lib/db/database';
import { type AuthConfig, type ServerUser, type SessionResponse, ApiError, api, setCsrfToken, setOnUnauthorized } from '../lib/server/api';
import { loginWithPasskey } from '../lib/server/passkeys';
import { SyncEngine, type SyncStatus } from '../lib/sync/engine';
import { t } from '../i18n';

const MODE_KEY = 'terpgrid.mode';
const LAST_ACCOUNT_KEY = 'terpgrid.lastAccount';
/** Abmelden ohne Serververbindung: Die Sitzung wird beim nächsten Serverkontakt beendet. */
const PENDING_LOGOUT_KEY = 'terpgrid.pendingLogout';
/** Abmeldesignal an andere Tabs desselben Browsers (gleiches Sitzungs-Cookie). */
const LOGOUT_SIGNAL_KEY = 'terpgrid.logoutSignal';

/**
 * Ausstehendes Abmelden nachholen, sobald der Server erreichbar ist (nicht erst beim Neustart).
 * Ohne Sitzung (401) ist nichts mehr zu tun. Gibt true zurück, wenn nichts mehr aussteht.
 */
export async function flushPendingLogout(): Promise<boolean> {
  if (!readJson<boolean>(PENDING_LOGOUT_KEY)) return true;
  try {
    await api<SessionResponse>('GET', '/api/auth/session'); // setzt das CSRF-Token für den Abmelde-Aufruf
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      writeJson(PENDING_LOGOUT_KEY, null);
      return true;
    }
    return false;
  }
  try {
    await api('POST', '/api/auth/logout');
    writeJson(PENDING_LOGOUT_KEY, null);
    return true;
  } catch {
    return false;
  } finally {
    setCsrfToken('');
  }
}

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
  loginPasskey(): Promise<void>;
  /** Registriert; das Konto wird erst mit enter() geöffnet (nachdem die Recovery-Codes gesichert wurden). */
  register(body: { mode: 'username' | 'generated'; username?: string; displayName?: string; password: string; invite?: string; ageConfirmed: boolean }): Promise<{ user: ServerUser; recoveryCodes: string[] }>;
  enter(user: ServerUser): void;
  recover(login: string, recoveryCode: string, newPassword: string): Promise<{ remainingRecoveryCodes: number }>;
  logout(opts?: { wipeLocal?: boolean }): Promise<void>;
  /** Offline-Nutzung für das angemeldete Konto auf diesem Gerät (Opt-in) */
  offlineEnabled: boolean;
  setOfflineMode(on: boolean): void;
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
  const [offlineEnabled, setOfflineEnabledState] = useState(false);

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setEngine(null);
  }, []);

  /** Konto-Datenbank aktivieren (vor dem Rendern der Daten) und Synchronisation starten. */
  const activate = useCallback(
    (user: ServerUser, offline: boolean, reauthUntil: string | null) => {
      stopEngine();
      clearPhotoUrlCache();
      selectDatabase(accountDbName(user.accountKey));
      setSyncTracking(true);
      setCatalogProxy(window.location.origin);
      // Neue Online-Anmeldung: ein älteres ausstehendes Abmelden betrifft diese Sitzung nicht
      if (!offline) writeJson(PENDING_LOGOUT_KEY, null);
      const dbName = accountDbName(user.accountKey);
      const la = { accountKey: user.accountKey, loginName: user.loginName, displayName: user.displayName };
      // Offline-Fortsetzen nur mit ausdrücklicher Offline-Freigabe (nie auf geteilten Geräten)
      const off = isOfflineEnabled(dbName);
      setOfflineEnabledState(off);
      if (off) {
        writeJson(LAST_ACCOUNT_KEY, la);
        setLastAccount(la);
        void requestPersistentStorage();
      } else {
        writeJson(LAST_ACCOUNT_KEY, null);
        setLastAccount(null);
      }
      // Kontowechsel: Arbeitskopien anderer Konten ohne Freigabe und ohne Ausstehendes entfernen
      void purgeStaleAccountData(dbName);
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
      clearPhotoUrlCache();
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
      if (typeof config?.inviteOnly !== 'boolean') throw new Error(t('account.noServer'));
    } catch (e) {
      const knownServer = readJson<string>(MODE_KEY) === 'server';
      if (knownServer && (!(e instanceof ApiError) || e.status === 0 || e.status >= 500)) {
        // Server bekannt, aber gerade nicht erreichbar
        configRef.current = null;
        setState({ kind: 'anonymous', config: { inviteOnly: true, minPasswordLength: 12, version: '' }, offline: true });
        return;
      }
      selectDatabase(DB_NAME);
      setSyncTracking(false);
      setCatalogProxy(null);
      setState({ kind: 'local' });
      return;
    }
    configRef.current = config;
    writeJson(MODE_KEY, 'server');
    let s: SessionResponse;
    try {
      s = await api<SessionResponse>('GET', '/api/auth/session');
    } catch {
      // Keine Sitzung (mehr) – ein ausstehendes Abmelden ist damit erledigt
      writeJson(PENDING_LOGOUT_KEY, null);
      toAnonymous(false);
      // Server erreichbar, keine Sitzung: nicht freigegebene Arbeitskopien ohne Ausstehendes entfernen
      void purgeStaleAccountData(null);
      return;
    }
    if (readJson<boolean>(PENDING_LOGOUT_KEY)) {
      // Offline abgemeldet: Sitzung jetzt serverseitig beenden, bevor Daten geladen werden
      const done = await api('POST', '/api/auth/logout')
        .then(() => true)
        .catch(() => false);
      if (done) writeJson(PENDING_LOGOUT_KEY, null);
      toAnonymous(false);
      void purgeStaleAccountData(null);
      return;
    }
    activate(s.user, false, s.reauthUntil);
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

  // Offline-Zustand (Server nicht erreichbar): bei Netzrückkehr und regelmäßig erneut prüfen.
  // Ist die Sitzung noch gültig, wird online weitergearbeitet und die Outbox synchronisiert;
  // andernfalls geht es zur Anmeldung – lokale Änderungen bleiben erhalten.
  const isOffline = (state.kind === 'authenticated' || state.kind === 'anonymous') && !!state.offline;
  useEffect(() => {
    if (!isOffline) return;
    let busy = false;
    const retry = () => {
      if (busy || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      busy = true;
      // Erst prüfen, ob der Server antwortet – sonst würde refresh() den Offline-Modus beenden.
      void api<AuthConfig>('GET', '/api/auth/config')
        .then((c) => (typeof c?.inviteOnly === 'boolean' ? refresh() : undefined))
        .catch(() => undefined)
        .finally(() => (busy = false));
    };
    window.addEventListener('online', retry);
    const t = window.setInterval(retry, 30_000);
    return () => {
      window.removeEventListener('online', retry);
      window.clearInterval(t);
    };
  }, [isOffline, refresh]);

  // Abmelden in einem anderen Tab: hier sofort lokal abmelden (keine Daten mehr anzeigen oder senden)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOGOUT_SIGNAL_KEY || !e.newValue) return;
      setState((st) => {
        if (st.kind !== 'authenticated') return st;
        engineRef.current?.stop();
        engineRef.current = null;
        setEngine(null);
        resetSpaceSessions();
        clearPhotoUrlCache();
        void closeDatabase();
        setSyncTracking(false);
        setCsrfToken('');
        try {
          for (const k of Object.keys(sessionStorage)) if (k.startsWith('terpgrid')) sessionStorage.removeItem(k);
        } catch {
          /* ignorieren */
        }
        return { kind: 'anonymous', config: configRef.current ?? { inviteOnly: true, minPasswordLength: 12, version: '' } };
      });
      setLastAccount(readJson<LastAccount>(LAST_ACCOUNT_KEY));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Ausstehendes Abmelden (offline abgemeldet) nachholen, sobald wieder eine Verbindung besteht
  useEffect(() => {
    const run = () => void flushPendingLogout();
    window.addEventListener('online', run);
    const t = window.setInterval(run, 30_000);
    const vis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('online', run);
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

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

  const loginPasskey = useCallback(async () => {
    const r = await loginWithPasskey();
    activate(r.user, false, new Date(Date.now() + 10 * 60_000).toISOString());
  }, [activate]);

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
      // Ohne Offline-Freigabe wird die Arbeitskopie gelöscht – aber nie mit ausstehenden Änderungen
      const keepForOffline = current ? isOfflineEnabled(accountDbName(current.accountKey)) : true;
      const pending = current ? (await pendingChanges()) + pendingSpaceOps(current.accountKey) : 0;
      const wipe = !!current && (opts.wipeLocal === true || isSharedDevice() || (!keepForOffline && pending === 0 && opts.wipeLocal !== false));
      const loggedOut = await api('POST', '/api/auth/logout')
        .then(() => true)
        .catch((e) => e instanceof ApiError && e.status === 401);
      // Server nicht erreichbar: Sitzung beim nächsten Kontakt beenden (Cookie ist HttpOnly)
      writeJson(PENDING_LOGOUT_KEY, loggedOut ? null : true);
      // Andere Tabs dieses Browsers ebenfalls abmelden (sie teilen das Cookie und die Arbeitskopie)
      try {
        localStorage.setItem(LOGOUT_SIGNAL_KEY, String(Date.now()));
      } catch {
        /* ignorieren */
      }
      stopEngine();
      // Zwischenspeicher gemeinsamer Bereiche (nur im Arbeitsspeicher) verwerfen
      resetSpaceSessions();
      if (wipe && current) {
        selectDatabase(accountDbName(current.accountKey));
        await deleteDatabase().catch(() => {});
        clearAccountLocalStorage(current.accountKey);
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

  const setOfflineMode = useCallback(
    (on: boolean) => {
      if (state.kind !== 'authenticated') return;
      const u = state.user;
      const dbName = accountDbName(u.accountKey);
      setOfflineEnabled(dbName, on && !isSharedDevice());
      const enabled = isOfflineEnabled(dbName);
      setOfflineEnabledState(enabled);
      if (enabled) {
        const la = { accountKey: u.accountKey, loginName: u.loginName, displayName: u.displayName };
        writeJson(LAST_ACCOUNT_KEY, la);
        setLastAccount(la);
        void requestPersistentStorage();
      } else {
        writeJson(LAST_ACCOUNT_KEY, null);
        setLastAccount(null);
      }
    },
    [state],
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
    () => ({ state, sync, engine, lastAccount, login, completeMfa, loginPasskey, register, enter, recover, logout, offlineEnabled, setOfflineMode, continueOffline, refresh, reauth, setUser }),
    [state, sync, engine, lastAccount, login, completeMfa, loginPasskey, register, enter, recover, logout, offlineEnabled, setOfflineMode, continueOffline, refresh, reauth, setUser],
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
