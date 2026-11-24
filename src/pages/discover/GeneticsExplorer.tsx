import { CircleHelp, Dna, ExternalLink, Loader2, Maximize2, Microscope, Minus, Plus, Search, X } from 'lucide-react';
import { type PointerEvent as RPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalogErrorText, useStrainDetail } from '../../app/catalog';
import { useData } from '../../app/DataProvider';
import { href, navigate } from '../../app/router';
import { EvidenceBadge, TypeBadge, rangeText } from '../../components/discover/Badges';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { ResearchPanel, useResearch } from '../../components/discover/ResearchPanel';
import { StrainVisual } from '../../components/discover/StrainVisual';
import { Callout } from '../../components/ui/Callout';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { type GNode, type LineageGraph, buildLineage, layoutLineage } from '../../lib/catalog/lineage';
import { catalog } from '../../lib/catalog/service';
import { geneticsLink, strainLink } from '../../lib/catalog/links';
import { type LibLineage, library, toCatalogStrain } from '../../lib/catalog/library';
import { useAsync, useLibraryStatus } from '../../app/library';
import type { CatalogStrain } from '../../lib/catalog/types';

const NODE_W = 184;
const NODE_H = 54;

const NODE_STYLE: Record<GNode['kind'], { stroke: string; fill: string; text: string }> = {
  root: { stroke: '#5fe39a', fill: '#12241b', text: '#f2f6f4' },
  strain: { stroke: 'rgb(255 255 255 / 0.18)', fill: '#121816', text: '#dfe7e3' },
  unresolved: { stroke: 'rgb(255 255 255 / 0.1)', fill: '#0e1211', text: '#8c9a95' },
  ambiguous: { stroke: '#fbbf24', fill: '#1a1710', text: '#fde68a' },
  cross: { stroke: 'rgb(255 255 255 / 0.12)', fill: '#0e1211', text: '#8c9a95' },
  unknown: { stroke: 'rgb(255 255 255 / 0.1)', fill: '#0e1211', text: '#9aa8a3' },
};

function StrainPicker() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CatalogStrain[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      catalog
        .search(q, 1, 12, c.signal)
        .then((p) => setItems(p.items.filter((i) => i.genetics)))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      window.clearTimeout(t);
      c.abort();
    };
  }, [q]);
  return (
    <div className="card mx-auto max-w-2xl p-6">
      <Dna className="size-7 text-leaf-400" />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink-50">Genetics Explorer</h1>
      <p className="mt-1 text-sm text-ink-400">Dokumentierte Abstammungen als interaktiver Graph. Nur belegte Beziehungen – Unklares wird gekennzeichnet.</p>
      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
        <input className="input-base h-11 pl-10" placeholder="Sorte suchen, z. B. Gelato" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sorte für Genetik suchen" autoFocus />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-leaf-400" />}
      </div>
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
          {items.map((i) => (
            <li key={i.key}>
              <a href={href(`discover/genetics/${i.id}`)} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.03]">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink-100">{i.name}</span>
                  <span className="block truncate text-[11px] text-ink-500">{i.genetics}</span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-500">{i.breeder ?? ''}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {q && !loading && items.length === 0 && <p className="hint mt-3">Keine Treffer mit dokumentierter Genetik.</p>}
    </div>
  );
}

function Graph({ graph, selected, onSelect }: { graph: LineageGraph; selected?: string; onSelect: (id: string) => void }) {
  const { pos, width, height } = useMemo(() => layoutLineage(graph, 240, 76), [graph]);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 40, y: 40, k: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; k: number } | null>(null);
  const moved = useRef(false);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const w = width + NODE_W;
    const h = height + NODE_H;
    // Auf schmalen Bildschirmen lesbar bleiben (min. 0,62) – Rest per Wischen erreichbar.
    const minK = el.clientWidth < 640 ? 0.62 : 0.35;
    const k = Math.min(1.1, Math.max(minK, Math.min((el.clientWidth - 40) / w, (el.clientHeight - 40) / h)));
    setView({ k, x: Math.max(16, (el.clientWidth - w * k) / 2), y: (el.clientHeight - h * k) / 2 });
  }, [width, height]);
  useEffect(fit, [fit]);

  const zoomAt = (factor: number, cx?: number, cy?: number) =>
    setView((v) => {
      const el = box.current;
      const px = cx ?? (el ? el.clientWidth / 2 : 0);
      const py = cy ?? (el ? el.clientHeight / 2 : 0);
      const k = Math.min(2.5, Math.max(0.25, v.k * factor));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const down = (e: RPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: view.k };
    }
  };
  const move = (e: RPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const r = box.current!.getBoundingClientRect();
      const factor = (pinch.current.k * (d / pinch.current.d)) / view.k;
      zoomAt(factor, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
      moved.current = true;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const up = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  return (
    <div className="relative">
      <div
        ref={box}
        className="relative h-[60vh] min-h-[420px] w-full touch-none select-none overflow-hidden rounded-2xl border border-white/[0.06] bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.05)_1px,transparent_0)] bg-[length:22px_22px] cursor-grab active:cursor-grabbing"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="application"
        aria-label="Abstammungsgraph – ziehen zum Verschieben, Mausrad oder Zwei-Finger-Geste zum Zoomen"
      >
        <svg className="absolute inset-0 h-full w-full">
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" fill="rgb(255 255 255 / 0.35)" />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {graph.edges.map((e, i) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              // Kante vom Elternteil (rechts) zum Kind (links)
              const x1 = a.x;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x + NODE_W;
              const y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const color = e.kind === 'research' ? '#fbbf24' : e.kind === 'alternative' ? '#fb923c' : 'rgb(255 255 255 / 0.28)';
              return (
                <g key={i}>
                  <path d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray={e.kind === 'alternative' ? '6 4' : e.kind === 'research' ? '2 4' : undefined} markerEnd="url(#arr)" opacity={0.9} />
                  {e.label && (
                    <text x={mx} y={(y1 + y2) / 2 - 4} fill="#fbbf24" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono Variable, monospace">
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {graph.nodes.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const st = NODE_STYLE[n.kind];
              const sel = selected === n.id;
              const sub =
                n.kind === 'root' || n.kind === 'strain'
                  ? (n.strain?.breeder ?? 'Breeder unbekannt')
                  : n.kind === 'ambiguous'
                    ? `${n.candidates?.length} gleichnamige Sorten`
                    : n.kind === 'cross'
                      ? 'Zwischenkreuzung'
                      : n.flags.includes('research')
                        ? 'CannaLib-Angabe'
                        : n.flags.includes('not-looked-up')
                          ? 'nicht abgefragt'
                          : n.kind === 'unknown'
                            ? 'unbekannt'
                            : 'nicht im Katalog';
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.label} – ${sub}`}
                  onClick={() => !moved.current && onSelect(n.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(n.id)}
                  className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-leaf-400"
                >
                  <rect width={NODE_W} height={NODE_H} rx={12} fill={st.fill} stroke={sel ? '#9ef0bd' : st.stroke} strokeWidth={sel ? 2 : 1} strokeDasharray={n.kind === 'unresolved' || n.kind === 'unknown' ? '4 3' : undefined} />
                  {n.kind === 'root' && <rect width={4} height={NODE_H - 20} x={0} y={10} rx={2} fill="#5fe39a" />}
                  <text x={14} y={23} fill={st.text} fontSize="13" fontWeight={600} fontFamily="Inter Variable, sans-serif">
                    {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                  </text>
                  <text x={14} y={40} fill="#9aa8a3" fontSize="10.5" fontFamily="Inter Variable, sans-serif">
                    {sub.length > 28 ? `${sub.slice(0, 27)}…` : sub}
                  </text>
                  {n.kind === 'ambiguous' && (
                    <text x={NODE_W - 18} y={22} fill="#fbbf24" fontSize="13" fontWeight={700}>
                      ?
                    </text>
                  )}
                  {n.kind === 'strain' && !n.expanded && (
                    <text x={NODE_W - 16} y={32} fill="#9aa8a3" fontSize="12">
                      …
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {graph.nodes.length === 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[13px] text-ink-400">Für diese Sorte ist keine Abstammung dokumentiert.</div>
        )}
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <button type="button" className="btn-ghost bg-ink-900/90 p-2" aria-label="Vergrößern" onClick={() => zoomAt(1.25)}>
          <Plus className="size-4" />
        </button>
        <button type="button" className="btn-ghost bg-ink-900/90 p-2" aria-label="Verkleinern" onClick={() => zoomAt(0.8)}>
          <Minus className="size-4" />
        </button>
        <button type="button" className="btn-ghost bg-ink-900/90 p-2" aria-label="Einpassen" onClick={fit}>
          <Maximize2 className="size-4" />
        </button>
      </div>
      <span className="sr-only">{[...nodeById.keys()].length} Knoten</span>
    </div>
  );
}

function NodePanel({ node, onClose }: { node: GNode; onClose: () => void }) {
  const s = node.strain;
  return (
    <Card
      title={node.label}
      subtitle={node.kind === 'root' ? 'Ausgangssorte' : node.kind === 'strain' ? 'Im Katalog gefunden (eindeutiger Name)' : undefined}
      actions={
        <button type="button" className="btn-ghost p-1.5" aria-label="Vorschau schließen" onClick={onClose}>
          <X className="size-4" />
        </button>
      }
    >
      {s ? (
        <div className="space-y-3">
          <StrainVisual image={s.image} name={s.name} className="aspect-[16/10] w-full rounded-xl" />
          <div className="flex flex-wrap gap-1.5">
            <TypeBadge type={s.typeClass} label={s.type} />
            {s.thc && <span className="rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[11px] text-ink-300">THC {rangeText(s.thc)}</span>}
          </div>
          <div className="text-[13px] text-ink-300">{s.breeder ?? 'Breeder unbekannt'}</div>
          <div className="text-[12px] text-ink-400">
            Genetik: <span className="text-ink-200">{s.genetics ?? 'keine Angabe'}</span> <EvidenceBadge state={s.evidence.genetics} />
          </div>
          {node.flags.includes('conflict') && <p className="text-[12px] text-amber-300/90">Seedbanks nennen unterschiedliche Eltern – abweichende Angaben sind als orange gestrichelte Kanten eingezeichnet.</p>}
          {s.provider === 'cisp' && <p className="text-[11px] text-ink-500">Quelle: Seedbank-Angaben (CI-Strains-Pro, CC BY 4.0) – nicht unabhängig bestätigt.</p>}
          <div className="flex flex-wrap gap-2">
            <a href={href(strainLink(s))} className="btn-primary py-1.5 text-xs">
              Profil öffnen
            </a>
            {node.kind !== 'root' && geneticsLink(s.provider, s.id) && (
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => navigate(geneticsLink(s.provider, s.id)!)}>
                <Dna className="size-3.5" /> Als Zentrum
              </button>
            )}
          </div>
        </div>
      ) : node.kind === 'ambiguous' ? (
        <div className="space-y-2">
          <p className="text-[13px] text-amber-200/90">Mehrere Sorten tragen diesen Namen. Ohne Breeder-Angabe in der Abstammung ist nicht belegt, welche gemeint ist – sie werden nicht zusammengeführt.</p>
          {node.flags.includes('same-breeder-candidate') && <p className="text-[12px] text-ink-400">Eine der Kandidatinnen stammt vom selben Breeder wie die Nachkommensorte – ein Hinweis, aber kein Beleg.</p>}
          <ul className="space-y-1.5">
            {node.candidates?.map((c) => (
              <li key={c.key} className="flex items-stretch gap-1">
                <a href={href(strainLink(c))} className="flex min-h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-[12px] hover:border-white/[0.14]">
                  <span className="truncate text-ink-100">{c.name}</span>
                  <span className="truncate text-ink-400">{c.breeder ?? 'Breeder unbekannt'}</span>
                </a>
                {geneticsLink(c.provider, c.id) && (
                  <a href={href(geneticsLink(c.provider, c.id)!)} className="grid w-10 place-items-center rounded-lg border border-white/[0.06] text-ink-400 hover:border-white/[0.14] hover:text-ink-100" aria-label={`Abstammung von ${c.name} (${c.breeder ?? 'Breeder unbekannt'}) als Zentrum`} title="Diese Linie als Zentrum">
                    <Dna className="size-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-2 text-[13px] text-ink-400">
          {node.kind === 'cross' && <p>Zwischenkreuzung aus den verbundenen Elternsorten (laut Genetikangabe in Klammern).</p>}
          {node.flags.includes('research') && (
            <p>
              Elternangabe aus CannaLib{node.confidence !== undefined && ` (Konfidenz ${Math.round(node.confidence * 100)} %)`}. Nicht im Katalog aufgelöst.
            </p>
          )}
          {node.flags.includes('not-in-catalog') && <p>Kein exakt gleichnamiger Eintrag im Katalog. Weitere Abstammung: keine Daten verfügbar.</p>}
          {node.flags.includes('not-looked-up') && <p>Wegen des Anfragebudgets nicht abgefragt. Ausgehend von einer anderen Sorte erneut erkunden.</p>}
          {node.kind === 'unknown' && <p>Die Quelle nennt diese Abstammung als unbekannt.</p>}
          {node.kind !== 'cross' && (
            <a href={href(`discover?q=${encodeURIComponent(node.label)}`)} className="btn-ghost py-1.5 text-xs">
              <Search className="size-3.5" /> Im Katalog suchen
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

export function GeneticsExplorer({ slug }: { slug?: string }) {
  const { settings } = useData();
  const { strain, loading, error } = useStrainDetail(slug);
  const research = useResearch();
  const [graph, setGraph] = useState<LineageGraph>();
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [depth, setDepth] = useState(3);
  const [withResearch, setWithResearch] = useState(false);

  useEffect(() => {
    if (!strain) return;
    let alive = true;
    const c = new AbortController();
    setBuilding(true);
    setBuildError(undefined);
    buildLineage(strain, (name) => catalog.findExact(name, c.signal), { maxDepth: depth, maxRequests: 6 + depth * 4, research: withResearch ? research.profile?.parents : undefined })
      .then((g) => alive && setGraph(g))
      .catch((e) => alive && setBuildError(catalogErrorText(e)))
      .finally(() => alive && setBuilding(false));
    return () => {
      alive = false;
      c.abort();
    };
  }, [strain, depth, withResearch, research.profile]);

  if (!slug) {
    return (
      <div>
        <DiscoverNav />
        <StrainPicker />
      </div>
    );
  }
  const sel = graph?.nodes.find((n) => n.id === selected);

  return (
    <div>
      <DiscoverNav />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-leaf-400/90">Genetics Explorer</div>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">{strain?.name ?? (loading ? 'Lade …' : 'Unbekannt')}</h1>
          {strain?.genetics && <p className="mt-1 text-sm text-ink-400">{strain.genetics}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-ink-400">
            Generationen
            <select className="input-base w-auto py-1.5 text-[12px]" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {[1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <a href={href('discover/genetics')} className="btn-ghost py-1.5 text-xs">
            <Search className="size-3.5" /> Andere Sorte
          </a>
        </div>
      </div>

      {error && !strain ? (
        <div className="card">
          <EmptyState title="Sorte konnte nicht geladen werden" text={error} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-3">
            {(loading || building) && !graph ? (
              <div className="grid h-[60vh] min-h-[420px] place-items-center rounded-2xl border border-white/[0.06]">
                <div className="flex items-center gap-2 text-sm text-ink-400">
                  <Loader2 className="size-4 animate-spin text-leaf-400" /> Abstammung wird aufgelöst …
                </div>
              </div>
            ) : graph ? (
              <div className={building ? 'opacity-60 transition-opacity' : ''}>
                <Graph graph={graph} selected={selected} onSelect={setSelected} />
              </div>
            ) : null}
            {buildError && <Callout tone="warn">{buildError}</Callout>}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-400">
              <span className="flex items-center gap-1.5">
                <svg width="26" height="6">
                  <line x1="0" y1="3" x2="26" y2="3" stroke="rgb(255 255 255 / 0.4)" strokeWidth="1.5" />
                </svg>
                Genetikangabe (StrainAPI)
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="26" height="6">
                  <line x1="0" y1="3" x2="26" y2="3" stroke="#fb923c" strokeWidth="1.5" strokeDasharray="6 4" />
                </svg>
                alternativ berichtet / umstritten
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="26" height="6">
                  <line x1="0" y1="3" x2="26" y2="3" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="2 4" />
                </svg>
                CannaLib (Konfidenz)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-5 rounded border border-dashed border-white/20" /> nicht eindeutig im Katalog
              </span>
              <span className="flex items-center gap-1.5">
                <CircleHelp className="size-3.5 text-amber-300" /> mehrdeutig (gleichnamig)
              </span>
            </div>
            {graph && (
              <p className="text-[11px] text-ink-600">
                {graph.requests} Katalog-Anfragen{graph.truncated && ' · Darstellung gekürzt (Anfragebudget/Generationen)'} · Elternnamen werden nur bei eindeutigem, exaktem Treffer aufgelöst.
              </p>
            )}
          </div>
          <div className="space-y-5">
            {sel ? (
              <NodePanel node={sel} onClose={() => setSelected(undefined)} />
            ) : (
              <Card title="Knoten auswählen">
                <p className="text-[13px] text-ink-400">Einen Knoten antippen, um Details zu sehen und zu verwandten Sorten zu navigieren.</p>
              </Card>
            )}
            {strain && settings.cannalibEnabled && settings.onlineCatalog && (
              <Card title="CannaLib-Abstammung" subtitle="Optional, mit Konfidenzangaben" icon={<Microscope className="size-4" />}>
                <ResearchPanel name={strain.name} research={research} />
                {research.profile && research.profile.parents.length > 0 && (
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-ink-200">
                    <input type="checkbox" className="accent-leaf-500" checked={withResearch} onChange={(e) => setWithResearch(e.target.checked)} />
                    Im Graphen anzeigen
                  </label>
                )}
              </Card>
            )}
            {strain && (
              <a href={strain.attribution.recordUrl ?? strain.attribution.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="inline-flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-300">
                Data provided by StrainAPI <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Katalog (CI-Strains-Pro) ───────────── */

/** Serverantwort → gemeinsames Graphmodell (dieselbe Darstellung wie bei StrainAPI). */
export function lineageToGraph(l: LibLineage): LineageGraph {
  return {
    nodes: l.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      depth: n.depth,
      strain: n.cultivar ? toCatalogStrain(n.cultivar) : undefined,
      candidates: n.candidates?.map(toCatalogStrain),
      genetics: n.cultivar?.parents.map((p) => p.name).join(' × '),
      flags: n.flags,
      expanded: n.expanded,
    })),
    edges: l.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
    requests: 1,
    truncated: l.truncated,
  };
}

function CatalogPicker() {
  const [q, setQ] = useState('');
  const res = useAsync((signal) => (q.trim().length < 2 ? Promise.resolve(null) : library.search({ q: q.trim(), lineage: '1', perPage: 12 }, signal)), [q]);
  return (
    <div className="card mx-auto max-w-2xl p-6">
      <Dna className="size-7 text-leaf-400" />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink-50">Genetics Explorer</h1>
      <p className="mt-1 text-sm text-ink-400">Abstammung aus dem lokalen Katalog als interaktiver Graph. Nur dokumentierte Elternangaben; gleichnamige Sorten verschiedener Breeder werden nicht gleichgesetzt.</p>
      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
        <input className="input-base h-11 pl-10" placeholder="Sorte suchen, z. B. Gelato" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sorte für Genetik suchen" autoFocus />
        {res.loading && q.trim().length >= 2 && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-leaf-400" />}
      </div>
      {res.data && res.data.items.length > 0 && (
        <>
          <p className="mt-3 text-[11px] text-ink-500">{res.data.total} Sorten mit dokumentierter Abstammung</p>
          <ul className="mt-1.5 divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
            {res.data.items.map((i) => (
              <li key={i.id}>
                <a href={href(`discover/genetics/c/${i.id}`)} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.03]">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink-100">
                      {i.name}
                      {i.version ? ` (${i.version})` : ''}
                      {i.auto && <span className="ml-1.5 text-[10px] text-ink-500">Auto</span>}
                    </span>
                    <span className="block truncate text-[11px] text-ink-500">{i.parents.map((p) => p.name).join(' × ')}</span>
                  </span>
                  <span className="shrink-0 truncate text-[11px] text-ink-400">{i.breeder.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {res.data && res.data.items.length === 0 && <p className="hint mt-3">Keine Sorte mit dokumentierter Abstammung gefunden.</p>}
      <a href={href('discover/genetics/live')} className="mt-4 inline-flex text-[12px] text-ink-400 hover:text-ink-100">
        Stattdessen Live-Katalog (StrainAPI) verwenden
      </a>
    </div>
  );
}

export function CatalogGenetics({ id }: { id?: string }) {
  const [depth, setDepth] = useState(3);
  const [selected, setSelected] = useState<string>();
  const res = useAsync((signal) => (id ? library.lineage(id, depth, signal) : Promise.resolve(null)), [id, depth]);
  const graph = useMemo(() => (res.data ? lineageToGraph(res.data) : undefined), [res.data]);
  if (!id)
    return (
      <div>
        <DiscoverNav />
        <CatalogPicker />
      </div>
    );
  const root = graph?.nodes.find((n) => n.kind === 'root');
  const sel = graph?.nodes.find((n) => n.id === selected);
  const counts = graph ? { strain: graph.nodes.filter((n) => n.kind === 'strain').length, ambiguous: graph.nodes.filter((n) => n.kind === 'ambiguous').length, unresolved: graph.nodes.filter((n) => n.kind === 'unresolved').length, unknown: graph.nodes.filter((n) => n.kind === 'unknown').length, alt: graph.edges.filter((e) => e.kind === 'alternative').length } : undefined;
  return (
    <div>
      <DiscoverNav />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Genetics Explorer · Katalog</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">{root?.label ?? (res.loading ? 'Lade …' : 'Unbekannt')}</h1>
          {root?.strain && (
            <p className="mt-1 text-sm text-ink-400">
              {root.strain.breeder} · {root.strain.genetics || 'keine Abstammung dokumentiert'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-ink-400">
            Generationen
            <select className="input-base w-auto py-1.5 text-[12px]" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {[1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          {root?.strain && (
            <a href={href(strainLink(root.strain))} className="btn-ghost py-1.5 text-xs">
              Sortenprofil
            </a>
          )}
          <a href={href('discover/genetics')} className="btn-ghost py-1.5 text-xs">
            <Search className="size-3.5" /> Andere Sorte
          </a>
        </div>
      </div>
      {res.error && !graph ? (
        <div className="card">
          <EmptyState title={res.notFound ? 'Sorte nicht im Katalog' : 'Abstammung konnte nicht geladen werden'} text={res.notFound ? undefined : res.error} action={<a href={href('discover/genetics')} className="btn-ghost">Andere Sorte</a>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-3">
            {!graph ? (
              <div className="grid h-[60vh] min-h-[420px] place-items-center rounded-2xl border border-white/[0.06]" aria-busy="true">
                <div className="flex items-center gap-2 text-sm text-ink-400">
                  <Loader2 className="size-4 animate-spin text-leaf-400" /> Abstammung wird geladen …
                </div>
              </div>
            ) : (
              <div className={res.loading ? 'opacity-60 transition-opacity' : ''}>
                <Graph graph={graph} selected={selected} onSelect={setSelected} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-400">
              <span className="flex items-center gap-1.5">
                <svg width="26" height="6" aria-hidden>
                  <line x1="0" y1="3" x2="26" y2="3" stroke="rgb(255 255 255 / 0.4)" strokeWidth="1.5" />
                </svg>
                Elternangabe (Seedbank)
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="26" height="6" aria-hidden>
                  <line x1="0" y1="3" x2="26" y2="3" stroke="#fb923c" strokeWidth="1.5" strokeDasharray="6 4" />
                </svg>
                abweichende Angabe einer anderen Seedbank
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-5 rounded border border-dashed border-white/20" aria-hidden /> nicht im Katalog / unbekannt
              </span>
              <span className="flex items-center gap-1.5">
                <CircleHelp className="size-3.5 text-amber-300" aria-hidden /> mehrdeutig (gleichnamig)
              </span>
            </div>
            {graph && counts && (
              <p className="text-[11px] text-ink-500">
                {counts.strain} eindeutig aufgelöst · {counts.ambiguous} mehrdeutig · {counts.unresolved} nicht im Katalog · {counts.unknown} unbekannt · {counts.alt} abweichende Kanten
                {graph.truncated && ' · gekürzt (Generationen/Knotenlimit)'}
              </p>
            )}
            {graph && (
              <details className="rounded-xl border border-white/[0.06] p-3 text-[12px] text-ink-300">
                <summary className="cursor-pointer text-ink-200">Abstammung als Liste (Textalternative)</summary>
                <ul className="mt-2 space-y-1">
                  {graph.edges.map((e, i) => {
                    const a = graph.nodes.find((n) => n.id === e.from);
                    const b = graph.nodes.find((n) => n.id === e.to);
                    return (
                      <li key={i}>
                        {b?.label} ← {a?.label}
                        {a?.kind === 'ambiguous' ? ' (mehrdeutig)' : a?.kind === 'unresolved' ? ' (nicht im Katalog)' : a?.kind === 'unknown' ? ' (unbekannt)' : ''}
                        {e.kind === 'alternative' ? ' – abweichende Angabe' : ''}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </div>
          <div className="space-y-5">
            {sel ? (
              <NodePanel node={sel} onClose={() => setSelected(undefined)} />
            ) : (
              <Card title="Knoten auswählen">
                <p className="text-[13px] text-ink-400">Einen Knoten antippen oder per Tab-Taste fokussieren und Enter drücken, um Details zu sehen und zu verwandten Sorten zu navigieren.</p>
              </Card>
            )}
            {res.data && (
              <p className="text-[11px] text-ink-500">
                Daten:{' '}
                <a href={res.data.attribution.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="hover:text-ink-300">
                  {res.data.attribution.name}
                </a>{' '}
                ({res.data.attribution.license}). Elternangaben sind Seedbank-Angaben, nicht unabhängig bestätigt.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Einstieg: Katalog (falls importiert), sonst StrainAPI wie bisher. */
export function GeneticsHome() {
  const lib = useLibraryStatus();
  if (lib === undefined) return <DiscoverNav />;
  return lib ? <CatalogGenetics /> : <GeneticsExplorer />;
}
