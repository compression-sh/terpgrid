import { ArrowLeft, Database, ExternalLink, FlaskRound, Loader2, Sprout } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFullCatalog } from '../../app/catalog';
import { useData } from '../../app/DataProvider';
import { href } from '../../app/router';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { StrainVisual } from '../../components/discover/StrainVisual';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { AROMA_FAMILIES, type AromaFamily, TERPENES, type TerpeneInfo, matchTerpene, terpeneById } from '../../lib/catalog/terpenes';
import type { CatalogStrain } from '../../lib/catalog/types';
import { fmt } from '../../lib/format';
import { toPercent } from '../../lib/lab';

const tooltipStyle = { background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 };

/**
 * Terpen-Rad: äußerer Ring = Aromafamilien, innere Punkte = Terpene, verbunden
 * mit den Familien, die ihrem beschriebenen Aroma entsprechen. Rein qualitativ.
 */
function TerpeneWheel({ active, onSelect }: { active?: string; onSelect: (id: string) => void }) {
  const [hover, setHover] = useState<AromaFamily | null>(null);
  const cx = 160;
  const cy = 160;
  const famAngle = (i: number) => (i / AROMA_FAMILIES.length) * Math.PI * 2 - Math.PI / 2;
  const arc = (r0: number, r1: number, a0: number, a1: number) => {
    const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    return `M ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
  };
  const step = (Math.PI * 2) / AROMA_FAMILIES.length;
  const terpPos = TERPENES.map((t, i) => {
    const a = (i / TERPENES.length) * Math.PI * 2 - Math.PI / 2 + step / 2;
    return { t, x: cx + 66 * Math.cos(a), y: cy + 66 * Math.sin(a) };
  });
  return (
    <svg viewBox="0 0 320 320" className="mx-auto w-full max-w-[340px]" role="img" aria-label="Terpen-Rad: Zuordnung der Terpene zu Aromafamilien">
      {AROMA_FAMILIES.map((f, i) => {
        const a0 = famAngle(i) + 0.02;
        const a1 = famAngle(i + 1) - 0.02;
        const mid = (a0 + a1) / 2;
        const on = hover === f.id || (active && terpeneById(active)?.families.includes(f.id));
        return (
          <g key={f.id} onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}>
            <path d={arc(112, 150, a0, a1)} fill={f.color} fillOpacity={on ? 0.55 : 0.18} stroke={f.color} strokeOpacity={0.4} />
            <text x={cx + 131 * Math.cos(mid)} y={cy + 131 * Math.sin(mid)} fill="#dfe7e3" fontSize="10.5" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter Variable, sans-serif">
              {f.id}
            </text>
          </g>
        );
      })}
      {terpPos.map(({ t, x, y }) =>
        t.families.map((fam) => {
          const fi = AROMA_FAMILIES.findIndex((f) => f.id === fam);
          const mid = famAngle(fi) + step / 2;
          const show = active === t.id || hover === fam;
          return <line key={`${t.id}-${fam}`} x1={x} y1={y} x2={cx + 110 * Math.cos(mid)} y2={cy + 110 * Math.sin(mid)} stroke={t.color} strokeOpacity={show ? 0.85 : 0.12} strokeWidth={show ? 1.4 : 1} />;
        }),
      )}
      {terpPos.map(({ t, x, y }) => (
        <g key={t.id} role="button" tabIndex={0} aria-label={t.name} onClick={() => onSelect(t.id)} onKeyDown={(e) => e.key === 'Enter' && onSelect(t.id)} className="cursor-pointer outline-none">
          <circle cx={x} cy={y} r={active === t.id ? 17 : 14} fill="#0a0d0c" stroke={t.color} strokeWidth={active === t.id ? 2.5 : 1.5} />
          <text x={x} y={y + 1} fill={t.color} fontSize="8.5" fontWeight={600} textAnchor="middle" dominantBaseline="middle" fontFamily="Inter Variable, sans-serif">
            {t.name.replace(/^[αβ]-/, '').slice(0, 5)}
          </text>
        </g>
      ))}
      <circle cx={cx} cy={cy} r={34} fill="#0e1211" stroke="rgb(255 255 255 / 0.08)" />
      <text x={cx} y={cy - 4} fill="#8c9a95" fontSize="9" textAnchor="middle" fontFamily="Inter Variable, sans-serif">
        Aroma-
      </text>
      <text x={cx} y={cy + 8} fill="#8c9a95" fontSize="9" textAnchor="middle" fontFamily="Inter Variable, sans-serif">
        familien
      </text>
    </svg>
  );
}

/** Wie oft nennt der Katalog ein Terpen? (Nennungen, KEINE Konzentrationen) */
function useMentionStats(items: CatalogStrain[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    const firsts = new Map<string, number>();
    for (const s of items) {
      const seen = new Set<string>();
      s.terpenes.forEach((t, i) => {
        const id = matchTerpene(t)?.id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (i === 0) firsts.set(id, (firsts.get(id) ?? 0) + 1);
      });
    }
    const withTerps = items.filter((s) => s.terpenes.length > 0).length;
    return {
      withTerps,
      rows: TERPENES.map((t) => ({ id: t.id, name: t.name, color: t.color, count: counts.get(t.id) ?? 0, first: firsts.get(t.id) ?? 0 })).sort((a, b) => b.count - a.count),
    };
  }, [items]);
}

function CatalogLoader({ full }: { full: ReturnType<typeof useFullCatalog> }) {
  if (full.loaded) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] text-ink-300">Für Auswertungen über alle Sorten wird der Online-Katalog einmalig vollständig geladen (wenige Anfragen, lokal zwischengespeichert).</p>
      <button type="button" className="btn-ghost shrink-0" onClick={full.load} disabled={full.loading}>
        {full.loading ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
        {full.progress ? `${full.progress.loaded}/${full.progress.total}` : 'Katalog laden'}
      </button>
      {full.error && <p className="text-[12px] text-rose-300">{full.error}</p>}
    </div>
  );
}

function TerpeneDetail({ t }: { t: TerpeneInfo }) {
  const { data } = useData();
  const full = useFullCatalog();
  const strains = useMemo(() => full.items.filter((s) => s.terpenes.some((x) => matchTerpene(x)?.id === t.id)), [full.items, t.id]);
  const dominant = strains.filter((s) => matchTerpene(s.terpenes[0] ?? '')?.id === t.id);
  const mine = data.strains.filter((s) => s.terpenes.some((x) => matchTerpene(x.name)?.id === t.id));
  const labs = data.labReports
    .map((r) => ({ r, v: r.terpenes.find((x) => matchTerpene(x.name)?.id === t.id) }))
    .filter((x): x is { r: (typeof data.labReports)[number]; v: { name: string; value: number } } => !!x.v);

  return (
    <div className="space-y-5">
      <a href={href('discover/terpenes')} className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
        <ArrowLeft className="size-3.5" /> Terpen-Atlas
      </a>
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] p-6 sm:p-8" style={{ background: `radial-gradient(600px 240px at 0% 0%, ${t.color}22, transparent 70%)` }}>
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em]" style={{ color: t.color }}>
          {t.className}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">{t.name}</h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-300">{t.summary}</p>
        <dl className="mt-6 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Summenformel', t.formula],
            ['Molare Masse', `${t.molarMass.toLocaleString('de-DE')} g/mol`],
            ['CAS-Nr.', t.cas],
            ['PubChem CID', String(t.pubchemCid)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/[0.06] bg-ink-950/50 px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">{k}</dt>
              <dd className="mt-0.5 font-mono text-[14px] text-ink-50">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0 space-y-5">
          <Card title="Dokumentierte Sorten" subtitle="Sorten, deren Terpenliste laut StrainAPI dieses Terpen nennt – ohne Mengenangaben">
            <CatalogLoader full={full} />
            {full.loaded && (
              <>
                <p className="mb-4 text-[13px] text-ink-300">
                  <span className="font-mono text-ink-50">{strains.length}</span> von {full.items.length} Sorten nennen {t.name}; bei <span className="font-mono text-ink-50">{dominant.length}</span> steht es an erster Stelle.
                </p>
                {strains.length === 0 ? (
                  <EmptyState compact title="Keine Sorten mit dieser Angabe" />
                ) : (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(dominant.length >= 6 ? dominant : strains).slice(0, 12).map((s) => (
                      <li key={s.key}>
                        <a href={href(`discover/strain/${s.id}`)} className="group block overflow-hidden rounded-xl border border-white/[0.06] hover:border-white/[0.14]">
                          <StrainVisual image={s.image} name={s.name} className="aspect-[4/3] w-full" />
                          <div className="px-2.5 py-2">
                            <div className="truncate text-[12px] font-medium text-ink-100">{s.name}</div>
                            <div className="truncate text-[10px] text-ink-500">Position {s.terpenes.findIndex((x) => matchTerpene(x)?.id === t.id) + 1} von {s.terpenes.length}</div>
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {strains.length > 12 && (
                  <a href={href(`discover?terp=${t.id}`)} className="btn-ghost mt-3 py-1.5 text-xs">
                    Alle {strains.length} in Discover filtern
                  </a>
                )}
              </>
            )}
          </Card>
          <Card title="Deine Daten" icon={<FlaskRound className="size-4" />}>
            {labs.length === 0 && mine.length === 0 ? (
              <p className="hint">Keine eigenen Sorten oder Laborberichte mit {t.name}.</p>
            ) : (
              <div className="space-y-3">
                {labs.length > 0 && (
                  <ul className="space-y-1.5">
                    {labs.map(({ r, v }) => (
                      <li key={r.id} className="flex justify-between text-[13px]">
                        <a href={href('lab-reports')} className="text-ink-100 hover:text-leaf-200">
                          {r.title}
                        </a>
                        <span className="font-mono text-ink-300">
                          {fmt(toPercent(v.value, r.unit)!)} % <span className="text-[10px] text-ink-500">(Labor)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {mine.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {mine.map((s) => (
                      <a key={s.id} href={href(`strains/${s.id}`)} className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2.5 py-1 text-[12px] text-ink-200 hover:border-white/20">
                        <Sprout className="size-3" /> {s.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
        <div className="min-w-0 space-y-5">
          <Card title="Aroma">
            <div className="flex flex-wrap gap-1.5">
              {t.aroma.map((a) => (
                <span key={a} className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: `${t.color}1f`, color: t.color }}>
                  {a}
                </span>
              ))}
            </div>
          </Card>
          <Card title="Natürliche Vorkommen">
            <ul className="space-y-1.5 text-[13px] text-ink-300">
              {t.occurrences.map((o) => (
                <li key={o} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full" style={{ background: t.color }} />
                  {o}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Quellen">
            <ul className="space-y-2.5">
              {t.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="group flex gap-1.5 text-[12px] leading-relaxed text-ink-300 hover:text-ink-100">
                    <span>{s.label}</span>
                    <ExternalLink className="mt-0.5 size-3 shrink-0 text-ink-500 group-hover:text-ink-300" />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-[11px] leading-relaxed text-ink-500">Das Vorkommen eines Terpens in einer Sorte ist keine Aussage über gesundheitliche oder psychoaktive Wirkungen.</p>
        </div>
      </div>
    </div>
  );
}

export function TerpeneAtlas({ terpeneId }: { terpeneId?: string }) {
  const { data } = useData();
  const full = useFullCatalog();
  const [focus, setFocus] = useState<string>();
  const [compare, setCompare] = useState<string[]>(['myrcene', 'limonene']);
  const stats = useMentionStats(full.items);
  const detail = terpeneId ? terpeneById(terpeneId) : undefined;

  if (terpeneId) {
    return (
      <div>
        <DiscoverNav />
        {detail ? <TerpeneDetail t={detail} /> : <EmptyState title="Terpen nicht im Atlas" action={<a className="btn-primary" href={href('discover/terpenes')}>Zum Atlas</a>} />}
      </div>
    );
  }

  const labReports = data.labReports.filter((r) => r.terpenes.length > 0);
  const compared = compare.map((id) => terpeneById(id)).filter((t): t is TerpeneInfo => !!t);

  return (
    <div>
      <DiscoverNav />
      <div className="mb-6 animate-fade-up">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-leaf-400/90">Terpen-Atlas</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-[40px] sm:leading-[1.1]">Aromen verstehen.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">Chemische Grunddaten, natürliche Vorkommen und Aromen häufig beschriebener Cannabis-Terpene – mit Quellen. Keine Wirkungsversprechen.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card title="Terpen-Rad" subtitle="Terpene und ihre beschriebenen Aromafamilien">
          <TerpeneWheel active={focus} onSelect={(id) => setFocus(id === focus ? undefined : id)} />
          {focus && terpeneById(focus) && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-2">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink-50">{terpeneById(focus)!.name}</div>
                <div className="truncate text-[11px] text-ink-500">{terpeneById(focus)!.aroma.join(', ')}</div>
              </div>
              <a href={href(`discover/terpenes/${focus}`)} className="btn-ghost shrink-0 py-1.5 text-xs">
                Details
              </a>
            </div>
          )}
        </Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TERPENES.map((t) => (
            <a key={t.id} href={href(`discover/terpenes/${t.id}`)} className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70 p-4 transition-colors hover:border-white/[0.14]">
              <div className="absolute -right-6 -top-6 size-20 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-35" style={{ background: t.color }} />
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-ink-50">{t.name}</h3>
                <span className="font-mono text-[11px] text-ink-500">{t.formula}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-500">{t.className}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {t.aroma.slice(0, 3).map((a) => (
                  <span key={a} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: `${t.color}1a`, color: t.color }}>
                    {a}
                  </span>
                ))}
              </div>
              <p className="mt-3 line-clamp-1 text-[12px] text-ink-400">Vorkommen: {t.occurrences.slice(0, 2).join(', ')}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Terpene vergleichen" subtitle="Chemische Daten und Aromen nebeneinander">
          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Terpene zum Vergleich">
            {TERPENES.map((t) => {
              const on = compare.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCompare((c) => (on ? c.filter((x) => x !== t.id) : c.length >= 3 ? [...c.slice(1), t.id] : [...c, t.id]))}
                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-white/25 text-ink-50' : 'border-white/[0.06] text-ink-500'}`}
                  style={on ? { background: `${t.color}22` } : undefined}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          {compared.length < 2 ? (
            <p className="hint">Mindestens zwei Terpene wählen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[12px]">
                <thead>
                  <tr className="text-ink-500">
                    <th className="py-1.5 pr-3 font-medium" />
                    {compared.map((t) => (
                      <th key={t.id} className="py-1.5 pr-3 font-semibold" style={{ color: t.color }}>
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-ink-200">
                  {(
                    [
                      ['Klasse', (t: TerpeneInfo) => t.className],
                      ['Formel', (t: TerpeneInfo) => t.formula],
                      ['Molare Masse', (t: TerpeneInfo) => `${t.molarMass.toLocaleString('de-DE')} g/mol`],
                      ['Aroma', (t: TerpeneInfo) => t.aroma.join(', ')],
                      ['Aromafamilien', (t: TerpeneInfo) => t.families.join(', ')],
                      ['Vorkommen', (t: TerpeneInfo) => t.occurrences.slice(0, 3).join(', ')],
                    ] as const
                  ).map(([label, get]) => (
                    <tr key={label} className="border-t border-white/[0.05] align-top">
                      <td className="py-2 pr-3 text-ink-500">{label}</td>
                      {compared.map((t) => (
                        <td key={t.id} className="py-2 pr-3">
                          {get(t)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Nennungen im Katalog" subtitle="Wie oft Sorten ein Terpen in ihrer Terpenliste nennen – keine Konzentrationen">
          <CatalogLoader full={full} />
          {full.loaded && (
            <>
              <div className="h-60" role="img" aria-label="Anzahl der Sorten je genanntem Terpen">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={92} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v, n === 'count' ? 'Sorten mit Nennung' : 'an erster Stelle']} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
                      {stats.rows.map((r) => (
                        <Cell key={r.id} fill={r.color} fillOpacity={0.75} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="hint mt-2">
                Basis: {stats.withTerps} von {full.items.length} Sorten mit Terpenliste (StrainAPI). Eine Nennung sagt nichts über die Menge aus.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card title="Dokumentierte Zusammensetzungen" subtitle="Nur aus deinen Laborberichten mit Mengenangaben" className="mt-5">
        {labReports.length === 0 ? (
          <EmptyState
            compact
            icon={<FlaskRound />}
            title="Keine quantitativen Daten"
            text="Prozentuale Zusammensetzungen werden nur aus Laborberichten mit Mengenangaben dargestellt."
            action={
              <a href={href('lab-reports')} className="btn-ghost">
                Laborbericht erfassen
              </a>
            }
          />
        ) : (
          <ul className="space-y-4">
            {labReports.map((r) => {
              const rows = r.terpenes.map((x) => ({ ...x, pct: toPercent(x.value, r.unit) ?? 0, info: matchTerpene(x.name) })).sort((a, b) => b.pct - a.pct);
              const total = rows.reduce((s, x) => s + x.pct, 0);
              return (
                <li key={r.id}>
                  <div className="mb-1.5 flex justify-between text-[12px]">
                    <span className="text-ink-100">{r.title}</span>
                    <span className="font-mono text-ink-400">Σ {fmt(total)} %</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-ink-700">
                    {rows.map((x) => (
                      <div key={x.name} title={`${x.info?.name ?? x.name}: ${fmt(x.pct)} %`} style={{ width: `${(x.pct / Math.max(total, 0.0001)) * 100}%`, background: x.info?.color ?? '#5f6d68' }} />
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-400">
                    {rows.map((x) => (
                      <span key={x.name} className="flex items-center gap-1">
                        <span className="size-2 rounded-sm" style={{ background: x.info?.color ?? '#5f6d68' }} />
                        {x.info?.name ?? x.name} {fmt(x.pct)} %
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
