/**
 * Kennzahlen eines Grow-Projekts – ausschließlich aus dokumentierten Datensätzen.
 * Fehlende Werte bleiben `undefined` (Anzeige „keine Daten“), es wird nichts geschätzt.
 * Gemeinsame Grundlage für Grow-Vergleich, Bericht und Vollständigkeitsanzeige.
 */
import type { Activity, Expense, GrowProject, MeasureContext, Photo, Plant } from '../db/types';
import { daysBetween, today as todayFn } from '../dates';
import { currentPhase } from './phases';
import { type DerivedKey, type MetricKey, type SeriesPoint, derivedSeries, metricSeries } from './series';
import { t } from '../../i18n';

export interface GrowSummary {
  grow: GrowProject;
  durationDays?: number;
  running: boolean;
  phase?: string;
  plants: number;
  plantsWithOutcome: number;
  dryWeightG?: number;
  wetWeightG?: number;
  activities: number;
  measurements: number;
  photos: number;
  expenses: number;
  expenseCount: number;
  maxHeightCm?: number;
  firstActivity?: string;
  lastActivity?: string;
}

export interface GrowData {
  plants: Plant[];
  activities: Activity[];
  photos: Photo[];
  expenses: Expense[];
}

export function growData(growId: string, d: GrowData): GrowData {
  return {
    plants: d.plants.filter((p) => p.growId === growId),
    activities: d.activities.filter((a) => a.growId === growId),
    photos: d.photos.filter((p) => p.growId === growId),
    expenses: d.expenses.filter((e) => e.growId === growId),
  };
}

export function summarizeGrow(grow: GrowProject, d: GrowData, ref: string = todayFn()): GrowSummary {
  const end = grow.completedDate ?? ref;
  const duration = grow.startDate && end >= grow.startDate ? daysBetween(grow.startDate, end) : undefined;
  const outcomes = d.plants.map((p) => p.outcome).filter((o): o is NonNullable<typeof o> => !!o);
  const dry = outcomes.filter((o) => o.dryWeightG !== undefined);
  const wet = outcomes.filter((o) => o.wetWeightG !== undefined);
  const heights = metricSeries(d.activities, 'heightCm');
  const dates = d.activities.map((a) => a.date).sort();
  return {
    grow,
    durationDays: duration,
    running: !grow.completedDate && grow.status === 'active',
    phase: currentPhase(grow.phaseDates, ref),
    plants: d.plants.length,
    plantsWithOutcome: outcomes.length,
    dryWeightG: dry.length ? dry.reduce((s, o) => s + o.dryWeightG!, 0) : undefined,
    wetWeightG: wet.length ? wet.reduce((s, o) => s + o.wetWeightG!, 0) : undefined,
    activities: d.activities.length,
    measurements: d.activities.filter((a) => a.measurements && Object.keys(a.measurements).length > 0).length,
    photos: d.photos.length,
    expenses: Math.round(d.expenses.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    expenseCount: d.expenses.length,
    maxHeightCm: heights.length ? Math.max(...heights.map((p) => p.value)) : undefined,
    firstActivity: dates[0],
    lastActivity: dates.at(-1),
  };
}

/** Messpunkte relativ zum Grow-Start (Tag 0 = Startdatum) – macht Grows mit unterschiedlichem Start vergleichbar. */
export interface DayPoint {
  day: number;
  value: number;
  date: string;
  activityId: string;
}

export function seriesByGrowDay(grow: GrowProject, activities: Activity[], key: MetricKey | DerivedKey, context?: MeasureContext | 'none'): DayPoint[] {
  const pts: SeriesPoint[] = key === 'vpd' || key === 'dli' ? derivedSeries(activities, key) : metricSeries(activities, key, context ? { context } : undefined);
  return pts.map((p) => ({ day: daysBetween(grow.startDate, p.date.slice(0, 10)), value: p.value, date: p.date, activityId: p.activityId })).filter((p) => p.day >= 0);
}

/** Welche Messkontexte kommen in den pH/EC-Messungen dieser Grows vor? (Hinweis bei Vermischung) */
export function contextsUsed(activities: Activity[], key: 'ph' | 'ecMsCm'): (MeasureContext | 'none')[] {
  const ck = key === 'ph' ? 'phContext' : 'ecContext';
  const set = new Set<MeasureContext | 'none'>();
  for (const a of activities) if (a.measurements?.[key] !== undefined) set.add(a.measurements[ck] ?? 'none');
  return [...set];
}

/* ───────────── Vollständigkeit der eigenen Dokumentation ───────────── */

export interface CompletenessItem {
  id: string;
  label: string;
  state: 'ok' | 'partial' | 'missing';
  detail: string;
}

/**
 * Was ist für diesen Grow dokumentiert? Reine Bestandsaufnahme (vorhanden/teilweise/fehlt) –
 * kein Punktwert, keine Bewertung der Qualität des Grows.
 */
export function growCompleteness(grow: GrowProject, d: GrowData, ref: string = todayFn()): CompletenessItem[] {
  const s = summarizeGrow(grow, d, ref);
  const weeks = s.durationDays !== undefined ? Math.max(1, Math.ceil((s.durationDays + 1) / 7)) : 1;
  const measureWeeks = new Set(d.activities.filter((a) => a.measurements).map((a) => Math.floor(daysBetween(grow.startDate, a.date.slice(0, 10)) / 7))).size;
  const photoWeeks = new Set(d.photos.map((p) => Math.floor(daysBetween(grow.startDate, p.takenAt.slice(0, 10)) / 7))).size;
  const phases = Object.keys(grow.phaseDates).length;
  const strainLinked = d.plants.filter((p) => p.strainId || p.strainName).length;
  const st = (n: number, of: number): CompletenessItem['state'] => (of === 0 || n === 0 ? 'missing' : n >= of ? 'ok' : 'partial');
  const items: CompletenessItem[] = [
    { id: 'phases', get label() { return t('grow.cp.phases'); }, state: phases === 0 ? 'missing' : phases >= 2 ? 'ok' : 'partial', detail: t('grow.cp.phasesD', { count: phases }) },
    { id: 'plants', get label() { return t('grow.cp.plants'); }, state: st(strainLinked, s.plants), detail: s.plants ? t('grow.cp.of', { a: strainLinked, b: s.plants }) : t('grow.cp.noPlants') },
    { id: 'measure', get label() { return t('grow.cp.measure'); }, state: st(measureWeeks, weeks), detail: t('grow.cp.measureD', { a: measureWeeks, b: weeks }) },
    { id: 'photos', get label() { return t('grow.cp.photos'); }, state: st(photoWeeks, weeks), detail: t('grow.cp.photosD', { a: photoWeeks, b: weeks }) },
    { id: 'expenses', get label() { return t('grow.cp.expenses'); }, state: s.expenseCount ? 'ok' : 'missing', detail: s.expenseCount ? t('grow.cp.items', { n: s.expenseCount }) : t('grow.cp.none') },
  ];
  if (!s.running) items.push({ id: 'outcome', get label() { return t('grow.cp.outcome'); }, state: st(s.plantsWithOutcome, s.plants), detail: s.plants ? t('grow.cp.of', { a: s.plantsWithOutcome, b: s.plants }) : t('grow.cp.noPlants') });
  return items;
}
