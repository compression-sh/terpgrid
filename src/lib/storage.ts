/**
 * Lokale Speicherung eigener Berechnungen – ausschließlich im localStorage des
 * Browsers. Es findet keinerlei Übertragung an einen Server statt.
 */

export type CalculationKind = 'edibles' | 'smoking' | 'compare';

export interface SavedCalculation<T = unknown> {
  id: string;
  kind: CalculationKind;
  name: string;
  createdAt: string;
  input: T;
  /** Kurze, menschenlesbare Zusammenfassung der Ergebnisse. */
  summary: Record<string, string>;
}

export const STORAGE_KEY = 'cannabisrechner.saved.v1';

/** Minimal-Interface, damit die Logik ohne Browser testbar ist. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSaved(value: unknown): value is SavedCalculation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.createdAt === 'string' &&
    (v.kind === 'edibles' || v.kind === 'smoking' || v.kind === 'compare') &&
    typeof v.summary === 'object'
  );
}

export function loadSaved(store: KeyValueStore | null = defaultStore()): SavedCalculation[] {
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSaved) : [];
  } catch {
    return [];
  }
}

export function persistSaved(items: SavedCalculation[], store: KeyValueStore | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function createSaved<T>(
  kind: CalculationKind,
  name: string,
  input: T,
  summary: Record<string, string>,
): SavedCalculation<T> {
  return {
    id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    name: name.trim() || 'Unbenannte Berechnung',
    createdAt: new Date().toISOString(),
    input,
    summary,
  };
}

export function clearSaved(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
