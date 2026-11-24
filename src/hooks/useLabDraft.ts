/**
 * Eingabe-Entwürfe des THC Lab.
 *
 * - Lokalmodus: wie bisher unter den alten localStorage-Schlüsseln (`cannabisrechner.*`).
 * - Servermodus: je Konto getrennt (`terpgrid.u.<konto>.*`, nie gerätweit) und über den
 *   Einstellungs-Datensatz `labDrafts` synchronisiert. Jeder Rechner ist ein eigenes Feld
 *   { v, at } – parallele Änderungen an verschiedenen Rechnern werden zusammengeführt,
 *   beim selben Rechner gewinnt der neuere Entwurf. Gespeicherte Berechnungen sind davon
 *   unabhängig (eigene Datensätze).
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../app/auth';
import { getOne, putOne, subscribe } from '../lib/db/database';
import { useLocalState } from './useLocalState';

export const LAB_DRAFTS_KEY = 'labDrafts';
const DEBOUNCE_MS = 1500;

type Drafts = Record<string, { v: unknown; at: number }>;

async function readDrafts(): Promise<Drafts> {
  const row = await getOne('settings', LAB_DRAFTS_KEY).catch(() => undefined);
  const v = row?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Drafts) : {};
}

function readTs(key: string): number {
  try {
    return Number(localStorage.getItem(`${key}.at`)) || 0;
  } catch {
    return 0;
  }
}
function writeTs(key: string, at: number) {
  try {
    localStorage.setItem(`${key}.at`, String(at));
  } catch {
    /* ignorieren */
  }
}

export function useLabDraft<T>(field: string, legacyKey: string, initial: () => T, isValid: (v: unknown) => v is T, opts: { sync?: boolean } = {}) {
  const { state } = useAuth();
  const accountKey = state.kind === 'authenticated' ? state.user.accountKey : null;
  const storageKey = accountKey ? `terpgrid.u.${accountKey}.${legacyKey}` : legacyKey;
  const [value, setValue] = useLocalState<T>(storageKey, initial, isValid);
  const sync = !!accountKey && opts.sync !== false;
  const localAt = useRef(readTs(storageKey));
  const fromRemote = useRef(false);
  const [ready, setReady] = useState(!sync);

  // Eingehende Entwürfe (anderes Gerät) übernehmen, wenn sie neuer sind
  useEffect(() => {
    if (!sync) return;
    let alive = true;
    const apply = async () => {
      const d = (await readDrafts())[field];
      if (alive && d && d.at > localAt.current && isValid(d.v)) {
        fromRemote.current = true;
        localAt.current = d.at;
        writeTs(storageKey, d.at);
        setValue(d.v);
      }
      if (alive) setReady(true);
    };
    void apply();
    const off = subscribe((stores) => {
      if (stores.has('settings')) void apply();
    });
    return () => {
      alive = false;
      off();
    };
  }, [sync, field, storageKey, isValid, setValue]);

  // Lokale Änderungen verzögert in den synchronisierten Datensatz schreiben
  useEffect(() => {
    if (!sync || !ready) return;
    if (fromRemote.current) {
      fromRemote.current = false;
      return;
    }
    const t = setTimeout(async () => {
      const at = Date.now();
      const drafts = await readDrafts();
      if (JSON.stringify(drafts[field]?.v) === JSON.stringify(value)) return;
      localAt.current = at;
      writeTs(storageKey, at);
      await putOne('settings', { key: LAB_DRAFTS_KEY, value: { ...drafts, [field]: { v: value, at } } }).catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [sync, ready, field, storageKey, value]);

  return [value, setValue] as const;
}
