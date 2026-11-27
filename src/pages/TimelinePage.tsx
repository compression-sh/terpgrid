import { Bell, BookOpenText, Camera, FlaskRound, Flag, Gauge, History, Leaf, type LucideIcon, Package, Sprout } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../app/DataProvider';
import { href, setQuery, useRoute } from '../app/router';
import { usePhotoUrl } from '../components/photos/usePhotoUrl';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { fmtDateLong, relativeDay, today } from '../lib/dates';
import { type TimelineEvent, type TimelineKind, buildTimeline, groupByDay } from '../lib/timeline';

const KIND: Record<TimelineKind, { label: string; icon: LucideIcon; tone: string }> = {
  milestone: { label: 'Meilensteine', icon: Flag, tone: 'text-leaf-300 bg-leaf-500/10' },
  activity: { label: 'Pflege', icon: Sprout, tone: 'text-sky-300 bg-sky-500/10' },
  measurement: { label: 'Messwerte', icon: Gauge, tone: 'text-cyan-300 bg-cyan-500/10' },
  photo: { label: 'Fotos', icon: Camera, tone: 'text-violet-300 bg-violet-500/10' },
  journal: { label: 'Journal', icon: BookOpenText, tone: 'text-amber-200 bg-amber-400/10' },
  strain: { label: 'Sorten', icon: Leaf, tone: 'text-emerald-300 bg-emerald-500/10' },
  collection: { label: 'Sammlung', icon: Package, tone: 'text-orange-200 bg-orange-400/10' },
  lab: { label: 'Labor', icon: FlaskRound, tone: 'text-rose-200 bg-rose-500/10' },
  reminder: { label: 'Kalender', icon: Bell, tone: 'text-ink-200 bg-white/[0.06]' },
};

function Thumb({ id }: { id: string }) {
  const { url } = usePhotoUrl(id, 'thumb');
  return url ? <img src={url} alt="" className="size-12 shrink-0 rounded-lg object-cover" loading="lazy" /> : <span className="size-12 shrink-0 animate-pulse rounded-lg bg-white/[0.04]" />;
}

function Row({ e }: { e: TimelineEvent }) {
  const k = KIND[e.kind];
  const Icon = k.icon;
  const time = e.at.length > 10 ? e.at.slice(11, 16) : null;
  return (
    <li>
      <a href={href(e.to)} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03] sm:px-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${k.tone}`}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-ink-100 group-hover:text-ink-50">{e.title}</span>
          {e.subtitle && <span className="block truncate text-[12px] text-ink-500">{e.subtitle}</span>}
        </span>
        {e.photoId && <Thumb id={e.photoId} />}
        {time && <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink-500">{time}</span>}
      </a>
    </li>
  );
}

export function TimelinePage() {
  const { data } = useData();
  const route = useRoute();
  const [days, setDays] = useState(30);
  const kindsParam = route.query.get('k') ?? '';
  const kinds = useMemo(() => kindsParam.split(',').filter((x): x is TimelineKind => x in KIND), [kindsParam]);
  const growFilter = route.query.get('grow') ?? '';
  const now = today();
  const all = useMemo(() => buildTimeline(data, { today: now }), [data, now]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(Object.keys(KIND).map((k) => [k, 0])) as Record<TimelineKind, number>;
    for (const e of all) c[e.kind]++;
    return c;
  }, [all]);
  const filtered = useMemo(() => all.filter((e) => (!kinds.length || kinds.includes(e.kind)) && (!growFilter || e.growId === growFilter)), [all, kinds, growFilter]);
  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const toggle = (k: TimelineKind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    setQuery(route, { k: next.length ? next.join(',') : undefined });
    setDays(30);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Verlauf" subtitle="Deine persönliche Zeitachse aus Grows, Pflege, Messwerten, Fotos, Journal, Sorten und Laborberichten." />
      {all.length === 0 ? (
        <EmptyState icon={<History />} title="Noch nichts passiert" text="Sobald du Grows, Fotos oder Journal-Einträge erfasst, erscheinen sie hier chronologisch. Es werden keine Beispieldaten angezeigt." />
      ) : (
        <>
          <div className="sticky top-[57px] z-10 -mx-4 mb-4 space-y-2 border-b border-white/[0.04] bg-ink-950/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:rounded-xl lg:border lg:px-3">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Nach Art filtern">
              {(Object.keys(KIND) as TimelineKind[])
                .filter((k) => counts[k] > 0)
                .map((k) => {
                  const on = kinds.includes(k);
                  const Icon = KIND[k].icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(k)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${on ? 'border-leaf-500/40 bg-leaf-500/10 text-leaf-100' : 'border-white/[0.07] text-ink-300 hover:border-white/[0.14]'}`}
                    >
                      <Icon className="size-3.5" /> {KIND[k].label}
                      <span className="font-mono text-[10.5px] text-ink-500">{counts[k]}</span>
                    </button>
                  );
                })}
            </div>
            {data.grows.length > 0 && (
              <select className="input-base py-1.5 text-[13px] sm:w-64" aria-label="Nach Grow filtern" value={growFilter} onChange={(e) => setQuery(route, { grow: e.target.value || undefined })}>
                <option value="">Alle Grows und Bereiche</option>
                {data.grows.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {groups.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-500">Keine Einträge für diese Auswahl.</p>
          ) : (
            <ol className="space-y-5">
              {groups.slice(0, days).map((g) => (
                <li key={g.day}>
                  <h2 className="mb-1 flex items-baseline gap-2 px-2 sm:px-3">
                    <span className="text-[13px] font-semibold text-ink-100">{relativeDay(g.day, now)}</span>
                    <span className="text-[11.5px] text-ink-500">{fmtDateLong(g.day)}</span>
                  </h2>
                  <ul className="card divide-y divide-white/[0.03] p-1">
                    {g.events.map((e) => (
                      <Row key={e.id} e={e} />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          {groups.length > days && (
            <div className="mt-6 flex justify-center">
              <button type="button" className="btn-ghost" onClick={() => setDays((d) => d + 30)}>
                Ältere Tage anzeigen ({groups.length - days} weitere)
              </button>
            </div>
          )}
          <p className="mt-6 text-center text-[11.5px] text-ink-600">Nur deine eigenen Einträge – kein Feed, nichts wird geteilt. Die Zeitachse wird aus vorhandenen Daten berechnet und nicht separat gespeichert.</p>
        </>
      )}
    </div>
  );
}
