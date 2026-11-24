import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { breederKey, cleanText, cultivarIdOf, groupCultivars, headerIndex, parseCsv, parseDataset, parseRow, plausibleName, slugify, type Listing } from '../src/catalog/cisp.js';

const FIXTURE = readFileSync(join(import.meta.dirname, 'fixtures', 'cisp-sample.csv'));
const HEADER = parseCsv(FIXTURE.toString('utf8'))[0]!;
const H = headerIndex(HEADER);

function row(over: Record<string, string>): string[] {
  const base: Record<string, string> = {
    strain_id: '00000000-0000-4000-8000-000000000001',
    source_url: 'https://example-seeds.test/gelato',
    strain_name_display: 'Gelato',
    strain_name_original: 'Gelato Feminized',
    seed_bank: 'Example Seeds',
    breeder: "Barney's Farm",
    is_auto_flowering: 'False',
    is_feminized_flowering: 'True',
  };
  const r = { ...base, ...over };
  return HEADER.map((c) => r[c] ?? '');
}

describe('CSV-Parser', () => {
  it('versteht Anführungszeichen, Kommas und Zeilenumbrüche in Feldern', () => {
    expect(parseCsv('a,b\n"x, y","z ""q"""\r\n"mehr\nzeilig",2\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'z "q"'],
      ['mehr\nzeilig', '2'],
    ]);
  });
});

describe('Bereinigung', () => {
  it('entfernt Mojibake-Ketten und Ersatzzeichen', () => {
    expect(cleanText('THIN MINTÃ\u0083Â\u0083Ã\u0082Â\u0082 GIRL SCOUT')).toBe('THIN MINT GIRL SCOUT');
    expect(cleanText('T.H.Seeds�')).toBe('T.H.Seeds');
  });
  it('führt nur Schreibweisen zusammen (Groß/Klein, Satzzeichen)', () => {
    expect(breederKey('ACE Seeds')).toBe(breederKey('Ace Seeds'));
    expect(breederKey('BlimBurn Seeds')).toBe(breederKey('Blimburn Seeds'));
    expect(breederKey('Amsterdam Genetics')).not.toBe(breederKey('Amsterdam Seeds'));
  });
  it('erkennt Fließtext statt Sortennamen', () => {
    expect(plausibleName('OG Kush')).toBe(true);
    expect(plausibleName('Lineage: (Blueberry Thai')).toBe(false);
    expect(plausibleName('About Auto MassassinMonster Mass')).toBe(false);
    expect(plausibleName('Titan F1 AutofloweringCalming, Focus, Physically Relaxing, Uplifting70 - 75 days')).toBe(false);
  });
});

describe('Zeilen-Validierung', () => {
  it('verwirft unplausible THC-Werte statt sie zu korrigieren', () => {
    const r = parseRow(row({ thc_min: '18.0', thc_max: '8211.0' }), H, 2) as Listing;
    expect(r.values.thc).toEqual({ min: 18, max: undefined });
    expect(r.rejected.thc_max).toBe('implausible');
    const z = parseRow(row({ thc_min: '0.03', thc_max: '0.03' }), H, 2) as Listing;
    expect(z.values.thc).toBeUndefined();
  });
  it('erlaubt niedriges THC nur bei CBD-dominanten Sorten', () => {
    const r = parseRow(row({ thc_min: '0.5', thc_max: '0.8', cbd_min: '10', cbd_max: '14' }), H, 2) as Listing;
    expect(r.values.thc).toEqual({ min: 0.5, max: 0.8 });
    expect(r.values.cbd).toEqual({ min: 10, max: 14 });
  });
  it('lehnt min > max ab und prüft Indica/Sativa-Summe', () => {
    const r = parseRow(row({ thc_min: '25', thc_max: '20', indica_percentage: '60', sativa_percentage: '60' }), H, 2) as Listing;
    expect(r.values.thc).toBeUndefined();
    expect(r.rejected.thc).toBe('min_gt_max');
    expect(r.values.indica).toBeUndefined();
  });
  it('verwirft Abstammung aus Shop-Fließtext vollständig', () => {
    const r = parseRow(row({ parent_1_display: 'OG Kush', parent_2_display: 'sunset sherbetDouble xl Banana Sherbetbanana x sunset sherbetSuper High THC levels' }), H, 2) as Listing;
    expect(r.values.parents).toBeUndefined();
    expect(r.rejected.parents).toBe('not_a_name');
    const ok = parseRow(row({ parent_1_display: 'BLUEBERRY', parent_2_display: 'Thin Mint Girl Scout Cookies Strain' }), H, 2) as Listing;
    expect(ok.values.parents).toEqual([
      { name: 'Blueberry', slug: 'blueberry' },
      { name: 'Thin Mint Girl Scout Cookies', slug: 'thin-mint-girl-scout-cookies' },
    ]);
  });
  it('lehnt Zeilen ohne Pflichtangaben oder mit unsicherer URL ab', () => {
    expect(parseRow(row({ strain_id: 'x' }), H, 2)).toMatchObject({ reason: 'Ungültige strain_id' });
    expect(parseRow(row({ source_url: 'http://plain.test/x' }), H, 2)).toMatchObject({ reason: 'Ungültige Quell-URL' });
    expect(parseRow(row({ source_url: 'javascript:alert(1)' }), H, 2)).toMatchObject({ reason: 'Ungültige Quell-URL' });
    expect(parseRow(row({ breeder: '' }), H, 2)).toMatchObject({ reason: 'Breeder fehlt' });
  });
  it('Terpen-Spalte mit Zahlen wird nicht als Terpenliste übernommen', () => {
    expect((parseRow(row({ terpenes: '3' }), H, 2) as Listing).values.terpenes).toBeUndefined();
    expect((parseRow(row({ terpenes: 'Caryophyllene, Limonene, Myrcene' }), H, 2) as Listing).values.terpenes).toEqual(['caryophyllene', 'limonene', 'myrcene']);
  });
});

describe('Gruppierung', () => {
  it('fasst Angebote nur innerhalb desselben Breeders zusammen', () => {
    const a = parseRow(row({ strain_id: '00000000-0000-4000-8000-00000000000a', seed_bank: 'Bank A', thc_min: '20', thc_max: '22' }), H, 2) as Listing;
    const b = parseRow(row({ strain_id: '00000000-0000-4000-8000-00000000000b', seed_bank: 'Bank B', thc_min: '25', thc_max: '28' }), H, 3) as Listing;
    const c = parseRow(row({ strain_id: '00000000-0000-4000-8000-00000000000c', breeder: 'Cookies Fam', thc_min: '20', thc_max: '22' }), H, 4) as Listing;
    const d = parseRow(row({ strain_id: '00000000-0000-4000-8000-00000000000d', is_auto_flowering: 'True' }), H, 5) as Listing;
    const { cultivars, breeders } = groupCultivars([a, b, c, d]);
    expect(cultivars.map((x) => x.id).sort()).toEqual(['barneysfarm--gelato', 'barneysfarm--gelato--auto', 'cookiesfam--gelato']);
    const barney = cultivars.find((x) => x.id === 'barneysfarm--gelato')!;
    expect(barney.listingIds).toHaveLength(2);
    expect(barney.values.thc).toEqual({ min: 20, max: 28 });
    // 20–22 und 25–28 überschneiden sich nicht → als Widerspruch markiert
    expect(barney.conflicts).toContain('thc');
    expect(breeders.map((x) => x.id).sort()).toEqual(['barneysfarm', 'cookiesfam']);
  });
  it('stabile Sorten-IDs', () => {
    expect(cultivarIdOf('barneysfarm', 'Gelato #41', '2', true)).toBe('barneysfarm--gelato-41--v-2--auto');
    expect(slugify('Barney’s Farm & Co.')).toBe('barney-s-farm-and-co');
  });
});

describe('Datensatz (Auszug aus CI-Strains-Pro)', () => {
  const d = parseDataset(FIXTURE);
  it('liefert einen nachvollziehbaren Qualitätsbericht', () => {
    expect(d.report.rawRows).toBe(39);
    expect(d.report.accepted + d.report.rejectedRows).toBe(39);
    expect(d.report.columns).toBe(53);
    expect(d.report.checksumMatches).toBe(false); // Auszug ≠ geprüfte Gesamtdatei
    expect(d.report.fieldRejections.thc_max).toBeGreaterThanOrEqual(2);
    expect(d.report.namesSharedAcrossBreeders).toBeGreaterThan(0);
  });
  it('trennt gleichnamige Sorten verschiedener Breeder', () => {
    const gelato = d.cultivars.filter((c) => slugify(c.name) === 'gelato');
    // Jede Sorte gehört genau einem Breeder; IDs sind eindeutig
    expect(new Set(gelato.map((c) => c.id)).size).toBe(gelato.length);
    expect(gelato.every((c) => c.id.startsWith(`${c.breederId}--`))).toBe(true);
    expect(new Set(gelato.map((c) => c.breederId)).size).toBeGreaterThan(1);
  });
  it('führt Breeder-Schreibweisen zusammen und bereinigt Kodierungsfehler', () => {
    expect(d.breeders.filter((b) => b.id === 'aceseeds')).toHaveLength(1);
    expect(d.breeders.some((b) => b.name.includes('�'))).toBe(false);
    expect(d.listings.every((l) => !/[�Ã]/.test(l.name + l.breederRaw + JSON.stringify(l.values)))).toBe(true);
  });
});
