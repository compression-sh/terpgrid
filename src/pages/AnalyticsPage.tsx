import { BarChart3, BookOpenText, Camera, Leaf, Receipt, Ruler, Scale, Sprout } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../app/DataProvider';
import { href } from '../app/router';
import { SelectField } from '../components/forms/Fields';
import { CATEGORY_COLOR, money } from '../components/grow/ExpenseList';
import { MeasurementCharts } from '../components/grow/MeasurementCharts';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { expensesByCategory, expensesByGrow, growDurations, harvestOutcomes, photoActivity, strainRatings } from '../lib/analytics';
import { fmtDate, today } from '../lib/dates';
import { EXPENSE_CATEGORY_LABEL } from '../lib/grow/labels';
import { PHASE_COLOR, PHASE_SHORT } from '../lib/grow/phases';
import { fmt } from '../lib/format';
import { journalSummary } from './JournalPage';

const tooltipStyle = { background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 };

function NoData({ text }: { text: string }) {
  return <EmptyState compact title="Noch keine Daten" text={text} />;
}

export function AnalyticsPage() {
  const { data, settings } = useData();
  const t = today();
  const [growFilter, setGrowFilter] = useState('');

  const durations = useMemo(() => growDurations(data.grows, t), [data.grows, t]);
  const byCat = useMemo(() => expensesByCategory(data.expenses), [data.expenses]);
  const byGrow = useMemo(() => expensesByGrow(data.expenses, data.grows), [data.expenses, data.grows]);
  const harvest = useMemo(() => harvestOutcomes(data.plants, data.strains), [data.plants, data.strains]);
  const ratings = useMemo(() => strainRatings(data.strains, data.journal), [data.strains, data.journal]);
  const heat = useMemo(() => photoActivity(data.photos, t, 26), [data.photos, t]);
  const journal = useMemo(() => journalSummary(data.journal, t), [data.journal, t]);
  const measurementActs = useMemo(() => data.activities.filter((a) => !growFilter || a.growId === growFilter), [data.activities, growFilter]);

  const hasAny = data.grows.length + data.journal.length + data.photos.length + data.expenses.length + data.strains.length > 0;
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < heat.days.length; i += 7) weeks.push(heat.days.slice(i, i + 7));
  const level = (c: number) => (c === 0 ? 0 : heat.max <= 1 ? 4 : Math.min(4, Math.ceil((c / heat.max) * 4)));
  const shades = ['rgb(255 255 255 / 0.04)', 'rgb(52 199 123 / 0.25)', 'rgb(52 199 123 / 0.45)', 'rgb(52 199 123 / 0.7)', 'rgb(95 227 154 / 0.95)'];

  return (
    <div>
      <PageHeader title="Analysen" subtitle="Auswertungen ausschließlich aus deinen eigenen Einträgen – fehlende Werte werden nicht ergänzt." />
      {!hasAny ? (
        <div className="card">
          <EmptyState icon={<BarChart3 />} title="Noch nichts auszuwerten" text="Sobald du Grows, Messwerte, Ausgaben, Sorten oder Journal-Einträge erfasst, erscheinen hier Diagramme. Es werden keine Beispieldaten angezeigt." />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Grow-Dauer" subtitle="Tage seit Start; laufende Grows bis heute" icon={<Sprout className="size-4" />}>
              {durations.length === 0 ? (
                <NoData text="Lege einen Grow an." />
              ) : (
                <ul className="space-y-3">
                  {durations.map((d) => {
                    const max = durations[0]!.days || 1;
                    const total = d.spans.reduce((s, x) => s + Math.max(1, x.days), 0) || 1;
                    return (
                      <li key={d.id}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                          <a href={href(`grows/${d.id}`)} className="truncate text-ink-100 hover:text-leaf-200">
                            {d.name}
                          </a>
                          <span className="shrink-0 font-mono text-ink-300">
                            {d.days} Tage{!d.completed && <span className="ml-1 text-[11px] text-ink-500">laufend</span>}
                          </span>
                        </div>
                        <div className="h-3 rounded-full bg-ink-700" style={{ width: `${Math.max(4, (d.days / max) * 100)}%` }}>
                          <div className="flex h-full overflow-hidden rounded-full">
                            {d.spans.length ? (
                              d.spans.map((s) => <div key={s.phase} title={`${PHASE_SHORT[s.phase]}: ${s.days} T.`} style={{ width: `${(Math.max(1, s.days) / total) * 100}%`, background: PHASE_COLOR[s.phase], opacity: 0.75 }} />)
                            ) : (
                              <div className="h-full w-full bg-ink-500" title="Keine Phasen erfasst" />
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="hint mt-4">Phasenanteile nur aus erfassten Meilensteinen. Graue Balken: keine Meilensteine erfasst.</p>
            </Card>

            <Card title="Ausgaben" subtitle={`Summe: ${money(byCat.reduce((s, c) => s + c.total, 0), settings.currency)}`} icon={<Receipt className="size-4" />}>
              {byCat.length === 0 ? (
                <NoData text="Ausgaben im Grow oder in der Sammlung erfassen." />
              ) : (
                <>
                  <div className="h-52" role="img" aria-label="Ausgaben nach Kategorie">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byCat.map((c) => ({ ...c, label: EXPENSE_CATEGORY_LABEL[c.category] }))} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => money(v, settings.currency).replace(/,00/, '')} />
                        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={84} />
                        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v: number) => [money(v, settings.currency), 'Summe']} />
                        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={26} isAnimationActive={false}>
                          {byCat.map((c) => (
                            <Cell key={c.category} fill={CATEGORY_COLOR[c.category]} fillOpacity={0.75} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-3 space-y-1 text-xs">
                    {byGrow.map((g) => (
                      <li key={g.id || 'none'} className="flex justify-between text-ink-300">
                        <span className="truncate">{g.name}</span>
                        <span className="font-mono text-ink-200">{money(g.total, settings.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>

          <Card
            title="Messwert-Verlauf"
            subtitle="Alle dokumentierten Messungen"
            icon={<Ruler className="size-4" />}
            actions={
              <div className="w-52">
                <SelectField label="" aria-label="Grow filtern" value={growFilter} onChange={setGrowFilter} placeholder="Alle Grows" options={data.grows.map((g) => ({ value: g.id, label: g.name }))} />
              </div>
            }
          >
            <MeasurementCharts activities={measurementActs} />
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Ernteergebnisse" subtitle="Trockengewicht je Pflanze (eigene Angaben)" icon={<Scale className="size-4" />}>
              {harvest.length === 0 ? (
                <NoData text="Ergebnis im Pflanzenprofil unter „Bearbeiten“ erfassen." />
              ) : (
                <>
                  <div className="h-56" role="img" aria-label="Trockengewicht je Pflanze">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={harvest.filter((h) => h.dryWeightG !== undefined)} margin={{ top: 4, right: 0, bottom: 0, left: -12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10 }} />
                        <YAxis tickLine={false} axisLine={false} unit=" g" width={56} />
                        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)} g`, 'Trocken']} />
                        <Bar dataKey="dryWeightG" fill="#fbbf24" fillOpacity={0.7} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="mt-3 w-full text-left text-xs">
                    <thead className="text-ink-500">
                      <tr>
                        <th className="py-1 font-medium">Pflanze</th>
                        <th className="py-1 font-medium">Sorte</th>
                        <th className="py-1 text-right font-medium">Nass</th>
                        <th className="py-1 text-right font-medium">Trocken</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-ink-200">
                      {harvest.map((h) => (
                        <tr key={h.plantId} className="border-t border-white/[0.04]">
                          <td className="py-1.5 font-sans">
                            <a className="hover:text-leaf-200" href={href(`grows/${h.growId}/plants/${h.plantId}`)}>
                              {h.name}
                            </a>
                            {h.harvestDate && <span className="ml-1 text-ink-500">{fmtDate(h.harvestDate)}</span>}
                          </td>
                          <td className="py-1.5 font-sans text-ink-400">{h.strain ?? '–'}</td>
                          <td className="py-1.5 text-right">{h.wetWeightG !== undefined ? `${fmt(h.wetWeightG)} g` : '–'}</td>
                          <td className="py-1.5 text-right">{h.dryWeightG !== undefined ? `${fmt(h.dryWeightG)} g` : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Card>

            <Card title="Sorten-Bewertungen" subtitle="Eigene Bewertung und Ø aus Journal" icon={<Leaf className="size-4" />}>
              {ratings.length === 0 ? (
                <NoData text="Sorten bewerten oder Journal-Einträge mit Bewertung anlegen." />
              ) : (
                <ul className="space-y-2.5">
                  {ratings.map((r) => (
                    <li key={r.id}>
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <a href={href(`strains/${r.id}`)} className="truncate text-ink-100 hover:text-leaf-200">
                          {r.name}
                        </a>
                        <span className="shrink-0 font-mono text-[11px] text-ink-400">
                          {r.rating !== undefined && `eigene ${r.rating}/5`}
                          {r.journalAvg !== undefined && ` · Journal Ø ${fmt(r.journalAvg)} (${r.journalCount})`}
                        </span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-1">
                        <div className="h-1.5 rounded-full bg-ink-700">
                          <div className="h-full rounded-full bg-amber-300/80" style={{ width: `${((r.rating ?? 0) / 5) * 100}%` }} />
                        </div>
                        <div className="h-1.5 rounded-full bg-ink-700">
                          <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${((r.journalAvg ?? 0) / 5) * 100}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Journal-Verlauf" subtitle={`${journal.total} Einträge · letzte 12 Monate`} icon={<BookOpenText className="size-4" />}>
              {journal.total === 0 ? (
                <NoData text="Das Journal ist optional." />
              ) : (
                <div className="h-48" role="img" aria-label="Journal-Einträge pro Monat">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={journal.months} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval={1} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v: number) => [v, 'Einträge']} />
                      <Bar dataKey="count" fill="#38bdf8" fillOpacity={0.65} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Foto-Aktivität" subtitle="Aufnahmetage der letzten 26 Wochen" icon={<Camera className="size-4" />}>
              {data.photos.length === 0 ? (
                <NoData text="Noch keine Fotos." />
              ) : (
                <>
                  <div className="overflow-x-auto pb-1">
                    <div className="flex gap-[3px]" role="img" aria-label="Foto-Heatmap">
                      {weeks.map((w) => (
                        <div key={w[0]!.date} className="flex flex-col gap-[3px]">
                          {w.map((d) => (
                            <div key={d.date} className="size-3 rounded-[3px]" style={{ background: shades[level(d.count)] }} title={`${fmtDate(d.date)}: ${d.count} Fotos`} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-ink-500">
                    weniger
                    {shades.map((s) => (
                      <span key={s} className="size-2.5 rounded-[2px]" style={{ background: s }} />
                    ))}
                    mehr
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
