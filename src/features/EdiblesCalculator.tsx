import { Cookie, FlaskConical, Scale, Sprout, Target } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { ExportMenu } from '../components/ui/ExportMenu';
import { NumberField } from '../components/ui/NumberField';
import { RangeBar } from '../components/ui/RangeBar';
import { SaveButton } from '../components/ui/SaveButton';
import { Segmented } from '../components/ui/Segmented';
import { Stat } from '../components/ui/Stat';
import { Toggle } from '../components/ui/Toggle';
import { assessEdibleDose } from '../lib/calc/dosage';
import {
  type EdibleInput,
  type EdibleResult,
  calculateEdibles,
  requiredCannabis,
  requiredConcentrationForPortion,
  validateEdibleInput,
} from '../lib/calc/edibles';
import type { ExportPayload } from '../lib/exporters';
import { fmt, fmtPercent, fmtRange } from '../lib/format';
import { DoseBadge } from './DoseBadge';
import { t } from '../i18n';

interface Props {
  input: EdibleInput;
  onChange: (input: EdibleInput) => void;
  onSave: (name: string, input: EdibleInput, summary: Record<string, string>) => void;
}

export function edibleSummary(r: EdibleResult): Record<string, string> {
  return {
    [t('lab.ed.sumButter')]: fmtRange(r.mgPerGramFat, 'mg/g'),
    [t('lab.ed.perPortion')]: fmtRange(r.perPortionMg, 'mg'),
    [t('lab.ed.recipe')]: fmtRange(r.recipeMg, 'mg'),
  };
}

export function edibleExport(input: EdibleInput, r: EdibleResult): ExportPayload {
  const p = input.potency;
  return {
    title: t('lab.ed.title'),
    generatedAt: new Date().toISOString(),
    inputs: [
      { label: t('lab.ed.cannabis'), value: `${fmt(input.cannabisGrams)} g` },
      p.mode === 'total'
        ? { label: t('lab.ed.totalThc'), value: `${fmt(p.thcPercent)} %` }
        : { label: 'THC / THCA', value: `${fmt(p.thcPercent)} % / ${fmt(p.thcaPercent ?? 0)} %` },
      { label: t('lab.ed.decarbed'), value: input.alreadyDecarbed ? t('lab.yes') : t('lab.no') },
      { label: t('lab.ed.fat'), value: `${fmt(input.fatGrams)} g` },
      { label: t('lab.ed.strainLoss'), value: fmtPercent(input.strainLoss) },
      { label: t('lab.ed.decarbEff'), value: fmtPercent(input.decarbEfficiency) },
      { label: t('lab.ed.extractEff'), value: fmtPercent(input.extractionEfficiency) },
      { label: t('lab.ed.labelUnc'), value: `± ${fmtPercent(input.labelUncertainty)}` },
      { label: t('lab.ed.recipeFat'), value: `${fmt(r.recipeFatGrams)} g` },
      { label: t('lab.ed.portions'), value: String(input.portions) },
    ],
    results: [
      { label: t('lab.ed.theoretical'), value: `${fmt(r.theoreticalMg.mid)} mg` },
      { label: t('lab.ed.afterDecarb'), value: t('lab.approxRange', { v: fmt(r.afterDecarbMg.mid), unit: 'mg', range: fmtRange(r.afterDecarbMg, 'mg') }) },
      { label: t('lab.ed.inFat'), value: t('lab.approxRange', { v: fmt(r.inFatMg.mid), unit: 'mg', range: fmtRange(r.inFatMg, 'mg') }) },
      { label: t('lab.ed.concentration'), value: t('lab.approxRange', { v: fmt(r.mgPerGramFat.mid), unit: 'mg/g', range: fmtRange(r.mgPerGramFat, 'mg/g') }) },
      { label: t('lab.ed.recipeTotal'), value: t('lab.approxRange', { v: fmt(r.recipeMg.mid), unit: 'mg', range: fmtRange(r.recipeMg, 'mg') }) },
      { label: t('lab.ed.perPortionCap'), value: t('lab.approxRange', { v: fmt(r.perPortionMg.mid), unit: 'mg', range: fmtRange(r.perPortionMg, 'mg') }) },
    ],
    notes: [
      t('lab.ed.noteEstimate'),
      t('lab.ed.noteOnset'),
      ...r.warnings,
    ],
  };
}

export function EdiblesCalculator({ input, onChange, onSave }: Props) {
  const set = <K extends keyof EdibleInput>(key: K, value: EdibleInput[K]) => onChange({ ...input, [key]: value });
  const setPotency = (patch: Partial<EdibleInput['potency']>) => onChange({ ...input, potency: { ...input.potency, ...patch } });

  const issues = useMemo(() => validateEdibleInput(input), [input]);
  const result = useMemo(() => calculateEdibles(input), [input]);
  const valid = issues.length === 0;
  const assessment = assessEdibleDose(result.perPortionMg.mid, result.perPortionMg.low, result.perPortionMg.high);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [resultsVisible, setResultsVisible] = useState(true);
  useEffect(() => {
    const el = resultsRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setResultsVisible(!!e?.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Mobil: Ergebnis immer erreichbar, solange das Formular im Blick ist */}
      {valid && !resultsVisible && (
        <button
          type="button"
          onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="no-print fixed inset-x-3 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-2xl border border-leaf-500/25 bg-ink-850/95 px-4 py-3 text-left shadow-2xl backdrop-blur-xl animate-fade-up lg:hidden"
          aria-label={t('lab.ed.jump')}
        >
          <span className="min-w-0">
            <span className="block text-[11px] text-ink-400">{t('lab.ed.stickyLabel')}</span>
            <span className="block font-mono text-[15px] tabular text-ink-50">
              {t('lab.approx', { v: fmt(result.perPortionMg.mid), unit: 'mg' })} <span className="text-xs text-ink-400">({fmt(result.perPortionMg.low)}–{fmt(result.perPortionMg.high)})</span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-leaf-300">{t('lab.ed.resultArrow')}</span>
        </button>
      )}
      {/* Eingaben */}
      <div className="space-y-5">
        <Card title={t('lab.ed.material')} subtitle={t('lab.ed.materialSub')} icon={<Sprout className="size-4" />}>
          <div className="space-y-5">
            <NumberField label={t('lab.ed.amount')} unit="g" value={input.cannabisGrams} onChange={(v) => set('cannabisGrams', v)} min={0} max={1000} sliderMax={56} step={0.5} positive />
            <Segmented
              label={t('lab.ed.thcInput')}
              value={input.potency.mode}
              onChange={(mode) => setPotency({ mode })}
              options={[
                { value: 'total', label: t('lab.ed.totalThc'), hint: t('lab.ed.modeTotalHint') },
                { value: 'separate', label: t('lab.ed.modeSplit'), hint: t('lab.ed.modeSplitHint') },
              ]}
            />
            {input.potency.mode === 'total' ? (
              <NumberField
                label={t('lab.ed.totalThc')}
                unit="%"
                value={input.potency.thcPercent}
                onChange={(v) => setPotency({ thcPercent: v })}
                min={0}
                max={100}
                sliderMax={35}
                step={0.5}
                positive
                hint={t('lab.ed.totalNote')}
              />
            ) : (
              <>
                <NumberField label={t('lab.ed.freeThc')} unit="%" value={input.potency.thcPercent} onChange={(v) => setPotency({ thcPercent: v })} min={0} max={100} sliderMax={10} step={0.1} />
                <NumberField
                  label="THCA"
                  unit="%"
                  value={input.potency.thcaPercent ?? 0}
                  onChange={(v) => setPotency({ thcaPercent: v })}
                  min={0}
                  max={100}
                  sliderMax={35}
                  step={0.5}
                  hint={t('lab.ed.thcaHint', { thc: fmt((input.potency.thcaPercent ?? 0) * 0.877), total: fmt(result.totalThcPercent) })}
                />
              </>
            )}
            <NumberField
              label={t('lab.ed.uncertainty')}
              unit="± %"
              value={input.labelUncertainty}
              onChange={(v) => set('labelUncertainty', v)}
              min={0}
              max={0.9}
              sliderMax={0.5}
              scale={100}
              step={1}
              hint={t('lab.ed.uncertaintyHint')}
            />
          </div>
        </Card>

        <Card title={t('lab.ed.processing')} subtitle={t('lab.ed.processingSub')} icon={<FlaskConical className="size-4" />}>
          <div className="space-y-5">
            <NumberField label={t('lab.ed.fatAmount')} unit="g" value={input.fatGrams} onChange={(v) => set('fatGrams', v)} min={0} max={10000} sliderMax={1000} step={5} positive />
            <Toggle
              label={t('lab.ed.alreadyDecarbed')}
              checked={input.alreadyDecarbed}
              onChange={(v) => set('alreadyDecarbed', v)}
              hint={t('lab.ed.alreadyDecarbedHint')}
            />
            {!input.alreadyDecarbed && (
              <NumberField
                label={t('lab.ed.decarbEff')}
                unit="%"
                badge={t('lab.ed.assumption')}
                value={input.decarbEfficiency}
                onChange={(v) => set('decarbEfficiency', v)}
                min={0.01}
                max={1}
                sliderMin={0.4}
                scale={100}
                step={1}
                hint={t('lab.ed.decarbHint')}
              />
            )}
            <NumberField
              label={t('lab.ed.extractEff')}
              unit="%"
              badge={t('lab.ed.assumption')}
              value={input.extractionEfficiency}
              onChange={(v) => set('extractionEfficiency', v)}
              min={0.01}
              max={1}
              sliderMin={0.3}
              scale={100}
              step={1}
              hint={t('lab.ed.extractHint')}
            />
            <NumberField
              label={t('lab.ed.strainLossLabel')}
              unit="%"
              value={input.strainLoss}
              onChange={(v) => set('strainLoss', v)}
              min={0}
              max={0.9}
              sliderMax={0.3}
              scale={100}
              step={1}
              hint={t('lab.ed.strainLossHint')}
            />
          </div>
        </Card>

        <Card title="Rezept" subtitle={t('lab.ed.recipeSub')} icon={<Cookie className="size-4" />}>
          <div className="space-y-5">
            <Segmented
              label={t('lab.ed.butterMode')}
              value={input.recipeFatMode}
              onChange={(m) => {
                // Umrechnen, damit das Ergebnis gleich bleibt
                const v =
                  m === input.recipeFatMode
                    ? input.recipeFatGrams
                    : m === 'perPortion'
                      ? input.recipeFatGrams / input.portions
                      : input.recipeFatGrams * input.portions;
                onChange({ ...input, recipeFatMode: m, recipeFatGrams: Math.round(v * 10) / 10 });
              }}
              options={[
                { value: 'perRecipe', label: t('lab.ed.perRecipe') },
                { value: 'perPortion', label: t('lab.ed.perPortion') },
              ]}
            />
            <NumberField
              label={input.recipeFatMode === 'perRecipe' ? t('lab.ed.butterInRecipe') : t('lab.ed.butterPerPortion')}
              unit="g"
              value={input.recipeFatGrams}
              onChange={(v) => set('recipeFatGrams', v)}
              min={0}
              max={10000}
              sliderMax={input.recipeFatMode === 'perRecipe' ? 500 : 30}
              step={input.recipeFatMode === 'perRecipe' ? 5 : 0.5}
              positive
            />
            <NumberField label={t('lab.ed.portionCount')} value={input.portions} onChange={(v) => set('portions', v)} min={1} max={1000} sliderMax={48} step={1} integer />
          </div>
        </Card>
      </div>

      {/* Ergebnisse */}
      <div className="space-y-5">
        {!valid && (
          <Callout tone="danger" title={t('lab.ed.checkInputs')}>
            <ul className="list-disc pl-4">
              {issues.map((i) => (
                <li key={i.field + i.message}>{i.message}</li>
              ))}
            </ul>
          </Callout>
        )}
        <div id="edible-results" ref={resultsRef} className={`scroll-mt-28 ${valid ? '' : 'pointer-events-none opacity-40 blur-[1px]'}`} aria-hidden={!valid}>
          <EdibleResults input={input} result={result} onSave={onSave} assessment={assessment} />
        </div>
        <ReverseCalculator input={input} />
      </div>
    </div>
  );
}

function EdibleResults({
  input,
  result: r,
  onSave,
  assessment,
}: {
  input: EdibleInput;
  result: EdibleResult;
  onSave: Props['onSave'];
  assessment: ReturnType<typeof assessEdibleDose>;
}) {
  return (
    <div className="space-y-5">
      <Card
        title={t('lab.ed.result')}
        subtitle={t('lab.ed.resultSub')}
        icon={<Scale className="size-4" />}
        actions={
          <>
            <SaveButton defaultName={t('lab.ed.saveName', { c: fmt(input.cannabisGrams), f: fmt(input.fatGrams) })} onSave={(n) => onSave(n, input, edibleSummary(r))} />
            <ExportMenu build={() => edibleExport(input, r)} />
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label={t('lab.ed.thcPerPortion')} range={r.perPortionMg} unit="mg" emphasis hint={<DoseBadge band={assessment.band} />} />
          <Stat label={t('lab.ed.butterConc')} range={r.mgPerGramFat} unit="mg/g" emphasis hint={t('lab.ed.perTsp', { v: fmt(r.mgPerGramFat.mid * 5) })} />
          <Stat label={t('lab.ed.thcRecipe')} range={r.recipeMg} unit="mg" hint={t('lab.ed.recipeHint', { a: fmt(r.recipeFatGrams), b: fmt(r.fatPerPortionGrams) })} />
          <Stat
            label={t('lab.ed.thcRecovered')}
            range={r.recoveredFatMg}
            unit="mg"
            hint={t('lab.ed.recoveredHint', { v: fmt(r.recoveredFatGrams) })}
          />
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-medium text-ink-200">{t('lab.ed.spread')}</h3>
            <span className="font-mono text-xs text-ink-400">{t('lab.ed.factor', { v: fmt(r.spreadFactor) })}</span>
          </div>
          <RangeBar
            range={r.perPortionMg}
            max={Math.max(25, r.perPortionMg.high * 1.15)}
            unit="mg"
            log
            markers={[
              { value: 2.5, label: fmt(2.5) },
              { value: 5, label: '5' },
              { value: 10, label: '10 mg' },
            ]}
          />
        </div>

        {r.warnings.length > 0 && (
          <div className="mt-2 space-y-2">
            {r.warnings.map((w) => (
              <Callout key={w} tone="warn">
                {w}
              </Callout>
            ))}
          </div>
        )}
        {assessment.warnings.length > 0 && (
          <div className="mt-3 space-y-2">
            {assessment.warnings.map((w) => (
              <Callout key={w} tone={assessment.highBand.tone === 'danger' ? 'danger' : 'warn'}>
                {w}
              </Callout>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('lab.ed.lossTitle')} subtitle={t('lab.ed.lossSub')}>
        <LossFlow r={r} />
      </Card>

      <Card title={t('lab.ed.curveTitle')} subtitle={t('lab.ed.curveSub')}>
        <DoseCurve input={input} />
      </Card>
    </div>
  );
}

function LossFlow({ r }: { r: EdibleResult }) {
  const max = r.theoreticalMg.mid || 1;
  const steps = [
    { label: t('lab.ed.lossTheo'), value: r.theoreticalMg.mid, loss: 0, lossLabel: '' },
    { label: t('lab.ed.afterDecarb'), value: r.afterDecarbMg.mid, loss: r.losses.decarbMg, lossLabel: 'Decarb' },
    { label: t('lab.ed.lossFat'), value: r.inFatMg.mid, loss: r.losses.extractionMg, lossLabel: t('lab.ed.lossExtraction') },
    { label: t('lab.ed.lossRecovered'), value: r.recoveredFatMg.mid, loss: r.losses.strainMg, lossLabel: t('lab.ed.lossStrain') },
  ];
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-ink-200">{s.label}</span>
            <span className="font-mono tabular text-ink-100">
              {i > 0 && <span className="mr-2 text-xs text-rose-300/80">−{fmt(s.loss)} mg</span>}
              {fmt(s.value)} mg
            </span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-leaf-600 to-leaf-400 transition-all duration-500"
              style={{ width: `${(s.value / max) * 100}%`, opacity: 1 - i * 0.12 }}
            />
          </div>
        </div>
      ))}
      <p className="hint pt-1">
        {t('lab.ed.lossNote')}
      </p>
    </div>
  );
}

function DoseCurve({ input }: { input: EdibleInput }) {
  const data = useMemo(() => {
    const maxG = Math.max(2, input.cannabisGrams * 2);
    const pts = 30;
    return Array.from({ length: pts + 1 }, (_, i) => {
      const g = (maxG / pts) * i;
      const r = calculateEdibles({ ...input, cannabisGrams: g });
      return {
        g: Math.round(g * 10) / 10,
        band: [r.perPortionMg.low, r.perPortionMg.high] as [number, number],
        mid: r.perPortionMg.mid,
      };
    });
  }, [input]);
  const current = calculateEdibles(input).perPortionMg.mid;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
          <defs>
            <linearGradient id="band" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#34c77b" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34c77b" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="g" type="number" domain={[0, 'dataMax']} tickFormatter={(v: number) => `${fmt(v)} g`} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => fmt(v)} tickLine={false} axisLine={false} unit=" mg" width={56} />
          <Tooltip
            contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }}
            labelFormatter={(g: number) => t('lab.ed.gCannabis', { v: fmt(g) })}
            formatter={(value: number | [number, number], name: string) =>
              Array.isArray(value) ? [`${fmt(value[0])} – ${fmt(value[1])} mg`, t('lab.ed.range')] : [`${fmt(value)} mg`, name === 'mid' ? t('lab.ed.mean') : name]
            }
          />
          <Area type="monotone" dataKey="band" stroke="none" fill="url(#band)" isAnimationActive={false} />
          <Line type="monotone" dataKey="mid" stroke="#5fe39a" strokeWidth={2} dot={false} isAnimationActive={false} />
          <ReferenceDot x={Math.round(input.cannabisGrams * 10) / 10} y={current} r={5} fill="#f2f6f4" stroke="#060807" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Umkehrrechner: gewünschte mg pro Portion → benötigte Cannabis-Menge. */
function ReverseCalculator({ input }: { input: EdibleInput }) {
  const [targetMg, setTargetMg] = useState(2.5);
  const r = calculateEdibles(input);
  const concentration = requiredConcentrationForPortion(targetMg, input.portions, r.recipeFatGrams);
  const need = requiredCannabis({
    potency: input.potency,
    alreadyDecarbed: input.alreadyDecarbed,
    decarbEfficiency: input.decarbEfficiency,
    extractionEfficiency: input.extractionEfficiency,
    labelUncertainty: input.labelUncertainty,
    targetMgPerGramFat: concentration,
    fatGrams: input.fatGrams,
  });
  const valid = Number.isFinite(need.grams) && r.totalThcPercent > 0;

  return (
    <Card
      title={t('lab.ed.reverse')}
      subtitle={t('lab.ed.reverseSub')}
      icon={<Target className="size-4" />}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          <NumberField label={t('lab.ed.target')} unit="mg" value={targetMg} onChange={setTargetMg} min={0} max={100} sliderMax={20} step={0.5} positive />
          <p className="hint">
            {t('lab.ed.reverseHint', { n: input.portions, a: fmt(r.recipeFatGrams), b: fmt(input.fatGrams) })}
            {t('lab.ed.sameAsAbove')}
          </p>
        </div>
        <div className="space-y-3">
          <Stat label={t('lab.ed.needConc')} value={concentration} unit="mg/g" />
          {valid ? (
            <Stat
              label={t('lab.ed.needAmount')}
              range={need.range}
              unit="g"
              emphasis
              hint={t('lab.ed.needHint')}
            />
          ) : (
            <Callout tone="warn">{t('lab.ed.needThc')}</Callout>
          )}
        </div>
      </div>
    </Card>
  );
}
