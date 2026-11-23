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
    <Card title="Gramm · Milligramm · Prozent" subtitle="Umrechnungen für Wirkstoffgehalte" icon={<ArrowLeftRight className="size-4" />}>
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">Gehalt → mg</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Material" unit="g" value={grams} onChange={setGrams} min={0} max={1000} sliderMax={10} step={0.1} />
            <NumberField label="THC" unit="%" value={percent} onChange={setPercent} min={0} max={100} sliderMax={35} step={0.5} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="THC gesamt" value={mgFromPercent(grams, percent)} unit="mg" theoretical />
            <Stat label="pro Gramm" value={percentToMgPerG(percent)} unit="mg/g" />
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">mg → Gehalt</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Wirkstoff" unit="mg" value={mg} onChange={setMg} min={0} max={100000} sliderMax={1000} step={5} />
            <NumberField label="in Material" unit="g" value={matGrams} onChange={setMatGrams} min={0} max={1000} sliderMax={10} step={0.1} positive />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Gehalt" value={percentFromMg(mg, matGrams)} unit="%" />
            <Stat label="Wirkstoff" value={mg / 1000} unit="g" hint={`${fmt(gToMg(mg / 1000))} mg = ${fmt(mg / 1000, 4)} g`} />
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
    <Card title="THC-Konzentrationen mischen" subtitle="Cannabutter mit normaler Butter strecken" icon={<Beaker className="size-4" />}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Cannabutter" unit="g" value={cbGrams} onChange={setCbGrams} min={0} max={10000} sliderMax={250} step={5} />
          <NumberField label="Konzentration" unit="mg/g" value={cbConc} onChange={setCbConc} min={0} max={500} sliderMax={20} step={0.1} />
        </div>
        <NumberField label="+ normale Butter" unit="g" value={plain} onChange={setPlain} min={0} max={10000} sliderMax={250} step={5} />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Neue Konzentration" value={mix.mgPerGram} unit="mg/g" emphasis />
          <Stat label="Mischung gesamt" value={mix.totalGrams} unit="g" hint={`${fmt(mix.totalMg)} mg THC`} />
        </div>
        <div className="border-t border-white/[0.05] pt-5">
          <NumberField label="Zielkonzentration" unit="mg/g" value={target} onChange={setTarget} min={0} max={500} sliderMax={Math.max(1, cbConc)} step={0.1} positive />
          <div className="mt-3">
            <Stat label="Hinzuzufügende normale Butter" value={addForTarget} unit="g" hint={target >= cbConc ? 'Zielkonzentration ist nicht niedriger – keine Verdünnung nötig.' : undefined} />
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
    <Card title="Cannabis-zu-Butter-Verhältnis" subtitle="Verhältnis berechnen oder Fettmenge bestimmen" icon={<Divide className="size-4" />}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Cannabis" unit="g" value={cannabis} onChange={setCannabis} min={0} max={1000} sliderMax={56} step={0.5} positive />
          <NumberField label="Butter / Öl" unit="g" value={fat} onChange={setFat} min={0} max={10000} sliderMax={1000} step={5} positive />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Verhältnis" value={ratio.oneTo} unit=": 1 (Fett : Cannabis)" />
          <Stat label="Cannabis pro 100 g Fett" value={ratio.per100g} unit="g" />
        </div>
        <div className="border-t border-white/[0.05] pt-5">
          <NumberField label="Gewünscht: Cannabis pro 100 g Fett" unit="g" value={wanted} onChange={setWanted} min={0} max={100} sliderMax={20} step={0.5} positive />
          <div className="mt-3">
            <Stat label={`Fettmenge für ${fmt(cannabis)} g Cannabis`} value={fatForRatio(cannabis, wanted)} unit="g" />
          </div>
        </div>
        <p className="hint">
          Das Verhältnis allein sagt wenig über die Stärke aus – entscheidend sind THC-Gehalt und Ausbeuten. Sehr viel Pflanzenmaterial in wenig Fett
          saugt Fett auf und verringert die Extraktion.
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
    <Card title="Umkehrrechner: mg pro Portion" subtitle="Wie viel fertige Cannabutter für eine Ziel-Dosis pro Portion?" icon={<Target className="size-4" />}>
      <div className="space-y-5">
        <NumberField label="Konzentration der Butter" unit="mg/g" value={conc} onChange={setConc} min={0} max={500} sliderMax={20} step={0.1} positive hint="z. B. aus dem Edibles-Rechner (Mittelwert)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Ziel pro Portion" unit="mg" value={targetMg} onChange={setTargetMg} min={0} max={100} sliderMax={20} step={0.5} positive />
          <NumberField label="Portionen" value={portions} onChange={setPortions} min={1} max={1000} sliderMax={48} step={1} integer />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Cannabutter im Rezept" value={fat} unit="g" emphasis />
          <Stat label="pro Portion" value={fat / portions} unit="g" />
        </div>
        <p className="hint">
          Den restlichen Fettbedarf des Rezepts mit normaler Butter auffüllen. Da die tatsächliche Konzentration unsicher ist, kann die echte Dosis deutlich
          abweichen.
        </p>
      </div>
      <Formula>m_Butter = mg_Portion × Portionen ÷ c</Formula>
    </Card>
  );
}
