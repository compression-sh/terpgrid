import { BookOpenText, CalendarDays, HeartHandshake, List, Paperclip, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { focusId, useFocusTarget } from '../app/useFocusTarget';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useConfirm } from '../app/Confirm';
import { useData, useLookup } from '../app/DataProvider';
import { errorText, useToast } from '../app/Toasts';
import { href } from '../app/router';
import { SelectField, Stars } from '../components/forms/Fields';
import { JournalFormModal } from '../components/forms/PersonalForms';
import { type DayMarker, MonthCalendar } from '../components/grow/MonthCalendar';
import { PhotoGrid } from '../components/photos/PhotoGrid';
import { PhotoUploadModal } from '../components/photos/PhotoUpload';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Segmented } from '../components/ui/Segmented';
import { addMonths, fmtDateLong, fmtDateTime, startOfMonth, today } from '../lib/dates';
import { deleteJournalEntry } from '../lib/db/repo';
import { CONSUMPTION_METHODS, type JournalEntry } from '../lib/db/types';
import { METHOD_LABEL, MOOD_OPTIONS } from '../lib/grow/labels';
import { fmt } from '../lib/format';
import { SharePicker } from '../components/collab/ShareDialog';

/** Rein beschreibende Zusammenfassung der erfassten Einträge (keine Wertung, keine Prognose). */
const MONTH_FMT = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** Einträge nach Monat gruppieren (Reihenfolge der Eingabe bleibt erhalten). */
export function byMonth<T extends { date: string }>(entries: T[]): [string, string, T[]][] {
  const out = new Map<string, T[]>();
  for (const e of entries) {
    const k = e.date.slice(0, 7);
    out.set(k, [...(out.get(k) ?? []), e]);
  }
  return [...out.entries()].map(([k, v]) => [k, /^\d{4}-\d{2}$/.test(k) ? MONTH_FMT.format(new Date(`${k}-01T00:00:00Z`)) : 'Ohne Datum', v]);
}

export function journalSummary(entries: JournalEntry[], ref: string) {
  const byMethod = CONSUMPTION_METHODS.map((m) => ({ method: m, count: entries.filter((e) => e.method === m).length })).filter((x) => x.count > 0);
  const rated = entries.filter((e) => e.rating !== undefined);
  const months: { key: string; label: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = addMonths(startOfMonth(ref), -i).slice(0, 7);
    months.push({ key: m, label: `${m.slice(5, 7)}/${m.slice(2, 4)}`, count: entries.filter((e) => e.date.startsWith(m)).length });
  }
  const moodCounts = new Map<string, number>();
  for (const e of entries) for (const m of e.moods) moodCounts.set(m, (moodCounts.get(m) ?? 0) + 1);
  return {
    total: entries.length,
    byMethod,
    avgRating: rated.length ? rated.reduce((s, e) => s + e.rating!, 0) / rated.length : undefined,
    ratedCount: rated.length,
    months,
    topMoods: [...moodCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

function EntryCard({ entry }: { entry: JournalEntry }) {
  const { data } = useData();
  const lookup = useLookup();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState<'edit' | 'photo' | null>(null);
  const photos = data.photos.filter((p) => p.journalId === entry.id);
  const strain = entry.strainId ? lookup.strain.get(entry.strainId) : undefined;

  async function remove() {
    if (!(await confirm({ title: 'Eintrag löschen?', message: `Journal-Eintrag vom ${fmtDateTime(entry.date)} inkl. ${photos.length} angehängter Fotos löschen?`, confirmLabel: 'Löschen', tone: 'danger' }))) return;
    try {
      await deleteJournalEntry(entry.id);
      toast('Eintrag gelöscht');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  return (
    <article id={focusId('journal', entry.id)} className="scroll-mt-24 rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink-50">
              {strain ? (
                <a href={href(`strains/${strain.id}`)} className="hover:text-leaf-200">
                  {strain.name}
                </a>
              ) : (
                entry.strainName || 'Ohne Sorte'
              )}
            </h3>
            <Chip>{METHOD_LABEL[entry.method]}</Chip>
          </div>
          <div className="mt-0.5 text-[11px] text-ink-500">{fmtDateTime(entry.date)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Stars value={entry.rating} size="xs" />
          <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label="Foto anhängen" onClick={() => setModal('photo')}>
            <Paperclip className="size-3.5" />
          </button>
          <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label="Bearbeiten" onClick={() => setModal('edit')}>
            <Pencil className="size-3.5" />
          </button>
          <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5 hover:text-rose-300" aria-label="Löschen" onClick={remove}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {entry.amount && (
          <div>
            <dt className="inline text-ink-500">Menge (Angabe): </dt>
            <dd className="inline font-mono text-ink-200">
              {fmt(entry.amount.value)} {entry.amount.unit}
            </dd>
          </div>
        )}
        {entry.thcPercent !== undefined && (
          <div>
            <dt className="inline text-ink-500">THC (Angabe): </dt>
            <dd className="inline font-mono text-ink-200">{fmt(entry.thcPercent)} %</dd>
          </div>
        )}
        {entry.durationNote && (
          <div>
            <dt className="inline text-ink-500">Dauer: </dt>
            <dd className="inline text-ink-200">{entry.durationNote}</dd>
          </div>
        )}
      </dl>
      {entry.moods.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {entry.moods.map((m) => (
            <span key={m} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-ink-300">
              {m}
            </span>
          ))}
        </div>
      )}
      {entry.notes && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-300">{entry.notes}</p>}
      {photos.length > 0 && (
        <div className="mt-3">
          <PhotoGrid photos={photos} group={false} dense />
        </div>
      )}
      {modal === 'edit' && <JournalFormModal open onClose={() => setModal(null)} entry={entry} />}
      {modal === 'photo' && <PhotoUploadModal open onClose={() => setModal(null)} target={{ journalId: entry.id, strainId: entry.strainId }} />}
    </article>
  );
}

export function JournalPage() {
  useFocusTarget('journal', 'entry');
  const { data, settings } = useData();
  const lookup = useLookup();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [strain, setStrain] = useState('');
  const [mood, setMood] = useState('');
  const [month, setMonth] = useState(startOfMonth(today()));
  const [day, setDay] = useState<string>();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.journal
      .filter((e) => !method || e.method === method)
      .filter((e) => !strain || e.strainId === strain || (strain === '__free' && !e.strainId))
      .filter((e) => !mood || e.moods.includes(mood))
      .filter((e) => !needle || [e.notes, e.durationNote, e.strainName, e.strainId && lookup.strain.get(e.strainId)?.name, ...e.moods].some((x) => x && x.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.journal, q, method, strain, mood, lookup]);

  const summary = journalSummary(filtered, today());
  const markers = new Map<string, DayMarker[]>();
  for (const e of filtered) markers.set(e.date.slice(0, 10), [...(markers.get(e.date.slice(0, 10)) ?? []), { color: '#5fe39a', label: METHOD_LABEL[e.method] }]);
  const dayEntries = day ? filtered.filter((e) => e.date.startsWith(day)) : [];

  const activeFilters = [method, strain, mood].filter(Boolean).length;
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches;
  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle="Optional und privat – deine eigenen Notizen zu Erfahrungen."
        actions={
          <>
            <SharePicker store="journal" items={data.journal.map((j) => ({ id: j.id, title: j.strainName || 'Journal-Eintrag', sub: new Date(j.date).toLocaleDateString('de-DE') }))} label="Einträge teilen …" />
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Eintrag
            </button>
          </>
        }
      />

      {data.journal.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpenText />}
            title="Noch keine Einträge"
            text="Halte Sorte, Konsumform, eigene Mengenangabe, Stimmung und Notizen fest. Es gibt keine Punkte, Ziele oder Vorhersagen – nur deine Aufzeichnungen."
            action={
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> Ersten Eintrag erstellen
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
          <div className="min-w-0 space-y-5">
            <div className="card space-y-3 p-4">
              <label className="relative block space-y-1.5">
                <span className="label">Suche</span>
                <Search className="pointer-events-none absolute left-3 top-[2.35rem] size-4 text-ink-500" />
                <input className="input-base pl-9" placeholder="Notizen, Sorte …" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              {/* Mobil eingeklappt, damit Einträge ohne Scrollen sichtbar sind; ab sm immer offen */}
              <details className="group sm:[&>summary]:hidden" open={wide || activeFilters > 0 || undefined}>
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-[13px] text-ink-300 [&::-webkit-details-marker]:hidden">
                  <span>Filter{activeFilters > 0 ? ` (${activeFilters} aktiv)` : ''}</span>
                  <span className="text-ink-500 group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-3 grid gap-3 sm:mt-0 sm:grid-cols-3">
                  <SelectField label="Konsumform" value={method} onChange={setMethod} placeholder="Alle" options={CONSUMPTION_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
                  <SelectField label="Sorte" value={strain} onChange={setStrain} placeholder="Alle" options={[...data.strains.map((s) => ({ value: s.id, label: s.name })), { value: '__free', label: 'Ohne Bibliotheks-Sorte' }]} />
                  <SelectField label="Stimmung" value={mood} onChange={setMood} placeholder="Alle" options={MOOD_OPTIONS.map((m) => ({ value: m, label: m }))} />
                </div>
              </details>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-400">
                {filtered.length} von {data.journal.length} Einträgen
              </span>
              <div className="w-56">
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'list', label: 'Liste' },
                    { value: 'calendar', label: 'Kalender' },
                  ]}
                />
              </div>
            </div>
            {view === 'list' ? (
              filtered.length === 0 ? (
                <div className="card">
                  <EmptyState compact title="Keine Treffer" />
                </div>
              ) : (
                <div className="space-y-6">
                  {byMonth(filtered).map(([key, label, entries]) => (
                    <section key={key} aria-label={label}>
                      <h2 className="mb-2 flex items-baseline justify-between px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                        {label}
                        <span className="font-normal normal-case tracking-normal text-ink-500">
                          {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}
                        </span>
                      </h2>
                      <div className="space-y-3">
                        {entries.map((e) => (
                          <EntryCard key={e.id} entry={e} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )
            ) : (
              <div className="grid gap-5 xl:grid-cols-2">
                <Card icon={<CalendarDays className="size-4" />} title="Kalender">
                  <MonthCalendar month={month} onMonth={setMonth} markers={markers} selected={day} onSelect={setDay} />
                </Card>
                <div className="space-y-3">
                  {!day ? (
                    <div className="card p-5">
                      <p className="hint">Tag auswählen, um Einträge zu sehen.</p>
                    </div>
                  ) : dayEntries.length === 0 ? (
                    <div className="card">
                      <EmptyState compact title={`Keine Einträge am ${fmtDateLong(day)}`} />
                    </div>
                  ) : (
                    dayEntries.map((e) => <EntryCard key={e.id} entry={e} />)
                  )}
                </div>
              </div>
            )}
          </div>

          <aside className="min-w-0 space-y-5">
            <Card title="Zusammenfassung" subtitle="Rein beschreibend, aus den gefilterten Einträgen" icon={<List className="size-4" />}>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] text-ink-500">Einträge</dt>
                  <dd className="font-mono text-xl tabular text-ink-50">{summary.total}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-500">Ø Bewertung</dt>
                  <dd className="font-mono text-xl tabular text-ink-50">{summary.avgRating !== undefined ? fmt(summary.avgRating) : '–'}</dd>
                  <dd className="text-[10px] text-ink-500">{summary.ratedCount} bewertet</dd>
                </div>
              </dl>
              <div className="mt-4 h-36" role="img" aria-label="Einträge pro Monat (letzte 12 Monate)">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.months} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [v, 'Einträge']} />
                    <Bar dataKey="count" fill="#34c77b" fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {summary.byMethod.length > 0 && (
                <ul className="mt-4 space-y-1 text-xs">
                  {summary.byMethod.map((m) => (
                    <li key={m.method} className="flex justify-between text-ink-300">
                      <span>{METHOD_LABEL[m.method]}</span>
                      <span className="font-mono text-ink-200">{m.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.topMoods.length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] text-ink-500">Häufigste Stimmungs-Notizen</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {summary.topMoods.map(([m, c]) => (
                      <span key={m} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-ink-300">
                        {m} · {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
            {settings.showHarmReduction && (
              <Card title="Hinweise zur Risikominderung" icon={<HeartHandshake className="size-4" />}>
                <ul className="space-y-2 text-[13px] leading-relaxed text-ink-300">
                  <li>• Weniger und seltener ist risikoärmer. Pausen senken die Toleranz.</li>
                  <li>• Edibles wirken verzögert – vor erneutem Konsum die volle Wirkzeit abwarten.</li>
                  <li>• Nicht mit Alkohol oder anderen Substanzen mischen.</li>
                  <li>• Nach Konsum nicht fahren. Beeinträchtigungen können Stunden anhalten.</li>
                </ul>
                <p className="hint mt-3">
                  Quelle: Lower-Risk Cannabis Use Guidelines (Fischer et al. 2022). Ausblendbar in den <a className="underline" href={href('settings')}>Einstellungen</a>.
                </p>
              </Card>
            )}
            <Callout tone="info">Das Journal zeigt nur, was du eingetragen hast. Es erstellt keine Wirkungsvorhersagen und vergibt keine Punkte oder Ziele.</Callout>
          </aside>
        </div>
      )}
      {creating && <JournalFormModal open onClose={() => setCreating(false)} />}
    </div>
  );
}
