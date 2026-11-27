/**
 * Übersicht 3.0 (6.0.1): ein ruhiger Blick auf die ganze Plattform statt einer Sammlung von Grow-Karten.
 *
 * - Nur Daten dieses Kontos (lokale Arbeitskopie) und der bereits vorhandene Zähler ungelesener
 *   Benachrichtigungen – keine zusätzlichen Serveranfragen, keine fremden Inhalte, keine erfundenen Zahlen.
 * - Adaptiv nach einfachen, festen Regeln: Bereiche ohne Daten werden nicht als leere Karten gezeigt.
 * - Reihenfolge und Sichtbarkeit bleiben über „Anpassen“ einstellbar (dashboardOrder/dashboardHidden).
 */
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  BookOpen,
  BookOpenText,
  Bookmark,
  Calculator,
  CalendarDays,
  Camera,
  Check,
  Compass,
  Dna,
  Droplets,
  Eye,
  EyeOff,
  Flag,
  FlaskRound,
  Gauge,
  Leaf,
  type LucideIcon,
  Package,
  Search,
  Settings2,
  ShieldCheck,
  Sprout,
  Store,
  Users,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useData, useLookup } from '../app/DataProvider';
import { useQuickActions } from '../app/QuickActions';
import { errorText, useToast } from '../app/Toasts';
import { useIsServerMode } from '../app/auth';
import { useCollabAvailable, useUnread } from '../app/collab';
import { href } from '../app/router';
import { ActiveGrowRow } from '../components/grow/ActiveGrowPanel';
import { PhotoGrid } from '../components/photos/PhotoGrid';
import { Card } from '../components/ui/Card';
import { nextPerReminder, repeatLabel } from '../lib/calendar';
import { fmtDateLong, fmtDateShort, fmtDateTime, relativeDay, today } from '../lib/dates';
import { toggleReminderCompletion } from '../lib/db/repo';
import { DASHBOARD_WIDGETS, type DashboardWidget } from '../lib/db/types';
import { REMINDER_CATEGORY_LABEL } from '../lib/grow/labels';
import { type TimelineKind, buildTimeline } from '../lib/timeline';
import { t } from '../i18n';

const WIDGET_META: Record<DashboardWidget, { label: string; span: string }> = {
  stats: { get label() { return t('dashboard.widget.stats'); }, span: 'lg:col-span-3' },
  reminders: { get label() { return t('dashboard.widget.reminders'); }, span: 'lg:col-span-1' },
  grows: { get label() { return t('dashboard.widget.grows'); }, span: 'lg:col-span-2' },
  activity: { get label() { return t('dashboard.widget.activity'); }, span: 'lg:col-span-2' },
  areas: { get label() { return t('dashboard.widget.areas'); }, span: 'lg:col-span-1' },
  discover: { get label() { return t('dashboard.widget.discover'); }, span: 'lg:col-span-1' },
  photos: { get label() { return t('dashboard.widget.photos'); }, span: 'lg:col-span-2' },
};

const KIND_ICON: Record<TimelineKind, LucideIcon> = { milestone: Flag, activity: Sprout, measurement: Gauge, photo: Camera, journal: BookOpenText, strain: Leaf, collection: Package, lab: FlaskRound, reminder: Bell };

function Metric({ label, value, to, sub }: { label: string; value: number; to: string; sub?: string }) {
  return (
    <a href={href(to)} className="group min-w-0 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:px-5">
      <div className="font-mono text-[22px] font-semibold leading-none tabular text-ink-50">{value}</div>
      <div className="mt-1.5 truncate text-[12px] text-ink-400 group-hover:text-ink-200">{label}</div>
      {sub && <div className="truncate text-[11px] text-ink-500">{sub}</div>}
    </a>
  );
}

function AreaRow({ icon: Icon, label, to, count, detail }: { icon: LucideIcon; label: string; to: string; count?: number; detail?: string }) {
  return (
    <li>
      <a href={href(to)} className="flex items-center gap-3 py-2 text-[13px] hover:text-ink-50">
        <Icon className="size-4 shrink-0 text-ink-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink-100">{label}</span>
          {detail && <span className="block truncate text-[11px] text-ink-500">{detail}</span>}
        </span>
        {count !== undefined && <span className="font-mono text-[12px] tabular text-ink-400">{count}</span>}
      </a>
    </li>
  );
}


export function Dashboard() {
  const server = useIsServerMode();
  const collabOn = useCollabAvailable();
  const unread = useUnread(collabOn);
  const { data, settings, updateSettings, ready } = useData();
  const lookup = useLookup();
  const quick = useQuickActions();
  const toast = useToast();
  const [customize, setCustomize] = useState(false);
  const todayStr = today();

  const activeGrows = useMemo(() => data.grows.filter((g) => g.status === 'active').sort((a, b) => b.startDate.localeCompare(a.startDate)), [data.grows]);
  const activeIds = new Set(activeGrows.map((g) => g.id));
  const trackedPlants = data.plants.filter((p) => activeIds.has(p.growId));
  const latestPhotos = useMemo(() => [...data.photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 12), [data.photos]);
  const upcoming = useMemo(() => nextPerReminder(data.reminders, todayStr, 7), [data.reminders, todayStr]);
  const late = upcoming.filter((o) => o.late).length;
  const favorites = useMemo(() => data.strains.filter((x) => x.favorite).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4), [data.strains]);
  const lastOf = <T extends { updatedAt: string }>(xs: T[]) => (xs.length ? xs.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b)).updatedAt : undefined);

  // Ein gemeinsamer Verlauf über alle Module (dieselbe Ableitung wie die Seite „Verlauf“)
  const timeline = useMemo(() => buildTimeline(data, { today: todayStr }).slice(0, 7), [data, todayStr]);

  // Academy: begonnene, nicht abgeschlossene Artikel – Titel werden nur bei Bedarf nachgeladen
  const reading = useMemo(() => Object.entries(settings.kbProgress).filter(([, p]) => p > 0 && p < 1), [settings.kbProgress]);
  const readCount = Object.values(settings.kbProgress).filter((p) => p >= 1).length;
  const [kbTitles, setKbTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    if (reading.length === 0) return;
    let live = true;
    void import('../lib/knowledge').then((m) => live && setKbTitles(Object.fromEntries(m.KB_ARTICLES.map((a) => [a.id, a.title]))));
    return () => {
      live = false;
    };
  }, [reading.length]);

  const isEmpty = ready && data.grows.length === 0 && data.journal.length === 0 && data.strains.length === 0 && data.calculations.length === 0 && data.photos.length === 0 && data.inventory.length === 0 && data.labReports.length === 0;

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

  // Kennzahlen: nur, was für dieses Konto Aussagekraft hat (keine Nullen)
  const metrics = [
    activeGrows.length > 0 && { label: t('dashboard.widget.grows'), value: activeGrows.length, to: 'grows', sub: t('dashboard.metric.plants', { count: trackedPlants.length }) },
    upcoming.length > 0 && { label: t('dashboard.metric.tasks'), value: upcoming.length, to: 'calendar', sub: late ? t('dashboard.metric.overdue', { count: late }) : undefined },
    data.journal.length > 0 && { label: t('dashboard.metric.journal'), value: data.journal.length, to: 'journal' },
    data.inventory.length > 0 && { label: t('dashboard.metric.collection'), value: data.inventory.length, to: 'collection' },
    data.strains.length > 0 && { label: t('dashboard.metric.strains'), value: data.strains.length, to: 'strains' },
    data.photos.length > 0 && { label: t('dashboard.metric.photos'), value: data.photos.length, to: 'photos' },
  ]
    .filter((m): m is { label: string; value: number; to: string; sub?: string } => !!m)
    .slice(0, 4);

  const friendNews = (unread.byCategory.friends ?? 0) + (unread.byCategory.invites ?? 0);
  const spaceNews = (unread.byCategory.comments ?? 0) + (unread.byCategory.updates ?? 0) + (unread.byCategory.access ?? 0);

  // Bereiche mit Daten; ohne Daten erscheinen sie nur in einer kurzen Zeile zum Anlegen
  const areas: { icon: LucideIcon; label: string; to: string; count: number; detail?: string }[] = [
    { icon: BookOpenText, label: t('shell.nav.journal'), to: 'journal', count: data.journal.length, detail: lastOf(data.journal) && t('dashboard.area.lastUpdated', { when: relativeDay(lastOf(data.journal)!.slice(0, 10), todayStr) }) },
    { icon: Package, label: t('shell.nav.collection'), to: 'collection', count: data.inventory.length },
    { icon: Leaf, label: t('shell.nav.strains'), to: 'strains', count: data.strains.length, detail: favorites.length ? t('dashboard.area.favorites', { count: data.strains.filter((s) => s.favorite).length }) : undefined },
    { icon: FlaskRound, label: t('shell.nav.labReports'), to: 'lab-reports', count: data.labReports.length },
    { icon: Calculator, label: t('dashboard.area.calculations'), to: 'lab/saved', count: data.calculations.length },
    { icon: CalendarDays, label: t('shell.nav.calendar'), to: 'calendar', count: data.reminders.length, detail: upcoming.length ? t('dashboard.area.next7', { count: upcoming.length }) : undefined },
  ];
  const filledAreas = areas.filter((a) => a.count > 0);
  const emptyAreas = areas.filter((a) => a.count === 0);

  /** Adaptiv: Bereiche ohne Inhalt entfallen (außer im Anpassen-Modus, damit sie einstellbar bleiben). */
  const hasContent: Record<DashboardWidget, boolean> = {
    stats: metrics.length > 0,
    reminders: upcoming.length > 0 || friendNews > 0 || spaceNews > 0,
    grows: activeGrows.length > 0,
    activity: timeline.length > 0,
    areas: true,
    discover: true,
    photos: latestPhotos.length > 0,
  };

  const linkBtn = (to: string, label: string) => (
    <a href={href(to)} className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-100">
      {label} <ArrowRight className="size-3.5" />
    </a>
  );

  const widgets: Record<DashboardWidget, ReactNode> = {
    stats: (
      <section aria-label={t('dashboard.widget.stats')} className="card grid grid-cols-2 divide-white/[0.05] overflow-hidden sm:grid-cols-4 sm:divide-x [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-white/[0.05] sm:[&>*:nth-child(n+3)]:border-t-0">
        {metrics.map((m) => (
          <Metric key={m.label} {...m} />
        ))}
      </section>
    ),
    reminders: (
      <Card title={t('dashboard.widget.reminders')} icon={<CalendarDays />} actions={linkBtn('calendar', t('shell.nav.calendar'))}>
        {friendNews + spaceNews > 0 && (
          <a href={href('together/notifications')} className="mb-2 flex items-center gap-2.5 rounded-lg bg-leaf-500/[0.07] px-3 py-2 text-[13px] text-leaf-100 hover:bg-leaf-500/[0.12]">
            <Users className="size-4 shrink-0 text-leaf-300" />
            <span className="min-w-0 flex-1 truncate">
              {[friendNews > 0 && t('dashboard.today.requests', { count: friendNews }), spaceNews > 0 && t('dashboard.today.spaceNews', { count: spaceNews })].filter(Boolean).join(' · ')}
            </span>
            <ArrowRight className="size-3.5 shrink-0" />
          </a>
        )}
        {upcoming.length === 0 ? (
          <p className="hint">{t('dashboard.today.none')}</p>
        ) : (
          <ul className="list-rows">
            {upcoming.slice(0, 6).map((o) => (
              <li key={`${o.reminder.id}-${o.date}`} className="flex items-center gap-3 py-2">
                <button
                  type="button"
                  aria-label={t('dashboard.today.markDone', { title: o.reminder.title })}
                  onClick={() =>
                    toggleReminderCompletion(o.reminder, o.date)
                      .then(() => toast(t('dashboard.today.done'), { action: { label: t('dashboard.undo'), run: () => toggleReminderCompletion({ ...o.reminder, completedDates: [...o.reminder.completedDates, o.date] }, o.date) } }))
                      .catch((e) => toast(errorText(e), { tone: 'error' }))
                  }
                  className="grid size-5 shrink-0 place-items-center rounded-md border border-white/20 text-transparent transition-colors hover:border-leaf-400 hover:text-leaf-400"
                >
                  <Check className="size-3.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink-100">{o.reminder.title}</div>
                  <div className="truncate text-[11px] text-ink-500">
                    {REMINDER_CATEGORY_LABEL[o.reminder.category] ?? t('labels.reminderCategory.other')}
                    {repeatLabel(o.reminder.repeat) && ` · ${repeatLabel(o.reminder.repeat)}`}
                    {o.reminder.growId && ` · ${lookup.grow.get(o.reminder.growId)?.name ?? ''}`}
                  </div>
                </div>
                <span className={`shrink-0 text-[11px] ${o.late ? 'text-amber-300' : o.date === todayStr ? 'text-leaf-300' : 'text-ink-400'}`}>{o.late ? t('dashboard.today.overdue', { date: fmtDateShort(o.date) }) : relativeDay(o.date, todayStr)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    grows: (
      <Card title={t('dashboard.widget.grows')} icon={<Sprout />} actions={linkBtn('grows', t('dashboard.allGrows'))}>
        <ul className={`grid gap-2.5 ${activeGrows.length > 1 ? 'xl:grid-cols-2' : ''}`}>
          {activeGrows.slice(0, 4).map((g) => (
            <ActiveGrowRow key={g.id} grow={g} />
          ))}
        </ul>
      </Card>
    ),
    activity: (
      <Card title={t('dashboard.widget.activity')} icon={<BookOpen />} actions={linkBtn('timeline', t('dashboard.fullTimeline'))}>
        <ol className="list-rows">
          {timeline.map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <li key={e.id}>
                <a href={href(e.to)} className="flex items-center gap-3 py-2 hover:text-ink-50">
                  <Icon className="size-4 shrink-0 text-ink-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink-100">{e.title}</span>
                    {e.subtitle && <span className="block truncate text-[11px] text-ink-500">{e.subtitle}</span>}
                  </span>
                  <time className="shrink-0 text-[11px] text-ink-500" dateTime={e.at}>
                    {e.at.length > 10 ? fmtDateTime(e.at) : fmtDateShort(e.at)}
                  </time>
                </a>
              </li>
            );
          })}
        </ol>
      </Card>
    ),
    areas: (
      <Card title={t('dashboard.widget.areas')} icon={<Package />}>
        {filledAreas.length > 0 && (
          <ul className="list-rows">
            {filledAreas.map((a) => (
              <AreaRow key={a.label} {...a} />
            ))}
          </ul>
        )}
        {emptyAreas.length > 0 && (
          <p className={`hint ${filledAreas.length ? 'mt-2 border-t border-white/[0.05] pt-2.5' : ''}`}>
            {t('dashboard.area.empty')}{' '}
            {emptyAreas.map((a, i) => (
              <span key={a.label}>
                {i > 0 && ', '}
                <a href={href(a.to)} className="text-ink-300 underline-offset-2 hover:text-ink-100 hover:underline">
                  {a.label}
                </a>
              </span>
            ))}
          </p>
        )}
      </Card>
    ),
    discover: (
      <Card title={t('dashboard.widget.discover')} icon={<Compass />} actions={linkBtn('discover', t('shell.nav.discover'))}>
        {(favorites.length > 0 || settings.recentCultivars.length > 0 || reading.length > 0) && (
          <ul className="list-rows mb-2">
            {reading.slice(0, 2).map(([id, p]) => (
              <li key={id}>
                <a href={href(`discover/learn/${id}`)} className="flex items-center gap-3 py-2 text-[13px]">
                  <BookOpen className="size-4 shrink-0 text-ink-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink-100">{kbTitles[id] ?? t('dashboard.discover.continueReading')}</span>
                    <span className="block text-[11px] text-ink-500">{t('dashboard.discover.readPct', { pct: Math.round(p * 100) })}</span>
                  </span>
                </a>
              </li>
            ))}
            {favorites.map((s) => (
              <li key={s.id}>
                <a href={href(`strains/${s.id}`)} className="flex items-center gap-3 py-2 text-[13px]">
                  <Bookmark className="size-4 shrink-0 text-ink-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink-100">{s.name}</span>
                    <span className="block truncate text-[11px] text-ink-500">{t('dashboard.discover.favorite')}{s.breeder ? ` · ${s.breeder}` : ''}</span>
                  </span>
                </a>
              </li>
            ))}
            {settings.recentCultivars.slice(0, 3).map((c) => (
              <li key={c.id}>
                <a href={href(`discover/cultivar/${c.id}`)} className="flex items-center gap-3 py-2 text-[13px]">
                  <Search className="size-4 shrink-0 text-ink-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink-100">{c.name}</span>
                    <span className="block truncate text-[11px] text-ink-500">{t('dashboard.discover.recent')}{c.breeder ? ` · ${c.breeder}` : ''}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          {[
            { to: 'discover/breeders', label: t('dashboard.discover.breeders'), icon: Store },
            { to: 'discover/genetics', label: t('dashboard.discover.genetics'), icon: Dna },
            { to: 'discover/terpenes', label: t('shell.nav.terpenes'), icon: Droplets },
            { to: 'discover/learn', label: readCount ? t('dashboard.discover.academyRead', { count: readCount }) : t('dashboard.discover.academy'), icon: BookOpen },
          ].map(({ to, label, icon: Icon }) => (
            <a key={to} href={href(to)} className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] px-2.5 py-1.5 text-[12px] text-ink-300 hover:border-white/[0.14] hover:text-ink-100">
              <Icon className="size-3.5 text-ink-500" /> {label}
            </a>
          ))}
        </div>
      </Card>
    ),
    photos: (
      <Card title={t('dashboard.widget.photos')} icon={<Camera />} actions={linkBtn('photos', t('dashboard.allPhotos'))}>
        <PhotoGrid photos={latestPhotos} group={false} dense />
      </Card>
    ),
  };

  const summary = [
    activeGrows.length > 0 && t('dashboard.summary.grows', { count: activeGrows.length }),
    upcoming.length > 0 && t('dashboard.summary.tasks', { count: upcoming.length }) + (late ? `, ${t('dashboard.metric.overdue', { count: late })}` : ''),
    friendNews + spaceNews > 0 && t('dashboard.summary.news', { count: friendNews + spaceNews }),
  ].filter(Boolean);

  const shown = order.filter((w) => customize || (!hidden.has(w) && hasContent[w]));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div className="min-w-0">
          <p className="text-[12px] text-ink-500">{fmtDateLong(todayStr)}</p>
          <h1 className="page-title mt-0.5">{t('dashboard.title')}</h1>
          <p className="mt-0.5 text-[13px] text-ink-400">{summary.length ? summary.join(' · ') : t('dashboard.subtitle')}</p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-2">
            <button type="button" className={`btn-ghost py-1.5 ${customize ? 'border-leaf-500/30 text-leaf-200' : ''}`} onClick={() => setCustomize((c) => !c)} aria-pressed={customize}>
              <Settings2 className="size-4" /> {customize ? t('dashboard.customize.done') : t('dashboard.customize.button')}
            </button>
          </div>
        )}
      </header>

      {isEmpty ? (
        <Card className="overflow-hidden" bodyClassName="p-0">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr]">
            <div className="p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-ink-50">{t('dashboard.welcome.title')}</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-400">
                {t('dashboard.welcome.text')}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => quick({ kind: 'grow' })}>
                  <Sprout className="size-4" /> {t('dashboard.welcome.firstGrow')}
                </button>
                <a href={href('discover')} className="btn-ghost">
                  <Compass className="size-4" /> {t('dashboard.welcome.discover')}
                </a>
                <a href={href('lab/edibles')} className="btn-ghost">
                  {t('dashboard.toThcLab')}
                </a>
              </div>
              <p className="hint mt-5">{t('dashboard.welcome.backup')}</p>
            </div>
            <div className="border-t border-white/[0.05] p-6 sm:p-8 lg:border-l lg:border-t-0">
              <ShieldCheck className="size-5 text-leaf-400" />
              <h3 className="mt-3 text-[14px] font-semibold text-ink-100">{t('dashboard.welcome.privacyTitle')}</h3>
              <ul className="mt-3 space-y-2 text-[13px] text-ink-400">
                {server ? (
                  <>
                    <li>{t('dashboard.welcome.p1')}</li>
                    <li>{t('dashboard.welcome.p2')}</li>
                    <li>{t('dashboard.welcome.p3')}</li>
                  </>
                ) : (
                  <>
                    <li>{t('dashboard.welcome.p4')}</li>
                    <li>{t('dashboard.welcome.p5')}</li>
                  </>
                )}
                <li>{t('dashboard.welcome.p6')}</li>
                <li>{t('dashboard.welcome.p7')}</li>
              </ul>
              <p className="hint mt-4">
                {server ? t('dashboard.welcome.copyServer') : t('dashboard.welcome.copyLocal')}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-flow-row-dense lg:grid-cols-3">
          {shown.map((w, i, arr) => (
            <div key={w} className={`${WIDGET_META[w].span} ${customize && (hidden.has(w) || !hasContent[w]) ? 'opacity-50' : ''} min-w-0`}>
              {customize && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-white/[0.12] px-3 py-1.5">
                  <span className="text-xs font-medium text-ink-300">
                    {WIDGET_META[w].label}
                    {!hasContent[w] && <span className="text-ink-500"> · {t('dashboard.customize.empty')}</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" className="btn-ghost p-1" aria-label={t('dashboard.customize.up', { name: WIDGET_META[w].label })} disabled={i === 0} onClick={() => move(w, -1)}>
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" className="btn-ghost p-1" aria-label={t('dashboard.customize.down', { name: WIDGET_META[w].label })} disabled={i === arr.length - 1} onClick={() => move(w, 1)}>
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button type="button" className="btn-ghost p-1" aria-label={hidden.has(w) ? t('dashboard.customize.show', { name: WIDGET_META[w].label }) : t('dashboard.customize.hide', { name: WIDGET_META[w].label })} onClick={() => toggleHidden(w)}>
                      {hidden.has(w) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </div>
              )}
              {hasContent[w] ? widgets[w] : customize ? <div className="card px-5 py-4 text-[12px] text-ink-500">{t('dashboard.customize.later')}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
