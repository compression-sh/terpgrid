import { currentDatabaseName } from './db/database';

/**
 * Formular-Entwürfe nur in diesem Tab (sessionStorage) und nur für das angemeldete Konto
 * (Schlüssel enthält die Kontodatenbank). Nichts wird synchronisiert oder dauerhaft gespeichert.
 */
const key = (form: string) => `terpgrid.draft.${form}.${currentDatabaseName()}`;

export function loadDraft<T extends object>(form: string, valid: (d: Record<string, unknown>) => boolean): T | null {
  try {
    const d = JSON.parse(globalThis.sessionStorage?.getItem(key(form)) ?? 'null');
    return d && typeof d === 'object' && !Array.isArray(d) && valid(d) ? (d as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(form: string, value: object): void {
  try {
    globalThis.sessionStorage?.setItem(key(form), JSON.stringify(value));
  } catch {
    /* Entwurf ist optional (z. B. privater Modus) */
  }
}

export function clearDraft(form: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key(form));
  } catch {
    /* ignorieren */
  }
}
