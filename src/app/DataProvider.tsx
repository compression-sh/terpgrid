import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RECORD_STORES, type StoreMap, getAll, openDatabase, subscribe } from '../lib/db/database';
import { runDataMigrations } from '../lib/db/migrate';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../lib/db/repo';
import type { AppSettings } from '../lib/db/types';
import { t } from '../i18n';

type RecordStore = (typeof RECORD_STORES)[number];
export type AppData = { [S in RecordStore]: StoreMap[S][] };

interface DataState {
  data: AppData;
  settings: AppSettings;
  ready: boolean;
  error?: string;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const empty = Object.fromEntries(RECORD_STORES.map((s) => [s, []])) as unknown as AppData;
const Ctx = createContext<DataState | null>(null);

/**
 * Lädt alle strukturierten Datensätze (ohne Bild-Binärdaten) in den Speicher und
 * hält sie bei Änderungen synchron. Bei persönlichen Datenmengen (Hunderte bis
 * wenige Tausend Datensätze) ist das einfach, schnell und konsistent.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(empty);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(new Set<RecordStore>());
  const timer = useRef<number | undefined>(undefined);

  const reload = useCallback(async (stores: RecordStore[]) => {
    const entries = await Promise.all(stores.map(async (s) => [s, await getAll(s)] as const));
    setData((d) => ({ ...d, ...Object.fromEntries(entries) }));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await openDatabase();
        await runDataMigrations();
        await reload(RECORD_STORES);
        const s = await loadSettings();
        if (alive) {
          setSettings(s);
          setReady(true);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : t('common.storage.unavailable'));
      }
    })();
    const off = subscribe((changed) => {
      for (const s of changed) if ((RECORD_STORES as string[]).includes(s)) pending.current.add(s as RecordStore);
      if (changed.has('settings')) loadSettings().then(setSettings).catch(() => {});
      // Mehrere Schreibvorgänge kurz hintereinander bündeln.
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const stores = [...pending.current];
        pending.current.clear();
        if (stores.length) reload(stores).catch(() => {});
      }, 16);
    });
    return () => {
      alive = false;
      off();
    };
  }, [reload]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(await saveSettings(patch));
  }, []);

  const value = useMemo(() => ({ data, settings, ready, error, updateSettings }), [data, settings, ready, error, updateSettings]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Wie useData, aber ohne Fehler außerhalb des Providers (z. B. Anmeldeseite). */
export function useOptionalData(): DataState | null {
  return useContext(Ctx);
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData außerhalb von DataProvider');
  return v;
}

/** Schnelle Lookups per ID. */
export function useLookup() {
  const { data } = useData();
  return useMemo(
    () => ({
      grow: new Map(data.grows.map((g) => [g.id, g])),
      plant: new Map(data.plants.map((p) => [p.id, p])),
      strain: new Map(data.strains.map((s) => [s.id, s])),
      photo: new Map(data.photos.map((p) => [p.id, p])),
    }),
    [data.grows, data.plants, data.strains, data.photos],
  );
}
