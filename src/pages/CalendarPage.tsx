import { BellOff, CalendarDays, Check, ChevronLeft, ChevronRight, Download, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../app/Confirm';
import { useData, useLookup } from '../app/DataProvider';
import { errorText, useToast } from '../app/Toasts';
import { href, setQuery, useRoute } from '../app/router';
import { SelectField } from '../components/forms/Fields';
import { ReminderFormModal } from '../components/forms/PersonalForms';
import { ACTIVITY_ICON } from '../components/grow/ActivityTimeline';
import { type DayMarker, MonthCalendar } from '../components/grow/MonthCalendar';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Segmented } from '../components/ui/Segmented';
import { type Occurrence, occurrencesInRange, overdue, remindersToIcs, safeRepeat } from '../lib/calendar';
import { addDays, fmtDateLong, fmtDateShort, monthGrid, startOfMonth, startOfWeek, today, weekDays } from '../lib/dates';
import { deleteSimple, toggleReminderCompletion } from '../lib/db/repo';
import { REMINDER_CATEGORIES, type Reminder } from '../lib/db/types';
import { downloadFile } from '../lib/exporters';
import { ACTIVITY_LABEL, METHOD_LABEL, REMINDER_CATEGORY_LABEL } from '../lib/grow/labels';
import { PHASE_COLOR, PHASE_LABEL } from '../lib/grow/phases';

type Kind = 'reminder' | 'activity' | 'photo' | 'milestone' | 'journal';
const KIND_META: Record<Kind, { label: string; color: string }> = {
  reminder: { label: 'Erinnerungen', color: '#fb923c' },
  activity: { label: 'Grow-Einträge', color: '#5fe39a' },
  photo: { label: 'Fotos', color: '#dfe7e3' },
  milestone: { label: 'Meilensteine', color: '#c084fc' },
  journal: { label: 'Journal', color: '#38bdf8' },
};

interface CalEvent {
  key: string;
  kind: Kind;
  date: string;
  time?: string;
  title: string;
  sub?: string;
  to?: string;
  color: string;
  occurrence?: Occurrence;
}

function repeatText(r: Reminder): string {
  const rep = safeRepeat(r.repeat);
  if (rep.kind === 'none') return 'einmalig';
  const n = rep.interval;
  const base = rep.kind === 'daily' ? (n === 1 ? 'täglich' : `alle ${n} Tage`) : n === 1 ? 'wöchentlich' : `alle ${n} Wochen`;
  return rep.until ? `${base} bis ${fmtDateShort(rep.until)}` : base;
}

/** Listenansicht: Zeitraum ab dem gewählten Tag */
const LIST_DAYS = 30;

export function CalendarPage() {
  const { data } = useData();
  const lookup = useLookup();
  const route = useRoute();
  const toast = useToast();
  const confirm = useConfirm();
  const t = today();
  const [view, setView] = useState<'month' | 'week' | 'list'>(() => (['week', 'list'].includes(route.query.get('view') ?? '') ? (route.query.get('view') as 'week' | 'list') : 'month'));
  const [cursor, setCursor] = useState(t);
  const [selected, setSelected] = useState(t);
  const [growId, setGrowId] = useState(route.query.get('grow') ?? '');
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(['reminder', 'activity', 'photo', 'milestone']));
  const [form, setForm] = useState<{ reminder?: Reminder; date?: string } | null>(null);

  useEffect(() => {
    if (route.query.get('new') === '1') {
      setForm({ date: t });
      setQuery(route, { new: undefined });
    }
  }, [route, t]);

  const range = useMemo(() => {
    if (view === 'month') {
      const g = monthGrid(cursor);
      return { from: g[0]!, to: g[41]! };
    }
    if (view === 'list') return { from: cursor, to: addDays(cursor, LIST_DAYS - 1) };
    const w = weekDays(cursor);
    return { from: w[0]!, to: w[6]! };
  }, [view, cursor]);

  const events = useMemo(() => {
    const out: CalEvent[] = [];
    const inRange = (d: string) => d >= range.from && d <= range.to;
    const growOk = (g?: string) => !growId || g === growId;
    if (kinds.has('reminder')) {
      for (const o of occurrencesInRange(data.reminders.filter((r) => growOk(r.growId)), range.from, range.to)) {
        out.push({
          key: `r-${o.reminder.id}-${o.date}`,
          kind: 'reminder',
          date: o.date,
          time: o.reminder.time,
          title: o.reminder.title,
          sub: [REMINDER_CATEGORY_LABEL[o.reminder.category], o.reminder.growId && lookup.grow.get(o.reminder.growId)?.name].filter(Boolean).join(' · '),
          color: o.done ? '#5f6d68' : KIND_META.reminder.color,
          occurrence: o,
        });
      }
    }
    if (kinds.has('activity')) {
      for (const a of data.activities) {
        const d = a.date.slice(0, 10);
        if (!inRange(d) || !growOk(a.growId) || a.type === 'photo') continue;
        const g = lookup.grow.get(a.growId);
        const p = a.plantId ? lookup.plant.get(a.plantId) : undefined;
        out.push({ key: `a-${a.id}`, kind: 'activity', date: d, time: a.date.slice(11, 16), title: a.title || ACTIVITY_LABEL[a.type], sub: [g?.name, p?.name].filter(Boolean).join(' · '), to: `grows/${a.growId}${p ? `/plants/${p.id}` : '?tab=log'}`, color: a.type === 'issue' ? '#fbbf24' : KIND_META.activity.color });
      }
    }
    if (kinds.has('photo')) {
      const byDay = new Map<string, number>();
      for (const p of data.photos) {
        const d = p.takenAt.slice(0, 10);
        if (inRange(d) && growOk(p.growId)) byDay.set(d, (byDay.get(d) ?? 0) + 1);
      }
      for (const [d, n] of byDay) out.push({ key: `p-${d}`, kind: 'photo', date: d, title: n === 1 ? '1 Foto' : `${n} Fotos`, to: `photos?from=${d}&to=${d}${growId ? `&grow=${growId}` : ''}`, color: KIND_META.photo.color });
    }
    if (kinds.has('milestone')) {
      for (const g of data.grows) {
        if (!growOk(g.id)) continue;
        for (const [phase, d] of Object.entries(g.phaseDates)) {
          if (d && inRange(d)) out.push({ key: `m-${g.id}-${phase}`, kind: 'milestone', date: d, title: `${PHASE_LABEL[phase as keyof typeof PHASE_LABEL]}`, sub: g.name, to: `grows/${g.id}`, color: PHASE_COLOR[phase as keyof typeof PHASE_COLOR] });
        }
      }
    }
    if (kinds.has('journal') && !growId) {
      for (const j of data.journal) {
        const d = j.date.slice(0, 10);
        if (inRange(d)) out.push({ key: `j-${j.id}`, kind: 'journal', date: d, time: j.date.slice(11, 16), title: `Journal · ${METHOD_LABEL[j.method]}`, sub: (j.strainId && lookup.strain.get(j.strainId)?.name) || j.strainName, to: 'journal', color: KIND_META.journal.color });
      }
    }
    return out.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
  }, [data, range, kinds, growId, lookup]);

  const markers = new Map<string, DayMarker[]>();
  for (const e of events) markers.set(e.date, [...(markers.get(e.date) ?? []), { color: e.color, label: e.title }]);
  const dayEvents = events.filter((e) => e.date === selected);
  const late = overdue(data.reminders.filter((r) => !growId || r.growId === growId), t, 30);

  async function toggle(o: Occurrence) {
    try {
      await toggleReminderCompletion(o.reminder, o.date);
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }
  async function removeReminder(r: Reminder) {
    if (!(await confirm({ title: 'Erinnerung löschen?', message: `„${r.title}“ (${repeatText(r)}) wird inkl. aller Wiederholungen entfernt.`, confirmLabel: 'Löschen', tone: 'danger' }))) return;
    try {
      await deleteSimple('reminders', r.id);
      toast('Erinnerung gelöscht');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }
  function exportIcs() {
    const list = data.reminders.filter((r) => !growId || r.growId === growId);
    downloadFile(`terpgrid-erinnerungen-${t}.ics`, remindersToIcs(list), 'text/calendar');
    toast(`${list.length} ${list.length === 1 ? 'Erinnerung' : 'Erinnerungen'} als ICS exportiert`);
  }

  const toggleKind = (k: Kind) =>
    setKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const EventRow = ({ e }: { e: CalEvent }) => {
    const r = e.occurrence?.reminder;
    const Icon = e.kind === 'activity' ? (ACTIVITY_ICON[data.activities.find((a) => `a-${a.id}` === e.key)?.type ?? 'observation'] ?? CalendarDays) : null;
    return (
      <li className="flex items-start gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
        {e.occurrence ? (
          <button
            type="button"
            onClick={() => toggle(e.occurrence!)}
            aria-label={e.occurrence.done ? 'Als offen markieren' : 'Als erledigt markieren'}
            aria-pressed={e.occurrence.done}
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${e.occurrence.done ? 'border-leaf-500 bg-leaf-500 text-ink-950' : 'border-white/25 text-transparent hover:border-leaf-400 hover:text-leaf-400'}`}
          >
            <Check className="size-3.5" />
          </button>
        ) : (
          <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
        )}
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1.5 text-[13px] ${e.occurrence?.done ? 'text-ink-500 line-through' : 'text-ink-100'}`}>
            {Icon && <Icon className="size-3.5 text-ink-400" />}
            {e.to ? (
              <a href={href(e.to)} className="truncate hover:text-leaf-200">
                {e.title}
              </a>
            ) : (
              <span className="truncate">{e.title}</span>
            )}
          </div>
          <div className="text-[11px] text-ink-500">
            {e.time && `${e.time} · `}
            {e.sub}
            {r && safeRepeat(r.repeat).kind !== 'none' && (
              <span className="ml-1 inline-flex items-center gap-0.5">
                · <Repeat className="size-3" /> {repeatText(r)}
              </span>
            )}
          </div>
        </div>
        {r && (
          <div className="flex shrink-0 gap-0.5">
            <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label="Bearbeiten" onClick={() => setForm({ reminder: r })}>
              <Pencil className="size-3.5" />
            </button>
            <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5 hover:text-rose-300" aria-label="Löschen" onClick={() => removeReminder(r)}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div>
      <PageHeader
        title="Kalender"
        subtitle="Dokumentierte Aktivitäten, Meilensteine und eigene Erinnerungen."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={exportIcs} disabled={data.reminders.length === 0}>
              <Download className="size-4" /> ICS-Export
            </button>
            <button type="button" className="btn-primary" onClick={() => setForm({ date: selected >= t ? selected : t })}>
              <Plus className="size-4" /> Erinnerung
            </button>
          </>
        }
      />

      <div className="card mb-5 flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ereignistypen">
          {(Object.keys(KIND_META) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kinds.has(k)}
              onClick={() => toggleKind(k)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${kinds.has(k) ? 'border-white/20 bg-white/[0.05] text-ink-100' : 'border-white/[0.06] text-ink-500'}`}
            >
              <span className="size-2 rounded-full" style={{ background: kinds.has(k) ? KIND_META[k].color : 'transparent', border: `1px solid ${KIND_META[k].color}` }} />
              {KIND_META[k].label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:w-[28rem]">
          <SelectField label="Grow" value={growId} onChange={setGrowId} placeholder="Alle Grows" options={data.grows.map((g) => ({ value: g.id, label: g.name }))} />
          <div className="space-y-1.5">
            <span className="label">Ansicht</span>
            <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'month', label: 'Monat' }, { value: 'week', label: 'Woche' }, { value: 'list', label: 'Liste' }]} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card bodyClassName="p-4 sm:p-5">
          {view === 'month' ? (
            <MonthCalendar month={startOfMonth(cursor)} onMonth={setCursor} markers={markers} selected={selected} onSelect={setSelected} />
          ) : view === 'list' ? (
            <AgendaList from={range.from} to={range.to} today={t} events={events} onShift={(days) => setCursor(addDays(cursor, days))} onToday={() => setCursor(t)} render={(e) => <EventRow key={e.key} e={e} />} />
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <button type="button" className="btn-ghost p-1.5" aria-label="Vorherige Woche" onClick={() => setCursor(addDays(startOfWeek(cursor), -7))}>
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-[14px] font-semibold text-ink-50">
                  {fmtDateShort(range.from)} – {fmtDateShort(range.to)}
                </span>
                <button type="button" className="btn-ghost p-1.5" aria-label="Nächste Woche" onClick={() => setCursor(addDays(startOfWeek(cursor), 7))}>
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <ol className="space-y-2">
                {weekDays(cursor).map((d) => {
                  const list = events.filter((e) => e.date === d);
                  return (
                    <li key={d}>
                      <button
                        type="button"
                        onClick={() => setSelected(d)}
                        className={`w-full rounded-xl border p-3 text-left ${selected === d ? 'border-leaf-500/40 bg-leaf-500/[0.06]' : 'border-white/[0.05] hover:border-white/[0.1]'}`}
                      >
                        <div className="flex items-baseline justify-between">
                          <span className={`text-[13px] font-medium ${d === t ? 'text-leaf-300' : 'text-ink-200'}`}>{fmtDateLong(d)}</span>
                          <span className="text-[11px] text-ink-500">{list.length || ''}</span>
                        </div>
                        {list.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {list.slice(0, 6).map((e) => (
                              <span key={e.key} className="flex items-center gap-1 rounded-md bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-ink-300">
                                <span className="size-1.5 rounded-full" style={{ background: e.color }} />
                                {e.title}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card
            title={fmtDateLong(selected)}
            subtitle={selected === t ? 'Heute' : undefined}
            actions={
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setForm({ date: selected })}>
                <Plus className="size-3.5" /> Erinnerung
              </button>
            }
          >
            {dayEvents.length === 0 ? <EmptyState compact icon={<CalendarDays />} title="Keine Ereignisse" /> : <ul className="space-y-2">{dayEvents.map((e) => <EventRow key={e.key} e={e} />)}</ul>}
          </Card>
          {late.length > 0 && (
            <Card title="Überfällig" subtitle="Nicht erledigte Erinnerungen der letzten 30 Tage">
              <ul className="space-y-2">
                {late.map((o) => (
                  <EventRow
                    key={`${o.reminder.id}-${o.date}`}
                    e={{ key: `late-${o.reminder.id}-${o.date}`, kind: 'reminder', date: o.date, title: o.reminder.title, sub: `${fmtDateShort(o.date)} · ${REMINDER_CATEGORY_LABEL[o.reminder.category]}`, color: '#fbbf24', occurrence: o }}
                  />
                ))}
              </ul>
            </Card>
          )}
          <Card title="Alle Erinnerungen" subtitle={`${data.reminders.length} angelegt`}>
            {data.reminders.length === 0 ? (
              <p className="hint">Noch keine Erinnerungen. Kategorien: {REMINDER_CATEGORIES.map((c) => REMINDER_CATEGORY_LABEL[c]).join(', ')}.</p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {[...data.reminders]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-ink-100">{r.title}</div>
                        <div className="text-[11px] text-ink-500">
                          ab {fmtDateShort(r.date)} · {repeatText(r)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Chip>{REMINDER_CATEGORY_LABEL[r.category]}</Chip>
                        <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label="Bearbeiten" onClick={() => setForm({ reminder: r })}>
                          <Pencil className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
          <Callout tone="info" title="Keine Push-Benachrichtigungen">
            <span className="inline-flex items-start gap-1.5">
              <BellOff className="mt-0.5 size-3.5 shrink-0" />
              Erinnerungen werden nur angezeigt, wenn TERPGRID geöffnet ist. Für Benachrichtigungen auf dem Gerät die Erinnerungen per ICS-Export in eine Kalender-App
              übernehmen.
            </span>
          </Callout>
        </div>
      </div>
      {form && <ReminderFormModal open onClose={() => setForm(null)} reminder={form.reminder} date={form.date} growId={growId || undefined} />}
    </div>
  );
}

/** Agenda: alle Ereignisse des Zeitraums nach Tagen gruppiert; Erinnerungen direkt abhakbar. */
function AgendaList({ from, to, today: t, events, onShift, onToday, render }: { from: string; to: string; today: string; events: CalEvent[]; onShift: (days: number) => void; onToday: () => void; render: (e: CalEvent) => ReactNode }) {
  const days = [...new Set(events.map((e) => e.date))].sort();
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost p-1.5" aria-label={`${LIST_DAYS} Tage zurück`} onClick={() => onShift(-LIST_DAYS)}>
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-ink-50">
            {fmtDateShort(from)} – {fmtDateShort(to)}
          </span>
          {from !== t && (
            <button type="button" className="btn-ghost py-1 text-xs" onClick={onToday}>
              Heute
            </button>
          )}
        </div>
        <button type="button" className="btn-ghost p-1.5" aria-label={`${LIST_DAYS} Tage weiter`} onClick={() => onShift(LIST_DAYS)}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      {days.length === 0 ? (
        <EmptyState compact icon={<CalendarDays />} title="Keine Ereignisse in diesem Zeitraum" text="Filter oben anpassen oder eine Erinnerung anlegen." />
      ) : (
        <ol className="space-y-4">
          {days.map((d) => (
            <li key={d}>
              <h3 className={`mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] ${d === t ? 'text-leaf-300' : 'text-ink-400'}`}>
                {fmtDateLong(d)}
                {d === t && ' · Heute'}
              </h3>
              <ul className="space-y-1.5">{events.filter((e) => e.date === d).map(render)}</ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
