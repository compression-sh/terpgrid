import { BarChart3, BookOpenText, Camera, Download, FlaskRound, Leaf, Receipt, Ruler, Scale, SlidersHorizontal, Sprout } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../app/DataProvider';
import { href } from '../app/router';
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
import { computeInsights } from '../lib/insights';
import { METRICS } from '../lib/grow/series';
import { downloadFile } from '../lib/exporters';
import { type ExplorerRange, RANGE_LABEL, expenseCsv, journalCsv, labComparison, labCsv, measurementCsv, scopeData } from '../lib/explorer';

const tooltipStyle = { background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 };

function Kpi({ label, value, sub, missing }: { label: string; value: string; sub?: string; missing?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] px-3.5 py-3">
      <div className="text-[11px] text-ink-500">{label}</div>
      {missing ? (
        <div className="mt-1 text-[12px] leading-snug text-ink-500">{missing}</div>
      ) : (
        <>
          <div className="mt-0.5 text-xl font-semibold tabular tracking-tight text-ink-50">{value}</div>
          {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
        </>
      )}
    </div>
  );
}

function InsightsHeader() {
  const { data, settings } = useData();
  const t = today();
  const i = useMemo(() => computeInsights(data, t), [data, t]);
  const d = (n: number | null) => (n === null ? '–' : `${fmt(n, 1)} Tage`);
  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      <Kpi label="Aktive Grows" value={String(i.activeGrows)} sub={`${i.completedGrows} abgeschlossen`} />
      <Kpi label="Ø dokumentierte Grow-Dauer" value={d(i.avgGrowDays.value)} sub={`aus ${i.avgGrowDays.n} abgeschlossenen`} missing={i.avgGrowDays.missing} />
      <Kpi label="Pflanzen in aktiven Grows" value={String(i.activePlants)} sub={i.oldestPlantDays.value !== null ? `älteste ${i.oldestPlantDays.value} Tage · Ø ${fmt(i.avgPlantAgeDays.value ?? 0, 0)}` : undefined} />
      <Kpi label="Fotos (30 Tage)" value={String(i.photos30d)} sub={i.photosPerWeek12w.value !== null ? `Ø ${fmt(i.photosPerWeek12w.value, 1)} pro Woche (12 Wo.)` : undefined} />
      <Kpi label="Messungen" value={String(i.measurements)} sub={i.measurementKinds.length ? i.measurementKinds.map((k) => METRICS.find((m) => m.key === k)?.label ?? k).slice(0, 5).join(', ') : 'keine Messwerte erfasst'} />
      <Kpi label="Eigene Sorten" value={String(i.strains.total)} sub={`${i.strains.favorites} Favoriten · ${i.strains.fromDiscover} aus Discover · ${i.strains.withLab} mit Laborwerten`} />
      <Kpi label="Journal" value={String(i.journal.total)} sub={`${i.journal.last30d} in 30 Tagen${i.journal.avgRating.value !== null ? ` · Ø Bewertung ${fmt(i.journal.avgRating.value, 1)}` : ''}`} />
      <Kpi label="Ausgaben (12 Monate)" value={i.expenses12m.value !== null ? money(i.expenses12m.value, settings.currency) : '–'} sub={`${i.expenses12m.n} Posten`} missing={i.expenses12m.missing} />
    </div>
  );
}

function NoData({ text }: { text: string }) {
  return <EmptyState compact title="Noch keine Daten" text={text} />;
}

export function AnalyticsPage() {
  const { data, settings } = useData();
  const t = today();
  const [growFilter, setGrowFilter] = useState('');
  const [range, setRange] = useState<ExplorerRange>('all');
  const sd = useMemo(() => scopeData(data, { range, growId: growFilter }, t), [data, range, growFilter, t]);

  const durations = useMemo(() => growDurations(sd.grows, t), [sd.grows, t]);
  const byCat = useMemo(() => expensesByCategory(sd.expenses), [sd.expenses]);
  const byGrow = useMemo(() => expensesByGrow(sd.expenses, data.grows), [sd.expenses, data.grows]);
  const harvest = useMemo(() => harvestOutcomes(sd.plants, data.strains), [sd.plants, data.strains]);
  const ratings = useMemo(() => strainRatings(data.strains, sd.journal), [data.strains, sd.journal]);
  const heat = useMemo(() => photoActivity(sd.photos, t, 26), [sd.photos, t]);
  const journal = useMemo(() => journalSummary(sd.journal, t), [sd.journal, t]);
  const measurementActs = sd.activities;
  const lab = useMemo(() => labComparison(sd.labReports, data.strains), [sd.labReports, data.strains]);
  const scopeLabel = `${RANGE_LABEL[range]}${growFilter ? ` · ${data.grows.find((g) => g.id === growFilter)?.name ?? ''}` : ' · alle Grows'}`;
  const stamp = t;
  const exportsList = [
    { label: `Messwerte (${measurementActs.filter((a) => a.measurements).length})`, run: () => downloadFile(`terpgrid-messwerte-${stamp}.csv`, measurementCsv(measurementActs, data.grows, data.plants), 'text/csv;charset=utf-8') },
    { label: `Ausgaben (${sd.expenses.length})`, run: () => downloadFile(`terpgrid-ausgaben-${stamp}.csv`, expenseCsv(sd.expenses, data.grows, EXPENSE_CATEGORY_LABEL), 'text/csv;charset=utf-8') },
    { label: `Journal (${sd.journal.length})`, run: () => downloadFile(`terpgrid-journal-${stamp}.csv`, journalCsv(sd.journal, data.strains), 'text/csv;charset=utf-8') },
    { label: `Laborberichte (${lab.rows.length})`, run: () => downloadFile(`terpgrid-labor-${stamp}.csv`, labCsv(lab), 'text/csv;charset=utf-8') },
  ];

  const hasAny = data.grows.length + data.journal.length + data.photos.length + data.expenses.length + data.strains.length > 0;
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < heat.days.length; i += 7) weeks.push(heat.days.slice(i, i + 7));
  const level = (c: number) => (c === 0 ? 0 : heat.max <= 1 ? 4 : Math.min(4, Math.ceil((c / heat.max) * 4)));
  const shades = ['rgb(255 255 255 / 0.04)', 'rgb(52 199 123 / 0.25)', 'rgb(52 199 123 / 0.45)', 'rgb(52 199 123 / 0.7)', 'rgb(95 227 154 / 0.95)'];

  return (
    <div>
      <PageHeader
        title="Insights"
        subtitle="Kennzahlen und Auswertungen ausschließlich aus deinen eigenen Einträgen. Fehlende Werte werden nicht ergänzt; reicht die Datengrundlage nicht, steht das dabei. Keine Empfehlungen, keine Vorhersagen."
      />
      {!hasAny ? (
        <div className="card">
          <EmptyState icon={<BarChart3 />} title="Noch nichts auszuwerten" text="Sobald du Grows, Messwerte, Ausgaben, Sorten oder Journal-Einträge erfasst, erscheinen hier Diagramme. Es werden keine Beispieldaten angezeigt." />
        </div>
      ) : (
        <div className="space-y-5">
          <InsightsHeader />
          <section aria-label="Filter für die Auswertungen" className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.06] bg-ink-950/85 px-3 py-2.5 backdrop-blur-md">
            <SlidersHorizontal className="size-4 text-ink-500" aria-hidden />
            <select aria-label="Zeitraum" className="input-base h-9 w-auto text-[13px]" value={range} onChange={(e) => setRange(e.target.value as ExplorerRange)}>
              {(Object.keys(RANGE_LABEL) as ExplorerRange[]).map((r) => (
                <option key={r} value={r}>
                  {RANGE_LABEL[r]}
                </option>
              ))}
            </select>
            <select aria-label="Grow" className="input-base h-9 w-auto max-w-[14rem] text-[13px]" value={growFilter} onChange={(e) => setGrowFilter(e.target.value)}>
              <option value="">Alle Grows</option>
              {data.grows.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <span className="text-[11.5px] text-ink-500" aria-live="polite">
              {sd.activities.length} Einträge · {sd.expenses.length} Ausgaben · {sd.journal.length} Journal · {sd.photos.length} Fotos
            </span>
            <div className="ml-auto">
              <CsvMenu items={exportsList} />
            </div>
          </section>
          <p className="-mt-2 text-[11.5px] text-ink-500">
            Die Kacheln oben zeigen den Gesamtstand; alle Auswertungen darunter folgen dem Filter. Journal und Laborberichte erscheinen bei einem Grow-Filter nur, wenn sie über die Sorte einer Pflanze dieses Grows verknüpft sind.
          </p>
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
            subtitle={`Dokumentierte Messungen · ${scopeLabel}`}
            icon={<Ruler className="size-4" />}
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

            <Card title="Journal-Verlauf" subtitle={`${journal.total} Einträge im Filter · Monate der letzten 12 Monate`} icon={<BookOpenText className="size-4" />}>
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

            <Card title="Foto-Aktivität" subtitle="Aufnahmetage der letzten 26 Wochen (gefiltert)" icon={<Camera className="size-4" />}>
              {sd.photos.length === 0 ? (
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

          <Card title="Laborberichte im Vergleich" subtitle="Eigene Proben nebeneinander – Werte in %, aus mg/g umgerechnet (÷ 10); jede Zeile gilt nur für ihre Probe" icon={<FlaskRound className="size-4" />}>
            {lab.rows.length === 0 ? (
              <NoData text="Laborberichte unter „Laborberichte“ erfassen." />
            ) : (
              <LabTable cmp={lab} />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function CsvMenu({ items }: { items: { label: string; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-ghost h-9 py-0 text-[13px]" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download className="size-4" aria-hidden /> CSV-Export
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-white/[0.08] bg-ink-850 p-1 shadow-2xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] text-ink-500">Gefilterte Daten · lokal erzeugt, nichts wird hochgeladen</p>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-[13px] text-ink-200 hover:bg-white/[0.05] hover:text-ink-50"
              onClick={() => {
                it.run();
                setOpen(false);
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LabTable({ cmp }: { cmp: ReturnType<typeof labComparison> }) {
  const terps = cmp.terpenes.slice(0, 8);
  const pct = (v?: number) => (v === undefined ? '–' : `${fmt(v, 2)}`);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[12px]">
        <caption className="sr-only">Cannabinoide und Terpene eigener Laborberichte in Prozent</caption>
        <thead className="text-[11px] text-ink-500">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Probe</th>
            <th className="py-1.5 pr-3 text-right font-medium">THC</th>
            <th className="py-1.5 pr-3 text-right font-medium">THCA</th>
            <th className="py-1.5 pr-3 text-right font-medium">CBD</th>
            {terps.map((t) => (
              <th key={t.id} className="py-1.5 pr-3 text-right font-medium">
                {t.label}
              </th>
            ))}
            <th className="py-1.5 text-right font-medium">Terpene Σ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04] font-mono tabular text-ink-200">
          {cmp.rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-3 font-sans">
                <a href={href('lab-reports')} className="text-ink-100 hover:text-leaf-200">
                  {r.title}
                </a>
                <span className="block text-[10.5px] text-ink-500">
                  {[r.strain, r.labName, r.testDate ? fmtDate(r.testDate) : undefined, r.unit === 'mg/g' ? 'aus mg/g' : undefined].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td className="py-2 pr-3 text-right">{pct(r.thc)}</td>
              <td className="py-2 pr-3 text-right">{pct(r.thca)}</td>
              <td className="py-2 pr-3 text-right">{pct(r.cbd)}</td>
              {terps.map((t) => (
                <td key={t.id} className="py-2 pr-3 text-right">
                  {pct(r.terpenes[t.id])}
                </td>
              ))}
              <td className="py-2 text-right">{pct(r.terpeneTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint mt-2">Alle Angaben in Prozent. „–“ = im Bericht nicht angegeben. Unterschiede zwischen Proben sind keine Aussage über Ursachen.</p>
    </div>
  );
}
