import type { EdibleInput } from './calc/edibles';
import type { SmokingInput } from './calc/smoking';
import type { Recipe } from './calc/compare';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isEdibleInput(v: unknown): v is EdibleInput {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const p = o.potency as Record<string, unknown> | undefined;
  return (
    num(o.cannabisGrams) &&
    num(o.fatGrams) &&
    num(o.strainLoss) &&
    num(o.decarbEfficiency) &&
    num(o.extractionEfficiency) &&
    num(o.labelUncertainty) &&
    num(o.recipeFatGrams) &&
    num(o.portions) &&
    typeof o.alreadyDecarbed === 'boolean' &&
    (o.recipeFatMode === 'perRecipe' || o.recipeFatMode === 'perPortion') &&
    !!p &&
    (p.mode === 'total' || p.mode === 'separate') &&
    num(p.thcPercent)
  );
}

export function isSmokingInput(v: unknown): v is SmokingInput {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    num(o.grams) &&
    num(o.thcPercent) &&
    num(o.fractionConsumed) &&
    num(o.people) &&
    ['unknown', 'occasional', 'regular'].includes(o.profile as string) &&
    ['none', 'low', 'medium', 'high'].includes(o.tolerance as string)
  );
}

export function isRecipeList(v: unknown): v is Recipe[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        r && typeof r === 'object' && typeof (r as Recipe).id === 'string' && typeof (r as Recipe).name === 'string' && isEdibleInput((r as Recipe).input),
    )
  );
}
