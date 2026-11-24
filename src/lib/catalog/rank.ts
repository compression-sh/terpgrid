/**
 * Relevanz-Sortierung von Suchtreffern. Die Volltextsuche von StrainAPI liefert Treffer
 * nicht nach Relevanz und findet den Begriff auch in Feldern, die nicht ausgeliefert werden
 * (Beispiel „gelato“: 225 Treffer, davon 8 mit „Gelato“ im Namen). Sortiert wird lokal über
 * die geladenen Treffer; die Gruppen werden ehrlich ausgewiesen.
 */
import type { CatalogStrain } from './types';

export type RelevanceGroup = 'name' | 'genetics' | 'description' | 'fulltext';

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function relevance(query: string, s: CatalogStrain): { score: number; group: RelevanceGroup } {
  const q = normalizeName(query);
  if (!q) return { score: 0, group: 'fulltext' };
  const name = normalizeName(s.name);
  const words = q.split(' ');
  const word = new RegExp(`(^| )${escape(q)}( |$)`);
  if (name === q) return { score: 100, group: 'name' };
  // „Gelato #33“, „Gelato 41“ – Name beginnt mit dem Suchbegriff, danach Nummer/Zusatz
  if (name.startsWith(`${q} `) || name.startsWith(`${q}#`)) return { score: 90 - Math.min(9, name.length - q.length) / 10, group: 'name' };
  if (word.test(name)) return { score: 80, group: 'name' };
  if (name.includes(q)) return { score: 70, group: 'name' };
  if (words.length > 1 && words.every((w) => name.includes(w))) return { score: 65, group: 'name' };
  const genetics = normalizeName(s.genetics ?? '');
  if (genetics && (word.test(genetics) || genetics.includes(q))) return { score: 40, group: 'genetics' };
  const text = normalizeName([s.excerpt, ...(s.aroma ?? []), ...(s.flavor ?? [])].filter(Boolean).join(' '));
  if (text.includes(q)) return { score: 20, group: 'description' };
  return { score: 0, group: 'fulltext' };
}

export interface RankedStrain extends CatalogStrain {
  relevanceGroup: RelevanceGroup;
}

/** Stabil nach Relevanz sortiert (bei Gleichstand bleibt die Reihenfolge der Quelle). */
export function rankStrains(query: string, items: CatalogStrain[]): RankedStrain[] {
  return items
    .map((s, i) => ({ s, i, r: relevance(query, s) }))
    .sort((a, b) => b.r.score - a.r.score || a.i - b.i)
    .map(({ s, r }) => ({ ...s, relevanceGroup: r.group }));
}

export function relevanceCounts(query: string, items: CatalogStrain[]): Record<RelevanceGroup, number> {
  const c: Record<RelevanceGroup, number> = { name: 0, genetics: 0, description: 0, fulltext: 0 };
  for (const s of items) c[relevance(query, s).group]++;
  return c;
}
