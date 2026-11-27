import { BookOpenText, CalendarDays, Download, HeartHandshake, List, Paperclip, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { downloadFile, toCSVTable } from '../lib/exporters';
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
import { t, intlLocale } from '../i18n';

/** Rein beschreibende Zusammenfassung der erfassten Einträge (keine Wertung, keine Prognose). */
const monthFmt = () => new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** Einträge nach Monat gruppieren (Reihenfolge der Eingabe bleibt erhalten). */
export function byMonth<T extends { date: string }>(entries: T[]): [string, string, T[]][] {
  const out = new Map<string, T[]>();
  for (const e of entries) {
    const k = e.date.slice(0, 7);
    out.set(k, [...(out.get(k) ?? []), e]);
  }
  return [...out.entries()].map(([k, v]) => [k, /^\d{4}-\d{2}$/.test(k) ? monthFmt().format(new Date(`${k}-01T00:00:00Z`)) : t('mine.jp.noDate'), v]);
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
    if (!(await confirm({ title: t('mine.jp.deleteTitle'), message: t('mine.jp.deleteMsg', { date: fmtDateTime(entry.date), count: photos.length }), confirmLabel: t('common.delete'), tone: 'danger' }))) return;
    try {
      await deleteJournalEntry(entry.id);
      toast(t('mine.jp.deleted'));
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
                entry.strainName || t('mine.jp.noStrain')
              )}
            </h3>
            <Chip>{METHOD_LABEL[entry.method]}</Chip>
          </div>
          <div className="mt-0.5 text-[11px] text-ink-500">{fmtDateTime(entry.date)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Stars value={entry.rating} size="xs" />
          <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label={t('mine.jp.attach')} onClick={() => setModal('photo')}>
            <Paperclip className="size-3.5" />
          </button>
          <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label={t('common.edit')} onClick={() => setModal('edit')}>
            <Pencil className="size-3.5" />
          </button>
          <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5 hover:text-rose-300" aria-label={t('common.delete')} onClick={remove}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {entry.amount && (
          <div>
            <dt className="inline text-ink-500">{t('mine.jp.amount')} </dt>
            <dd className="inline font-mono text-ink-200">
              {fmt(entry.amount.value)} {entry.amount.unit}
            </dd>
          </div>
        )}
        {entry.thcPercent !== undefined && (
          <div>
            <dt className="inline text-ink-500">{t('mine.jp.thc')} </dt>
            <dd className="inline font-mono text-ink-200">{fmt(entry.thcPercent)} %</dd>
          </div>
        )}
        {entry.durationNote && (
          <div>
            <dt className="inline text-ink-500">{t('mine.jp.duration')} </dt>
            <dd className="inline text-ink-200">{entry.durationNote}</dd>
          </div>
        )}
      </dl>
      {(entry.tags?.length ?? 0) > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1" aria-label={t('mine.jp.tags')}>
          {entry.tags!.map((tg) => (
            <span key={tg} className="rounded-full border border-leaf-500/20 px-2 py-0.5 text-[11px] text-leaf-200">
              #{tg}
            </span>
          ))}
        </div>
      )}
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
  const [tag, setTag] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const allTags = useMemo(() => [...new Set(data.journal.flatMap((e) => e.tags ?? []))].sort((a, b) => a.localeCompare(b, 'de')), [data.journal]);
  const [month, setMonth] = useState(startOfMonth(today()));
  const [day, setDay] = useState<string>();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.journal
      .filter((e) => !method || e.method === method)
      .filter((e) => !strain || e.strainId === strain || (strain === '__free' && !e.strainId))
      .filter((e) => !mood || e.moods.includes(mood))
      .filter((e) => !tag || (e.tags ?? []).includes(tag))
      .filter((e) => !from || e.date.slice(0, 10) >= from)
      .filter((e) => !to || e.date.slice(0, 10) <= to)
      .filter((e) => !needle || [e.notes, e.durationNote, e.strainName, e.strainId && lookup.strain.get(e.strainId)?.name, ...e.moods, ...(e.tags ?? [])].some((x) => x && x.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.journal, q, method, strain, mood, tag, from, to, lookup]);
  const resetFilters = () => {
    setQ('');
    setMethod('');
    setStrain('');
    setMood('');
    setTag('');
    setFrom('');
    setTo('');
  };
  /** Gefilterte Einträge als CSV (lokal erzeugt, nichts wird gesendet). */
  const exportCsv = () => {
    const rows = filtered.map((e) => [
      e.date.replace('T', ' '),
      (e.strainId && lookup.strain.get(e.strainId)?.name) || e.strainName || '',
      METHOD_LABEL[e.method],
      e.amount ? String(e.amount.value).replace('.', ',') : '',
      e.amount?.unit ?? '',
      e.thcPercent !== undefined ? String(e.thcPercent).replace('.', ',') : '',
      e.rating ?? '',
      e.moods.join(', '),
      (e.tags ?? []).join(', '),
      e.durationNote,
      e.notes,
    ]);
    downloadFile(`terpgrid-journal-${today()}.csv`, `\uFEFF${toCSVTable(t('mine.jp.csvHead').split('|'), rows)}`, 'text/csv;charset=utf-8');
  };

  const summary = journalSummary(filtered, today());
  const markers = new Map<string, DayMarker[]>();
  for (const e of filtered) markers.set(e.date.slice(0, 10), [...(markers.get(e.date.slice(0, 10)) ?? []), { color: '#5fe39a', label: METHOD_LABEL[e.method] }]);
  const dayEntries = day ? filtered.filter((e) => e.date.startsWith(day)) : [];

  const activeFilters = [method, strain, mood, tag, from, to].filter(Boolean).length;
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches;
  return (
    <div>
      <PageHeader
        title={t('mine.jp.title')}
        subtitle={t('mine.jp.subtitle')}
        actions={
          <>
            <SharePicker store="journal" items={data.journal.map((j) => ({ id: j.id, title: j.strainName || t('mine.jp.entryFallback'), sub: new Date(j.date).toLocaleDateString(intlLocale()) }))} label={t('mine.jp.shareEntries')} />
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {t('mine.jp.entry')}
            </button>
          </>
        }
      />

      {data.journal.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpenText />}
            title={t('mine.jp.emptyTitle')}
            text={t('mine.jp.emptyText')}
            action={
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> {t('mine.jp.first')}
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
          <div className="min-w-0 space-y-5">
            <div className="card space-y-3 p-4">
              <label className="relative block space-y-1.5">
                <span className="label">{t('mine.jp.search')}</span>
                <Search className="pointer-events-none absolute left-3 top-[2.35rem] size-4 text-ink-500" />
                <input className="input-base pl-9" placeholder={t('mine.jp.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              {/* Mobil eingeklappt, damit Einträge ohne Scrollen sichtbar sind; ab sm immer offen */}
              <details className="group sm:[&>summary]:hidden" open={wide || activeFilters > 0 || undefined}>
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-[13px] text-ink-300 [&::-webkit-details-marker]:hidden">
                  <span>{t('mine.jp.filter')}{activeFilters > 0 ? t('mine.jp.active', { n: activeFilters }) : ''}</span>
                  <span className="text-ink-500 group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-3 grid gap-3 sm:mt-0 sm:grid-cols-3">
                  <SelectField label={t('mine.jp.method')} value={method} onChange={setMethod} placeholder={t('mine.jp.all')} options={CONSUMPTION_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
                  <SelectField label={t('mine.jp.strain')} value={strain} onChange={setStrain} placeholder={t('mine.jp.all')} options={[...data.strains.map((s) => ({ value: s.id, label: s.name })), { value: '__free', label: t('mine.jp.noLibStrain') }]} />
                  <SelectField label={t('mine.jp.mood')} value={mood} onChange={setMood} placeholder={t('mine.jp.all')} options={MOOD_OPTIONS.map((m) => ({ value: m, label: m }))} />
                  <SelectField label={t('mine.jp.tag')} value={tag} onChange={setTag} placeholder={allTags.length ? t('mine.jp.all') : t('mine.jp.noTags')} options={allTags.map((tg) => ({ value: tg, label: `#${tg}` }))} disabled={allTags.length === 0} />
                  <label className="space-y-1.5">
                    <span className="label">{t('mine.jp.from')}</span>
                    <input type="date" className="input-base" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="label">{t('mine.jp.to')}</span>
                    <input type="date" className="input-base" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                  </label>
                </div>
              </details>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
                {filtered.length} von {data.journal.length} Einträgen
                {(activeFilters > 0 || q) && (
                  <button type="button" className="btn-ghost h-7 px-2 text-[11.5px]" onClick={resetFilters}>
                    <RotateCcw className="size-3" /> {t('mine.jp.reset')}
                  </button>
                )}
                <button type="button" className="btn-ghost h-7 px-2 text-[11.5px]" onClick={exportCsv} disabled={filtered.length === 0} title={t('mine.jp.csvTitle')}>
                  <Download className="size-3" /> CSV
                </button>
              </span>
              <div className="w-56">
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'list', label: t('mine.jp.list') },
                    { value: 'calendar', label: t('mine.jp.calendar') },
                  ]}
                />
              </div>
            </div>
            {view === 'list' ? (
              filtered.length === 0 ? (
                <div className="card">
                  <EmptyState compact title={t('mine.jp.noHits')} />
                </div>
              ) : (
                <div className="space-y-6">
                  {byMonth(filtered).map(([key, label, entries]) => (
                    <section key={key} aria-label={label}>
                      <h2 className="mb-2 flex items-baseline justify-between px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                        {label}
                        <span className="font-normal normal-case tracking-normal text-ink-500">
                          {t('mine.jp.count', { count: entries.length })}
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
                <Card icon={<CalendarDays className="size-4" />} title={t('mine.jp.calendar')}>
                  <MonthCalendar month={month} onMonth={setMonth} markers={markers} selected={day} onSelect={setDay} />
                </Card>
                <div className="space-y-3">
                  {!day ? (
                    <div className="card p-5">
                      <p className="hint">{t('mine.jp.pickDay')}</p>
                    </div>
                  ) : dayEntries.length === 0 ? (
                    <div className="card">
                      <EmptyState compact title={t('mine.jp.noneOn', { date: fmtDateLong(day) })} />
                    </div>
                  ) : (
                    dayEntries.map((e) => <EntryCard key={e.id} entry={e} />)
                  )}
                </div>
              </div>
            )}
          </div>

          <aside className="min-w-0 space-y-5">
            <Card title={t('mine.jp.summary')} subtitle={t('mine.jp.summarySub')} icon={<List className="size-4" />}>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] text-ink-500">{t('mine.jp.entries')}</dt>
                  <dd className="font-mono text-xl tabular text-ink-50">{summary.total}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-500">{t('mine.jp.avgRating')}</dt>
                  <dd className="font-mono text-xl tabular text-ink-50">{summary.avgRating !== undefined ? fmt(summary.avgRating) : '–'}</dd>
                  <dd className="text-[10px] text-ink-500">{summary.ratedCount} bewertet</dd>
                </div>
              </dl>
              <div className="mt-4 h-36" role="img" aria-label={t('mine.jp.perMonth')}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.months} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [v, t('mine.jp.entries')]} />
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
                  <div className="text-[11px] text-ink-500">{t('mine.jp.topMoods')}</div>
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
              <Card title={t('mine.jp.harm')} icon={<HeartHandshake className="size-4" />}>
                <ul className="space-y-2 text-[13px] leading-relaxed text-ink-300">
                  <li>{t('mine.jp.harm1')}</li>
                  <li>{t('mine.jp.harm2')}</li>
                  <li>{t('mine.jp.harm3')}</li>
                  <li>{t('mine.jp.harm4')}</li>
                </ul>
                <p className="hint mt-3">
                  {t('mine.jp.harmSource')} <a className="underline" href={href('settings')}>{t('mine.jp.settings')}</a>.
                </p>
              </Card>
            )}
            <Callout tone="info">{t('mine.jp.only')}</Callout>
          </aside>
        </div>
      )}
      {creating && <JournalFormModal open onClose={() => setCreating(false)} />}
    </div>
  );
}
