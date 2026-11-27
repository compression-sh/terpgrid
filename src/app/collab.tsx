/**
 * React-Anbindung für private Zusammenarbeit: Bereichssitzungen und ungelesene
 * Benachrichtigungen (geteilter Zähler, Abfrage nur im Servermodus).
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { collab } from '../lib/collab/api';
import { type SpaceSession, spaceSession } from '../lib/collab/spaceSync';
import { useAuth } from './auth';

export function useAccountKey(): string | null {
  const { state } = useAuth();
  return state.kind === 'authenticated' ? state.user.accountKey : null;
}

/** Zusammenarbeit gibt es nur mit Server und Anmeldung (nicht im Lokal- oder Offline-Modus). */
export function useCollabAvailable(): boolean {
  const { state } = useAuth();
  return state.kind === 'authenticated' && !state.offline;
}

export function useSpaceSession(spaceId: string): SpaceSession | null {
  const key = useAccountKey();
  const session = useMemo(() => (key ? spaceSession(key, spaceId) : null), [key, spaceId]);
  useEffect(() => session?.retain(), [session]);
  useSyncExternalStore(session?.subscribe ?? noopSub, session?.getState ?? noopState, session?.getState ?? noopState);
  return session;
}
const noopSub = () => () => {};
const noopState = () => null;

/* ───────────── Ungelesene Benachrichtigungen ───────────── */

type Unread = { count: number; byCategory: Record<string, number> };
let unread: Unread = { count: 0, byCategory: {} };
const unreadListeners = new Set<() => void>();
let unreadTimer: ReturnType<typeof setInterval> | undefined;
let unreadUsers = 0;

let unreadInflight: Promise<void> | null = null;
/** Ungelesene Benachrichtigungen neu laden – gleichzeitige Aufrufe teilen sich eine Anfrage. */
export function refreshUnread(): Promise<void> {
  unreadInflight ??= (async () => {
    try {
      const r = await collab.unread();
      unread = { count: r.count, byCategory: r.byCategory as Record<string, number> };
      for (const l of unreadListeners) l();
    } catch {
      /* offline oder abgemeldet – Zähler bleibt */
    } finally {
      unreadInflight = null;
    }
  })();
  return unreadInflight;
}

export function useUnread(enabled: boolean): Unread & { refresh: () => Promise<void> } {
  useEffect(() => {
    if (!enabled) return;
    unreadUsers++;
    if (unreadUsers === 1) {
      void refreshUnread();
      unreadTimer = setInterval(() => document.visibilityState !== 'hidden' && void refreshUnread(), 60_000);
    }
    const onFocus = () => void refreshUnread();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      unreadUsers--;
      if (unreadUsers === 0) clearInterval(unreadTimer);
    };
  }, [enabled]);
  const snap = useSyncExternalStore(
    (l) => {
      unreadListeners.add(l);
      return () => unreadListeners.delete(l);
    },
    () => unread,
    () => unread,
  );
  return { ...snap, refresh: refreshUnread };
}

/** Kleiner Lade-Hook für Abfragen mit Neuladen. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | undefined; loading: boolean; reload: () => Promise<void> } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}
