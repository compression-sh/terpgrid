import { useIsServerMode } from '../app/auth';
import { type TimelineKind, buildTimeline } from '../lib/timeline';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpenText,
  Bookmark,
  Calculator,
  CalendarClock,
  Camera,
  Check,
  Eye,
  EyeOff,
  History,
  Images,
  Leaf,
  type LucideIcon,
  Plus,
  Settings2,
  ShieldCheck,
  Sprout,
  Bell,
  Flag,
  FlaskRound,
  Gauge,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useData, useLookup } from '../app/DataProvider';
import { useQuickActions } from '../app/QuickActions';
import { errorText, useToast } from '../app/Toasts';
import { href } from '../app/router';
import { Stars } from '../components/forms/Fields';
import { PhotoGrid } from '../components/photos/PhotoGrid';
import { PhotoImg } from '../components/photos/PhotoImg';
import { Card } from '../components/ui/Card';
import { Chip, PhaseChip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { overdue, upcoming } from '../lib/calendar';
import { fmtDateLong, fmtDateShort, fmtDateTime, relativeDay, today } from '../lib/dates';
import { toggleReminderCompletion } from '../lib/db/repo';
import { DASHBOARD_WIDGETS, type DashboardWidget, type GrowProject } from '../lib/db/types';
import { METHOD_LABEL, REMINDER_CATEGORY_LABEL } from '../lib/grow/labels';
import { PHASE_COLOR, currentPhase, growDay, phaseSpans } from '../lib/grow/phases';

const WIDGET_META: Record<DashboardWidget, { label: string; span: string }> = {
  stats: { label: 'Kennzahlen', span: 'lg:col-span-3' },
  grows: { label: 'Aktive Grows', span: 'lg:col-span-2' },
  reminders: { label: 'Anstehende Erinnerungen', span: 'lg:col-span-1' },
  photos: { label: 'Neueste Fotos', span: 'lg:col-span-2' },
  activity: { label: 'Letzte Aktivitäten', span: 'lg:col-span-1' },
  journal: { label: 'Journal', span: 'lg:col-span-1' },
  calculations: { label: 'Gespeicherte Berechnungen', span: 'lg:col-span-1' },
  strains: { label: 'Zuletzt bearbeitete Sorten', span: 'lg:col-span-1' },
};

function QuickAction({ icon: Icon, label, onClick, to, disabled, hint }: { icon: LucideIcon; label: string; onClick?: () => void; to?: string; disabled?: boolean; hint?: string }) {
  const cls = `group flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 px-3.5 py-3 text-left transition-all hover:border-leaf-500/25 hover:bg-ink-850 disabled:cursor-not-allowed disabled:opacity-45`;
  const inner = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-leaf-500/20 bg-leaf-500/10 text-leaf-400 transition-colors group-hover:bg-leaf-500/15">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-tight text-ink-100">{label}</span>
        {hint && <span className="mt-0.5 hidden truncate text-[11px] text-ink-500 sm:block">{hint}</span>}
      </span>
    </>
  );
  return to ? (
    <a href={href(to)} className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={disabled ? hint : undefined}>
      {inner}
    </button>
  );
}

function StatTile({ label, value, to, sub }: { label: string; value: number | string; to: string; sub?: string }) {
  return (
    <a href={href(to)} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 transition-colors hover:border-white/[0.12]">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular text-ink-50">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-500">{sub}</div>}
    </a>
  );
}

export function GrowCard({ grow, compact }: { grow: GrowProject; compact?: boolean }) {
  const { data } = useData();
  const plants = data.plants.filter((p) => p.growId === grow.id);
  const photos = data.photos.filter((p) => p.growId === grow.id);
  const t = today();
  const day = growDay(grow.startDate, t, grow.completedDate);
  const phase = currentPhase(grow.phaseDates, t);
  const spans = phaseSpans(grow.phaseDates, t, grow.completedDate);
  const total = spans.reduce((s, x) => s + Math.max(1, x.days), 0);
  const cover = grow.coverPhotoId ?? [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]?.id;
  return (
    <a href={href(`grows/${grow.id}`)} className="group block overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/60 transition-all hover:border-white/[0.12]">
      <div className={`relative ${compact ? 'h-24' : 'h-32'} overflow-hidden bg-ink-850`}>
        <PhotoImg photoId={cover} alt={`Titelbild ${grow.name}`} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/20 to-transparent" />
        <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink-50">{grow.name}</div>
            <div className="text-[11px] text-ink-300">
              seit {fmtDateShort(grow.startDate)} · {plants.length} {plants.length === 1 ? 'Pflanze' : 'Pflanzen'}
            </div>
          </div>
          {day !== undefined ? (
            <div className="shrink-0 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-right backdrop-blur">
              <div className="text-[9px] uppercase tracking-wider text-ink-400">Tag</div>
              <div className="font-mono text-base font-semibold leading-none text-ink-50">{day}</div>
            </div>
          ) : (
            <Chip tone="sky">startet {relativeDay(grow.startDate)}</Chip>
          )}
        </div>
      </div>
      <div className="space-y-2.5 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <PhaseChip phase={phase} />
          <span className="text-[11px] text-ink-500">{photos.length} Fotos</span>
        </div>
        {spans.length > 0 ? (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-ink-700" aria-label="Erfasste Phasen">
            {spans.map((s) => (
              <div key={s.phase} title={`${s.phase}: ${s.days} Tage`} style={{ width: `${(Math.max(1, s.days) / total) * 100}%`, background: PHASE_COLOR[s.phase], opacity: s.ongoing ? 1 : 0.6 }} />
            ))}
          </div>
        ) : (
          <div className="h-1.5 rounded-full bg-ink-700" title="Noch keine Meilensteine erfasst" />
        )}
      </div>
    </a>
  );
}

export function Dashboard() {
  const server = useIsServerMode();
  const { data, settings, updateSettings, ready } = useData();
  const lookup = useLookup();
  const quick = useQuickActions();
  const toast = useToast();
  const [customize, setCustomize] = useState(false);
  const t = today();

  const activeGrows = data.grows.filter((g) => g.status === 'active').sort((a, b) => b.startDate.localeCompare(a.startDate));
  const activeIds = new Set(activeGrows.map((g) => g.id));
  const trackedPlants = data.plants.filter((p) => activeIds.has(p.growId));
  const latestPhotos = useMemo(() => [...data.photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 12), [data.photos]);
  const next = upcoming(data.reminders, t, 14, 6);
  const late = overdue(data.reminders, t, 14);
  const recentJournal = [...data.journal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const recentCalcs = [...data.calculations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const recentStrains = [...data.strains].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);

  // Aktivitätsverlauf: dieselbe Ableitung wie die Seite „Verlauf“ (keine doppelte Logik)
  const timeline = useMemo(() => {
    const icon: Record<TimelineKind, LucideIcon> = { milestone: Flag, activity: Sprout, measurement: Gauge, photo: Camera, journal: BookOpenText, strain: Leaf, lab: FlaskRound, reminder: Bell };
    return buildTimeline(data, { today: t })
      .slice(0, 8)
      .map((e) => ({ id: e.id, at: e.at, icon: icon[e.kind], text: e.title, sub: e.subtitle, to: e.to }));
  }, [data, t]);

  const isEmpty = ready && data.grows.length === 0 && data.journal.length === 0 && data.strains.length === 0 && data.calculations.length === 0 && data.photos.length === 0;

  const order = settings.dashboardOrder.length ? settings.dashboardOrder : [...DASHBOARD_WIDGETS];
  const hidden = new Set(settings.dashboardHidden);

  async function move(w: DashboardWidget, dir: -1 | 1) {
    const i = order.indexOf(w);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    await updateSettings({ dashboardOrder: next });
  }
  async function toggleHidden(w: DashboardWidget) {
    const set = new Set(hidden);
    if (set.has(w)) set.delete(w);
    else set.add(w);
    await updateSettings({ dashboardHidden: [...set] });
  }

  const widgets: Record<DashboardWidget, ReactNode> = {
    stats: (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Aktive Grows" value={activeGrows.length} to="grows" sub={`${data.grows.length} insgesamt`} />
        <StatTile label="Pflanzen (aktiv)" value={trackedPlants.length} to="grows" sub={`${data.plants.length} insgesamt`} />
        <StatTile label="Fotos" value={data.photos.length} to="photos" />
        <StatTile label="Journal-Einträge" value={data.journal.length} to="journal" />
      </div>
    ),
    grows: (
      <Card
        title="Aktive Grows"
        icon={<Sprout className="size-4" />}
        actions={
          <a href={href('grows')} className="btn-ghost py-1.5 text-xs">
            Alle <ArrowRight className="size-3.5" />
          </a>
        }
      >
        {activeGrows.length === 0 ? (
          <EmptyState compact icon={<Sprout />} title="Kein aktiver Grow" text="Lege ein Projekt an, um Pflanzen, Fotos und Messwerte zu dokumentieren." action={<button type="button" className="btn-primary" onClick={() => quick({ kind: 'grow' })}><Plus className="size-4" /> Neuer Grow</button>} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeGrows.slice(0, 4).map((g) => (
              <GrowCard key={g.id} grow={g} compact />
            ))}
          </div>
        )}
      </Card>
    ),
    reminders: (
      <Card
        title="Erinnerungen"
        subtitle="Nächste 14 Tage"
        icon={<CalendarClock className="size-4" />}
        actions={
          <a href={href('calendar')} className="btn-ghost py-1.5 text-xs">
            Kalender
          </a>
        }
      >
        {next.length === 0 && late.length === 0 ? (
          <EmptyState compact title="Nichts geplant" text="Eigene Erinnerungen erscheinen hier und im Kalender." action={<a href={href('calendar?new=1')} className="btn-ghost"><Plus className="size-4" /> Erinnerung</a>} />
        ) : (
          <ul className="space-y-1.5">
            {[...late.map((o) => ({ ...o, late: true })), ...next.map((o) => ({ ...o, late: false }))].slice(0, 7).map((o) => (
              <li key={`${o.reminder.id}-${o.date}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                <button
                  type="button"
                  aria-label={`${o.reminder.title} als erledigt markieren`}
                  onClick={() => toggleReminderCompletion(o.reminder, o.date).then(() => toast('Erledigt', { action: { label: 'Rückgängig', run: () => toggleReminderCompletion({ ...o.reminder, completedDates: [...o.reminder.completedDates, o.date] }, o.date) } })).catch((e) => toast(errorText(e), { tone: 'error' }))}
                  className="grid size-5 shrink-0 place-items-center rounded-md border border-white/20 text-transparent transition-colors hover:border-leaf-400 hover:text-leaf-400"
                >
                  <Check className="size-3.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink-100">{o.reminder.title}</div>
                  <div className="text-[11px] text-ink-500">
                    {REMINDER_CATEGORY_LABEL[o.reminder.category]}
                    {o.reminder.growId && ` · ${lookup.grow.get(o.reminder.growId)?.name ?? ''}`}
                  </div>
                </div>
                <span className={`shrink-0 text-[11px] ${o.late ? 'text-amber-300' : o.date === t ? 'text-leaf-300' : 'text-ink-400'}`}>{o.late ? `überfällig · ${fmtDateShort(o.date)}` : relativeDay(o.date, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    photos: (
      <Card
        title="Neueste Fotos"
        icon={<Images className="size-4" />}
        actions={
          <>
            <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => quick({ kind: 'photo' })}>
              <Camera className="size-3.5" /> Hochladen
            </button>
            <a href={href('photos')} className="btn-ghost py-1.5 text-xs">
              Alle
            </a>
          </>
        }
      >
        {latestPhotos.length === 0 ? (
          <EmptyState compact icon={<Camera />} title="Noch keine Fotos" text="Fotos bleiben auf diesem Gerät. Standortdaten werden beim Import entfernt." />
        ) : (
          <PhotoGrid photos={latestPhotos} group={false} dense />
        )}
      </Card>
    ),
    activity: (
      <Card
        title="Letzte Aktivitäten"
        icon={<History className="size-4" />}
        actions={
          <a href={href('timeline')} className="text-[12px] text-leaf-300 hover:underline">
            Ganzer Verlauf
          </a>
        }
      >
        {timeline.length === 0 ? (
          <EmptyState compact title="Noch keine Aktivitäten" />
        ) : (
          <ol className="relative space-y-3 before:absolute before:inset-y-1 before:left-[11px] before:w-px before:bg-white/[0.06]">
            {timeline.map((i) => {
              const Icon = i.icon;
              const body = (
                <>
                  <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-ink-850 text-ink-400">
                    <Icon className="size-3" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink-100">{i.text}</span>
                    <span className="block truncate text-[11px] text-ink-500">
                      {fmtDateTime(i.at)}
                      {i.sub && ` · ${i.sub}`}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={i.id}>
                  {i.to ? (
                    <a href={href(i.to)} className="flex items-start gap-3 rounded-md hover:bg-white/[0.02]">
                      {body}
                    </a>
                  ) : (
                    <div className="flex items-start gap-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    ),
    journal: (
      <Card title="Journal" icon={<BookOpenText className="size-4" />} actions={<a href={href('journal')} className="btn-ghost py-1.5 text-xs">Alle</a>}>
        {recentJournal.length === 0 ? (
          <EmptyState compact title="Keine Einträge" text="Das Journal ist optional und privat." action={<button type="button" className="btn-ghost" onClick={() => quick({ kind: 'journal' })}><Plus className="size-4" /> Eintrag</button>} />
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {recentJournal.map((j) => (
              <li key={j.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink-100">{(j.strainId && lookup.strain.get(j.strainId)?.name) || j.strainName || METHOD_LABEL[j.method]}</span>
                  <Stars value={j.rating} size="xs" />
                </div>
                <div className="text-[11px] text-ink-500">
                  {fmtDateTime(j.date)} · {METHOD_LABEL[j.method]}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    calculations: (
      <Card title="Berechnungen" icon={<Bookmark className="size-4" />} actions={<a href={href('lab/saved')} className="btn-ghost py-1.5 text-xs">Alle</a>}>
        {recentCalcs.length === 0 ? (
          <EmptyState compact title="Nichts gespeichert" text="Ergebnisse aus dem THC Lab lassen sich lokal speichern." action={<a href={href('lab/edibles')} className="btn-ghost"><Calculator className="size-4" /> THC Lab</a>} />
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {recentCalcs.map((c) => (
              <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="truncate text-[13px] font-medium text-ink-100">{c.name}</div>
                <div className="truncate font-mono text-[11px] text-ink-400">{Object.values(c.summary)[1] ?? Object.values(c.summary)[0]}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    strains: (
      <Card title="Sorten" icon={<Leaf className="size-4" />} actions={<a href={href('strains')} className="btn-ghost py-1.5 text-xs">Bibliothek</a>}>
        {recentStrains.length === 0 ? (
          <EmptyState compact title="Bibliothek leer" text="Eigene Sorten mit Notizen, Terpenen und Bewertung." />
        ) : (
          <ul className="space-y-2">
            {recentStrains.map((s) => (
              <li key={s.id}>
                <a href={href(`strains/${s.id}`)} className="flex items-center gap-3 rounded-lg p-1 hover:bg-white/[0.03]">
                  <PhotoImg photoId={s.coverPhotoId} alt="" className="size-10 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink-100">{s.name}</span>
                    <span className="block text-[11px] text-ink-500">bearbeitet {relativeDay(s.updatedAt.slice(0, 10), t)}</span>
                  </span>
                  <Stars value={s.rating} size="xs" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
        <div>
          <div className="text-xs text-ink-500">{fmtDateLong(t)}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-50 sm:text-[28px]">Übersicht</h1>
        </div>
        {!isEmpty && (
          <button type="button" className={`btn-ghost py-1.5 ${customize ? 'border-leaf-500/30 text-leaf-200' : ''}`} onClick={() => setCustomize((c) => !c)} aria-pressed={customize}>
            <Settings2 className="size-4" /> {customize ? 'Fertig' : 'Anpassen'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <QuickAction icon={Sprout} label="Neuer Grow" onClick={() => quick({ kind: 'grow' })} />
        <QuickAction icon={Plus} label="Pflanze hinzufügen" onClick={() => quick({ kind: 'plant' })} disabled={data.grows.length === 0} hint={data.grows.length === 0 ? 'Erst einen Grow anlegen' : undefined} />
        <QuickAction icon={Camera} label="Foto hochladen" onClick={() => quick({ kind: 'photo' })} />
        <QuickAction icon={BookOpenText} label="Journal-Eintrag" onClick={() => quick({ kind: 'journal' })} />
        <QuickAction icon={Calculator} label="THC berechnen" to="lab/edibles" />
      </div>

      {isEmpty ? (
        <Card className="overflow-hidden" bodyClassName="p-0">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr]">
            <div className="p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-ink-50">Willkommen bei TERPGRID</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-400">
                Dein persönlicher, privater Bereich für Growlogs, Fotos, Sorten-Notizen und den THC-Rechner. Noch ist alles leer – hier erscheinen ausschließlich deine
                eigenen Einträge.
              </p>
              <ol className="mt-6 space-y-3">
                {[
                  ['Grow anlegen', 'Startdatum, Ort und Meilensteine erfassen.'],
                  ['Pflanzen & Fotos hinzufügen', 'Jede Pflanze mit eigener Zeitleiste und Messwerten.'],
                  ['Regelmäßig sichern', 'Backups unter „Daten & Backup“ exportieren.'],
                ].map(([title, text], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-leaf-500/30 bg-leaf-500/10 font-mono text-[11px] text-leaf-300">{i + 1}</span>
                    <span>
                      <span className="block text-[13px] font-medium text-ink-100">{title}</span>
                      <span className="block text-xs text-ink-500">{text}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => quick({ kind: 'grow' })}>
                  <Sprout className="size-4" /> Ersten Grow anlegen
                </button>
                <a href={href('lab/edibles')} className="btn-ghost">
                  Zum THC Lab
                </a>
              </div>
            </div>
            <div className="border-t border-white/[0.05] bg-[radial-gradient(500px_300px_at_80%_0%,rgb(52_199_123/0.08),transparent)] p-6 sm:p-8 lg:border-l lg:border-t-0">
              <ShieldCheck className="size-6 text-leaf-400" />
              <h3 className="mt-3 text-[14px] font-semibold text-ink-100">Privat by Design</h3>
              <ul className="mt-3 space-y-2 text-[13px] text-ink-400">
                {server ? (
                  <>
                    <li>• Self-hosted: Daten liegen auf deinem eigenen Server</li>
                    <li>• Dort verschlüsselt gespeichert (Betreiber könnte technisch entschlüsseln)</li>
                    <li>• Kein Tracking, keine Analyse-Dienste</li>
                  </>
                ) : (
                  <>
                    <li>• Kein Konto, kein Tracking – persönliche Daten ohne Server</li>
                    <li>• Daten & Fotos bleiben in diesem Browser</li>
                  </>
                )}
                <li>• Standortdaten werden aus Fotos entfernt</li>
                <li>• Vollständiger Export jederzeit möglich</li>
                <li>• Online-Sortendaten (Discover) kommen von externen Quellen</li>
              </ul>
              <p className="hint mt-4">
                {server ? 'Eine Kopie liegt zusätzlich unverschlüsselt in diesem Browser – auf gemeinsam genutzten Geräten beim Abmelden löschen.' : 'Browser-Daten sind gerätegebunden und können beim Löschen der Browserdaten verloren gehen.'}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-flow-row-dense lg:grid-cols-3">
          {order
            .filter((w) => customize || !hidden.has(w))
            .map((w, i, arr) => (
              <div key={w} className={`${WIDGET_META[w].span} ${hidden.has(w) ? 'opacity-40' : ''} relative`}>
                {customize && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-white/[0.12] bg-ink-900 px-3 py-1.5">
                    <span className="text-xs font-medium text-ink-300">{WIDGET_META[w].label}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" className="btn-ghost p-1" aria-label={`${WIDGET_META[w].label} nach oben`} disabled={i === 0} onClick={() => move(w, -1)}>
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button type="button" className="btn-ghost p-1" aria-label={`${WIDGET_META[w].label} nach unten`} disabled={i === arr.length - 1} onClick={() => move(w, 1)}>
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button type="button" className="btn-ghost p-1" aria-label={hidden.has(w) ? `${WIDGET_META[w].label} einblenden` : `${WIDGET_META[w].label} ausblenden`} onClick={() => toggleHidden(w)}>
                        {hidden.has(w) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
                {widgets[w]}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
