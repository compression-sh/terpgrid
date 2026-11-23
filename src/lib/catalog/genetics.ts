/**
 * Parser für Freitext-Abstammungen wie "A × B", "(A x B) x C",
 * "A x B (also reported as C x D)". Es werden nur die im Text genannten
 * Beziehungen abgebildet – nichts wird ergänzt oder vereinheitlicht.
 */

export type LineageNode =
  | { kind: 'strain'; name: string }
  | { kind: 'cross'; parents: LineageNode[] }
  | { kind: 'unknown'; text: string };

export interface ParsedGenetics {
  /** Direkte Eltern-Knoten (bei einfacher Kreuzung zwei Sorten) */
  parents: LineageNode[];
  /** Alternativ berichtete Abstammungen (z. B. "also reported as …") */
  alternatives: LineageNode[][];
  /** Hinweise wie "Disputed", "unknown", Rückkreuzung */
  flags: ('disputed' | 'unknown' | 'backcross' | 'phenotype' | 'unparsed')[];
  raw: string;
}

const CROSS_SPLIT = /\s+(?:x|×|X)\s+|\s*×\s*/;

/** Teilt an Kreuzungszeichen auf oberster Klammerebene. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const rest = s.slice(i);
      const m = /^(\s+[xX]\s+|\s*×\s*)/.exec(rest);
      if (m) {
        parts.push(buf);
        buf = '';
        i += m[0].length - 1;
        continue;
      }
    }
    buf += ch;
  }
  parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function cleanName(s: string): string {
  let t = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  // Nur entfernen, wenn der GANZE Name in Anführungszeichen steht ("Name").
  const m = /^(["'])([^"']+)\1$/.exec(t);
  if (m) t = m[2]!;
  return t.trim();
}

const UNKNOWN_RE = /^(unknown|unbekannt|n\/a|not (?:reliably )?(?:established|disclosed)|undisclosed|secret)\b/i;

function parseExpr(s: string, flags: Set<ParsedGenetics['flags'][number]>): LineageNode {
  let t = s.trim();
  // Äußere Klammern entfernen, wenn sie den ganzen Ausdruck umschließen
  while (t.startsWith('(') && t.endsWith(')') && splitTopLevel(t.slice(1, -1)).length >= 1 && balanced(t.slice(1, -1))) t = t.slice(1, -1).trim();
  const parts = splitTopLevel(t);
  if (parts.length > 1) return { kind: 'cross', parents: parts.map((p) => parseExpr(p, flags)) };
  // Annotationen in Klammern am Ende abtrennen, z. B. "Papaya (BA Botanicals cut)"
  const annotated = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(t);
  let name = t;
  if (annotated && annotated[1]) {
    name = annotated[1];
    if (/pheno|cut|clone/i.test(annotated[2]!)) flags.add('phenotype');
  }
  name = cleanName(name);
  if (!name || UNKNOWN_RE.test(name)) {
    flags.add('unknown');
    return { kind: 'unknown', text: name || t };
  }
  if (/\b(bx\d*|backcross)/i.test(name)) flags.add('backcross');
  return { kind: 'strain', name };
}

function balanced(s: string): boolean {
  let d = 0;
  for (const c of s) {
    if (c === '(') d++;
    if (c === ')') d--;
    if (d < 0) return false;
  }
  return d === 0;
}

export function parseGenetics(raw?: string | null): ParsedGenetics | undefined {
  if (!raw || !raw.trim()) return undefined;
  const flags = new Set<ParsedGenetics['flags'][number]>();
  let main = raw.trim();
  const alternatives: LineageNode[][] = [];
  // "(also reported as …)" / "(alternatively …)" / "or …"
  const alt = /\((?:also|alternatively|sometimes)\s+(?:reported|listed|cited)?\s*(?:as)?\s*([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/i.exec(main);
  if (alt) {
    main = main.slice(0, alt.index).trim();
    flags.add('disputed');
    const node = parseExpr(alt[1]!, flags);
    alternatives.push(node.kind === 'cross' ? node.parents : [node]);
  }
  if (/\(disputed\)|disputed/i.test(main)) {
    flags.add('disputed');
    main = main.replace(/\(disputed\)/gi, '').trim();
  }
  if (/\blines?\b|\bvarious\b|\bmultiple\b/i.test(main) && !CROSS_SPLIT.test(main)) {
    flags.add('unparsed');
    if (/backcross/i.test(main)) flags.add('backcross');
    return { parents: [], alternatives, flags: [...flags], raw };
  }
  const node = parseExpr(main, flags);
  const parents = node.kind === 'cross' ? node.parents : node.kind === 'strain' ? [] : [node];
  if (node.kind === 'strain') {
    // Nur ein Name ohne Kreuzung – keine belegte Elternbeziehung ableitbar.
    flags.add('unparsed');
  }
  return { parents, alternatives, flags: [...flags], raw };
}

/** Alle Sortennamen innerhalb eines Knotens (z. B. für Suche nach Eltern). */
export function namesIn(node: LineageNode): string[] {
  if (node.kind === 'strain') return [node.name];
  if (node.kind === 'cross') return node.parents.flatMap(namesIn);
  return [];
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[#'’"“”.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
