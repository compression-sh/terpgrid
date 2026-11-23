import { describe, expect, it } from 'vitest';
import { bioavailabilityForProfile, calculateSmoking, defaultSmokingInput, validateSmokingInput } from '../calc/smoking';

describe('calculateSmoking', () => {
  const base = { grams: 0.5, thcPercent: 20, fractionConsumed: 1, people: 1, profile: 'unknown' as const, tolerance: 'low' as const };

  it('theoretischer Gehalt: 0,5 g · 20 % = 100 mg', () => {
    expect(calculateSmoking(base).theoreticalTotalMg).toBe(100);
  });

  it('berücksichtigt konsumierten Anteil und Personen', () => {
    const r = calculateSmoking({ ...base, fractionConsumed: 0.6, people: 3 });
    expect(r.theoreticalConsumedMg).toBeCloseTo(60, 10);
    expect(r.theoreticalPerPersonMg).toBeCloseTo(20, 10);
  });

  it('systemische Aufnahme ist immer kleiner als der theoretische Gehalt', () => {
    for (const profile of ['unknown', 'occasional', 'regular'] as const) {
      const r = calculateSmoking({ ...base, profile });
      expect(r.systemicPerPersonMg.high).toBeLessThan(r.theoreticalPerPersonMg);
      expect(r.systemicExtremePerPersonMg.high).toBeLessThan(r.theoreticalPerPersonMg);
      expect(r.systemicPerPersonMg.low).toBeGreaterThan(0);
    }
  });

  it('typischer Bereich 10–35 % (Grotenhermen 2003)', () => {
    const r = calculateSmoking(base);
    expect(r.systemicPerPersonMg.low).toBeCloseTo(10, 10);
    expect(r.systemicPerPersonMg.high).toBeCloseTo(35, 10);
  });

  it('Profile liefern unterschiedliche Bereiche', () => {
    expect(bioavailabilityForProfile('occasional').high).toBeLessThan(bioavailabilityForProfile('regular').high);
  });

  it('nennt Verlustfaktoren und betont den Unterschied theoretisch/aufgenommen', () => {
    const r = calculateSmoking(base);
    expect(r.losses.length).toBeGreaterThanOrEqual(4);
    expect(r.notes[0]).toMatch(/NICHT/);
  });

  it('Validierung', () => {
    expect(validateSmokingInput(defaultSmokingInput())).toEqual([]);
    expect(validateSmokingInput({ ...base, people: 0, fractionConsumed: 1.5 }).length).toBe(2);
    expect(validateSmokingInput({ ...base, people: 1.5 }).some((i) => i.field === 'people')).toBe(true);
  });
});
