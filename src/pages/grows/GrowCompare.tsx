import { AlertTriangle, ArrowLeft, Columns3, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../../app/DataProvider';
import { href, setQuery, useRoute } from '../../app/router';
import { money } from '../../components/grow/ExpenseList';
import { PhotoImg } from '../../components/photos/PhotoImg';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { fmtDate } from '../../lib/dates';
import { MEASURE_CONTEXTS, type MeasureContext } from '../../lib/db/types';
import { fmt } from '../../lib/format';
import { CONTEXT_LABEL } from '../../lib/grow/measure';
import { PHASE_LABEL } from '../../lib/grow/phases';
import { DERIVED, METRICS, type DerivedKey, type MetricKey } from '../../lib/grow/series';
import { contextsUsed, growData, seriesByGrowDay, summarizeGrow } from '../../lib/grow/summary';

const COLORS = ['#5fe39a', '#38bdf8', '#c084fc', '#fbbf24'];
const DASH = [undefined, '6 3', '2 3', '8 3 2 3'];
const MAX = 4;
const RANGES = [
  { id: 0, label: 'Alle Tage' },
  { id: 30, label: 'Tag 0–30' },
  { id: 60, label: 'Tag 0–60' },
  { id: 120, label: 'Tag 0–120' },
];

/** Vergleich von bis zu vier Grow-Projekten auf Basis dokumentierter Werte. */
export function GrowCompare() {
  const route = useRoute();
  const { data, settings } = useData();
  const ids = (route.query.get('ids') ?? '').split(',').filter((id) => data.grows.some((g) => g.id === id)).slice(0, MAX);
  const [metric, setMetric] = useState<MetricKey | DerivedKey>('heightCm');
  const [context, setContext] = useState<MeasureContext | 'none' | ''>('');
  const [range, setRange] = useState(0);
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < MAX ? [...ids, id] : ids;
    setQuery(route, { ids: next.join(',') || undefined });
  };
  const grows = ids.map((id) => data.grows.find((g) => g.id === id)!).filter(Boolean);
  const per = useMemo(() => grows.map((g) => ({ g, d: growData(g.id, data) })), [grows.map((g) => g.id).join(','), data]); // eslint-disable-line react-hooks/exhaustive-deps
  const summaries = per.map(({ g, d }) => summarizeGrow(g, d));
  const def = METRICS.find((m) => m.key === metric);
  const der = DERIVED.find((m) => m.key === metric);
  const unit = def?.unit ?? der?.unit ?? '';
  const ctxMetric = metric === 'ph' || metric === 'ecMsCm' ? metric : undefined;
  const mixed = ctxMetric && !context ? new Set(per.flatMap(({ d }) => contextsUsed(d.activities, ctxMetric))).size > 1 : false;
  const series = per.map(({ g, d }) => ({ g, pts: seriesByGrowDay(g, d.activities, metric, ctxMetric && context ? context : undefined).filter((p) => !range || p.day <= range) }));
  const available = [...METRICS, ...DERIVED].filter((m) => per.some(({ g, d }) => seriesByGrowDay(g, d.activities, m.key).length > 0));

  const rows: { label: string; value: (i: number) => string; hint?: string }[] = [
    { label: 'Start', value: (i) => fmtDate(summaries[i]!.grow.startDate) },
    { label: 'Dauer', value: (i) => (summaries[i]!.durationDays !== undefined ? `${summaries[i]!.durationDays} Tage${summaries[i]!.running ? ' (läuft)' : ''}` : 'keine Daten') },
    { label: 'Aktuelle Phase', value: (i) => (summaries[i]!.phase ? PHASE_LABEL[summaries[i]!.phase as keyof typeof PHASE_LABEL] : 'nicht erfasst') },
    { label: 'Pflanzen', value: (i) => String(summaries[i]!.plants) },
    { label: 'Max. Höhe', value: (i) => (summaries[i]!.maxHeightCm !== undefined ? `${fmt(summaries[i]!.maxHeightCm!)} cm` : 'keine Messung') },
    { label: 'Einträge / Messungen', value: (i) => `${summaries[i]!.activities} / ${summaries[i]!.measurements}` },
    { label: 'Fotos', value: (i) => String(summaries[i]!.photos) },
    { label: 'Ausgaben', value: (i) => (summaries[i]!.expenseCount ? money(summaries[i]!.expenses, settings.currency) : 'keine erfasst') },
    {
      label: 'Ergebnis (trocken)',
      value: (i) => (summaries[i]!.dryWeightG !== undefined ? `${fmt(summaries[i]!.dryWeightG!)} g (${summaries[i]!.plantsWithOutcome} von ${summaries[i]!.plants} Pfl.)` : 'nicht erfasst'),
      hint: 'Summe der erfassten Trockengewichte – Pflanzen ohne Angabe fehlen in der Summe.',
    },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Growlogs', to: 'grows' }, { label: 'Vergleich' }]}
        title="Grow-Vergleich"
        subtitle="Bis zu vier Projekte nebeneinander – nur dokumentierte Werte, Zeitachse in Grow-Tagen ab Start."
        actions={
          <a href={href('grows')} className="btn-ghost">
            <ArrowLeft className="size-4" /> Growlogs
          </a>
        }
      />

      <Card title="Projekte wählen" subtitle={`${ids.length} von höchstens ${MAX}`} className="mb-5">
        {data.grows.length < 2 ? (
          <p className="text-[13px] text-ink-400">Für einen Vergleich werden mindestens zwei Grow-Projekte benötigt.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {[...data.grows]
              .sort((a, b) => b.startDate.localeCompare(a.startDate))
              .map((g) => {
                const on = ids.includes(g.id);
                const i = ids.indexOf(g.id);
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={!on && ids.length >= MAX}
                      onClick={() => toggle(g.id)}
                      className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-[13px] transition-colors disabled:opacity-40 ${on ? 'border-leaf-500/40 bg-leaf-500/10 text-ink-50' : 'border-white/[0.08] text-ink-300 hover:border-white/[0.16]'}`}
                    >
                      {on && <span className="size-2.5 rounded-full" style={{ background: COLORS[i] }} aria-hidden />}
                      {g.name}
                      <span className="text-[11px] text-ink-500">{fmtDate(g.startDate)}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      {grows.length < 2 ? (
        <div className="card">
          <EmptyState icon={<Columns3 />} title="Zwei bis vier Projekte wählen" text="Der Vergleich zeigt Dauer, Pflanzen, Messwerte, Ausgaben, Ergebnisse und Fotos nebeneinander." />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Kennzahlen: Desktop als Tabelle, mobil als Karten je Projekt */}
          <Card title="Kennzahlen" bodyClassName="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-3 font-medium" scope="col">
                      <span className="sr-only">Kennzahl</span>
                    </th>
                    {grows.map((g, i) => (
                      <th key={g.id} className="px-4 py-3 font-medium normal-case tracking-normal" scope="col">
                        <a href={href(`grows/${g.id}`)} className="flex items-center gap-2 text-[13px] text-ink-100 hover:underline">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i] }} aria-hidden />
                          <span className="truncate">{g.name}</span>
                        </a>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-white/[0.04] last:border-0">
                      <th scope="row" className="px-4 py-2.5 font-normal text-ink-400" title={r.hint}>
                        {r.label}
                      </th>
                      {grows.map((g, i) => (
                        <td key={g.id} className={`px-4 py-2.5 font-mono tabular ${/keine|nicht/.test(r.value(i)) ? 'font-sans text-ink-500' : 'text-ink-100'}`}>
                          {r.value(i)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 md:hidden">
              {grows.map((g, i) => (
                <section key={g.id} className="rounded-xl border border-white/[0.06] p-3" aria-label={g.name}>
                  <a href={href(`grows/${g.id}`)} className="flex items-center gap-2 text-[14px] font-semibold text-ink-50">
                    <span className="size-2.5 rounded-full" style={{ background: COLORS[i] }} aria-hidden /> {g.name}
                  </a>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                    {rows.map((r) => (
                      <div key={r.label} className="min-w-0">
                        <dt className="text-ink-500">{r.label}</dt>
                        <dd className="truncate text-ink-100">{r.value(i)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </Card>

          <Card title="Verlauf" subtitle="X-Achse: Tage seit Projektstart. Nur gemessene Punkte; Linien verbinden Messungen.">
            {available.length === 0 ? (
              <EmptyState compact title="Keine Messwerte in diesen Projekten" />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <select className="input-base h-9 w-auto text-[13px]" aria-label="Messgröße" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey | DerivedKey)}>
                    {available.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                        {m.unit ? ` (${m.unit})` : ''}
                      </option>
                    ))}
                  </select>
                  {ctxMetric && (
                    <select className="input-base h-9 w-auto text-[13px]" aria-label="Messkontext" value={context} onChange={(e) => setContext(e.target.value as MeasureContext | 'none' | '')}>
                      <option value="">Alle Kontexte</option>
                      {MEASURE_CONTEXTS.map((c) => (
                        <option key={c} value={c}>
                          {CONTEXT_LABEL[c]}
                        </option>
                      ))}
                      <option value="none">ohne Kontextangabe</option>
                    </select>
                  )}
                  <select className="input-base h-9 w-auto text-[13px]" aria-label="Zeitraum" value={range} onChange={(e) => setRange(Number(e.target.value))}>
                    {RANGES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {mixed && (
                  <p className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-200">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Die Werte stammen aus verschiedenen Messkontexten (z. B. Gießwasser und Drainage) und sind so nicht direkt vergleichbar. Bitte einen Kontext wählen.
                  </p>
                )}
                {der && <p className="text-[12px] text-ink-400">Berechnet, nicht gemessen: {der.note}</p>}
                <div className="h-72 w-full" role="img" aria-label={`Verlauf ${def?.label ?? der?.label} für ${grows.map((g) => g.name).join(', ')}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="day" type="number" domain={[0, 'dataMax']} tickLine={false} axisLine={false} unit=" T" allowDuplicatedCategory={false} />
                      <YAxis dataKey="value" tickLine={false} axisLine={false} width={52} unit={unit ? ` ${unit}` : ''} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }}
                        labelFormatter={(d: number) => `Tag ${d}`}
                        formatter={(v: number, name: string) => [`${fmt(v)}${unit ? ` ${unit}` : ''}`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {series.map(({ g, pts }, i) => (
                        <Line key={g.id} data={pts} dataKey="value" name={g.name} stroke={COLORS[i]} strokeDasharray={DASH[i]} strokeWidth={1.6} dot={{ r: 3, fill: COLORS[i], strokeWidth: 0 }} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-400">
                  {series.map(({ g, pts }, i) => (
                    <li key={g.id}>
                      <span style={{ color: COLORS[i] }}>●</span> {g.name}: {pts.length ? `${pts.length} Messpunkte, ${fmt(Math.min(...pts.map((p) => p.value)))}–${fmt(Math.max(...pts.map((p) => p.value)))}${unit ? ` ${unit}` : ''}` : 'keine Werte'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Fotos" subtitle="Jeweils die neuesten Aufnahmen">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {per.map(({ g, d }, i) => {
                const latest = [...d.photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 4);
                return (
                  <section key={g.id} aria-label={`Fotos ${g.name}`}>
                    <p className="mb-1.5 flex items-center gap-2 text-[12px] text-ink-300">
                      <span className="size-2 rounded-full" style={{ background: COLORS[i] }} aria-hidden /> {g.name}
                    </p>
                    {latest.length ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        {latest.map((p) => (
                          <PhotoImg key={p.id} photoId={p.id} alt={`${g.name}, ${fmtDate(p.takenAt.slice(0, 10))}`} className="aspect-square w-full rounded-lg" />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-ink-500">Keine Fotos.</p>
                    )}
                  </section>
                );
              })}
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            {grows.map((g) => (
              <a key={g.id} href={href(`grows/${g.id}/report`)} className="btn-ghost">
                <FileText className="size-4" /> Bericht: {g.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
