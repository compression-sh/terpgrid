import { ArrowLeftRight, Beaker, Divide, Target } from 'lucide-react';
import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { NumberField } from '../components/ui/NumberField';
import { Stat } from '../components/ui/Stat';
import { fatNeededForPortionDose } from '../lib/calc/edibles';
import {
  cannabisToFatRatio,
  dilutionToTarget,
  fatForRatio,
  gToMg,
  mgFromPercent,
  mgPerGToPercent,
  mixConcentration,
  percentFromMg,
  percentToMgPerG,
} from '../lib/calc/conversions';
import { fmt } from '../lib/format';
import { t } from '../i18n';

export function ToolsView() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <UnitConverter />
      <ConcentrationTool />
      <RatioTool />
      <ReversePortionTool />
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-lg border border-white/[0.05] bg-ink-850 px-3 py-2 font-mono text-[11.5px] text-ink-300">{children}</div>;
}

function UnitConverter() {
  const [grams, setGrams] = useState(1);
  const [percent, setPercent] = useState(20);
  const [mg, setMg] = useState(100);
  const [matGrams, setMatGrams] = useState(0.5);
  return (
    <Card title={t('lab.tools.units')} subtitle={t('lab.tools.unitsSub')} icon={<ArrowLeftRight className="size-4" />}>
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">{t('lab.tools.toMg')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label={t('lab.tools.material')} unit="g" value={grams} onChange={setGrams} min={0} max={1000} sliderMax={10} step={0.1} />
            <NumberField label="THC" unit="%" value={percent} onChange={setPercent} min={0} max={100} sliderMax={35} step={0.5} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label={t('lab.tools.thcTotal')} value={mgFromPercent(grams, percent)} unit="mg" theoretical />
            <Stat label={t('lab.tools.perGram')} value={percentToMgPerG(percent)} unit="mg/g" />
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">{t('lab.tools.fromMg')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label={t('lab.tools.active')} unit="mg" value={mg} onChange={setMg} min={0} max={100000} sliderMax={1000} step={5} />
            <NumberField label={t('lab.tools.inMaterial')} unit="g" value={matGrams} onChange={setMatGrams} min={0} max={1000} sliderMax={10} step={0.1} positive />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label={t('lab.tools.content')} value={percentFromMg(mg, matGrams)} unit="%" />
            <Stat label={t('lab.tools.active')} value={mg / 1000} unit="g" hint={`${fmt(gToMg(mg / 1000))} mg = ${fmt(mg / 1000, 4)} g`} />
          </div>
        </div>
      </div>
      <Formula>
        mg = g × 1000 × % ÷ 100 · 1 % = 10 mg/g · {fmt(percentToMgPerG(1))} mg/g = {fmt(mgPerGToPercent(10))} %
      </Formula>
    </Card>
  );
}

function ConcentrationTool() {
  const [cbGrams, setCbGrams] = useState(50);
  const [cbConc, setCbConc] = useState(3);
  const [plain, setPlain] = useState(50);
  const [target, setTarget] = useState(1);
  const mix = mixConcentration([
    { grams: cbGrams, mgPerGram: cbConc },
    { grams: plain, mgPerGram: 0 },
  ]);
  const addForTarget = dilutionToTarget(cbGrams, cbConc, target);
  return (
    <Card title={t('lab.tools.mix')} subtitle={t('lab.tools.mixSub')} icon={<Beaker className="size-4" />}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label={t('lab.tools.cannabutter')} unit="g" value={cbGrams} onChange={setCbGrams} min={0} max={10000} sliderMax={250} step={5} />
          <NumberField label={t('lab.tools.conc')} unit="mg/g" value={cbConc} onChange={setCbConc} min={0} max={500} sliderMax={20} step={0.1} />
        </div>
        <NumberField label={t('lab.tools.plain')} unit="g" value={plain} onChange={setPlain} min={0} max={10000} sliderMax={250} step={5} />
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t('lab.tools.newConc')} value={mix.mgPerGram} unit="mg/g" emphasis />
          <Stat label={t('lab.tools.mixTotal')} value={mix.totalGrams} unit="g" hint={t('lab.tools.mgThc', { v: fmt(mix.totalMg) })} />
        </div>
        <div className="border-t border-white/[0.05] pt-5">
          <NumberField label={t('lab.tools.target')} unit="mg/g" value={target} onChange={setTarget} min={0} max={500} sliderMax={Math.max(1, cbConc)} step={0.1} positive />
          <div className="mt-3">
            <Stat label={t('lab.tools.addPlain')} value={addForTarget} unit="g" hint={target >= cbConc ? t('lab.tools.noDilution') : undefined} />
          </div>
        </div>
      </div>
      <Formula>c_neu = (c₁·m₁ + c₂·m₂) ÷ (m₁ + m₂) · m_zusätzlich = m · (c ÷ c_Ziel − 1)</Formula>
    </Card>
  );
}

function RatioTool() {
  const [cannabis, setCannabis] = useState(7);
  const [fat, setFat] = useState(250);
  const [wanted, setWanted] = useState(3);
  const ratio = cannabisToFatRatio(cannabis, fat);
  return (
    <Card title={t('lab.tools.ratio')} subtitle={t('lab.tools.ratioSub')} icon={<Divide className="size-4" />}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label={t('lab.tools.cannabis')} unit="g" value={cannabis} onChange={setCannabis} min={0} max={1000} sliderMax={56} step={0.5} positive />
          <NumberField label={t('lab.tools.fat')} unit="g" value={fat} onChange={setFat} min={0} max={10000} sliderMax={1000} step={5} positive />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t('lab.tools.ratioLabel')} value={ratio.oneTo} unit={t('lab.tools.ratioUnit')} />
          <Stat label={t('lab.tools.per100')} value={ratio.per100g} unit="g" />
        </div>
        <div className="border-t border-white/[0.05] pt-5">
          <NumberField label={t('lab.tools.wanted')} unit="g" value={wanted} onChange={setWanted} min={0} max={100} sliderMax={20} step={0.5} positive />
          <div className="mt-3">
            <Stat label={t('lab.tools.fatFor', { v: fmt(cannabis) })} value={fatForRatio(cannabis, wanted)} unit="g" />
          </div>
        </div>
        <p className="hint">
          {t('lab.tools.ratioHint')}
        </p>
      </div>
    </Card>
  );
}

function ReversePortionTool() {
  const [conc, setConc] = useState(3);
  const [targetMg, setTargetMg] = useState(2.5);
  const [portions, setPortions] = useState(12);
  const fat = fatNeededForPortionDose(targetMg, portions, conc);
  return (
    <Card title={t('lab.tools.reverse')} subtitle={t('lab.tools.reverseSub')} icon={<Target className="size-4" />}>
      <div className="space-y-5">
        <NumberField label={t('lab.tools.butterConc')} unit="mg/g" value={conc} onChange={setConc} min={0} max={500} sliderMax={20} step={0.1} positive hint={t('lab.tools.butterConcHint')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label={t('lab.tools.targetPortion')} unit="mg" value={targetMg} onChange={setTargetMg} min={0} max={100} sliderMax={20} step={0.5} positive />
          <NumberField label={t('lab.tools.portions')} value={portions} onChange={setPortions} min={1} max={1000} sliderMax={48} step={1} integer />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t('lab.tools.inRecipe')} value={fat} unit="g" emphasis />
          <Stat label={t('lab.tools.perPortion')} value={fat / portions} unit="g" />
        </div>
        <p className="hint">
          {t('lab.tools.fillHint')}
        </p>
      </div>
      <Formula>{t('lab.tools.formula')}</Formula>
    </Card>
  );
}
