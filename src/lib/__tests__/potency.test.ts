import { describe, expect, it } from 'vitest';
import { MOLAR_MASS_THC, MOLAR_MASS_THCA, THCA_TO_THC_FACTOR } from '../calc/constants';
import { classifyFlowerPotency, gramsForMg, mgFromPercent, percentFromMg, totalThcPercent } from '../calc/potency';

describe('THCA-Umrechnung', () => {
  it('Faktor 0,877 entspricht dem Molmassenverhältnis', () => {
    expect(MOLAR_MASS_THC / MOLAR_MASS_THCA).toBeCloseTo(THCA_TO_THC_FACTOR, 3);
  });

  it('wendet 0,877 auf THCA an (Modus separat)', () => {
    const r = totalThcPercent({ mode: 'separate', thcPercent: 1, thcaPercent: 20 });
    expect(r.totalThcPercent).toBeCloseTo(1 + 20 * 0.877, 10);
    expect(r.freeThcPercent).toBe(1);
    expect(r.thcFromThcaPercent).toBeCloseTo(17.54, 10);
    expect(r.splitKnown).toBe(true);
  });

  it('wendet den Faktor bei Gesamt-THC NICHT erneut an', () => {
    const r = totalThcPercent({ mode: 'total', thcPercent: 18, thcaPercent: 25 });
    expect(r.totalThcPercent).toBe(18);
    expect(r.splitKnown).toBe(false);
  });
});

describe('Prozent/mg-Umrechnung', () => {
  it('1 g bei 20 % = 200 mg', () => {
    expect(mgFromPercent(1, 20)).toBe(200);
  });
  it('ist umkehrbar', () => {
    expect(percentFromMg(mgFromPercent(3.5, 17), 3.5)).toBeCloseTo(17, 10);
    expect(gramsForMg(200, 20)).toBeCloseTo(1, 10);
  });
  it('behandelt Randfälle', () => {
    expect(percentFromMg(10, 0)).toBe(0);
    expect(gramsForMg(10, 0)).toBe(Infinity);
  });
});

describe('Potenz-Einordnung', () => {
  it.each([
    [5, 'niedrig'],
    [12, 'mittel'],
    [18, 'hoch'],
    [25, 'sehr hoch'],
    [60, 'extrem'],
  ])('%s %% → %s', (v, cat) => {
    expect(classifyFlowerPotency(v).category).toBe(cat);
  });
  it('Skalenposition bleibt zwischen 0 und 1', () => {
    expect(classifyFlowerPotency(-1).scalePosition).toBe(0);
    expect(classifyFlowerPotency(90).scalePosition).toBe(1);
  });
});
