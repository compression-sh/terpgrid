import { Cigarette, Clock, Flame, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { ExportMenu } from '../components/ui/ExportMenu';
import { NumberField } from '../components/ui/NumberField';
import { SaveButton } from '../components/ui/SaveButton';
import { Segmented } from '../components/ui/Segmented';
import { Stat } from '../components/ui/Stat';
import { type SmokingInput, type SmokingResult, calculateSmoking, validateSmokingInput } from '../lib/calc/smoking';
import { TIMELINES } from '../lib/calc/timeline';
import type { ExportPayload } from '../lib/exporters';
import { fmt, fmtPercent, fmtRange } from '../lib/format';

interface Props {
  input: SmokingInput;
  onChange: (input: SmokingInput) => void;
  onSave: (name: string, input: SmokingInput, summary: Record<string, string>) => void;
  onShowTimeline: () => void;
}

const profileLabel: Record<SmokingInput['profile'], string> = {
  unknown: 'Keine Angabe',
  occasional: 'Gelegentlich',
  regular: 'Regelmäßig',
};
const toleranceLabel: Record<SmokingInput['tolerance'], string> = {
  none: 'Keine',
  low: 'Gering',
  medium: 'Mittel',
  high: 'Hoch',
};

export function smokingSummary(r: SmokingResult): Record<string, string> {
  return {
    'theoretisch gesamt': `${fmt(r.theoreticalTotalMg)} mg`,
    'theor. pro Person': `${fmt(r.theoreticalPerPersonMg)} mg`,
    'systemisch (grob)': fmtRange(r.systemicPerPersonMg, 'mg'),
  };
}

function exportData(input: SmokingInput, r: SmokingResult): ExportPayload {
  return {
    title: 'Joint & Smoking Rechner',
    generatedAt: new Date().toISOString(),
    inputs: [
      { label: 'Cannabis im Joint', value: `${fmt(input.grams)} g` },
      { label: 'THC-Gehalt', value: `${fmt(input.thcPercent)} %` },
      { label: 'Konsumierter Anteil', value: fmtPercent(input.fractionConsumed) },
      { label: 'Personen', value: String(input.people) },
      { label: 'Nutzungsprofil', value: profileLabel[input.profile] },
      { label: 'Toleranz', value: toleranceLabel[input.tolerance] },
    ],
    results: [
      { label: 'Theoretischer THC-Gehalt (gesamt)', value: `${fmt(r.theoreticalTotalMg)} mg` },
      { label: 'Theoretisch im konsumierten Anteil', value: `${fmt(r.theoreticalConsumedMg)} mg` },
      { label: 'Theoretisch pro Person', value: `${fmt(r.theoreticalPerPersonMg)} mg` },
      { label: 'Systemische Aufnahme pro Person (grob)', value: fmtRange(r.systemicPerPersonMg, 'mg') },
      { label: 'Literatur-Extremwerte', value: fmtRange(r.systemicExtremePerPersonMg, 'mg') },
      { label: 'Angenommene Bioverfügbarkeit', value: `${fmtPercent(r.bioavailability.low)}–${fmtPercent(r.bioavailability.high)} (${r.bioavailability.source})` },
    ],
    notes: r.notes,
  };
}

export function SmokingCalculator({ input, onChange, onSave, onShowTimeline }: Props) {
  const set = <K extends keyof SmokingInput>(k: K, v: SmokingInput[K]) => onChange({ ...input, [k]: v });
  const issues = useMemo(() => validateSmokingInput(input), [input]);
  const r = useMemo(() => calculateSmoking(input), [input]);
  const valid = issues.length === 0;
  const tl = TIMELINES.smoking;

  const max = r.theoreticalTotalMg || 1;
  const segments = [
    { label: 'Nicht konsumiert', value: r.theoreticalTotalMg - r.theoreticalConsumedMg, cls: 'bg-ink-600' },
    { label: 'Anteil anderer Personen', value: r.theoreticalConsumedMg - r.theoreticalPerPersonMg, cls: 'bg-ink-500' },
    { label: 'Verluste (Pyrolyse, Nebenstrom, ausgeatmet …)', value: r.theoreticalPerPersonMg - r.systemicPerPersonMg.high, cls: 'bg-rose-400/40' },
    { label: 'Spanne der Annahme (oberer Teil)', value: r.systemicPerPersonMg.high - r.systemicPerPersonMg.low, cls: 'bg-leaf-500/40' },
    { label: 'Unteres Ende der Annahme (kein garantiertes Minimum)', value: r.systemicPerPersonMg.low, cls: 'bg-leaf-500' },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-5">
        <Card title="Joint" subtitle="Menge, Gehalt und Konsum" icon={<Cigarette className="size-4" />}>
          <div className="space-y-5">
            <NumberField label="Cannabis im Joint" unit="g" value={input.grams} onChange={(v) => set('grams', v)} min={0} max={10} sliderMax={2} step={0.05} positive />
            <NumberField label="THC-Gehalt (gesamt)" unit="%" value={input.thcPercent} onChange={(v) => set('thcPercent', v)} min={0} max={100} sliderMax={35} step={0.5} positive />
            <NumberField
              label="Tatsächlich konsumierter Anteil"
              unit="%"
              value={input.fractionConsumed}
              onChange={(v) => set('fractionConsumed', v)}
              min={0}
              max={1}
              scale={100}
              step={5}
              positive
              hint="Der Rest (Stummel, ausgegangen, weggeworfen) wird nicht berücksichtigt."
            />
            <NumberField label="Beteiligte Personen" value={input.people} onChange={(v) => set('people', v)} min={1} max={50} sliderMax={8} step={1} integer />
          </div>
        </Card>
        <Card title="Profil (optional)" subtitle="Verändert nur den Literaturbereich und die Hinweise" icon={<Users className="size-4" />}>
          <div className="space-y-5">
            <Segmented
              label="Nutzungsprofil"
              value={input.profile}
              onChange={(v) => set('profile', v)}
              options={[
                { value: 'unknown', label: 'k. A.' },
                { value: 'occasional', label: 'Gelegentlich' },
                { value: 'regular', label: 'Regelmäßig' },
              ]}
            />
            <Segmented
              label="Toleranz"
              value={input.tolerance}
              onChange={(v) => set('tolerance', v)}
              options={[
                { value: 'none', label: 'Keine' },
                { value: 'low', label: 'Gering' },
                { value: 'medium', label: 'Mittel' },
                { value: 'high', label: 'Hoch' },
              ]}
            />
            <p className="hint">Die Toleranz verändert die berechneten mg nicht. Sie beeinflusst die Wirkung, nicht die Aufnahme.</p>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        {!valid && (
          <Callout tone="danger" title="Bitte Eingaben prüfen">
            <ul className="list-disc pl-4">
              {issues.map((i) => (
                <li key={i.message}>{i.message}</li>
              ))}
            </ul>
          </Callout>
        )}
        <div className={`space-y-5 ${valid ? '' : 'pointer-events-none opacity-40 blur-[1px]'}`}>
          <Card
            title="Ergebnis"
            subtitle="Theoretischer Gehalt ≠ aufgenommene Menge"
            icon={<Flame className="size-4" />}
            actions={
              <>
                <SaveButton defaultName={`Joint ${fmt(input.grams)} g · ${fmt(input.thcPercent)} %`} onSave={(n) => onSave(n, input, smokingSummary(r))} />
                <ExportMenu build={() => exportData(input, r)} />
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat step={1} label="Theoretischer THC-Gehalt" value={r.theoreticalTotalMg} unit="mg" theoretical hint="Gesamter Joint, rein rechnerisch aus Menge × Gehalt." />
              <Stat
                step={2}
                label={input.people > 1 ? 'Theoretisch konsumiert (pro Person)' : 'Theoretisch konsumiert'}
                value={r.theoreticalPerPersonMg}
                unit="mg"
                theoretical
                hint={`${fmtPercent(input.fractionConsumed)} geraucht${input.people > 1 ? `, geteilt durch ${input.people}` : ''} – noch ohne Verluste.`}
              />
              <Stat
                step={3}
                label="Geschätzte systemische Aufnahme"
                range={r.systemicPerPersonMg}
                rangeOnly
                unit="mg"
                emphasis
                hint={`Sehr grobe Spanne aus ${fmtPercent(r.bioavailability.low)}–${fmtPercent(r.bioavailability.high)} Bioverfügbarkeit (Literatur). Auch Werte außerhalb sind möglich.`}
              />
            </div>
            <p className="hint mt-3">
              Die drei Werte beschreiben unterschiedliche Dinge und dürfen nicht gleichgesetzt werden. Selbst das untere Ende der Spanne ist kein garantiertes Minimum –
              individuelle Aufnahme kann darunter oder darüber liegen.
            </p>

            <div className="mt-6">
              <h3 className="mb-2 text-[13px] font-medium text-ink-200">Wohin geht das THC? (pro Person, grob)</h3>
              <div className="flex h-4 overflow-hidden rounded-full bg-ink-700">
                {segments.map((s) => (
                  <div
                    key={s.label}
                    className={`${s.cls} h-full transition-all duration-500`}
                    style={{ width: `${(Math.max(0, s.value) / max) * 100}%` }}
                    title={`${s.label}: ${fmt(s.value)} mg`}
                  />
                ))}
              </div>
              <ul className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                {segments.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-2 text-ink-300">
                    <span className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-sm ${s.cls}`} />
                      {s.label}
                    </span>
                    <span className="whitespace-nowrap font-mono tabular text-ink-200">{fmt(Math.max(0, s.value))} mg</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 space-y-2">
              <Callout tone="warn" title="Starke individuelle Variabilität">
                In Studien schwankte die Bioverfügbarkeit beim Rauchen zwischen etwa 2 und 56 % (Huestis 2007). Bezogen auf diese
                Eingaben wären das <span className="font-mono">{fmtRange(r.systemicExtremePerPersonMg, 'mg')}</span>. Zugtechnik, Atemanhalten,
                Pausen und Erfahrung machen einen großen Unterschied.
              </Callout>
              {r.notes.slice(1).map((n) => (
                <Callout key={n} tone="info">
                  {n}
                </Callout>
              ))}
            </div>
          </Card>

          <Card title="Mögliche Verluste beim Rauchen" subtitle="Größenordnungen aus der Literatur – keine exakten Werte">
            <ul className="divide-y divide-white/[0.05]">
              {r.losses.map((l) => (
                <li key={l.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:gap-4">
                  <div>
                    <div className="text-[13px] font-medium text-ink-100">{l.title}</div>
                    <div className="hint">{l.description}</div>
                  </div>
                  <div className="text-xs text-ink-300 sm:max-w-[14rem] sm:text-right">{l.magnitude}</div>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Wirkeintritt und Wirkungsdauer"
            subtitle="Typische Zeitbereiche laut Health Canada"
            icon={<Clock className="size-4" />}
            actions={
              <button type="button" className="btn-ghost py-1.5" onClick={onShowTimeline}>
                Zeitachse
              </button>
            }
          >
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tl.keyFacts.map((f) => (
                <div key={f.label} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                  <dt className="text-xs text-ink-400">{f.label}</dt>
                  <dd className="mt-1 text-sm font-medium text-ink-50">{f.value}</dd>
                </div>
              ))}
            </dl>
            <p className="hint mt-3">{tl.warning}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
