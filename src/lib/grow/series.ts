import { labels } from '../../i18n';
import type { Activity, MeasureContext } from '../db/types';
import { dli, vpd } from './measure';

export type MetricKey =
  | 'heightCm'
  | 'temperatureC'
  | 'humidityPct'
  | 'ph'
  | 'ecMsCm'
  | 'waterTempC'
  | 'substrateTempC'
  | 'substrateMoisturePct'
  | 'co2Ppm'
  | 'leafTempC'
  | 'ppfd'
  | 'photoperiodH';

export type MetricGroup = 'plant' | 'climate' | 'water' | 'root' | 'light';
export const GROUP_LABEL = labels('labels.metricGroup', ['plant', 'climate', 'water', 'root', 'light'] as MetricGroup[]);

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  color: string;
  group: MetricGroup;
  /** Messkontext (pH/EC) – erlaubt Filter nach Gießwasser, Drainage usw. */
  contextKey?: 'phContext' | 'ecContext';
}

export const METRICS: MetricDef[] = [
  { key: 'heightCm', label: 'Höhe', unit: 'cm', min: 0, max: 600, step: 0.5, color: '#5fe39a', group: 'plant' },
  { key: 'temperatureC', label: 'Lufttemperatur', unit: '°C', min: -20, max: 60, step: 0.1, color: '#fb923c', group: 'climate' },
  { key: 'humidityPct', label: 'Rel. Luftfeuchte', unit: '%', min: 0, max: 100, step: 1, color: '#38bdf8', group: 'climate' },
  { key: 'leafTempC', label: 'Blatttemperatur', unit: '°C', min: -10, max: 50, step: 0.1, color: '#fdba74', group: 'climate' },
  { key: 'co2Ppm', label: 'CO₂', unit: 'ppm', min: 0, max: 5000, step: 10, color: '#94a3b8', group: 'climate' },
  { key: 'ph', label: 'pH', unit: '', min: 0, max: 14, step: 0.1, color: '#c084fc', group: 'water', contextKey: 'phContext' },
  { key: 'ecMsCm', label: 'EC', unit: 'mS/cm', min: 0, max: 20, step: 0.01, color: '#facc15', group: 'water', contextKey: 'ecContext' },
  { key: 'waterTempC', label: 'Wassertemperatur', unit: '°C', min: 0, max: 40, step: 0.1, color: '#67e8f9', group: 'water' },
  { key: 'substrateTempC', label: 'Substrattemperatur', unit: '°C', min: -10, max: 45, step: 0.1, color: '#d6a36b', group: 'root' },
  { key: 'substrateMoisturePct', label: 'Substratfeuchte', unit: '%', min: 0, max: 100, step: 1, color: '#60a5fa', group: 'root' },
  { key: 'ppfd', label: 'PPFD', unit: 'µmol/m²/s', min: 0, max: 3000, step: 1, color: '#fde047', group: 'light' },
  { key: 'photoperiodH', label: 'Lichtstunden', unit: 'h/Tag', min: 0, max: 24, step: 0.5, color: '#fef08a', group: 'light' },
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
export function metricSeries(activities: Activity[], key: MetricKey, filter?: { plantId?: string; context?: MeasureContext | 'none' }): SeriesPoint[] {
  const ck = METRIC_BY_KEY[key]?.contextKey;
  return activities
    .filter((a) => (filter?.plantId ? a.plantId === filter.plantId : true))
    .filter((a) => !filter?.context || !ck || (filter.context === 'none' ? !a.measurements?.[ck] : a.measurements?.[ck] === filter.context))
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

/** Abgeleitete Reihen – aus Rohwerten derselben Messung berechnet, nie gespeichert. */
export type DerivedKey = 'vpd' | 'dli';
export const DERIVED: { key: DerivedKey; label: string; unit: string; note: string }[] = [
  { key: 'vpd', label: 'VPD (berechnet)', unit: 'kPa', note: 'Aus Lufttemperatur, Luftfeuchte und ggf. Blatttemperatur derselben Messung. Ohne Blatttemperatur: Blatt = Luft angenommen.' },
  { key: 'dli', label: 'DLI (berechnet)', unit: 'mol/m²/Tag', note: 'PPFD × Lichtstunden × 3600 / 10⁶ – nimmt konstante PPFD über die ganze Lichtphase an.' },
];

export function derivedSeries(activities: Activity[], key: DerivedKey, filter?: { plantId?: string }): (SeriesPoint & { note?: string })[] {
  const out: (SeriesPoint & { note?: string })[] = [];
  for (const a of activities) {
    if (filter?.plantId && a.plantId !== filter.plantId) continue;
    const m = a.measurements;
    if (!m) continue;
    if (key === 'vpd') {
      const r = vpd(m);
      if (r) out.push({ date: a.date, t: toMs(a.date), value: r.value, activityId: a.id, plantId: a.plantId, note: r.basis });
    } else {
      const r = dli(m);
      if (r !== undefined) out.push({ date: a.date, t: toMs(a.date), value: r, activityId: a.id, plantId: a.plantId });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

/** Punkte außerhalb eines eigenen Zielbereichs (Grenzen inklusive = im Bereich). */
export function outOfRange(value: number, range?: { min?: number; max?: number }): 'low' | 'high' | undefined {
  if (!range) return undefined;
  if (range.min !== undefined && value < range.min) return 'low';
  if (range.max !== undefined && value > range.max) return 'high';
  return undefined;
}

/** Zeitraumfilter (letzte N Tage relativ zu `now`). */
export function withinDays<T extends { t: number }>(points: T[], days: number | undefined, now = Date.now()): T[] {
  if (!days) return points;
  const from = now - days * 86_400_000;
  return points.filter((p) => p.t >= from);
}

/** CSV (Semikolon, deutsches Dezimalkomma) für Tabellenprogramme. */
export function seriesCsv(rows: { date: string; ref: string; value: number; unit: string; context?: string; flag?: string }[]): string {
  const esc = (raw: string) => {
    const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; // keine Formel-Ausführung in Tabellenprogrammen
    return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const head = 'Zeitpunkt;Bezug;Wert;Einheit;Kontext;Zielbereich';
  return [head, ...rows.map((r) => [r.date.replace('T', ' '), esc(r.ref), String(r.value).replace('.', ','), r.unit, r.context ?? '', r.flag ?? ''].join(';'))].join('\r\n') + '\r\n';
}
