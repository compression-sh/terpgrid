export const SYNC_STORE_LABEL: Record<string, string> = {
  grows: 'Grows',
  plants: 'Pflanzen',
  activities: 'Einträge',
  photos: 'Fotos',
  photoData: 'Fotodateien',
  reminders: 'Erinnerungen',
  strains: 'Sorten',
  journal: 'Journal',
  inventory: 'Sammlung',
  expenses: 'Ausgaben',
  calculations: 'Berechnungen',
  labReports: 'Laborberichte',
  labDocs: 'Labordokumente',
  settings: 'Einstellungen',
};

/** Kurzer, lesbarer Titel eines Datensatzes für Konfliktanzeigen. */
export function recordTitle(data: unknown): string {
  if (!data || typeof data !== 'object') return '–';
  const o = data as Record<string, unknown>;
  for (const k of ['name', 'title', 'label', 'note', 'notes', 'date']) if (typeof o[k] === 'string' && o[k]) return String(o[k]).slice(0, 80);
  return String(o.id ?? o.key ?? '–');
}
