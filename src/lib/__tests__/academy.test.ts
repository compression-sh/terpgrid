import { describe, expect, it } from 'vitest';
import { GLOSSARY, searchGlossary } from '../academy/glossary';
import { LEARNING_PATHS, pathProgress } from '../academy/paths';
import { SRC } from '../academy/sources';
import { KB_ARTICLES, KB_CATEGORIES, kbSearch } from '../knowledge';

const ids = new Set(KB_ARTICLES.map((a) => a.id));

describe('Academy', () => {
  it('hat eindeutige Artikel-IDs und mindestens 20 Artikel', () => {
    expect(ids.size).toBe(KB_ARTICLES.length);
    expect(KB_ARTICLES.length).toBeGreaterThanOrEqual(20);
  });

  it('jede der 17 Kategorien enthält mindestens einen Artikel', () => {
    expect(KB_CATEGORIES).toHaveLength(17);
    for (const c of KB_CATEGORIES) expect(KB_ARTICLES.some((a) => a.category === c), c).toBe(true);
  });

  it('jeder Artikel hat Quellen mit https-Links und gültige Querverweise', () => {
    for (const a of KB_ARTICLES) {
      expect(a.sources.length, a.id).toBeGreaterThan(0);
      for (const s of a.sources) expect(s.url, a.id).toMatch(/^https:\/\//);
      for (const r of a.related) expect(ids.has(r), `${a.id} → ${r}`).toBe(true);
      for (const sec of a.sections)
        for (const l of sec.links ?? []) {
          const m = /^discover\/learn\/([a-z0-9-]+)$/.exec(l.to);
          if (m) expect(ids.has(m[1]!), `${a.id} → ${l.to}`).toBe(true);
        }
    }
  });

  it('Lernpfade und Glossar verweisen nur auf vorhandene Artikel', () => {
    for (const p of LEARNING_PATHS) for (const id of p.articles) expect(ids.has(id), `${p.id} → ${id}`).toBe(true);
    for (const g of GLOSSARY) expect(ids.has(g.article), `${g.id} → ${g.article}`).toBe(true);
    expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length);
  });

  it('Lernpfad-Fortschritt ergibt sich aus dem Lesefortschritt', () => {
    const p = LEARNING_PATHS[0]!;
    expect(pathProgress(p, {}).done).toBe(0);
    expect(pathProgress(p, {}).next).toBe(p.articles[0]);
    const pr = pathProgress(p, { [p.articles[0]!]: 1, [p.articles[1]!]: 0.5 });
    expect(pr.done).toBe(1);
    expect(pr.next).toBe(p.articles[1]);
  });

  it('Glossar findet Begriffe und Abkürzungen', () => {
    expect(searchGlossary('vpd')[0]?.id).toBe('vpd');
    expect(searchGlossary('Dampfdruck').map((g) => g.id)).toContain('vpd');
    expect(searchGlossary('mehltau').map((g) => g.id)).toContain('mehltau');
    expect(searchGlossary('x')).toEqual([]);
  });

  it('Suche findet neue Leitfäden', () => {
    expect(kbSearch('Narbe')[0]?.id).toBe('erntezeitpunkt');
    expect(kbSearch('VPD').map((a) => a.id)).toContain('klima-vpd');
  });

  it('Academy-Quellen sind DOI-Links', () => {
    for (const s of Object.values(SRC)) expect(s.url).toMatch(/^https:\/\/doi\.org\/10\./);
  });

  it('der Terpen-Link der Sortenseite zeigt auf einen vorhandenen Artikel', () => {
    expect(ids.has('terpene-analytik')).toBe(true);
  });
});
