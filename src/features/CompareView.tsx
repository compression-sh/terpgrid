import { Copy, GitCompare, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../components/ui/Card';
import { ExportMenu } from '../components/ui/ExportMenu';
import { NumberField } from '../components/ui/NumberField';
import { SaveButton } from '../components/ui/SaveButton';
import { type Recipe, compareRecipes, extremes, newRecipe } from '../lib/calc/compare';
import { classifyEdibleDose } from '../lib/calc/dosage';
import type { EdibleInput } from '../lib/calc/edibles';
import { totalThcPercent } from '../lib/calc/potency';
import type { ExportPayload } from '../lib/exporters';
import { fmt, fmtRange } from '../lib/format';
import { toneHex } from './DoseBadge';
import { t } from '../i18n';

interface Props {
  recipes: Recipe[];
  onChange: (recipes: Recipe[]) => void;
  currentEdible: EdibleInput;
  onSave: (name: string, recipes: Recipe[], summary: Record<string, string>) => void;
}

const MAX_RECIPES = 6;

export function CompareView({ recipes, onChange, currentEdible, onSave }: Props) {
  const rows = useMemo(() => compareRecipes(recipes), [recipes]);
  const { minId, maxId } = extremes(rows);

  const update = (id: string, patch: Partial<Recipe> | ((r: Recipe) => Recipe)) =>
    onChange(recipes.map((r) => (r.id === id ? (typeof patch === 'function' ? patch(r) : { ...r, ...patch }) : r)));
  const setInput = (id: string, patch: Partial<EdibleInput>) => update(id, (r) => ({ ...r, input: { ...r.input, ...patch } }));

  const chartData = rows.map((row) => ({
    name: row.name,
    mid: row.result.perPortionMg.mid,
    err: [row.result.perPortionMg.mid - row.result.perPortionMg.low, row.result.perPortionMg.high - row.result.perPortionMg.mid] as [number, number],
    tone: classifyEdibleDose(row.result.perPortionMg.mid).tone,
  }));

  const summary = Object.fromEntries(rows.map((r) => [r.name, fmtRange(r.result.perPortionMg, t('lab.cmp.mgPortion'))]));
  const buildExport = (): ExportPayload => ({
    title: t('lab.cmp.title'),
    generatedAt: new Date().toISOString(),
    inputs: recipes.map((r) => ({
      label: r.name,
      value: t('lab.cmp.inputLine', { c: fmt(r.input.cannabisGrams), thc: fmt(totalThcPercent(r.input.potency).totalThcPercent), fat: fmt(r.input.fatGrams), n: r.input.portions }),
    })),
    results: rows.flatMap((r) => [
      { label: t('lab.cmp.rowButter', { name: r.name }), value: fmtRange(r.result.mgPerGramFat, 'mg/g') },
      { label: t('lab.cmp.rowPortion', { name: r.name }), value: t('lab.approxRange', { v: fmt(r.result.perPortionMg.mid), unit: 'mg', range: fmtRange(r.result.perPortionMg, 'mg') }) },
    ]),
    notes: [t('lab.cmp.note')],
  });

  return (
    <div className="space-y-5">
      <Card
        title={t('lab.cmp.card')}
        subtitle={t('lab.cmp.cardSub')}
        icon={<GitCompare className="size-4" />}
        actions={
          <>
            <SaveButton defaultName={t('lab.cmp.count', { n: recipes.length })} onSave={(n) => onSave(n, recipes, summary)} />
            <ExportMenu build={buildExport} />
          </>
        }
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} />
              <YAxis tickLine={false} axisLine={false} unit=" mg" width={56} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }}
                formatter={(v: number, _n: string, item: { payload?: { err: [number, number]; mid: number } }) => {
                  const p = item.payload;
                  return p ? [t('lab.approxRange', { v: fmt(v), unit: 'mg', range: `${fmt(p.mid - p.err[0])}–${fmt(p.mid + p.err[1])}` }), t('lab.cmp.perPortion')] : [v, ''];
                }}
              />
              <ReferenceLine y={10} stroke="#fb7185" strokeDasharray="4 4" label={{ value: '10 mg', position: 'insideTopRight', fill: '#fb7185', fontSize: 10 }} />
              <ReferenceLine y={2.5} stroke="#34c77b" strokeDasharray="4 4" label={{ value: '2,5', position: 'insideTopRight', fill: '#34c77b', fontSize: 10 }} />
              <Bar dataKey="mid" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={toneHex[d.tone]} fillOpacity={0.75} />
                ))}
                <ErrorBar dataKey="err" width={8} strokeWidth={1.5} stroke="#dfe7e3" direction="y" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-ink-400">
                <th className="py-2 pr-3 font-medium">{t('lab.cmp.recipe')}</th>
                <th className="py-2 pr-3 font-medium">{t('lab.cmp.theoretical')}</th>
                <th className="py-2 pr-3 font-medium">{t('lab.cmp.mgButter')}</th>
                <th className="py-2 pr-3 font-medium">{t('lab.cmp.total')}</th>
                <th className="py-2 font-medium">{t('lab.cmp.perPortion')}</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-2.5 pr-3 font-sans font-medium text-ink-100">
                    {r.name}
                    {r.id === maxId && rows.length > 1 && <span className="ml-2 text-[10px] text-rose-300">{t('lab.cmp.strongest')}</span>}
                    {r.id === minId && rows.length > 1 && <span className="ml-2 text-[10px] text-leaf-300">{t('lab.cmp.weakest')}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-300">{fmt(r.result.theoreticalMg.mid)} mg</td>
                  <td className="py-2.5 pr-3 text-ink-200">{fmtRange(r.result.mgPerGramFat)}</td>
                  <td className="py-2.5 pr-3 text-ink-200">{fmtRange(r.result.recipeMg)}</td>
                  <td className="py-2.5 text-ink-50">
                    ~{fmt(r.result.perPortionMg.mid)} <span className="text-ink-400">({fmtRange(r.result.perPortionMg)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 no-print">
        <button
          type="button"
          className="btn-ghost"
          disabled={recipes.length >= MAX_RECIPES}
          onClick={() => onChange([...recipes, newRecipe(recipes.length)])}
        >
          <Plus className="size-4" /> {t('lab.cmp.new')}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={recipes.length >= MAX_RECIPES}
          onClick={() => onChange([...recipes, { ...newRecipe(recipes.length, currentEdible), name: t('lab.cmp.fromEdibles') }])}
        >
          <Copy className="size-4" /> {t('lab.cmp.fromEdiblesHint')}
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {recipes.map((r, idx) => (
          <Card
            key={r.id}
            title={
              <input
                aria-label={t('lab.cmp.name')}
                className="-ml-1 w-full rounded bg-transparent px-1 font-semibold text-ink-50 outline-none hover:bg-white/[0.03] focus:bg-white/[0.05]"
                value={r.name}
                maxLength={40}
                onChange={(e) => update(r.id, { name: e.target.value })}
              />
            }
            actions={
              <>
                <button
                  type="button"
                  className="btn-ghost p-1.5"
                  aria-label={t('lab.cmp.duplicate')}
                  title={t('lab.cmp.duplicate')}
                  disabled={recipes.length >= MAX_RECIPES}
                  onClick={() => {
                    const copy = { ...newRecipe(recipes.length, r.input), name: t('lab.cmp.copy', { name: r.name }) };
                    const next = [...recipes];
                    next.splice(idx + 1, 0, copy);
                    onChange(next);
                  }}
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="btn-ghost p-1.5 hover:text-rose-300"
                  aria-label={t('lab.cmp.remove')}
                  title={t('lab.cmp.remove')}
                  disabled={recipes.length <= 1}
                  onClick={() => onChange(recipes.filter((x) => x.id !== r.id))}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <NumberField label={t('lab.cmp.cannabis')} unit="g" value={r.input.cannabisGrams} onChange={(v) => setInput(r.id, { cannabisGrams: v })} min={0} max={1000} sliderMax={56} step={0.5} positive />
              <NumberField
                label={t('lab.cmp.totalThc')}
                unit="%"
                value={totalThcPercent(r.input.potency).totalThcPercent}
                onChange={(v) => setInput(r.id, { potency: { mode: 'total', thcPercent: v } })}
                min={0}
                max={100}
                sliderMax={35}
                step={0.5}
                positive
              />
              <NumberField label={t('lab.cmp.fatTotal')} unit="g" value={r.input.fatGrams} onChange={(v) => setInput(r.id, { fatGrams: v })} min={0} max={10000} sliderMax={1000} step={5} positive />
              <NumberField
                label={t('lab.cmp.fatRecipe')}
                unit="g"
                value={r.input.recipeFatGrams}
                onChange={(v) => setInput(r.id, { recipeFatGrams: v, recipeFatMode: 'perRecipe' })}
                min={0}
                max={10000}
                sliderMax={500}
                step={5}
                positive
              />
              <NumberField label={t('lab.cmp.portions')} value={r.input.portions} onChange={(v) => setInput(r.id, { portions: v })} min={1} max={1000} sliderMax={48} integer />
              <div className="space-y-3">
                <NumberField label={t('lab.cmp.decarb')} unit="%" value={r.input.decarbEfficiency} onChange={(v) => setInput(r.id, { decarbEfficiency: v })} min={0.01} max={1} scale={100} slider={false} />
                <NumberField label={t('lab.cmp.extraction')} unit="%" value={r.input.extractionEfficiency} onChange={(v) => setInput(r.id, { extractionEfficiency: v })} min={0.01} max={1} scale={100} slider={false} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
