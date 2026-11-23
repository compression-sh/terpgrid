import { describe, expect, it } from 'vitest';
import {
  type EdibleInput,
  calculateEdibles,
  defaultEdibleInput,
  effectiveYieldMgPerGram,
  fatNeededForPortionDose,
  requiredCannabis,
  requiredConcentrationForPortion,
  validateEdibleInput,
} from '../calc/edibles';

function input(over: Partial<EdibleInput> = {}): EdibleInput {
  return {
    cannabisGrams: 10,
    potency: { mode: 'total', thcPercent: 20 },
    alreadyDecarbed: false,
    fatGrams: 200,
    strainLoss: 0,
    decarbEfficiency: 1,
    extractionEfficiency: 1,
    labelUncertainty: 0,
    recipeFatMode: 'perRecipe',
    recipeFatGrams: 100,
    portions: 10,
    ...over,
  };
}

describe('calculateEdibles – Grundrechnung', () => {
  it('theoretische Menge = g · 1000 · %/100', () => {
    const r = calculateEdibles(input());
    expect(r.theoreticalMg.mid).toBe(2000);
  });

  it('ohne Verluste: 2000 mg in 200 g → 10 mg/g', () => {
    const r = calculateEdibles(input());
    expect(r.mgPerGramFat.mid).toBeCloseTo(10, 10);
    expect(r.recipeMg.mid).toBeCloseTo(1000, 10);
    expect(r.perPortionMg.mid).toBeCloseTo(100, 10);
  });

  it('Effizienzen werden genau einmal multipliziert', () => {
    const r = calculateEdibles(input({ decarbEfficiency: 0.8, extractionEfficiency: 0.5 }));
    expect(r.afterDecarbMg.mid).toBeCloseTo(1600, 10);
    expect(r.inFatMg.mid).toBeCloseTo(800, 10);
    expect(r.mgPerGramFat.mid).toBeCloseTo(4, 10);
    // Verlustsumme = theoretisch − im Fett
    expect(r.losses.decarbMg + r.losses.extractionMg).toBeCloseTo(2000 - 800, 10);
  });

  it('Abseihverlust ändert die Konzentration nicht (keine Doppelzählung)', () => {
    const a = calculateEdibles(input({ extractionEfficiency: 0.7 }));
    const b = calculateEdibles(input({ extractionEfficiency: 0.7, strainLoss: 0.2 }));
    expect(b.mgPerGramFat.mid).toBeCloseTo(a.mgPerGramFat.mid, 10);
    expect(b.recoveredFatGrams).toBeCloseTo(160, 10);
    expect(b.recoveredFatMg.mid).toBeCloseTo(a.inFatMg.mid * 0.8, 10);
    expect(b.losses.strainMg).toBeCloseTo(a.inFatMg.mid * 0.2, 10);
  });

  it('Modus "pro Portion" multipliziert Butter mit Portionen', () => {
    const r = calculateEdibles(input({ recipeFatMode: 'perPortion', recipeFatGrams: 5, portions: 12 }));
    expect(r.recipeFatGrams).toBe(60);
    expect(r.fatPerPortionGrams).toBe(5);
    expect(r.perPortionMg.mid).toBeCloseTo(50, 10);
  });

  it('bereits decarboxyliert → Decarb-Effizienz wird ignoriert', () => {
    const r = calculateEdibles(input({ alreadyDecarbed: true, decarbEfficiency: 0.5 }));
    expect(r.afterDecarbMg.mid).toBe(2000);
    expect(r.afterDecarbMg.low).toBe(2000);
  });
});

describe('calculateEdibles – THCA', () => {
  it('Decarb-Effizienz wirkt nur auf den THCA-Anteil', () => {
    const r = calculateEdibles(
      input({ potency: { mode: 'separate', thcPercent: 2, thcaPercent: 20 }, decarbEfficiency: 0.5 }),
    );
    // frei: 10 g · 2 % = 200 mg; aus THCA: 10 g · 20 % · 0,877 = 1754 mg → ×0,5 = 877
    expect(r.theoreticalMg.mid).toBeCloseTo(200 + 1754, 6);
    expect(r.afterDecarbMg.mid).toBeCloseTo(200 + 877, 6);
  });

  it('Gesamt-THC-Modus wendet 0,877 nicht an', () => {
    const r = calculateEdibles(input({ potency: { mode: 'total', thcPercent: 20, thcaPercent: 22 } }));
    expect(r.theoreticalMg.mid).toBe(2000);
  });
});

describe('calculateEdibles – Unsicherheit', () => {
  it('Bereich umschließt den Mittelwert und wird mit Unsicherheit breiter', () => {
    const narrow = calculateEdibles(input({ decarbEfficiency: 0.85, extractionEfficiency: 0.7 }));
    const wide = calculateEdibles(input({ decarbEfficiency: 0.85, extractionEfficiency: 0.7, labelUncertainty: 0.2 }));
    for (const r of [narrow, wide]) {
      expect(r.perPortionMg.low).toBeLessThanOrEqual(r.perPortionMg.mid);
      expect(r.perPortionMg.high).toBeGreaterThanOrEqual(r.perPortionMg.mid);
    }
    expect(wide.spreadFactor).toBeGreaterThan(narrow.spreadFactor);
  });

  it('Effizienzgrenzen werden auf 0–100 % begrenzt', () => {
    const r = calculateEdibles(input({ decarbEfficiency: 1, extractionEfficiency: 1 }));
    // obere Grenze darf theoretisches Maximum nicht übersteigen (ohne Label-Unsicherheit)
    expect(r.inFatMg.high).toBeLessThanOrEqual(r.theoreticalMg.mid + 1e-9);
  });

  it('Beispiel mit Standardwerten liefert plausible Größenordnung', () => {
    const r = calculateEdibles(defaultEdibleInput());
    // 7 g · 18 % = 1260 mg; ·0,85·0,7 ≈ 749,7 mg in 250 g → ≈ 3 mg/g
    expect(r.theoreticalMg.mid).toBeCloseTo(1260, 6);
    expect(r.mgPerGramFat.mid).toBeCloseTo(2.9988, 3);
  });
});

describe('Warnungen & Validierung', () => {
  it('warnt, wenn das Rezept mehr Butter braucht als vorhanden', () => {
    const r = calculateEdibles(input({ recipeFatGrams: 190, strainLoss: 0.1 }));
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('erkennt ungültige Eingaben', () => {
    const issues = validateEdibleInput(input({ cannabisGrams: -1, portions: 0 }));
    expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(['cannabisGrams', 'portions']));
  });
  it('THC + THCA > 100 % ist ungültig', () => {
    const issues = validateEdibleInput(input({ potency: { mode: 'separate', thcPercent: 50, thcaPercent: 70 } }));
    expect(issues.some((i) => i.field === 'thcPercent')).toBe(true);
  });
  it('gültige Standardeingabe hat keine Fehler', () => {
    expect(validateEdibleInput(defaultEdibleInput())).toEqual([]);
  });
});

describe('Umkehrrechnungen', () => {
  it('benötigte Cannabis-Menge ist die Umkehrung der Vorwärtsrechnung', () => {
    const base = input({ decarbEfficiency: 0.85, extractionEfficiency: 0.7 });
    const fwd = calculateEdibles(base);
    const rev = requiredCannabis({
      potency: base.potency,
      alreadyDecarbed: false,
      decarbEfficiency: 0.85,
      extractionEfficiency: 0.7,
      labelUncertainty: 0,
      targetMgPerGramFat: fwd.mgPerGramFat.mid,
      fatGrams: base.fatGrams,
    });
    expect(rev.grams).toBeCloseTo(base.cannabisGrams, 8);
    expect(rev.range.low).toBeLessThanOrEqual(rev.grams);
    expect(rev.range.high).toBeGreaterThanOrEqual(rev.grams);
  });

  it('effektive Ausbeute pro Gramm', () => {
    expect(effectiveYieldMgPerGram({ potency: { mode: 'total', thcPercent: 20 }, alreadyDecarbed: false }, 0.5, 0.5)).toBeCloseTo(50, 10);
  });

  it('benötigte Konzentration für Ziel-mg pro Portion', () => {
    expect(requiredConcentrationForPortion(5, 20, 100)).toBe(1);
    expect(requiredConcentrationForPortion(5, 20, 0)).toBe(Infinity);
  });

  it('benötigte Buttermenge für Ziel-mg pro Portion', () => {
    expect(fatNeededForPortionDose(5, 10, 2.5)).toBe(20);
    expect(fatNeededForPortionDose(5, 10, 0)).toBe(Infinity);
  });
});
