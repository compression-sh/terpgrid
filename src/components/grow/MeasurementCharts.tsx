import { Ruler, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLookup } from '../../app/DataProvider';
import { fmtDate, fmtDateTime, nowLocal, today } from '../../lib/dates';
import type { Activity } from '../../lib/db/types';
import { METRICS, type SeriesPoint, customMetricKeys, customSeries, metricSeries, seriesStats } from '../../lib/grow/series';
import { fmt } from '../../lib/format';
import { EmptyState } from '../ui/EmptyState';

const SERIES_COLORS = ['#5fe39a', '#38bdf8', '#c084fc', '#fb923c', '#facc15', '#f472b6', '#a3e635', '#94a3b8'];

interface MetricOption {
  id: string;
  label: string;
  unit: string;
  get: (acts: Activity[], plantId?: string) => SeriesPoint[];
}

/**
 * Diagramme der dokumentierten Messwerte. Nur erfasste Punkte werden gezeigt;
 * optionale Verbindungslinien sind gestrichelt und als solche erklärt.
 */
export function MeasurementCharts({ activities, splitByPlant = true }: { activities: Activity[]; splitByPlant?: boolean }) {
  const lookup = useLookup();
  const options: MetricOption[] = useMemo(() => {
    const base: MetricOption[] = METRICS.map((m) => ({ id: m.key, label: m.label, unit: m.unit, get: (acts, plantId) => metricSeries(acts, m.key, plantId ? { plantId } : undefined) }));
    const custom: MetricOption[] = customMetricKeys(activities).map((c) => ({
      id: `custom:${c.label}|${c.unit}`,
      label: c.label,
      unit: c.unit,
      get: (acts, plantId) => customSeries(acts, c.label, c.unit, plantId ? { plantId } : undefined),
    }));
    return [...base, ...custom].filter((o) => o.get(activities).length > 0);
  }, [activities]);

  const [selected, setSelected] = useState<string>();
  const [lines, setLines] = useState(true);
  const [table, setTable] = useState(false);
  const opt = options.find((o) => o.id === selected) ?? options[0];

  const series = useMemo(() => {
    if (!opt) return [];
    const all = opt.get(activities);
    if (!splitByPlant) return [{ key: 'all', name: opt.label, points: all }];
    const byPlant = new Map<string, SeriesPoint[]>();
    for (const p of all) {
      const k = p.plantId ?? 'grow';
      byPlant.set(k, [...(byPlant.get(k) ?? []), p]);
    }
    return [...byPlant.entries()].map(([k, points]) => ({ key: k, name: k === 'grow' ? 'Grow allgemein' : (lookup.plant.get(k)?.name ?? 'Pflanze'), points }));
  }, [opt, activities, splitByPlant, lookup]);

  if (!opt) {
    return <EmptyState compact icon={<Ruler />} title="Noch keine Messwerte" text="Höhe, Temperatur, Luftfeuchte, pH oder EC über „Eintrag hinzufügen“ erfassen." />;
  }

  const stats = seriesStats(series.flatMap((s) => s.points).sort((a, b) => a.t - b.t));
  const allT = series.flatMap((s) => s.points.map((p) => p.t));
  const domain: [number, number] = [Math.min(...allT), Math.max(...allT)];
  const singleDay = domain[1] - domain[0] < 86_400_000;
  const unit = opt.unit ? ` ${opt.unit}` : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Messgröße">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={o.id === opt.id}
            onClick={() => setSelected(o.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${o.id === opt.id ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-200' : 'border-white/[0.08] text-ink-400 hover:text-ink-200'}`}
          >
            {o.label}
            {o.unit && <span className="ml-1 text-ink-500">{o.unit}</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Messungen', String(stats.count)],
          ['Letzter Wert', stats.latest ? `${fmt(stats.latest.value)}${unit}` : '–'],
          ['Min – Max', stats.min !== undefined ? `${fmt(stats.min)} – ${fmt(stats.max!)}${unit}` : '–'],
          ['Größte Lücke', stats.maxGapDays !== undefined ? `${fmt(stats.maxGapDays)} Tage` : '–'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
            <div className="text-[11px] text-ink-500">{k}</div>
            <div className="font-mono text-[13px] tabular text-ink-100">{v}</div>
          </div>
        ))}
      </div>

      <div className="h-64 w-full sm:h-72" role="img" aria-label={`Diagramm ${opt.label}: ${stats.count} Messpunkte`}>
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
            <Tooltip
              contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }}
              labelFormatter={(t: number) => fmtDateTime(nowLocal(new Date(t)))}
              formatter={(v: number, name: string) => [`${fmt(v)}${unit}`, name]}
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
                dot={{ r: 3.5, strokeWidth: 0, fill: SERIES_COLORS[i % SERIES_COLORS.length] }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="hint max-w-xl">
          Punkte = erfasste Messungen. {lines ? 'Gestrichelte Linien verbinden nur aufeinanderfolgende Messpunkte – Werte dazwischen wurden nicht gemessen.' : 'Ohne Verbindungslinien.'}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost py-1 text-xs" aria-pressed={lines} onClick={() => setLines((l) => !l)}>
            {lines ? 'Linien ausblenden' : 'Linien einblenden'}
          </button>
          <button type="button" className="btn-ghost py-1 text-xs" aria-expanded={table} onClick={() => setTable((t) => !t)}>
            <Table2 className="size-3.5" /> Tabelle
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
                <th className="px-3 py-2 text-right font-medium">{opt.label}</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              {series
                .flatMap((s) => s.points.map((p) => ({ ...p, name: s.name })))
                .sort((a, b) => b.t - a.t)
                .map((p) => (
                  <tr key={`${p.activityId}-${p.name}`} className="border-t border-white/[0.04]">
                    <td className="px-3 py-1.5 text-ink-300">{fmtDateTime(p.date)}</td>
                    {splitByPlant && <td className="px-3 py-1.5 font-sans text-ink-400">{p.name}</td>}
                    <td className="px-3 py-1.5 text-right text-ink-100">
                      {fmt(p.value)}
                      {unit}
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
