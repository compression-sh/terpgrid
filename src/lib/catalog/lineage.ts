/**
 * Baut einen Abstammungsgraphen ausschließlich aus belegten Angaben:
 * - Elternbeziehungen aus dem Genetikfeld der Quelle (geparst)
 * - optional CannaLib-Elternangaben (mit Konfidenz)
 * Auflösung von Elternnamen nur bei EINDEUTIGEM exaktem Namenstreffer;
 * gleichnamige Sorten verschiedener Breeder bleiben getrennt (mehrdeutig).
 */
import { type LineageNode, normalizeName, parseGenetics } from './genetics';
import type { CatalogStrain, LineageParent } from './types';
import { t } from '../../i18n';

export type GNodeKind = 'root' | 'strain' | 'unresolved' | 'ambiguous' | 'cross' | 'unknown';
export type GEdgeKind = 'documented' | 'alternative' | 'research';

export interface GNode {
  id: string;
  kind: GNodeKind;
  label: string;
  depth: number;
  strain?: CatalogStrain;
  candidates?: CatalogStrain[];
  /** Genetik-Rohtext dieses Knotens (falls bekannt) */
  genetics?: string;
  flags: string[];
  expanded: boolean;
  confidence?: number;
}

export interface GEdge {
  from: string; // Elternknoten
  to: string; // Kind
  kind: GEdgeKind;
  label?: string;
}

export interface LineageGraph {
  nodes: GNode[];
  edges: GEdge[];
  requests: number;
  truncated: boolean;
}

export type Resolver = (name: string) => Promise<CatalogStrain[]>;

export interface BuildOptions {
  maxDepth?: number;
  maxRequests?: number;
  research?: LineageParent[];
}

export async function buildLineage(root: CatalogStrain, resolve: Resolver, opts: BuildOptions = {}): Promise<LineageGraph> {
  const maxDepth = opts.maxDepth ?? 3;
  const maxRequests = opts.maxRequests ?? 14;
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  let requests = 0;
  let truncated = false;
  const resolveCache = new Map<string, CatalogStrain[]>();

  const addEdge = (e: GEdge) => {
    if (!edges.some((x) => x.from === e.from && x.to === e.to)) edges.push(e);
  };

  const rootNode: GNode = { id: root.key, kind: 'root', label: root.name, depth: 0, strain: root, genetics: root.genetics, flags: [], expanded: true };
  nodes.set(rootNode.id, rootNode);

  async function lookup(name: string): Promise<CatalogStrain[] | undefined> {
    const k = normalizeName(name);
    if (resolveCache.has(k)) return resolveCache.get(k);
    if (requests >= maxRequests) {
      truncated = true;
      return undefined;
    }
    requests++;
    try {
      const res = await resolve(name);
      resolveCache.set(k, res);
      return res;
    } catch {
      resolveCache.set(k, []);
      return [];
    }
  }

  /** Erzeugt/verbindet einen Knoten für einen Lineage-Ausdruck, gibt die Knoten-ID zurück. */
  async function place(expr: LineageNode, childId: string, depth: number, kind: GEdgeKind, queue: GNode[]): Promise<void> {
    if (expr.kind === 'unknown') {
      const id = `unknown:${childId}:${expr.text}`;
      if (!nodes.has(id)) nodes.set(id, { id, kind: 'unknown', label: expr.text || 'unbekannt', depth, flags: ['unknown'], expanded: true });
      addEdge({ from: id, to: childId, kind });
      return;
    }
    if (expr.kind === 'cross') {
      const id = `cross:${childId}:${depth}:${edges.length}`;
      nodes.set(id, { id, kind: 'cross', get label() { return t('discover.ge.cross'); }, depth, flags: [], expanded: true });
      addEdge({ from: id, to: childId, kind });
      for (const p of expr.parents) await place(p, id, depth + 1, kind, queue);
      return;
    }
    const norm = normalizeName(expr.name);
    // Bereits vorhandener aufgelöster Knoten mit gleichem Namen → wiederverwenden (gleiche Sorte)
    const existing = [...nodes.values()].find((n) => (n.kind === 'strain' || n.kind === 'root') && normalizeName(n.label) === norm);
    if (existing) {
      addEdge({ from: existing.id, to: childId, kind });
      return;
    }
    const hits = depth <= maxDepth ? await lookup(expr.name) : undefined;
    if (hits && hits.length === 1) {
      const s = hits[0]!;
      const id = s.key;
      if (!nodes.has(id)) {
        const n: GNode = { id, kind: 'strain', label: s.name, depth, strain: s, genetics: s.genetics, flags: [], expanded: false };
        nodes.set(id, n);
        queue.push(n);
      }
      addEdge({ from: id, to: childId, kind });
    } else if (hits && hits.length > 1) {
      const id = `ambiguous:${norm}`;
      if (!nodes.has(id)) nodes.set(id, { id, kind: 'ambiguous', label: expr.name, depth, candidates: hits, flags: ['ambiguous'], expanded: true });
      addEdge({ from: id, to: childId, kind });
    } else {
      const id = `name:${norm}`;
      if (!nodes.has(id)) nodes.set(id, { id, kind: 'unresolved', label: expr.name, depth, flags: hits === undefined ? ['not-looked-up'] : ['not-in-catalog'], expanded: true });
      addEdge({ from: id, to: childId, kind });
    }
  }

  async function expand(n: GNode, queue: GNode[]) {
    n.expanded = true;
    const g = parseGenetics(n.genetics);
    if (!g) return;
    n.flags.push(...g.flags);
    for (const p of g.parents) await place(p, n.id, n.depth + 1, 'documented', queue);
    for (const alt of g.alternatives) for (const p of alt) await place(p, n.id, n.depth + 1, 'alternative', queue);
  }

  // Breitensuche über die Generationen
  let queue: GNode[] = [rootNode];
  while (queue.length) {
    const next: GNode[] = [];
    for (const n of queue) {
      if (n.depth >= maxDepth) {
        n.expanded = false;
        if (parseGenetics(n.genetics)?.parents.length) truncated = true;
        continue;
      }
      await expand(n, next);
    }
    queue = next;
  }

  // CannaLib-Elternangaben (nur für die Wurzel, ohne weitere Auflösung)
  for (const p of opts.research ?? []) {
    const norm = normalizeName(p.name);
    const existing = [...nodes.values()].find((n) => normalizeName(n.label) === norm && n.depth === 1);
    if (existing) {
      addEdge({ from: existing.id, to: rootNode.id, kind: 'research', label: p.confidence !== undefined ? `${Math.round(p.confidence * 100)} %` : undefined });
      continue;
    }
    const id = `research:${norm}`;
    nodes.set(id, { id, kind: 'unresolved', label: p.name, depth: 1, flags: ['research'], expanded: true, confidence: p.confidence });
    addEdge({ from: id, to: rootNode.id, kind: 'research', label: p.confidence !== undefined ? `${Math.round(p.confidence * 100)} %` : undefined });
  }

  return { nodes: [...nodes.values()], edges, requests, truncated };
}

/* ───────────── Layout (Generationen als Spalten) ───────────── */

export interface Positioned {
  id: string;
  x: number;
  y: number;
}

export function layoutLineage(graph: LineageGraph, colWidth = 230, rowHeight = 78): { pos: Map<string, Positioned>; width: number; height: number } {
  const parentsOf = new Map<string, string[]>();
  for (const e of graph.edges) parentsOf.set(e.to, [...(parentsOf.get(e.to) ?? []), e.from]);
  const root = graph.nodes.find((n) => n.kind === 'root');
  const pos = new Map<string, Positioned>();
  if (!root) return { pos, width: 0, height: 0 };
  const depthOf = new Map(graph.nodes.map((n) => [n.id, n.depth]));
  let row = 0;
  const visiting = new Set<string>();
  const place = (id: string, depth: number): number => {
    if (pos.has(id)) return pos.get(id)!.y;
    if (visiting.has(id)) return row * rowHeight;
    visiting.add(id);
    const parents = (parentsOf.get(id) ?? []).filter((p) => !pos.has(p) || true);
    const ys = parents.filter((p) => (depthOf.get(p) ?? 0) > depth || !pos.has(p)).map((p) => place(p, depth + 1));
    const y = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : row++ * rowHeight;
    pos.set(id, { id, x: depth * colWidth, y });
    visiting.delete(id);
    return y;
  };
  place(root.id, 0);
  // Knoten, die noch fehlen (z. B. Mehrfachbezug), unten anfügen
  for (const n of graph.nodes) if (!pos.has(n.id)) pos.set(n.id, { id: n.id, x: n.depth * colWidth, y: row++ * rowHeight });
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  return { pos, width: Math.max(...xs) + colWidth, height: Math.max(...ys) + rowHeight };
}
