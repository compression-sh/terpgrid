import { Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { type Phase, type PhaseStatus, type Route, TIMELINES, formatMinutes, phaseStatusAt, relativeIntensityBand } from '../lib/calc/timeline';

const ROUTE_COLOR: Record<Route, string> = { smoking: '#38bdf8', edibles: '#5fe39a' };
const PHASE_COLOR: Record<Phase['id'], string> = {
  onset: '#38bdf8',
  peak: '#5fe39a',
  comedown: '#facc15',
  residual: '#8c9a95',
};
const STATUS_LABEL: Record<PhaseStatus, string> = {
  'not-yet': 'noch nicht',
  possible: 'möglich',
  likely: 'wahrscheinlich',
  over: 'vorbei',
};

type Show = 'both' | Route;

export function TimelineView() {
  const [show, setShow] = useState<Show>('both');
  const [horizonH, setHorizonH] = useState<'6' | '12' | '24'>('12');
  const [t, setT] = useState(90);
  const horizon = Number(horizonH) * 60;
  const routes: Route[] = show === 'both' ? ['smoking', 'edibles'] : [show];

  const data = useMemo(() => {
    const step = horizon / 120;
    return Array.from({ length: 121 }, (_, i) => {
      const m = i * step;
      return {
        m,
        smoking: relativeIntensityBand('smoking', m),
        edibles: relativeIntensityBand('edibles', m),
      };
    });
  }, [horizon]);

  const time = Math.min(t, horizon);

  return (
    <div className="space-y-5">
      <Card
        title="Wirkungsverlauf"
        subtitle="Qualitative Darstellung typischer Zeitbereiche. Die Höhe ist relativ und keine Wirkstärke-Prognose."
        icon={<Clock className="size-4" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmented
            label="Konsumform"
            value={show}
            onChange={setShow}
            options={[
              { value: 'both', label: 'Vergleich' },
              { value: 'smoking', label: 'Rauchen' },
              { value: 'edibles', label: 'Edibles' },
            ]}
          />
          <Segmented
            label="Zeitraum"
            value={horizonH}
            onChange={setHorizonH}
            options={[
              { value: '6', label: '6 Std.' },
              { value: '12', label: '12 Std.' },
              { value: '24', label: '24 Std.' },
            ]}
          />
        </div>

        <div className="mt-5 h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <defs>
                {routes.map((r) => (
                  <linearGradient key={r} id={`g-${r}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={ROUTE_COLOR[r]} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={ROUTE_COLOR[r]} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="m"
                type="number"
                domain={[0, horizon]}
                ticks={Array.from({ length: Number(horizonH) / (horizon > 720 ? 3 : 1) + 1 }, (_, i) => i * 60 * (horizon > 720 ? 3 : 1))}
                tickFormatter={(m: number) => `${m / 60} h`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v: number) => (v === 1 ? 'max' : v === 0 ? '0' : '')} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }}
                labelFormatter={(m: number) => `${formatMinutes(m)} nach Konsum`}
                formatter={(_v: unknown, name: string) => [
                  'typischer Bereich',
                  name === 'smoking' ? 'Rauchen' : 'Edibles',
                ]}
              />
              {routes.map((r) => (
                <Area key={r} type="monotone" dataKey={r} stroke={ROUTE_COLOR[r]} strokeOpacity={0.6} strokeWidth={1} fill={`url(#g-${r})`} isAnimationActive={false} />
              ))}
              <ReferenceLine x={time} stroke="#f2f6f4" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="tl-time" className="label">
              Zeit seit Konsum
            </label>
            <span className="font-mono text-sm tabular text-ink-50">{formatMinutes(time)}</span>
          </div>
          <input
            id="tl-time"
            type="range"
            className="slider"
            min={0}
            max={horizon}
            step={5}
            value={time}
            style={{ ['--fill' as string]: `${(time / horizon) * 100}%` }}
            onChange={(e) => setT(Number(e.target.value))}
          />
        </div>

        <div className={`mt-5 grid gap-3 ${routes.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {routes.map((r) => (
            <PhaseStatusPanel key={r} route={r} t={time} />
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {(['smoking', 'edibles'] as const).map((r) => (
          <Card key={r} title={TIMELINES[r].title} subtitle="Phasen mit unscharfen Grenzen (früheste bis späteste Übergänge)">
            <PhaseGantt route={r} />
            <dl className="mt-4 grid grid-cols-2 gap-2">
              {TIMELINES[r].keyFacts.map((f) => (
                <div key={f.label} className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
                  <dt className="text-[11px] text-ink-400">{f.label}</dt>
                  <dd className="text-[13px] font-medium text-ink-100">{f.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4">
              <Callout tone={r === 'edibles' ? 'danger' : 'warn'}>{TIMELINES[r].warning}</Callout>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PhaseStatusPanel({ route, t }: { route: Route; t: number }) {
  const tl = TIMELINES[route];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-100">
        <span className="size-2 rounded-full" style={{ background: ROUTE_COLOR[route] }} />
        {tl.title}
      </div>
      <ul className="space-y-2">
        {tl.phases.map((p) => {
          const s = phaseStatusAt(p, t);
          const active = s === 'likely' || s === 'possible';
          return (
            <li key={p.id} className={`flex items-start justify-between gap-3 text-[13px] transition-opacity ${active ? '' : 'opacity-45'}`}>
              <div>
                <div className="font-medium text-ink-100">{p.label}</div>
                {active && <div className="hint">{p.description}</div>}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                  s === 'likely' ? 'bg-leaf-500/15 text-leaf-300' : s === 'possible' ? 'bg-amber-400/10 text-amber-300' : 'bg-white/[0.04] text-ink-400'
                }`}
              >
                {STATUS_LABEL[s]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Gantt-Diagramm mit Verläufen an den unsicheren Rändern; Zeitachse in Wurzelskala. */
function PhaseGantt({ route }: { route: Route }) {
  const tl = TIMELINES[route];
  const H = tl.horizonMin;
  // Wurzelskala: frühe Phasen (Minuten) bleiben sichtbar, 24 h passen trotzdem.
  const x = (m: number) => Math.sqrt(m / H) * 100;
  const ticks = [0, 10, 30, 60, 120, 240, 480, 720, 1440];
  return (
    <div>
      <div className="space-y-2.5">
        {tl.phases.map((p) => {
          const s0 = x(p.startMin[0]);
          const s1 = x(p.startMin[1]);
          const e0 = x(p.endMin[0]);
          const e1 = x(p.endMin[1]);
          const c = PHASE_COLOR[p.id];
          const w = e1 - s0 || 1;
          const g = `linear-gradient(to right, transparent 0%, ${c} ${((s1 - s0) / w) * 100}%, ${c} ${((e0 - s0) / w) * 100}%, transparent 100%)`;
          return (
            <div key={p.id} className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
              <div className="text-xs text-ink-300">{p.label}</div>
              <div className="relative h-5 rounded-md bg-white/[0.02]">
                <div
                  className="absolute inset-y-0 rounded-md opacity-80"
                  style={{ left: `${s0}%`, width: `${w}%`, background: g }}
                  title={`${p.label}: Beginn ${formatMinutes(p.startMin[0])}–${formatMinutes(p.startMin[1])}, Ende ${formatMinutes(p.endMin[0])}–${formatMinutes(p.endMin[1])}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative ml-[7.25rem] mt-2 h-4 text-[10px] text-ink-400">
        {ticks.map((m) => (
          <span key={m} className="absolute -translate-x-1/2" style={{ left: `${x(m)}%` }}>
            {m < 60 ? `${m}′` : `${m / 60}h`}
          </span>
        ))}
      </div>
    </div>
  );
}
