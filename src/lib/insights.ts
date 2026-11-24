/**
 * TERPGRID Insights: Kennzahlen ausschließlich aus eigenen Einträgen. Jede Kennzahl
 * nennt ihre Datengrundlage (n) und wird nicht berechnet, wenn zu wenig Daten vorliegen.
 * Keine Empfehlungen, keine Vorhersagen, keine Vergleiche mit anderen Personen.
 */
import type { Activity, Expense, GrowProject, JournalEntry, LabReport, Photo, Plant, Strain } from './db/types';

export interface Metric {
  value: number | null;
  /** Anzahl der Datensätze, auf denen der Wert beruht */
  n: number;
  /** Erklärung, warum kein Wert berechnet wurde */
  missing?: string;
}

export interface Insights {
  activeGrows: number;
  completedGrows: number;
  avgGrowDays: Metric;
  activePlants: number;
  avgPlantAgeDays: Metric;
  oldestPlantDays: Metric;
  photos30d: number;
  photosPerWeek12w: Metric;
  measurements: number;
  measurementKinds: string[];
  strains: { total: number; favorites: number; fromDiscover: number; withLab: number; rated: number };
  journal: { total: number; last30d: number; avgRating: Metric };
  expenses12m: Metric;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

export function computeInsights(
  d: { grows: GrowProject[]; plants: Plant[]; activities: Activity[]; photos: Photo[]; strains: Strain[]; journal: JournalEntry[]; labReports: LabReport[]; expenses: Expense[] },
  today: string,
): Insights {
  const active = d.grows.filter((g) => g.status === 'active');
  // Dokumentierte Grow-Dauer: nur abgeschlossene Grows mit Start- und Enddatum
  const durations = d.grows
    .filter((g) => g.status !== 'active')
    .map((g) => {
      const end = g.completedDate ?? g.phaseDates?.completed;
      return end ? dayDiff(g.startDate, end) : null;
    })
    .filter((x): x is number => x !== null && x >= 0);
  const activeGrowIds = new Set(active.map((g) => g.id));
  const activePlants = d.plants.filter((p) => activeGrowIds.has(p.growId) && !p.phaseDates?.completed);
  const ages = activePlants.map((p) => dayDiff(p.startDate, today)).filter((x) => x >= 0);
  const since30 = addDays(today, -30);
  const since84 = addDays(today, -84);
  const photos12w = d.photos.filter((p) => p.takenAt.slice(0, 10) > since84 && p.takenAt.slice(0, 10) <= today).length;
  const firstPhoto = d.photos.map((p) => p.takenAt.slice(0, 10)).sort()[0];
  const weeksCovered = firstPhoto ? Math.min(12, Math.max(1, Math.ceil((dayDiff(firstPhoto, today) + 1) / 7))) : 0;
  const measurementActs = d.activities.filter((a) => a.measurements && Object.keys(a.measurements).length > 0);
  const kinds = new Set<string>();
  for (const a of measurementActs) for (const [k, v] of Object.entries(a.measurements ?? {})) if (typeof v === 'number' && Number.isFinite(v)) kinds.add(k); // nur Messgrößen, keine Kontext-/Gerätefelder
  const labStrains = new Set(d.labReports.map((l) => l.strainId).filter(Boolean));
  const ratings = d.journal.map((j) => j.rating).filter((r): r is number => typeof r === 'number');
  const since365 = addDays(today, -365);
  const exp = d.expenses.filter((e) => e.date > since365 && e.date <= today);
  const avg = (a: number[]) => Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10;

  return {
    activeGrows: active.length,
    completedGrows: d.grows.filter((g) => g.status === 'completed').length,
    avgGrowDays: durations.length >= 1 ? { value: avg(durations), n: durations.length } : { value: null, n: 0, missing: 'Noch kein abgeschlossener Grow mit Start- und Enddatum.' },
    activePlants: activePlants.length,
    avgPlantAgeDays: ages.length ? { value: avg(ages), n: ages.length } : { value: null, n: 0, missing: 'Keine Pflanzen in aktiven Grows.' },
    oldestPlantDays: ages.length ? { value: Math.max(...ages), n: ages.length } : { value: null, n: 0, missing: 'Keine Pflanzen in aktiven Grows.' },
    photos30d: d.photos.filter((p) => p.takenAt.slice(0, 10) > since30 && p.takenAt.slice(0, 10) <= today).length,
    photosPerWeek12w:
      d.photos.length >= 3 && weeksCovered >= 2
        ? { value: Math.round((photos12w / weeksCovered) * 10) / 10, n: photos12w }
        : { value: null, n: d.photos.length, missing: 'Mindestens 3 Fotos über 2 Wochen nötig.' },
    measurements: measurementActs.length,
    measurementKinds: [...kinds].sort(),
    strains: {
      total: d.strains.length,
      favorites: d.strains.filter((s) => s.favorite).length,
      fromDiscover: d.strains.filter((s) => !!s.external).length,
      withLab: d.strains.filter((s) => labStrains.has(s.id)).length,
      rated: d.strains.filter((s) => typeof s.rating === 'number').length,
    },
    journal: {
      total: d.journal.length,
      last30d: d.journal.filter((j) => j.date.slice(0, 10) > since30 && j.date.slice(0, 10) <= today).length,
      avgRating: ratings.length >= 3 ? { value: avg(ratings), n: ratings.length } : { value: null, n: ratings.length, missing: 'Mindestens 3 bewertete Einträge nötig.' },
    },
    expenses12m: exp.length ? { value: Math.round(exp.reduce((s, e) => s + e.amount, 0) * 100) / 100, n: exp.length } : { value: null, n: 0, missing: 'Keine Ausgaben in den letzten 12 Monaten.' },
  };
}
