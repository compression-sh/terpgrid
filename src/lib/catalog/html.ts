import type { ContentBlock } from './types';

/**
 * Extrahiert aus externem HTML ausschließlich Text (Überschriften, Absätze,
 * Listen). Es wird nie HTML gerendert – das Ergebnis sind reine Strings.
 */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  times: '×',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  beta: 'β',
  alpha: 'α',
  deg: '°',
  middot: '·',
  eacute: 'é',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return NAMED[code] ?? m;
  });
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export function htmlToBlocks(html: string, maxBlocks = 80): ContentBlock[] {
  if (!html) return [];
  const clean = html.replace(/<(script|style|iframe|object|svg)[\s\S]*?<\/\1>/gi, '');
  const blocks: ContentBlock[] = [];
  const re = /<(h[1-6]|p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) && blocks.length < maxBlocks) {
    const tag = m[1]!.toLowerCase();
    const inner = m[2]!;
    if (tag === 'ul' || tag === 'ol') {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => stripTags(x[1]!)).filter(Boolean);
      if (items.length) blocks.push({ kind: 'list', items });
    } else {
      const text = stripTags(inner);
      if (text) blocks.push({ kind: tag.startsWith('h') ? 'heading' : 'paragraph', text });
    }
  }
  return blocks;
}
