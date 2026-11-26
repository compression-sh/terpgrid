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
