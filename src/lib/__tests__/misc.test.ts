import { describe, expect, it } from 'vitest';
import { compareRecipes, extremes, newRecipe } from '../calc/compare';
import { checkField, parseLocaleNumber } from '../calc/validation';
import { toCSV, toText, slugify, type ExportPayload } from '../exporters';
import { type KeyValueStore, createSaved, loadSaved, persistSaved, STORAGE_KEY } from '../storage';
import { fmt, fmtRange } from '../format';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('parseLocaleNumber', () => {
  it.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['1.234,5', 1234.5],
    [' 12 ', 12],
    ['abc', NaN],
    ['', NaN],
  ])('%s → %s', (s, n) => {
    expect(Number.isNaN(n) ? Number.isNaN(parseLocaleNumber(s)) : parseLocaleNumber(s) === n).toBe(true);
  });
});

describe('checkField', () => {
  const rule = { min: 0, max: 10, label: 'Wert' };
  it('Grenzen', () => {
    expect(checkField('x', 5, rule)).toBeNull();
    expect(checkField('x', 11, rule)).not.toBeNull();
    expect(checkField('x', 0, rule)).not.toBeNull();
    expect(checkField('x', 0, { ...rule, allowZero: true })).toBeNull();
    expect(checkField('x', NaN, rule)).not.toBeNull();
  });
});

describe('Rezeptvergleich', () => {
  it('findet min/max', () => {
    const a = newRecipe(0, { cannabisGrams: 5 });
    const b = newRecipe(1, { cannabisGrams: 15 });
    const rows = compareRecipes([a, b]);
    expect(extremes(rows)).toEqual({ minId: a.id, maxId: b.id });
    expect(extremes([])).toEqual({});
  });
});

describe('Lokale Speicherung', () => {
  it('speichert und lädt', () => {
    const store = memoryStore();
    const item = createSaved('edibles', '  Test  ', { a: 1 }, { x: '1' });
    expect(item.name).toBe('Test');
    expect(persistSaved([item], store)).toBe(true);
    expect(loadSaved(store)).toHaveLength(1);
  });
  it('ignoriert defekte Daten', () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, '{kaputt');
    expect(loadSaved(store)).toEqual([]);
    store.setItem(STORAGE_KEY, JSON.stringify([{ foo: 1 }]));
    expect(loadSaved(store)).toEqual([]);
  });
  it('ohne Speicher', () => {
    expect(loadSaved(null)).toEqual([]);
    expect(persistSaved([], null)).toBe(false);
  });
});

describe('Export', () => {
  const p: ExportPayload = {
    title: 'Edibles Rechner',
    generatedAt: '2026-01-01T00:00:00.000Z',
    inputs: [{ label: 'Cannabis', value: '7 g' }],
    results: [{ label: 'Pro Portion', value: '2–5 mg; "ca."' }],
    notes: ['Hinweis'],
  };
  it('CSV escaped Semikolon und Anführungszeichen', () => {
    const csv = toCSV(p);
    expect(csv.split('\r\n')[0]).toBe('Bereich;Bezeichnung;Wert');
    expect(csv).toContain('"2–5 mg; ""ca."""');
  });
  it('Text enthält Hinweis auf lokale Berechnung', () => {
    expect(toText(p)).toMatch(/keine Daten übertragen/);
  });
  it('slugify', () => {
    expect(slugify('Größe & Maß')).toBe('grosse-mass');
  });
});

describe('Formatierung', () => {
  it('Stellenzahl ohne Scheinpräzision', () => {
    expect(fmt(0.123)).toBe('0,12');
    expect(fmt(12.345)).toBe('12,3');
    expect(fmt(1234.5)).toBe('1.235');
    expect(fmt(Infinity)).toBe('–');
    expect(fmtRange({ low: 1, mid: 2, high: 3 }, 'mg')).toBe('1–3 mg');
  });
});

import { isEdibleInput, isRecipeList, isSmokingInput } from '../guards';
import { defaultEdibleInput } from '../calc/edibles';
import { defaultSmokingInput } from '../calc/smoking';

describe('Typ-Guards für gespeicherte Daten', () => {
  it('akzeptiert gültige und verwirft ungültige Eingaben', () => {
    expect(isEdibleInput(defaultEdibleInput())).toBe(true);
    expect(isEdibleInput({ ...defaultEdibleInput(), portions: 'x' })).toBe(false);
    expect(isSmokingInput(defaultSmokingInput())).toBe(true);
    expect(isSmokingInput({ ...defaultSmokingInput(), profile: 'foo' })).toBe(false);
    expect(isRecipeList([newRecipe(0)])).toBe(true);
    expect(isRecipeList([{ id: 1 }])).toBe(false);
  });
});
