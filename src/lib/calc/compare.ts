import { type EdibleInput, type EdibleResult, calculateEdibles, defaultEdibleInput } from './edibles';

export interface Recipe {
  id: string;
  name: string;
  input: EdibleInput;
}

export interface RecipeComparisonRow {
  id: string;
  name: string;
  result: EdibleResult;
}

export function compareRecipes(recipes: Recipe[]): RecipeComparisonRow[] {
  return recipes.map((r) => ({ id: r.id, name: r.name, result: calculateEdibles(r.input) }));
}

/** Index der Rezepte mit niedrigster / höchster Portionsdosis (Mittelwert). */
export function extremes(rows: RecipeComparisonRow[]): { minId?: string; maxId?: string } {
  if (rows.length === 0) return {};
  let min = rows[0]!;
  let max = rows[0]!;
  for (const row of rows) {
    if (row.result.perPortionMg.mid < min.result.perPortionMg.mid) min = row;
    if (row.result.perPortionMg.mid > max.result.perPortionMg.mid) max = row;
  }
  return { minId: min.id, maxId: max.id };
}

export function newRecipe(index: number, base?: Partial<EdibleInput>): Recipe {
  return {
    id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Rezept ${String.fromCharCode(65 + (index % 26))}`,
    input: { ...defaultEdibleInput(), ...base },
  };
}
