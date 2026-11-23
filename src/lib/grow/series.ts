import type { Activity, Measurements } from '../db/types';

export type MetricKey = 'heightCm' | 'temperatureC' | 'humidityPct' | 'ph' | 'ecMsCm';

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  color: string;
}

export const METRICS: MetricDef[] = [
  { key: 'heightCm', label: 'Höhe', unit: 'cm', min: 0, max: 600, step: 0.5, color: '#5fe39a' },
  { key: 'temperatureC', label: 'Temperatur', unit: '°C', min: -20, max: 60, step: 0.1, color: '#fb923c' },
  { key: 'humidityPct', label: 'Rel. Luftfeuchte', unit: '%', min: 0, max: 100, step: 1, color: '#38bdf8' },
  { key: 'ph', label: 'pH', unit: '', min: 0, max: 14, step: 0.1, color: '#c084fc' },
  { key: 'ecMsCm', label: 'EC', unit: 'mS/cm', min: 0, max: 20, step: 0.01, color: '#facc15' },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDef>;

export interface SeriesPoint {
  date: string;
  /** Zeitstempel in ms (für numerische Zeitachsen). */
  t: number;
  value: number;
  activityId: string;
  plantId?: string;
}

function toMs(dt: string): number {
  return Date.parse(dt.length === 10 ? `${dt}T00:00` : dt);
}

/**
 * Messreihe aus erfassten Aktivitäten. Es werden ausschließlich tatsächlich
 * eingetragene Werte zurückgegeben – keine Interpolation.
 */
export function metricSeries(activities: Activity[], key: MetricKey, filter?: { plantId?: string }): SeriesPoint[] {
  return activities
    .filter((a) => (filter?.plantId ? a.plantId === filter.plantId : true))
    .filter((a) => typeof a.measurements?.[key] === 'number' && Number.isFinite(a.measurements[key]))
    .map((a) => ({ date: a.date, t: toMs(a.date), value: a.measurements![key] as number, activityId: a.id, plantId: a.plantId }))
    .sort((a, b) => a.t - b.t);
}

/** Eigene Messgrößen (Label + Einheit) aus allen Aktivitäten. */
export function customMetricKeys(activities: Activity[]): { label: string; unit: string }[] {
  const seen = new Map<string, { label: string; unit: string }>();
  for (const a of activities) {
    for (const c of a.measurements?.custom ?? []) {
      const k = `${c.label}|${c.unit}`;
      if (!seen.has(k)) seen.set(k, { label: c.label, unit: c.unit });
    }
  }
  return [...seen.values()];
}

export function customSeries(activities: Activity[], label: string, unit: string, filter?: { plantId?: string }): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const a of activities) {
    if (filter?.plantId && a.plantId !== filter.plantId) continue;
    for (const c of a.measurements?.custom ?? []) {
      if (c.label === label && c.unit === unit && Number.isFinite(c.value)) {
        out.push({ date: a.date, t: toMs(a.date), value: c.value, activityId: a.id, plantId: a.plantId });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface SeriesStats {
  count: number;
  min?: number;
  max?: number;
  latest?: SeriesPoint;
  /** Längste Lücke zwischen zwei Messungen in Tagen. */
  maxGapDays?: number;
}

export function seriesStats(points: SeriesPoint[]): SeriesStats {
  if (points.length === 0) return { count: 0 };
  let maxGap = 0;
  for (let i = 1; i < points.length; i++) maxGap = Math.max(maxGap, (points[i]!.t - points[i - 1]!.t) / 86_400_000);
  return {
    count: points.length,
    min: Math.min(...points.map((p) => p.value)),
    max: Math.max(...points.map((p) => p.value)),
    latest: points[points.length - 1],
    maxGapDays: points.length > 1 ? Math.round(maxGap * 10) / 10 : undefined,
  };
}

export function hasAnyMeasurement(m?: Measurements): boolean {
  if (!m) return false;
  return (
    METRICS.some((d) => typeof m[d.key] === 'number' && Number.isFinite(m[d.key] as number)) || (m.custom?.length ?? 0) > 0
  );
}
