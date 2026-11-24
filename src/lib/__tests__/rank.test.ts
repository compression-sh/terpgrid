import { describe, expect, it } from 'vitest';
import * as SA from '../catalog/strainapi';
import { rankStrains, relevance, relevanceCounts } from '../catalog/rank';
import fixture from './fixtures/strainapi-search-gelato.json';
import type { CatalogStrain } from '../catalog/types';

// Echte, gekürzte StrainAPI-Antwort (Suche „gelato“, 3 Seiten à 100, abgerufen am fetchedAt)
const items = (fixture.data as SA.RawStrain[]).map((r) => SA.normalizeStrain(r)).filter((s): s is CatalogStrain => !!s);

describe('Relevanz-Sortierung (echte StrainAPI-Antwort „gelato“)', () => {
  it('normalisiert alle Treffer der Quelle', () => {
    expect(items.length).toBe(fixture.total);
  });

  it('Namenstreffer stehen vor Erwähnungen und reinen Volltexttreffern', () => {
    const ranked = rankStrains('gelato', items);
    const counts = relevanceCounts('gelato', items);
    expect(counts.name).toBeGreaterThan(0);
    const firstNonName = ranked.findIndex((s) => s.relevanceGroup !== 'name');
    expect(firstNonName).toBe(counts.name);
    expect(ranked.slice(0, counts.name).every((s) => /gelato/i.test(s.name))).toBe(true);
    // Gruppenreihenfolge monoton: name → genetics → description → fulltext
    const order = { name: 0, genetics: 1, description: 2, fulltext: 3 };
    for (let i = 1; i < ranked.length; i++) expect(order[ranked[i]!.relevanceGroup]).toBeGreaterThanOrEqual(order[ranked[i - 1]!.relevanceGroup]);
    expect(counts.name + counts.genetics + counts.description + counts.fulltext).toBe(items.length);
  });

  it('exakter Name > Name mit Nummer/Zusatz > Wort im Namen > Teilwort', () => {
    const mk = (name: string) => ({ ...items[0]!, name, key: name }) as CatalogStrain;
    const r = rankStrains('gelato', [mk('Rainbow Zelato'), mk('Churro Gelato'), mk('Gelatonade'), mk('Gelato #33'), mk('Gelato')]).map((s) => s.name);
    expect(r).toEqual(['Gelato', 'Gelato #33', 'Churro Gelato', 'Gelatonade', 'Rainbow Zelato']);
  });

  it('Groß-/Kleinschreibung, Akzente und Mehrwortsuchen', () => {
    const mk = (name: string, genetics?: string) => ({ ...items[0]!, name, genetics, key: name }) as CatalogStrain;
    expect(relevance('GELATO', mk('gelato')).score).toBe(100);
    expect(relevance('blue dream', mk('Blue Dream')).group).toBe('name');
    expect(relevance('dream blue', mk('Blue Dream')).group).toBe('name');
    expect(relevance('gelato', mk('Mystery', 'Gelato x Sherbet')).group).toBe('genetics');
    expect(relevance('(((', mk('Gelato')).group).toBe('fulltext');
  });
});
