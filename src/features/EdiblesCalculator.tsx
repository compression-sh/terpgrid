import { Cookie, FlaskConical, Scale, Sprout, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
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

interface Props {
  input: EdibleInput;
  onChange: (input: EdibleInput) => void;
  onSave: (name: string, input: EdibleInput, summary: Record<string, string>) => void;
}

export function edibleSummary(r: EdibleResult): Record<string, string> {
  return {
    'mg/g Butter': fmtRange(r.mgPerGramFat, 'mg/g'),
    'pro Portion': fmtRange(r.perPortionMg, 'mg'),
    Rezept: fmtRange(r.recipeMg, 'mg'),
  };
}

export function edibleExport(input: EdibleInput, r: EdibleResult): ExportPayload {
  const p = input.potency;
  return {
    title: 'Edibles & Cannabutter Rechner',
    generatedAt: new Date().toISOString(),
    inputs: [
      { label: 'Cannabis', value: `${fmt(input.cannabisGrams)} g` },
      p.mode === 'total'
        ? { label: 'Gesamt-THC', value: `${fmt(p.thcPercent)} %` }
        : { label: 'THC / THCA', value: `${fmt(p.thcPercent)} % / ${fmt(p.thcaPercent ?? 0)} %` },
      { label: 'Bereits decarboxyliert', value: input.alreadyDecarbed ? 'ja' : 'nein' },
      { label: 'Butter/Öl', value: `${fmt(input.fatGrams)} g` },
      { label: 'Abseihverlust Fett', value: fmtPercent(input.strainLoss) },
      { label: 'Decarboxylierungsausbeute', value: fmtPercent(input.decarbEfficiency) },
      { label: 'Extraktionsausbeute', value: fmtPercent(input.extractionEfficiency) },
      { label: 'Unsicherheit THC-Angabe', value: `± ${fmtPercent(input.labelUncertainty)}` },
      { label: 'Butter im Rezept', value: `${fmt(r.recipeFatGrams)} g` },
      { label: 'Portionen', value: String(input.portions) },
    ],
    results: [
      { label: 'Theoretisches THC', value: `${fmt(r.theoreticalMg.mid)} mg` },
      { label: 'Nach Decarboxylierung', value: `ca. ${fmt(r.afterDecarbMg.mid)} mg (${fmtRange(r.afterDecarbMg, 'mg')})` },
      { label: 'Im Fett', value: `ca. ${fmt(r.inFatMg.mid)} mg (${fmtRange(r.inFatMg, 'mg')})` },
      { label: 'Konzentration', value: `ca. ${fmt(r.mgPerGramFat.mid)} mg/g (${fmtRange(r.mgPerGramFat, 'mg/g')})` },
      { label: 'Rezept gesamt', value: `ca. ${fmt(r.recipeMg.mid)} mg (${fmtRange(r.recipeMg, 'mg')})` },
      { label: 'Pro Portion', value: `ca. ${fmt(r.perPortionMg.mid)} mg (${fmtRange(r.perPortionMg, 'mg')})` },
    ],
    notes: [
      'Schätzwerte. Die tatsächliche Dosis kann deutlich abweichen.',
      'Edibles: Wirkeintritt 30 Min. – 2 Std., nicht nachdosieren.',
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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Eingaben */}
      <div className="space-y-5">
        <Card title="Ausgangsmaterial" subtitle="Cannabis-Menge und Wirkstoffgehalt" icon={<Sprout className="size-4" />}>
          <div className="space-y-5">
            <NumberField label="Cannabis-Menge" unit="g" value={input.cannabisGrams} onChange={(v) => set('cannabisGrams', v)} min={0} max={1000} sliderMax={56} step={0.5} positive />
            <Segmented
              label="THC-Angabe"
              value={input.potency.mode}
              onChange={(mode) => setPotency({ mode })}
              options={[
                { value: 'total', label: 'Gesamt-THC', hint: 'Wert vom Etikett („Total THC“) – bereits inkl. umgerechnetem THCA' },
                { value: 'separate', label: 'THC + THCA getrennt', hint: 'Laborwerte für Δ9-THC und THCA separat' },
              ]}
            />
            {input.potency.mode === 'total' ? (
              <NumberField
                label="Gesamt-THC"
                unit="%"
                value={input.potency.thcPercent}
                onChange={(v) => setPotency({ thcPercent: v })}
                min={0}
                max={100}
                sliderMax={35}
                step={0.5}
                positive
                hint="„Total THC“ enthält das umgerechnete THCA bereits – der Faktor 0,877 wird nicht erneut angewandt."
              />
            ) : (
              <>
                <NumberField label="Δ9-THC (frei)" unit="%" value={input.potency.thcPercent} onChange={(v) => setPotency({ thcPercent: v })} min={0} max={100} sliderMax={10} step={0.1} />
                <NumberField
                  label="THCA"
                  unit="%"
                  value={input.potency.thcaPercent ?? 0}
                  onChange={(v) => setPotency({ thcaPercent: v })}
                  min={0}
                  max={100}
                  sliderMax={35}
                  step={0.5}
                  hint={`Wird mit 0,877 umgerechnet → ${fmt((input.potency.thcaPercent ?? 0) * 0.877)} % THC. Gesamt: ${fmt(result.totalThcPercent)} %.`}
                />
              </>
            )}
            <NumberField
              label="Unsicherheit der THC-Angabe"
              unit="± %"
              value={input.labelUncertainty}
              onChange={(v) => set('labelUncertainty', v)}
              min={0}
              max={0.9}
              sliderMax={0.5}
              scale={100}
              step={1}
              hint="Etikettenwerte weichen in Untersuchungen oft deutlich ab (Schwabe et al. 2023)."
            />
          </div>
        </Card>

        <Card title="Verarbeitung" subtitle="Decarboxylierung und Extraktion ins Fett" icon={<FlaskConical className="size-4" />}>
          <div className="space-y-5">
            <NumberField label="Butter- / Ölmenge" unit="g" value={input.fatGrams} onChange={(v) => set('fatGrams', v)} min={0} max={10000} sliderMax={1000} step={5} positive />
            <Toggle
              label="Material bereits decarboxyliert"
              checked={input.alreadyDecarbed}
              onChange={(v) => set('alreadyDecarbed', v)}
              hint="z. B. bereits erhitztes Material oder Destillat – dann keine Decarboxylierungs-Verluste."
            />
            {!input.alreadyDecarbed && (
              <NumberField
                label="Decarboxylierungsausbeute"
                unit="%"
                badge="Annahme"
                value={input.decarbEfficiency}
                onChange={(v) => set('decarbEfficiency', v)}
                min={0.01}
                max={1}
                sliderMin={0.4}
                scale={100}
                step={1}
                hint="Anteil des THCA, der als THC erhalten bleibt (unvollständige Umwandlung + Abbau). Unsicherheit ± 10 Pp."
              />
            )}
            <NumberField
              label="Extraktionsausbeute"
              unit="%"
              badge="Annahme"
              value={input.extractionEfficiency}
              onChange={(v) => set('extractionEfficiency', v)}
              min={0.01}
              max={1}
              sliderMin={0.3}
              scale={100}
              step={1}
              hint="Anteil des THC, der ins Fett übergeht. Für Heimverfahren gibt es keine belastbaren Standardwerte. Unsicherheit ± 15 Pp."
            />
            <NumberField
              label="Fettverlust beim Abseihen"
              unit="%"
              value={input.strainLoss}
              onChange={(v) => set('strainLoss', v)}
              min={0}
              max={0.9}
              sliderMax={0.3}
              scale={100}
              step={1}
              hint="Fett, das im Pflanzenmaterial bleibt. Ändert die Konzentration nicht – nur die verfügbare Menge."
            />
          </div>
        </Card>

        <Card title="Rezept" subtitle="Wie viel Butter landet in wie vielen Portionen?" icon={<Cookie className="size-4" />}>
          <div className="space-y-5">
            <Segmented
              label="Butterangabe"
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
                { value: 'perRecipe', label: 'pro Rezept' },
                { value: 'perPortion', label: 'pro Portion' },
              ]}
            />
            <NumberField
              label={input.recipeFatMode === 'perRecipe' ? 'Cannabutter im Rezept' : 'Cannabutter pro Portion'}
              unit="g"
              value={input.recipeFatGrams}
              onChange={(v) => set('recipeFatGrams', v)}
              min={0}
              max={10000}
              sliderMax={input.recipeFatMode === 'perRecipe' ? 500 : 30}
              step={input.recipeFatMode === 'perRecipe' ? 5 : 0.5}
              positive
            />
            <NumberField label="Anzahl Portionen" value={input.portions} onChange={(v) => set('portions', v)} min={1} max={1000} sliderMax={48} step={1} integer />
          </div>
        </Card>
      </div>

      {/* Ergebnisse */}
      <div className="space-y-5">
        {!valid && (
          <Callout tone="danger" title="Bitte Eingaben prüfen">
            <ul className="list-disc pl-4">
              {issues.map((i) => (
                <li key={i.field + i.message}>{i.message}</li>
              ))}
            </ul>
          </Callout>
        )}
        <div className={valid ? '' : 'pointer-events-none opacity-40 blur-[1px]'} aria-hidden={!valid}>
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
        title="Ergebnis"
        subtitle="Schätzwerte mit Schwankungsbreite – keine exakten Angaben"
        icon={<Scale className="size-4" />}
        actions={
          <>
            <SaveButton defaultName={`Cannabutter ${fmt(input.cannabisGrams)} g / ${fmt(input.fatGrams)} g`} onSave={(n) => onSave(n, input, edibleSummary(r))} />
            <ExportMenu build={() => edibleExport(input, r)} />
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="THC pro Portion" range={r.perPortionMg} unit="mg" emphasis hint={<DoseBadge band={assessment.band} />} />
          <Stat label="Konzentration der Butter" range={r.mgPerGramFat} unit="mg/g" emphasis hint={`≈ ${fmt(r.mgPerGramFat.mid * 5)} mg pro Teelöffel (≈ 5 g)`} />
          <Stat label="THC im gesamten Rezept" range={r.recipeMg} unit="mg" hint={`${fmt(r.recipeFatGrams)} g Butter · ${fmt(r.fatPerPortionGrams)} g pro Portion`} />
          <Stat
            label="THC in zurückgewonnener Butter"
            range={r.recoveredFatMg}
            unit="mg"
            hint={`ca. ${fmt(r.recoveredFatGrams)} g Butter nach dem Abseihen`}
          />
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-medium text-ink-200">Schwankungsbreite pro Portion</h3>
            <span className="font-mono text-xs text-ink-400">Faktor {fmt(r.spreadFactor)} zwischen min. und max.</span>
          </div>
          <RangeBar
            range={r.perPortionMg}
            max={Math.max(25, r.perPortionMg.high * 1.15)}
            unit="mg"
            log
            markers={[
              { value: 2.5, label: '2,5' },
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

      <Card title="Wo geht THC verloren?" subtitle="Vom theoretischen Gehalt bis zur Butter (Mittelwerte)">
        <LossFlow r={r} />
      </Card>

      <Card title="Dosis pro Portion je nach Cannabis-Menge" subtitle="Grünes Band = Unsicherheitsbereich, Linie = Mittelwert">
        <DoseCurve input={input} />
      </Card>
    </div>
  );
}

function LossFlow({ r }: { r: EdibleResult }) {
  const max = r.theoreticalMg.mid || 1;
  const steps = [
    { label: 'Theoretisch im Material', value: r.theoreticalMg.mid, loss: 0, lossLabel: '' },
    { label: 'Nach Decarboxylierung', value: r.afterDecarbMg.mid, loss: r.losses.decarbMg, lossLabel: 'Decarb' },
    { label: 'Im Fett gelöst', value: r.inFatMg.mid, loss: r.losses.extractionMg, lossLabel: 'Extraktion' },
    { label: 'In zurückgewonnener Butter', value: r.recoveredFatMg.mid, loss: r.losses.strainMg, lossLabel: 'Abseihen' },
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
        Jeder Verlust wird genau einmal angewandt. Der Abseihverlust verringert nur die Menge an Butter, nicht deren Konzentration.
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
            labelFormatter={(g: number) => `${fmt(g)} g Cannabis`}
            formatter={(value: number | [number, number], name: string) =>
              Array.isArray(value) ? [`${fmt(value[0])} – ${fmt(value[1])} mg`, 'Bereich'] : [`${fmt(value)} mg`, name === 'mid' ? 'Mittelwert' : name]
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
      title="Umkehrrechner"
      subtitle="Wie viel Cannabis für eine gewünschte rechnerische Dosis pro Portion?"
      icon={<Target className="size-4" />}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          <NumberField label="Ziel pro Portion" unit="mg" value={targetMg} onChange={setTargetMg} min={0} max={100} sliderMax={20} step={0.5} positive />
          <p className="hint">
            Bei {input.portions} Portionen, {fmt(r.recipeFatGrams)} g Butter im Rezept und {fmt(input.fatGrams)} g Butter insgesamt.
            Wirkstoff und Effizienzen wie oben.
          </p>
        </div>
        <div className="space-y-3">
          <Stat label="Benötigte Konzentration" value={concentration} unit="mg/g" />
          {valid ? (
            <Stat
              label="Benötigte Cannabis-Menge"
              range={need.range}
              unit="g"
              emphasis
              hint="Bereich: falls das Material stärker (weniger nötig) bzw. schwächer (mehr nötig) ist als angenommen. Im Zweifel die geringere Menge wählen."
            />
          ) : (
            <Callout tone="warn">Bitte einen THC-Gehalt größer als 0 angeben.</Callout>
          )}
        </div>
      </div>
    </Card>
  );
}
