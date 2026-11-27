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
import { t } from '../i18n';

interface Props {
  input: SmokingInput;
  onChange: (input: SmokingInput) => void;
  onSave: (name: string, input: SmokingInput, summary: Record<string, string>) => void;
  onShowTimeline: () => void;
}

const profileLabel: Record<SmokingInput['profile'], string> = {
  get unknown() { return t('lab.smk.profUnknown'); },
  get occasional() { return t('lab.smk.occasional'); },
  get regular() { return t('lab.smk.regular'); },
};
const toleranceLabel: Record<SmokingInput['tolerance'], string> = {
  get none() { return t('lab.smk.tolNone'); },
  get low() { return t('lab.smk.tolLow'); },
  get medium() { return t('lab.smk.tolMid'); },
  get high() { return t('lab.smk.tolHigh'); },
};

export function smokingSummary(r: SmokingResult): Record<string, string> {
  return {
    [t('lab.smk.sumTotal')]: `${fmt(r.theoreticalTotalMg)} mg`,
    [t('lab.smk.sumPerson')]: `${fmt(r.theoreticalPerPersonMg)} mg`,
    [t('lab.smk.sumSystemic')]: fmtRange(r.systemicPerPersonMg, 'mg'),
  };
}

function exportData(input: SmokingInput, r: SmokingResult): ExportPayload {
  return {
    title: t('lab.smk.title'),
    generatedAt: new Date().toISOString(),
    inputs: [
      { label: t('lab.smk.joint'), value: `${fmt(input.grams)} g` },
      { label: t('lab.smk.thc'), value: `${fmt(input.thcPercent)} %` },
      { label: t('lab.smk.fraction'), value: fmtPercent(input.fractionConsumed) },
      { label: t('lab.smk.people'), value: String(input.people) },
      { label: t('lab.smk.profile'), value: profileLabel[input.profile] },
      { label: t('lab.smk.tolerance'), value: toleranceLabel[input.tolerance] },
    ],
    results: [
      { label: t('lab.smk.rTotal'), value: `${fmt(r.theoreticalTotalMg)} mg` },
      { label: t('lab.smk.rConsumed'), value: `${fmt(r.theoreticalConsumedMg)} mg` },
      { label: t('lab.smk.rPerson'), value: `${fmt(r.theoreticalPerPersonMg)} mg` },
      { label: t('lab.smk.rSystemic'), value: fmtRange(r.systemicPerPersonMg, 'mg') },
      { label: t('lab.smk.rExtremes'), value: fmtRange(r.systemicExtremePerPersonMg, 'mg') },
      { label: t('lab.smk.rBio'), value: `${fmtPercent(r.bioavailability.low)}–${fmtPercent(r.bioavailability.high)} (${r.bioavailability.source})` },
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
    { label: t('lab.smk.segNot'), value: r.theoreticalTotalMg - r.theoreticalConsumedMg, cls: 'bg-ink-600' },
    { label: t('lab.smk.segOthers'), value: r.theoreticalConsumedMg - r.theoreticalPerPersonMg, cls: 'bg-ink-500' },
    { label: t('lab.smk.segLoss'), value: r.theoreticalPerPersonMg - r.systemicPerPersonMg.high, cls: 'bg-rose-400/40' },
    { label: t('lab.smk.segSpan'), value: r.systemicPerPersonMg.high - r.systemicPerPersonMg.low, cls: 'bg-leaf-500/40' },
    { label: t('lab.smk.segLow'), value: r.systemicPerPersonMg.low, cls: 'bg-leaf-500' },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-5">
        <Card title={t('lab.smk.card')} subtitle={t('lab.smk.cardSub')} icon={<Cigarette className="size-4" />}>
          <div className="space-y-5">
            <NumberField label={t('lab.smk.joint')} unit="g" value={input.grams} onChange={(v) => set('grams', v)} min={0} max={10} sliderMax={2} step={0.05} positive />
            <NumberField label={t('lab.smk.thcTotal')} unit="%" value={input.thcPercent} onChange={(v) => set('thcPercent', v)} min={0} max={100} sliderMax={35} step={0.5} positive />
            <NumberField
              label={t('lab.smk.actual')}
              unit="%"
              value={input.fractionConsumed}
              onChange={(v) => set('fractionConsumed', v)}
              min={0}
              max={1}
              scale={100}
              step={5}
              positive
              hint={t('lab.smk.restHint')}
            />
            <NumberField label={t('lab.smk.participants')} value={input.people} onChange={(v) => set('people', v)} min={1} max={50} sliderMax={8} step={1} integer />
          </div>
        </Card>
        <Card title={t('lab.smk.profileCard')} subtitle={t('lab.smk.profileSub')} icon={<Users className="size-4" />}>
          <div className="space-y-5">
            <Segmented
              label={t('lab.smk.profile')}
              value={input.profile}
              onChange={(v) => set('profile', v)}
              options={[
                { value: 'unknown', get label() { return t('lab.smk.na'); } },
                { value: 'occasional', get label() { return t('lab.smk.occasional'); } },
                { value: 'regular', get label() { return t('lab.smk.regular'); } },
              ]}
            />
            <Segmented
              label={t('lab.smk.tolerance')}
              value={input.tolerance}
              onChange={(v) => set('tolerance', v)}
              options={[
                { value: 'none', get label() { return t('lab.smk.tolNone'); } },
                { value: 'low', get label() { return t('lab.smk.tolLow'); } },
                { value: 'medium', get label() { return t('lab.smk.tolMid'); } },
                { value: 'high', get label() { return t('lab.smk.tolHigh'); } },
              ]}
            />
            <p className="hint">{t('lab.smk.tolHint')}</p>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        {!valid && (
          <Callout tone="danger" title={t('lab.smk.check')}>
            <ul className="list-disc pl-4">
              {issues.map((i) => (
                <li key={i.message}>{i.message}</li>
              ))}
            </ul>
          </Callout>
        )}
        <div className={`space-y-5 ${valid ? '' : 'pointer-events-none opacity-40 blur-[1px]'}`}>
          <Card
            title={t('lab.smk.result')}
            subtitle={t('lab.smk.resultSub')}
            icon={<Flame className="size-4" />}
            actions={
              <>
                <SaveButton defaultName={t('lab.smk.saveName', { g: fmt(input.grams), p: fmt(input.thcPercent) })} onSave={(n) => onSave(n, input, smokingSummary(r))} />
                <ExportMenu build={() => exportData(input, r)} />
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat step={1} label={t('lab.smk.sTheo')} value={r.theoreticalTotalMg} unit="mg" theoretical hint={t('lab.smk.sTheoHint')} />
              <Stat
                step={2}
                label={input.people > 1 ? t('lab.smk.sConsumedPP') : t('lab.smk.sConsumed')}
                value={r.theoreticalPerPersonMg}
                unit="mg"
                theoretical
                hint={t('lab.smk.smoked', { p: fmtPercent(input.fractionConsumed), shared: input.people > 1 ? t('lab.smk.shared', { n: input.people }) : '' })}
              />
              <Stat
                step={3}
                label={t('lab.smk.sSystemic')}
                range={r.systemicPerPersonMg}
                rangeOnly
                unit="mg"
                emphasis
                hint={t('lab.smk.spanHint', { lo: fmtPercent(r.bioavailability.low), hi: fmtPercent(r.bioavailability.high) })}
              />
            </div>
            <p className="hint mt-3">
              {t('lab.smk.threeValues')}
            </p>

            <div className="mt-6">
              <h3 className="mb-2 text-[13px] font-medium text-ink-200">{t('lab.smk.where')}</h3>
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
              <Callout tone="warn" title={t('lab.smk.variability')}>
                {t('lab.smk.varA')} <span className="font-mono">{fmtRange(r.systemicExtremePerPersonMg, 'mg')}</span>. {t('lab.smk.varB')}
              </Callout>
              {r.notes.slice(1).map((n) => (
                <Callout key={n} tone="info">
                  {n}
                </Callout>
              ))}
            </div>
          </Card>

          <Card title={t('lab.smk.losses')} subtitle={t('lab.smk.lossesSub')}>
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
            title={t('lab.smk.timing')}
            subtitle={t('lab.smk.timingSub')}
            icon={<Clock className="size-4" />}
            actions={
              <button type="button" className="btn-ghost py-1.5" onClick={onShowTimeline}>
                {t('lab.smk.timeline')}
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
