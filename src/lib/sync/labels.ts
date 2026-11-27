import { labels } from '../../i18n';
export const SYNC_STORE_LABEL = labels('labels.syncStore', ['grows', 'plants', 'activities', 'photos', 'photoData', 'reminders', 'strains', 'journal', 'inventory', 'expenses', 'calculations', 'labReports', 'labDocs', 'settings'] as string[]);

/** Kurzer, lesbarer Titel eines Datensatzes für Konfliktanzeigen. */
export function recordTitle(data: unknown): string {
  if (!data || typeof data !== 'object') return '–';
  const o = data as Record<string, unknown>;
  for (const k of ['name', 'title', 'label', 'note', 'notes', 'date']) if (typeof o[k] === 'string' && o[k]) return String(o[k]).slice(0, 80);
  return String(o.id ?? o.key ?? '–');
}
