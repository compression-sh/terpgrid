import { describe, expect, it } from 'vitest';
import {
  cannabisToFatRatio,
  dilutionToTarget,
  fatForRatio,
  gToMg,
  mgPerGToPercent,
  mgToG,
  mixConcentration,
  percentToMgPerG,
} from '../calc/conversions';

describe('Einheiten', () => {
  it('g ↔ mg', () => {
    expect(gToMg(1.5)).toBe(1500);
    expect(mgToG(250)).toBe(0.25);
  });
  it('% ↔ mg/g', () => {
    expect(percentToMgPerG(20)).toBe(200);
    expect(mgPerGToPercent(200)).toBe(20);
  });
});

describe('Konzentration', () => {
  it('Mischung (gewichtetes Mittel)', () => {
    const m = mixConcentration([
      { grams: 100, mgPerGram: 4 },
      { grams: 100, mgPerGram: 0 },
    ]);
    expect(m.mgPerGram).toBe(2);
    expect(m.totalMg).toBe(400);
  });
  it('leere Mischung', () => {
    expect(mixConcentration([]).mgPerGram).toBe(0);
  });
  it('Verdünnung auf Zielkonzentration', () => {
    expect(dilutionToTarget(100, 4, 2)).toBe(100);
    expect(dilutionToTarget(100, 4, 5)).toBe(0);
    expect(dilutionToTarget(100, 4, 0)).toBe(Infinity);
  });
  it('Cannabis-zu-Fett-Verhältnis', () => {
    expect(cannabisToFatRatio(10, 250)).toEqual({ oneTo: 25, per100g: 4 });
    expect(cannabisToFatRatio(0, 250)).toEqual({ oneTo: 0, per100g: 0 });
    expect(fatForRatio(10, 4)).toBe(250);
  });
});
