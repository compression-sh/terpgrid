import { Download, Ruler, SlidersHorizontal, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLookup } from '../../app/DataProvider';
import { fmtDate, fmtDateTime, nowLocal, today } from '../../lib/dates';
import { type Activity, MEASURE_CONTEXTS, type MeasureContext, type Thresholds } from '../../lib/db/types';
import { CONTEXT_LABEL } from '../../lib/grow/measure';
import { DERIVED, METRICS, METRIC_BY_KEY, type MetricKey, type SeriesPoint, customMetricKeys, customSeries, derivedSeries, metricSeries, outOfRange, seriesCsv, seriesStats, withinDays } from '../../lib/grow/series';
import { fmt } from '../../lib/format';
import { EmptyState } from '../ui/EmptyState';

const SERIES_COLORS = ['#5fe39a', '#38bdf8', '#c084fc', '#fb923c', '#facc15', '#f472b6', '#a3e635', '#94a3b8'];
const RANGES = [
  { id: 0, label: 'Alle' },
  { id: 7, label: '7 Tage' },
  { id: 30, label: '30 Tage' },
  { id: 90, label: '90 Tage' },
];

interface MetricOption {
  id: string;
  label: string;
  unit: string;
  derived?: string;
  metric?: MetricKey;
  get: (acts: Activity[], plantId?: string, context?: MeasureContext | 'none') => SeriesPoint[];
}

type Point = SeriesPoint & { flag?: 'low' | 'high' };

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Punktform: außerhalb des Zielbereichs als Raute (nicht nur farblich unterscheidbar). */
function Dot(props: { cx?: number; cy?: number; payload?: Point; fill?: string }) {
  const { cx, cy, payload, fill } = props;
  if (cx === undefined || cy === undefined) return null;
  if (payload?.flag) return <path d={`M${cx} ${cy - 5.5}L${cx + 5.5} ${cy}L${cx} ${cy + 5.5}L${cx - 5.5} ${cy}Z`} fill="#fbbf24" stroke="#0b0f0e" strokeWidth={1} />;
  return <circle cx={cx} cy={cy} r={3.5} fill={fill} />;
}

/**
 * Diagramme der dokumentierten Messwerte. Nur erfasste Punkte werden gezeigt (berechnete
 * Größen sind als solche gekennzeichnet); Verbindungslinien sind gestrichelt und erklärt.
 */
export function MeasurementCharts({ activities, splitByPlant = true, thresholds, onEditThresholds, fileName = 'messwerte' }: { activities: Activity[]; splitByPlant?: boolean; thresholds?: Thresholds; onEditThresholds?: () => void; fileName?: string }) {
  const lookup = useLookup();
  const options: MetricOption[] = useMemo(() => {
    const base: MetricOption[] = METRICS.map((m) => ({ id: m.key, metric: m.key, label: m.label, unit: m.unit, get: (acts, plantId, context) => metricSeries(acts, m.key, { plantId, context }) }));
    const derived: MetricOption[] = DERIVED.map((d) => ({ id: d.key, label: d.label, unit: d.unit, derived: d.note, get: (acts, plantId) => derivedSeries(acts, d.key, plantId ? { plantId } : undefined) }));
    const custom: MetricOption[] = customMetricKeys(activities).map((c) => ({
      id: `custom:${c.label}|${c.unit}`,
      label: c.label,
      unit: c.unit,
      get: (acts, plantId) => customSeries(acts, c.label, c.unit, plantId ? { plantId } : undefined),
    }));
    return [...base, ...derived, ...custom].filter((o) => o.get(activities).length > 0);
  }, [activities]);

  const [selected, setSelected] = useState<string>();
  const [lines, setLines] = useState(true);
  const [table, setTable] = useState(false);
  const [days, setDays] = useState(0);
  const [context, setContext] = useState<MeasureContext | 'none' | ''>('');
  const opt = options.find((o) => o.id === selected) ?? options[0];
  const ctxKey = opt?.metric ? METRIC_BY_KEY[opt.metric].contextKey : undefined;
  const contexts = useMemo(() => {
    if (!ctxKey) return [];
    const set = new Set(activities.map((a) => (a.measurements && opt?.metric && a.measurements[opt.metric] !== undefined ? (a.measurements[ctxKey] ?? 'none') : null)).filter(Boolean));
    return [...set] as (MeasureContext | 'none')[];
  }, [activities, ctxKey, opt]);
  const range = opt ? thresholds?.[opt.id] : undefined;

  const series = useMemo(() => {
    if (!opt) return [];
    const ctx = ctxKey && context ? context : undefined;
    const flag = (p: SeriesPoint): Point => ({ ...p, flag: outOfRange(p.value, range) });
    const all = withinDays(opt.get(activities, undefined, ctx), days).map(flag);
    if (!splitByPlant) return [{ key: 'all', name: opt.label, points: all }];
    const byPlant = new Map<string, Point[]>();
    for (const p of all) {
      const k = p.plantId ?? 'grow';
      byPlant.set(k, [...(byPlant.get(k) ?? []), p]);
    }
    return [...byPlant.entries()].map(([k, points]) => ({ key: k, name: k === 'grow' ? 'Grow allgemein' : (lookup.plant.get(k)?.name ?? 'Pflanze'), points }));
  }, [opt, activities, splitByPlant, lookup, days, context, ctxKey, range]);

  if (!opt) {
    return <EmptyState compact icon={<Ruler />} title="Noch keine Messwerte" text="Höhe, Klima, pH, EC oder Licht über „Eintrag hinzufügen“ erfassen." />;
  }

  const flat = series.flatMap((s) => s.points.map((p) => ({ ...p, name: s.name }))).sort((a, b) => a.t - b.t);
  const stats = seriesStats(flat);
  const flagged = flat.filter((p) => p.flag).length;
  const unit = opt.unit ? ` ${opt.unit}` : '';
  const allT = flat.map((p) => p.t);
  const domain: [number, number] = allT.length ? [Math.min(...allT), Math.max(...allT)] : [0, 1];
  const singleDay = domain[1] - domain[0] < 86_400_000;
  const contextOf = (activityId: string) => {
    if (!ctxKey) return undefined;
    const c = activities.find((a) => a.id === activityId)?.measurements?.[ctxKey];
    return c ? CONTEXT_LABEL[c] : undefined;
  };
  const exportCsv = () =>
    download(
      `${fileName}-${opt.label.replace(/[^\wäöüÄÖÜß-]+/g, '_')}.csv`,
      seriesCsv(flat.map((p) => ({ date: p.date, ref: p.name, value: p.value, unit: opt.unit, context: contextOf(p.activityId), flag: p.flag === 'low' ? 'unter Zielbereich' : p.flag === 'high' ? 'über Zielbereich' : '' }))),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Messgröße">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={o.id === opt.id}
            onClick={() => {
              setSelected(o.id);
              setContext('');
            }}
            className={`rounded-full border px-2.5 py-1 text-xs ${o.id === opt.id ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-200' : 'border-white/[0.08] text-ink-400 hover:text-ink-200'} ${o.derived ? 'border-dashed' : ''}`}
          >
            {o.label}
            {o.unit && <span className="ml-1 text-ink-500">{o.unit}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/[0.07] p-0.5" role="radiogroup" aria-label="Zeitraum">
          {RANGES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={days === r.id} onClick={() => setDays(r.id)} className={`rounded-md px-2.5 py-1 text-[12px] ${days === r.id ? 'bg-white/[0.08] text-ink-50' : 'text-ink-400 hover:text-ink-200'}`}>
              {r.label}
            </button>
          ))}
        </div>
        {contexts.length > 0 && (
          <select className="input-base h-8 w-auto py-0 text-[12px]" aria-label="Messkontext" value={context} onChange={(e) => setContext(e.target.value as MeasureContext | 'none' | '')}>
            <option value="">Alle Kontexte</option>
            {MEASURE_CONTEXTS.filter((c) => contexts.includes(c)).map((c) => (
              <option key={c} value={c}>
                {CONTEXT_LABEL[c]}
              </option>
            ))}
            {contexts.includes('none') && <option value="none">ohne Kontextangabe</option>}
          </select>
        )}
        {onEditThresholds && !opt.id.startsWith('custom:') && (
          <button type="button" className="btn-ghost h-8 px-2.5 text-[12px]" onClick={onEditThresholds}>
            <SlidersHorizontal className="size-3.5" /> Eigene Zielbereiche
          </button>
        )}
      </div>

      {opt.derived && <p className="rounded-lg border border-dashed border-white/[0.1] px-3 py-2 text-[12px] text-ink-400">Berechnet, nicht gemessen: {opt.derived}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Messungen', String(stats.count)],
          ['Letzter Wert', stats.latest ? `${fmt(stats.latest.value)}${unit}` : '–'],
          ['Min – Max', stats.min !== undefined ? `${fmt(stats.min)} – ${fmt(stats.max!)}${unit}` : '–'],
          range ? ['Außerhalb Zielbereich', `${flagged} von ${stats.count}`] : ['Größte Lücke', stats.maxGapDays !== undefined ? `${fmt(stats.maxGapDays)} Tage` : '–'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
            <div className="text-[11px] text-ink-500">{k}</div>
            <div className="font-mono text-[13px] tabular text-ink-100">{v}</div>
          </div>
        ))}
      </div>

      {flat.length === 0 ? (
        <EmptyState compact title="Keine Messwerte in diesem Zeitraum" text="Zeitraum oder Kontext ändern." />
      ) : (
        <div className="h-64 w-full sm:h-72" role="img" aria-label={`Diagramm ${opt.label}: ${stats.count} Messpunkte${range ? `, ${flagged} außerhalb des eigenen Zielbereichs` : ''}. Werte auch als Tabelle verfügbar.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={singleDay ? [domain[0] - 43_200_000, domain[1] + 43_200_000] : domain}
                tickFormatter={(t: number) => fmtDate(today(new Date(t))).slice(0, 6)}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                allowDuplicatedCategory={false}
              />
              <YAxis dataKey="value" tickLine={false} axisLine={false} width={52} unit={unit} domain={['auto', 'auto']} />
              {range && (range.min !== undefined || range.max !== undefined) && <ReferenceArea y1={range.min} y2={range.max} fill="#5fe39a" fillOpacity={0.06} stroke="#5fe39a" strokeOpacity={0.25} strokeDasharray="3 3" ifOverflow="extendDomain" />}
              <Tooltip
                contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }}
                labelFormatter={(t: number) => fmtDateTime(nowLocal(new Date(t)))}
                formatter={(v: number, name: string, item: { payload?: Point }) => [`${fmt(v)}${unit}${item.payload?.flag === 'low' ? ' (unter Zielbereich)' : item.payload?.flag === 'high' ? ' (über Zielbereich)' : ''}`, name]}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  data={s.points}
                  dataKey="value"
                  name={s.name}
                  type="linear"
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={lines ? 1.5 : 0}
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                  dot={<Dot fill={SERIES_COLORS[i % SERIES_COLORS.length]} />}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="hint max-w-xl">
          Punkte = erfasste Messungen{range ? ', Rauten = außerhalb deines eigenen Zielbereichs (grüne Fläche – keine allgemeingültige Empfehlung)' : ''}. {lines ? 'Gestrichelte Linien verbinden nur aufeinanderfolgende Messpunkte.' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost py-1 text-xs" aria-pressed={lines} onClick={() => setLines((l) => !l)}>
            {lines ? 'Linien aus' : 'Linien an'}
          </button>
          <button type="button" className="btn-ghost py-1 text-xs" aria-expanded={table} onClick={() => setTable((t) => !t)}>
            <Table2 className="size-3.5" /> Tabelle
          </button>
          <button type="button" className="btn-ghost py-1 text-xs" onClick={exportCsv} disabled={!flat.length}>
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>

      {table && (
        <div className="max-h-72 overflow-auto rounded-lg border border-white/[0.06]">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-ink-850 text-ink-400">
              <tr>
                <th className="px-3 py-2 font-medium">Zeitpunkt</th>
                {splitByPlant && <th className="px-3 py-2 font-medium">Bezug</th>}
                {ctxKey && <th className="px-3 py-2 font-medium">Kontext</th>}
                <th className="px-3 py-2 text-right font-medium">{opt.label}</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              {[...flat].reverse().map((p) => (
                <tr key={`${p.activityId}-${p.name}`} className="border-t border-white/[0.04]">
                  <td className="px-3 py-1.5 text-ink-300">{fmtDateTime(p.date)}</td>
                  {splitByPlant && <td className="px-3 py-1.5 font-sans text-ink-400">{p.name}</td>}
                  {ctxKey && <td className="px-3 py-1.5 font-sans text-ink-400">{contextOf(p.activityId) ?? '–'}</td>}
                  <td className="px-3 py-1.5 text-right text-ink-100">
                    {fmt(p.value)}
                    {unit}
                    {p.flag && <span className="ml-1.5 font-sans text-[10px] text-amber-300">{p.flag === 'low' ? '↓ unter Ziel' : '↑ über Ziel'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
