import { describe, expect, it } from 'vitest';
import { CBDA_TO_CBD_FACTOR, MOLAR_MASS_CBD, MOLAR_MASS_CBDA, convertUnit, plausibilityIssues, totalCbd, totalThc } from '../lab';

describe('Laborberichte', () => {
  it('Faktor CBDA → CBD entspricht dem Molmassenverhältnis', () => {
    expect(MOLAR_MASS_CBD / MOLAR_MASS_CBDA).toBeCloseTo(CBDA_TO_CBD_FACTOR, 3);
  });
  it('Gesamt-THC = THC + 0,877 × THCA', () => {
    expect(totalThc({ thc: 0.5, thca: 22 })).toMatchObject({ computed: 19.794, basis: 'computed' });
  });
  it('deklarierter Gesamtwert wird nicht erneut umgerechnet, nur verglichen', () => {
    const r = totalThc({ thc: 0.5, thca: 22, declaredTotalThc: 19.8 });
    expect(r.declared).toBe(19.8);
    expect(r.difference).toBeCloseTo(0.006, 3);
    expect(totalThc({ declaredTotalThc: 20 })).toMatchObject({ basis: 'declared-only', computed: undefined });
  });
  it('fehlende Säureform: nur Untergrenze, gekennzeichnet', () => {
    expect(totalCbd({ cbd: 1.2 })).toMatchObject({ computed: 1.2, basis: 'neutral-only' });
    expect(totalCbd({ cbda: 10 })).toMatchObject({ computed: 8.77, basis: 'acid-only' });
    expect(totalCbd({})).toMatchObject({ basis: 'missing' });
  });
  it('Einheiten: 1 % = 10 mg/g', () => {
    expect(convertUnit(2.5, '%', 'mg/g')).toBe(25);
    expect(convertUnit(25, 'mg/g', '%')).toBe(2.5);
  });
  it('Plausibilität', () => {
    expect(plausibilityIssues({ unit: '%', thca: 90, thc: 20, terpenes: [] })).toHaveLength(1);
    expect(plausibilityIssues({ unit: 'mg/g', thca: 250, terpenes: [{ name: 'Myrcen', value: 8 }] })).toEqual([]);
  });
});
