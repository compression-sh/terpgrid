import { AlertTriangle, ArrowLeft, BadgeCheck, ExternalLink, FlaskRound, Layers, Search, Sprout } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { useAsync, useLibraryStatus } from '../../app/library';
import { href } from '../../app/router';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { EvidenceTag } from '../../components/discover/EvidenceTag';
import { MoleculeView } from '../../components/discover/MoleculeView';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { library } from '../../lib/catalog/library';
import {
  AROMA_FAMILIES,
  type AromaFamily,
  CHEM_META,
  TERPENES,
  TERPENE_GROUPS,
  type TerpeneGroup,
  type TerpeneInfo,
  matchTerpene,
  matchTerpeneGroup,
  terpeneById,
  terpeneChem,
  terpeneGroupById,
} from '../../lib/catalog/terpenes';
import { fmtDate } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { toPercent } from '../../lib/lab';

const ext = { target: '_blank', rel: 'noopener noreferrer nofollow', referrerPolicy: 'no-referrer' } as const;
const isPubchem = (url: string) => url.includes('pubchem.ncbi.nlm.nih.gov');
/** Literaturbelege für ein Vorkommen in Cannabis: nur Quellen, deren Volltext für diesen Atlas geprüft wurde */
const cannabisSources = (t: TerpeneInfo) => t.sources.filter((s) => !isPubchem(s.url) && s.label.includes('Volltext geprüft'));
const groupsOf = (id: string) => TERPENE_GROUPS.filter((g) => g.members.includes(id));

/**
 * Terpen-Rad: äußerer Ring = Aromafamilien, innere Punkte = Terpene, verbunden mit den Familien,
 * die ihrer belegten Geruchsbeschreibung entsprechen. Gestrichelt = keine Geruchsbeschreibung belegt.
 */
function TerpeneWheel({ items, active, onSelect }: { items: TerpeneInfo[]; active?: string; onSelect: (id: string) => void }) {
  const [hover, setHover] = useState<AromaFamily | null>(null);
  const cx = 180;
  const cy = 180;
  const n = AROMA_FAMILIES.length;
  const famAngle = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const step = (Math.PI * 2) / n;
  const arc = (r0: number, r1: number, a0: number, a1: number) => {
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    return `M ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
  };
  const pos = items.map((t, i) => {
    const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
    return { t, x: cx + 92 * Math.cos(a), y: cy + 92 * Math.sin(a) };
  });
  const act = active ? terpeneById(active) : undefined;
  return (
    <svg viewBox="0 0 360 360" className="mx-auto w-full max-w-[380px]" role="group" aria-label="Terpen-Rad: Zuordnung der Terpene zu Aromafamilien">
      {AROMA_FAMILIES.map((f, i) => {
        const a0 = famAngle(i) + 0.02;
        const a1 = famAngle(i + 1) - 0.02;
        const mid = (a0 + a1) / 2;
        const on = hover === f.id || act?.families.includes(f.id);
        return (
          <g key={f.id} onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}>
            <path d={arc(132, 172, a0, a1)} fill={f.color} fillOpacity={on ? 0.55 : 0.16} stroke={f.color} strokeOpacity={0.4} />
            <text x={cx + 152 * Math.cos(mid)} y={cy + 152 * Math.sin(mid)} fill="#dfe7e3" fontSize="11" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter Variable, sans-serif">
              {f.id}
            </text>
          </g>
        );
      })}
      {pos.map(({ t, x, y }) =>
        t.families.map((fam) => {
          const fi = AROMA_FAMILIES.findIndex((f) => f.id === fam);
          const mid = famAngle(fi) + step / 2;
          const show = active === t.id || hover === fam;
          return <line key={`${t.id}-${fam}`} x1={x} y1={y} x2={cx + 130 * Math.cos(mid)} y2={cy + 130 * Math.sin(mid)} stroke={t.color} strokeOpacity={show ? 0.85 : 0.09} strokeWidth={show ? 1.4 : 1} />;
        }),
      )}
      {pos.map(({ t, x, y }) => (
        <g
          key={t.id}
          role="button"
          tabIndex={0}
          aria-pressed={active === t.id}
          aria-label={`${t.name}${t.families.length ? '' : ' (keine Geruchsbeschreibung belegt)'}`}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(t.id))}
          className="cursor-pointer outline-none [&:focus-visible_circle]:stroke-white"
        >
          <title>{t.name}</title>
          <circle cx={x} cy={y} r={active === t.id ? 10 : 7.5} fill="#0a0d0c" stroke={t.color} strokeWidth={active === t.id ? 2.5 : 1.6} strokeDasharray={t.families.length ? undefined : '2 2'} />
        </g>
      ))}
      <circle cx={cx} cy={cy} r={58} fill="#0e1211" stroke="rgb(255 255 255 / 0.08)" />
      <text x={cx} y={cy - 6} fill={act?.color ?? '#8c9a95'} fontSize={act ? 12 : 10} fontWeight={act ? 600 : 400} textAnchor="middle" fontFamily="Inter Variable, sans-serif">
        {act ? act.name.replace(/ \(.*\)$/, '') : 'Aroma-'}
      </text>
      <text x={cx} y={cy + 10} fill="#8c9a95" fontSize="10" textAnchor="middle" fontFamily="Inter Variable, sans-serif">
        {act ? (act.families.join(' · ') || 'keine Angabe') : 'familien'}
      </text>
    </svg>
  );
}

/** Kennzahlen-Kachel der chemischen Identität */
function Fact({ k, v, mono = true, note, className = '' }: { k: string; v: string; mono?: boolean; note?: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className} rounded-xl border border-white/[0.06] bg-ink-950/50 px-3 py-2.5`}>
      <dt className="text-[10px] uppercase tracking-wider text-ink-500">{k}</dt>
      <dd className={`mt-0.5 break-words text-[13.5px] text-ink-50 ${mono ? 'font-mono' : ''}`}>{v}</dd>
      {note && <dd className="mt-0.5 text-[10.5px] leading-snug text-ink-500">{note}</dd>}
    </div>
  );
}

/** Sorten des lokalen Katalogs, deren Quellen das Terpen NENNEN (paginiert) */
function CatalogMentions({ id, label }: { id: string; label: string }) {
  const lib = useLibraryStatus();
  const [page, setPage] = useState(1);
  const res = useAsync((signal) => (lib ? library.terpeneCultivars(id, page, signal) : Promise.resolve(null)), [id, page, !!lib]);
  if (lib === null) return <p className="hint">Der lokale Sortenkatalog ist nur mit TERPGRID-Server verfügbar.</p>;
  const d = res.data;
  if (res.loading && !d) return <p className="hint">Wird geladen …</p>;
  if (res.error) return <p className="hint text-rose-300">{res.error}</p>;
  if (!d || d.total === 0) return <p className="text-[13px] text-ink-300">Keine Sorte im Katalog nennt {label}.</p>;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-300">
        <span className="font-mono text-ink-50">{d.total.toLocaleString('de-DE')}</span> Sorten nennen {label} in Seedbank-Texten oder Datenbank-Angaben. Nennungen sind keine Mengen und gelten für die
        jeweilige Quelle, nicht für jede Charge.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {d.items.map((c) => (
          <li key={c.id}>
            <a href={href(`discover/cultivar/${c.id}`)} className="block rounded-xl border border-white/[0.06] px-3 py-2 hover:border-white/[0.14]">
              <div className="truncate text-[13px] font-medium text-ink-100">
                {c.name}
                {c.version ? ` (${c.version})` : ''}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-ink-500">{c.breeder.name}</span>
                <EvidenceTag kind={c.terpeneSource === 'database' ? 'database' : 'seedbank'} />
              </div>
            </a>
          </li>
        ))}
      </ul>
      {d.totalPages > 1 && (
        <nav className="flex items-center justify-between text-[12px]" aria-label="Seiten">
          <button type="button" className="btn-ghost py-1 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Zurück
          </button>
          <span className="tabular text-ink-500">
            Seite {d.page} von {d.totalPages}
          </span>
          <button type="button" className="btn-ghost py-1 text-xs" disabled={page >= d.totalPages} onClick={() => setPage((p) => p + 1)}>
            Weiter
          </button>
        </nav>
      )}
    </div>
  );
}

function SourceList({ sources }: { sources: TerpeneInfo['sources'] }) {
  return (
    <ul className="space-y-2.5">
      {sources.map((s) => (
        <li key={s.url}>
          <a href={s.url} {...ext} className="group flex gap-1.5 text-[12px] leading-relaxed text-ink-300 hover:text-ink-100">
            <span>{s.label}</span>
            <ExternalLink className="mt-0.5 size-3 shrink-0 text-ink-500 group-hover:text-ink-300" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function TerpeneDetail({ t }: { t: TerpeneInfo }) {
  const { data } = useData();
  const chem = terpeneChem(t.id);
  const lit = cannabisSources(t);
  const groups = groupsOf(t.id);
  const mine = data.strains.filter((s) => s.terpenes.some((x) => matchTerpene(x.name)?.id === t.id));
  const labs = data.labReports
    .map((r) => ({ r, v: r.terpenes.find((x) => matchTerpene(x.name)?.id === t.id) }))
    .filter((x): x is { r: (typeof data.labReports)[number]; v: { name: string; value: number } } => !!x.v);
  const isomers = TERPENES.filter((o) => o.id !== t.id && o.formula === t.formula).slice(0, 8);

  return (
    <div className="space-y-5">
      <a href={href('discover/terpenes')} className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
        <ArrowLeft className="size-3.5" /> Terpen-Atlas
      </a>
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] p-6 sm:p-8" style={{ background: `radial-gradient(600px 240px at 0% 0%, ${t.color}22, transparent 70%)` }}>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: t.color }}>
              {t.className}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">{t.name}</h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-300">{t.summary}</p>
            {lit.length === 0 && (
              <p className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-100">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Vorkommen in Cannabis in den geprüften Quellen nicht belegt. Aufgeführt, weil Seedbank- oder Datenbanktexte den Namen nennen.
              </p>
            )}
          </div>
          {chem && (
            <figure className="rounded-2xl border border-white/[0.06] bg-ink-950/60 p-3">
              <div className="aspect-[4/3]">
                <MoleculeView chem={chem} color={t.color} size="lg" label={t.name} />
              </div>
              <figcaption className="mt-1 text-center text-[10.5px] text-ink-500">2D-Struktur nach PubChem · ohne Stereo-Keile</figcaption>
            </figure>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0 space-y-5">
          <Card title="Chemische Identität" subtitle={`Laut PubChem, abgerufen am ${fmtDate(CHEM_META.retrieved)}`} icon={<BadgeCheck className="size-4" />}>
            {chem ? (
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Fact k="Summenformel" v={t.formula} />
                <Fact k="Molare Masse" v={`${t.molarMass.toLocaleString('de-DE')} g/mol`} />
                <Fact k="PubChem CID" v={String(chem.cid)} />
                <Fact k="CAS-Nr." v={chem.cas ?? '–'} note={chem.casListed > 1 ? `Erste von ${chem.casListed} bei PubChem gelisteten Nummern (Isomere/Gemische)` : undefined} />
                <Fact className="col-span-2" k="PubChem-Eintrag" v={chem.title} mono={false} note="Der Titel zeigt, ob eine bestimmte Stereoform gemeint ist." />
                <Fact className="col-span-2 sm:col-span-3" k="IUPAC-Name" v={chem.iupac} />
                <Fact className="col-span-2 sm:col-span-3" k="InChIKey" v={chem.inchikey} />
              </dl>
            ) : (
              <p className="hint">Keine PubChem-Daten hinterlegt.</p>
            )}
            {chem && (
              <a href={`https://pubchem.ncbi.nlm.nih.gov/compound/${chem.cid}`} {...ext} className="mt-3 inline-flex items-center gap-1 text-[12px] text-leaf-300 hover:underline">
                Eintrag bei PubChem öffnen <ExternalLink className="size-3" />
              </a>
            )}
          </Card>

          <Card title="Sorten im Katalog" subtitle="Nennungen in Seedbank-Texten und Datenbank-Angaben – keine Mengen">
            <CatalogMentions id={t.id} label={t.name} />
            {groups.length > 0 && (
              <p className="hint mt-3">
                Nennungen ohne Isomerangabe stehen gesondert unter{' '}
                {groups.map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && ', '}
                    <a className="text-leaf-300 hover:underline" href={href(`discover/terpenes/${g.id}`)}>
                      {g.name}
                    </a>
                  </span>
                ))}
                .
              </p>
            )}
          </Card>

          <Card title="Deine Daten" subtitle="Privat, nur in deinem Konto" icon={<FlaskRound className="size-4" />}>
            {labs.length === 0 && mine.length === 0 ? (
              <p className="hint">Keine eigenen Sorten oder Laborberichte mit {t.name}.</p>
            ) : (
              <div className="space-y-3">
                {labs.length > 0 && (
                  <ul className="space-y-1.5">
                    {labs.map(({ r, v }) => (
                      <li key={r.id} className="flex flex-wrap justify-between gap-2 text-[13px]">
                        <a href={href('lab-reports')} className="text-ink-100 hover:text-leaf-200">
                          {r.title}
                          {r.testDate && <span className="text-ink-500"> · {fmtDate(r.testDate)}</span>}
                        </a>
                        <span className="flex items-center gap-2 font-mono text-ink-300">
                          {fmt(v.value)} {r.unit}
                          {r.unit !== '%' && toPercent(v.value, r.unit) !== undefined && <span className="text-[11px] text-ink-500">≙ {fmt(toPercent(v.value, r.unit)!)} %</span>}
                          <EvidenceTag kind="lab" />
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
                <p className="hint">Messwerte gelten für die jeweilige Probe und werden nie in den Katalog übertragen.</p>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card title="Geruch" subtitle="Belegte Beschreibungen, Originalwortlaut">
            {t.aroma.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {t.aroma.map((a) => (
                  <span key={a} className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: `${t.color}1f`, color: t.color }}>
                    {a}
                  </span>
                ))}
              </div>
            )}
            {chem && chem.odor.length > 0 ? (
              <ul className="space-y-2">
                {chem.odor.map((o) => (
                  <li key={o.text} className="text-[12.5px] leading-relaxed text-ink-300">
                    „{o.text}“ <span className="text-[11px] text-ink-500">– PubChem, {o.section}{o.source ? ` (${o.source})` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-ink-400">
                {t.aroma.length ? 'Stichworte nach den unten genannten Übersichtsarbeiten.' : 'PubChem enthält keine Geruchsbeschreibung; der Atlas ergänzt keine.'}
              </p>
            )}
          </Card>

          <Card title="Vorkommen in Cannabis" subtitle="Nur Quellen, deren Volltext geprüft wurde">
            {lit.length ? (
              <SourceList sources={lit} />
            ) : (
              <p className="text-[12.5px] text-ink-400">In den geprüften Quellen nicht belegt.</p>
            )}
            {t.occurrences.length > 0 && (
              <>
                <p className="mb-1.5 mt-4 text-[11px] uppercase tracking-wider text-ink-500">Weitere Pflanzen (laut Übersichtsarbeiten)</p>
                <p className="text-[12.5px] text-ink-300">{t.occurrences.join(', ')}</p>
              </>
            )}
          </Card>

          {(groups.length > 0 || isomers.length > 0) && (
            <Card title="Isomere & Sammelnamen" icon={<Layers className="size-4" />}>
              {groups.map((g) => (
                <p key={g.id} className="mb-2 text-[12.5px] text-ink-300">
                  <a className="text-leaf-300 hover:underline" href={href(`discover/terpenes/${g.id}`)}>
                    {g.name}
                  </a>{' '}
                  – {g.note}
                </p>
              ))}
              {isomers.length > 0 && (
                <>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">Gleiche Summenformel {t.formula}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {isomers.map((o) => (
                      <a key={o.id} href={href(`discover/terpenes/${o.id}`)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[12px] text-ink-200 hover:border-white/20">
                        {o.name}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

          <Card title="Alle Quellen">
            <SourceList sources={t.sources} />
          </Card>
          <p className="text-[11px] leading-relaxed text-ink-500">Das Vorkommen eines Terpens in einer Sorte ist keine Aussage über gesundheitliche oder psychoaktive Wirkungen.</p>
        </div>
      </div>
    </div>
  );
}

function GroupDetail({ g }: { g: TerpeneGroup }) {
  return (
    <div className="space-y-5">
      <a href={href('discover/terpenes')} className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
        <ArrowLeft className="size-3.5" /> Terpen-Atlas
      </a>
      <section className="rounded-3xl border border-white/[0.06] p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Sammelname</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50">{g.name}</h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-300">
          {g.note} TERPGRID ordnet solche Nennungen bewusst keinem bestimmten Isomer zu – die Quelle gibt nicht an, welches gemeint ist.
        </p>
        {g.members.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {g.members.map((id) => {
              const t = terpeneById(id)!;
              const c = terpeneChem(id);
              return (
                <a key={id} href={href(`discover/terpenes/${id}`)} className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-3 hover:border-white/[0.14]">
                  {c && (
                    <div className="aspect-[4/3]">
                      <MoleculeView chem={c} color={t.color} size="sm" label={t.name} />
                    </div>
                  )}
                  <div className="mt-1 text-[13px] font-medium text-ink-100">{t.name}</div>
                </a>
              );
            })}
          </div>
        )}
      </section>
      <Card title="Sorten mit dieser Nennung" subtitle="Ohne Isomerangabe in Seedbank-Texten oder Datenbank-Angaben">
        <CatalogMentions id={g.id} label={`„${g.name.replace(' (Isomer nicht angegeben)', '')}“`} />
      </Card>
    </div>
  );
}

const CLASSES = [...new Set(TERPENES.map((t) => t.className))];

export function TerpeneAtlas({ terpeneId }: { terpeneId?: string }) {
  const { data } = useData();
  const lib = useLibraryStatus();
  const index = useAsync((signal) => (lib ? library.terpeneIndex(signal) : Promise.resolve(null)), [!!lib]);
  const [focus, setFocus] = useState<string>();
  const [fam, setFam] = useState<AromaFamily | ''>('');
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [evidence, setEvidence] = useState<'' | 'lit' | 'none'>('');
  const [compare, setCompare] = useState<string[]>(['myrcene', 'limonene']);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return TERPENES.filter(
      (t) =>
        (!fam || t.families.includes(fam)) &&
        (!cls || t.className === cls) &&
        (!evidence || (evidence === 'lit') === cannabisSources(t).length > 0) &&
        (!k || [t.name, t.id, ...t.aliases].some((a) => a.toLowerCase().includes(k))),
    );
  }, [fam, cls, q, evidence]);

  if (terpeneId) {
    // Alte Links „…/pinene“ meinten α-Pinen; „pinene“ allein ist jetzt der Sammelname
    const t = terpeneById(terpeneId);
    const g = terpeneGroupById(terpeneId) ?? (!t ? matchTerpeneGroup(terpeneId) : undefined);
    return (
      <div>
        <DiscoverNav />
        {t ? (
          <TerpeneDetail key={t.id} t={t} />
        ) : g ? (
          <GroupDetail g={g} />
        ) : (
          <EmptyState
            title="Terpen nicht im Atlas"
            action={
              <a className="btn-primary" href={href('discover/terpenes')}>
                Zum Atlas
              </a>
            }
          />
        )}
      </div>
    );
  }

  const labReports = data.labReports.filter((r) => r.terpenes.length > 0);
  const compared = compare.map((id) => terpeneById(id)).filter((t): t is TerpeneInfo => !!t);
  const counts = new Map((index.data?.terpenes ?? []).map((r) => [r.id, r]));
  const ranked = (index.data?.terpenes ?? []).filter((r) => r.cisp + r.database > 0).slice(0, 16);
  const maxCount = Math.max(1, ...ranked.map((r) => r.cisp + r.database));
  const nameOf = (id: string, fallback: string[]) => terpeneById(id)?.name ?? terpeneGroupById(id)?.name ?? (id.startsWith('unbekannt:') ? `${fallback[0]} (nicht im Atlas)` : id);
  const withLit = TERPENES.filter((t) => cannabisSources(t).length > 0).length;

  return (
    <div>
      <DiscoverNav />
      <div className="mb-6 animate-fade-up">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-leaf-400/90">Terpen-Atlas</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-[40px] sm:leading-[1.1]">Aromen verstehen.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">
          {TERPENES.length} Verbindungen mit chemischer Identität aus PubChem (abgerufen am {fmtDate(CHEM_META.retrieved)}), 2D-Struktur und belegten Geruchsbeschreibungen. Bei {withLit} ist das
          Vorkommen in Cannabis mit Literatur belegt. Keine Wirkungsversprechen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card title="Terpen-Rad" subtitle="Belegte Geruchsbeschreibungen nach Aromafamilien">
          <TerpeneWheel items={TERPENES} active={focus} onSelect={(id) => setFocus(id === focus ? undefined : id)} />
          {focus && terpeneById(focus) && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-2">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink-50">{terpeneById(focus)!.name}</div>
                <div className="truncate text-[11px] text-ink-500">{terpeneById(focus)!.aroma.join(', ') || 'Keine Geruchsbeschreibung belegt'}</div>
              </div>
              <a href={href(`discover/terpenes/${focus}`)} className="btn-ghost shrink-0 py-1.5 text-xs">
                Details
              </a>
            </div>
          )}
          <p className="hint mt-3">Gestrichelte Punkte: keine belegte Geruchsbeschreibung. Familien sind eine grobe Einordnung der Originalbeschreibungen.</p>
        </Card>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="relative min-w-[12rem] flex-1">
              <span className="sr-only">Terpen suchen</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
              <input className="input-base pl-9" placeholder="Name oder Schreibweise …" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select aria-label="Aromafamilie" className="input-base w-auto" value={fam} onChange={(e) => setFam(e.target.value as AromaFamily | '')}>
              <option value="">Alle Aromafamilien</option>
              {AROMA_FAMILIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id}
                </option>
              ))}
            </select>
            <select aria-label="Stoffklasse" className="input-base w-auto" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">Alle Stoffklassen</option>
              {CLASSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select aria-label="Beleg für Cannabis" className="input-base w-auto" value={evidence} onChange={(e) => setEvidence(e.target.value as '' | 'lit' | 'none')}>
              <option value="">Alle Belege</option>
              <option value="lit">In Cannabis belegt</option>
              <option value="none">Nicht belegt</option>
            </select>
          </div>
          <p className="text-[12px] text-ink-500" aria-live="polite">
            {filtered.length} von {TERPENES.length} Verbindungen
          </p>
          {filtered.length === 0 ? (
            <EmptyState compact title="Keine Treffer" text="Filter zurücksetzen oder anders schreiben." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((t) => {
                const c = terpeneChem(t.id);
                const n = counts.get(t.id);
                return (
                  <a key={t.id} href={href(`discover/terpenes/${t.id}`)} className="group flex gap-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70 p-3 transition-colors hover:border-white/[0.14]">
                    {c && (
                      <div className="h-16 w-20 shrink-0 rounded-lg bg-ink-950/60 p-1">
                        <MoleculeView chem={c} color={t.color} size="sm" label={t.name} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <h3 className="truncate text-[14px] font-semibold text-ink-50">{t.name}</h3>
                        <span className="font-mono text-[10.5px] text-ink-500">{t.formula}</span>
                      </div>
                      <p className="truncate text-[11px] text-ink-500">{t.className}</p>
                      <p className="mt-1 truncate text-[11.5px]" style={{ color: t.color }}>
                        {t.aroma.slice(0, 3).join(' · ') || <span className="text-ink-500">keine Geruchsangabe</span>}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-ink-500">
                        {cannabisSources(t).length ? 'In Cannabis belegt' : 'In Cannabis nicht belegt'}
                        {n ? ` · ${(n.cisp + n.database).toLocaleString('de-DE')} Katalog-Nennungen` : ''}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[11px] text-ink-500">Sammelnamen:</span>
            {TERPENE_GROUPS.map((g) => (
              <a key={g.id} href={href(`discover/terpenes/${g.id}`)} className="rounded-full border border-dashed border-white/[0.12] px-2 py-0.5 text-[11px] text-ink-300 hover:border-white/25">
                {g.name.replace(' (Isomer nicht angegeben)', '')}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Terpene vergleichen" subtitle="Bis zu drei Verbindungen nebeneinander">
          <label className="mb-3 block">
            <span className="sr-only">Terpen zum Vergleich hinzufügen</span>
            <select
              className="input-base"
              value=""
              onChange={(e) => e.target.value && setCompare((c) => (c.includes(e.target.value) ? c : c.length >= 3 ? [...c.slice(1), e.target.value] : [...c, e.target.value]))}
            >
              <option value="">Terpen hinzufügen …</option>
              {TERPENES.filter((t) => !compare.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {compared.length < 2 ? (
            <p className="hint">Mindestens zwei Terpene wählen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] table-fixed text-left text-[12px]">
                <thead>
                  <tr className="text-ink-500">
                    <th className="w-24 py-1.5 pr-3 font-medium" />
                    {compared.map((t) => (
                      <th key={t.id} className="py-1.5 pr-3 align-top font-semibold" style={{ color: t.color }}>
                        <div className="flex items-start justify-between gap-1">
                          {t.name}
                          <button type="button" aria-label={`${t.name} entfernen`} className="text-ink-500 hover:text-ink-100" onClick={() => setCompare((c) => c.filter((x) => x !== t.id))}>
                            ×
                          </button>
                        </div>
                        {terpeneChem(t.id) && (
                          <div className="mt-1 h-16">
                            <MoleculeView chem={terpeneChem(t.id)!} color={t.color} size="sm" label={t.name} />
                          </div>
                        )}
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
                      ['CAS-Nr.', (t: TerpeneInfo) => t.cas || '–'],
                      ['Geruch', (t: TerpeneInfo) => t.aroma.join(', ') || 'nicht belegt'],
                      ['Cannabis', (t: TerpeneInfo) => (cannabisSources(t).length ? 'belegt' : 'nicht belegt')],
                      ['Katalog', (t: TerpeneInfo) => (counts.get(t.id) ? `${(counts.get(t.id)!.cisp + counts.get(t.id)!.database).toLocaleString('de-DE')} Nennungen` : '–')],
                    ] as const
                  ).map(([label, get]) => (
                    <tr key={label} className="border-t border-white/[0.05] align-top">
                      <td className="py-2 pr-3 text-ink-500">{label}</td>
                      {compared.map((t) => (
                        <td key={t.id} className="break-words py-2 pr-3">
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

        <Card title="Nennungen im Sortenkatalog" subtitle="Wie viele Sorten ein Terpen nennen – keine Konzentrationen">
          {lib === null ? (
            <p className="hint">Der lokale Sortenkatalog ist nur mit TERPGRID-Server verfügbar.</p>
          ) : !index.data ? (
            <p className="hint">{index.error ?? 'Wird geladen …'}</p>
          ) : (
            <>
              <ul className="space-y-1.5" aria-label="Sorten je genanntem Terpen">
                {ranked.map((r) => {
                  const t = terpeneById(r.id);
                  const total = r.cisp + r.database;
                  const linkable = t || terpeneGroupById(r.id);
                  return (
                    <li key={r.id} className="grid grid-cols-[9.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-[12px]">
                      {linkable ? (
                        <a href={href(`discover/terpenes/${r.id}`)} className="truncate text-ink-200 hover:text-leaf-200">
                          {nameOf(r.id, r.names)}
                        </a>
                      ) : (
                        <span className="truncate text-ink-400">{nameOf(r.id, r.names)}</span>
                      )}
                      <span className="h-2 rounded-full bg-ink-700" aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${(total / maxCount) * 100}%`, background: t?.color ?? '#6b7a75', opacity: t ? 0.85 : 0.5 }} />
                      </span>
                      <span className="text-right font-mono tabular text-ink-300">{total.toLocaleString('de-DE')}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="hint mt-3">
                Basis: {index.data.cultivarsWithTerpenes.toLocaleString('de-DE')} Sorten mit Terpen-Nennung in Seedbank-Texten (CI-Strains-Pro) plus freigegebene Datenbank-Angaben. Sammelnamen wie „Pinen“
                werden nicht auf ein Isomer verteilt.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card title="Gemessene Zusammensetzungen" subtitle="Nur aus deinen eigenen Laborberichten – je Probe" className="mt-5">
        {labReports.length === 0 ? (
          <EmptyState
            compact
            icon={<FlaskRound />}
            title="Keine quantitativen Daten"
            text="Mengenanteile werden nur aus Laborberichten mit Messwerten dargestellt. Katalogdaten enthalten keine Mengen."
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
                  <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-[12px]">
                    <span className="text-ink-100">
                      {r.title}
                      {r.labName && <span className="text-ink-500"> · {r.labName}</span>}
                      {r.testDate && <span className="text-ink-500"> · {fmtDate(r.testDate)}</span>}
                    </span>
                    <span className="font-mono text-ink-400">
                      Σ {fmt(total)} % {r.unit !== '%' && <span className="text-[10.5px]">(aus {r.unit} umgerechnet)</span>}
                    </span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-ink-700">
                    {rows.map((x) => (
                      <div key={x.name} title={`${x.info?.name ?? x.name}: ${fmt(x.value)} ${r.unit}`} style={{ width: `${(x.pct / Math.max(total, 0.0001)) * 100}%`, background: x.info?.color ?? '#5f6d68' }} />
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-400">
                    {rows.map((x) => (
                      <span key={x.name} className="flex items-center gap-1">
                        <span className="size-2 rounded-sm" style={{ background: x.info?.color ?? '#5f6d68' }} />
                        {x.info ? (
                          <a href={href(`discover/terpenes/${x.info.id}`)} className="hover:text-ink-100">
                            {x.info.name}
                          </a>
                        ) : (
                          x.name
                        )}{' '}
                        {fmt(x.value)} {r.unit}
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
