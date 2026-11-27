import { describe, expect, it } from 'vitest';
import { toCSVTable } from '../exporters';

describe('CSV-Tabellenexport (Journal)', () => {
  it('trennt mit Semikolon, maskiert Sonderzeichen und lässt fehlende Werte leer', () => {
    const csv = toCSVTable(['Datum', 'Notizen', 'Bewertung'], [['2026-11-01 20:00', 'ruhig; "gut"\nzweite Zeile', 4], ['2026-11-02 21:00', '', undefined]]);
    expect(csv.split('\r\n')[0]).toBe('Datum;Notizen;Bewertung');
    expect(csv).toContain('"ruhig; ""gut""\nzweite Zeile"');
    expect(csv.split('\r\n').at(-1)).toBe('2026-11-02 21:00;;');
  });
});

describe('CSV: Schutz vor Formel-Injektion', () => {
  it('markiert Texte mit führendem =, +, -, @ als Text, lässt Zahlen unverändert', async () => {
    const { toTableCsv } = await import('../explorer');
    const { seriesCsv } = await import('../grow/series');
    const csv = toCSVTable(['A', 'B'], [['=HYPERLINK("http://x","y")', '-1,5'], ['@SUMME(1)', '+49 123'], ['normal', -2]]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csv).toContain(';-1,5');
    expect(csv).toContain("'@SUMME(1)");
    expect(csv).toContain(';-2');
    const t = toTableCsv(['Name', 'Wert'], [['=1+1', -3.5]]);
    expect(t).toContain("'=1+1;-3,5");
    expect(seriesCsv([{ date: '2026-11-01T10:00', ref: '=cmd', value: 6.1, unit: '' }])).toContain("'=cmd;6,1");
  });
});
