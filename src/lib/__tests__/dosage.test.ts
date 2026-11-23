import { describe, expect, it } from 'vitest';
import { assessEdibleDose, classifyEdibleDose, doseScalePosition, standardUnits } from '../calc/dosage';

describe('Edible-Dosis-Einordnung', () => {
  it.each([
    [1, 'start'],
    [2.5, 'low'],
    [5, 'moderate'],
    [9.9, 'moderate'],
    [10, 'high'],
    [25, 'veryHigh'],
    [80, 'extreme'],
  ])('%s mg → %s', (mg, level) => {
    expect(classifyEdibleDose(mg).level).toBe(level);
  });

  it('ungültige Werte werden als 0 behandelt', () => {
    expect(classifyEdibleDose(Number.NaN).level).toBe('start');
    expect(classifyEdibleDose(-3).level).toBe('start');
  });

  it('Standard-THC-Einheiten (5 mg)', () => {
    expect(standardUnits(10)).toBe(2);
  });

  it('Warnungen basieren auf der Obergrenze', () => {
    const a = assessEdibleDose(6, 4, 12);
    expect(a.highBand.level).toBe('high');
    expect(a.warnings.some((w) => w.includes('10 mg'))).toBe(true);
    expect(assessEdibleDose(1, 0.8, 1.2).warnings).toEqual([]);
  });

  it('logarithmische Skala', () => {
    expect(doseScalePosition(0.1)).toBe(0);
    expect(doseScalePosition(200)).toBe(1);
    const p = doseScalePosition(5);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.5);
  });
});
