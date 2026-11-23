import { Activity, Gauge, HeartPulse, Scale, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { NumberField } from '../components/ui/NumberField';
import {
  EDIBLE_DOSE_BANDS,
  EDIBLE_VS_SMOKING_FACTS,
  INDIVIDUAL_FACTORS,
  assessEdibleDose,
  doseScalePosition,
} from '../lib/calc/dosage';
import { classifyFlowerPotency, mgFromPercent } from '../lib/calc/potency';
import { fmt } from '../lib/format';
import { DoseBadge, toneHex } from './DoseBadge';

const POTENCY_STOPS = [
  { at: 0, label: '0 %' },
  { at: 10, label: '10' },
  { at: 15, label: '15' },
  { at: 20, label: '20' },
  { at: 35, label: '35 %' },
];

export const OVERDOSE_SIGNS = [
  'Starke Angst, Panik oder Paranoia',
  'Verwirrtheit, Orientierungslosigkeit',
  'Herzrasen, Kreislaufprobleme, Schwindel',
  'Übelkeit und Erbrechen',
  'Halluzinationen oder psychotische Symptome',
  'Starke Müdigkeit, Koordinationsstörungen',
];

export function DosageAnalyzer({ initialDoseMg }: { initialDoseMg?: number }) {
  const [thc, setThc] = useState(18);
  const [dose, setDose] = useState(initialDoseMg ?? 5);
  const potency = classifyFlowerPotency(thc);
  const assessment = assessEdibleDose(dose);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Potenz der Blüte" subtitle="Einordnung anhand des THC-Prozentwerts" icon={<Gauge className="size-4" />}>
          <NumberField label="THC-Gehalt (gesamt)" unit="%" value={thc} onChange={setThc} min={0} max={100} sliderMax={35} step={0.5} />
          <div className="mt-6">
            <div className="relative h-3 rounded-full bg-gradient-to-r from-leaf-600/70 via-yellow-400/70 to-rose-500/80">
              <div
                className="absolute top-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgb(6_8_7)] transition-all duration-500"
                style={{ left: `${potency.scalePosition * 100}%` }}
              />
            </div>
            <div className="relative mt-2 h-4 text-[10px] text-ink-400">
              {POTENCY_STOPS.map((s) => (
                <span
                  key={s.at}
                  className={`absolute whitespace-nowrap ${s.at === 0 ? '' : s.at === 35 ? '-translate-x-full' : '-translate-x-1/2'}`}
                  style={{ left: `${(s.at / 35) * 100}%` }}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <div className="text-xs text-ink-400">Grobe Einordnung</div>
            <div className="mt-0.5 text-lg font-semibold capitalize text-ink-50">{potency.category}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-300">{potency.description}</p>
            <p className="hint mt-3">
              Theoretisch enthält 0,1 g dieser Blüte {fmt(mgFromPercent(0.1, thc))} mg THC, 1 g enthält {fmt(mgFromPercent(1, thc))} mg. Wie viel
              davon aufgenommen wird, hängt stark von der Konsumform ab. Die Einteilung ist nicht offiziell.
            </p>
          </div>
        </Card>

        <Card title="Edible-Dosis einordnen" subtitle="Vorsichtige Referenzbereiche für oral aufgenommenes THC" icon={<Scale className="size-4" />}>
          <NumberField label="THC im Edible" unit="mg" value={dose} onChange={setDose} min={0} max={1000} sliderMax={60} step={0.5} />
          <div className="mt-6">
            <div className="flex h-3 overflow-hidden rounded-full">
              {EDIBLE_DOSE_BANDS.map((b) => {
                const from = doseScalePosition(Math.max(b.minMg, 0.5));
                const to = doseScalePosition(Math.min(b.maxMg, 100));
                return <div key={b.level} style={{ width: `${(to - from) * 100}%`, background: toneHex[b.tone], opacity: 0.65 }} title={b.label} />;
              })}
            </div>
            <div className="relative h-0">
              <div
                className="absolute -top-[18px] h-6 w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgb(6_8_7)] transition-all duration-500"
                style={{ left: `${doseScalePosition(dose) * 100}%` }}
              />
            </div>
            <div className="relative mt-2 h-4 text-[10px] text-ink-400">
              {[1, 2.5, 5, 10, 20, 50, 100].map((v) => (
                <span key={v} className={`absolute whitespace-nowrap ${v === 100 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${doseScalePosition(v) * 100}%` }}>
                  {fmt(v)}
                </span>
              ))}
            </div>
            <p className="hint mt-1 text-right">logarithmische Skala, mg THC</p>
          </div>
          <div className="mt-3 space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <DoseBadge band={assessment.band} />
            <p className="text-[13px] leading-relaxed text-ink-300">{assessment.band.description}</p>
            <p className="hint">
              = {fmt(assessment.units)} Standard-THC-Einheiten (5 mg, Freeman & Lorenzetti 2020). Die Einordnung ist keine Wirkungsprognose.
            </p>
          </div>
          {assessment.warnings.length > 0 && (
            <div className="mt-3 space-y-2">
              {assessment.warnings.map((w) => (
                <Callout key={w} tone={assessment.band.tone === 'danger' ? 'danger' : 'warn'}>
                  {w}
                </Callout>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Referenzbereiche für Edibles" subtitle="Orientierung, kein Dosierungsrat. Grundlage: Health Canada, Standard-THC-Einheit">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-ink-400">
                <th className="py-2 pr-4 font-medium">Bereich</th>
                <th className="py-2 pr-4 font-medium">mg THC</th>
                <th className="py-2 font-medium">Einordnung</th>
              </tr>
            </thead>
            <tbody>
              {EDIBLE_DOSE_BANDS.map((b) => (
                <tr key={b.level} className={`border-b border-white/[0.04] last:border-0 ${assessment.band.level === b.level ? 'bg-white/[0.03]' : ''}`}>
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2 font-medium text-ink-100">
                      <span className="size-2 rounded-full" style={{ background: toneHex[b.tone] }} />
                      {b.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 font-mono tabular text-ink-200">
                    {Number.isFinite(b.maxMg) ? `${fmt(b.minMg)} – < ${fmt(b.maxMg)}` : `≥ ${fmt(b.minMg)}`}
                  </td>
                  <td className="py-2.5 text-ink-300">{b.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Edible ≠ Joint" subtitle="Warum mg-Angaben nicht vergleichbar sind" icon={<Activity className="size-4" />}>
          <ul className="space-y-3">
            {EDIBLE_VS_SMOKING_FACTS.map((f) => (
              <li key={f} className="flex gap-3 text-[13px] leading-relaxed text-ink-300">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-leaf-500" />
                {f}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Überdosierung und verzögerter Wirkeintritt" subtitle="Das größte Risiko bei Edibles" icon={<ShieldAlert className="size-4" />}>
          <p className="text-[13px] leading-relaxed text-ink-300">
            Weil die Wirkung erst nach 30 Minuten bis 2 Stunden einsetzt, wird oft nachgelegt. Das kann zu einer unbeabsichtigt hohen Dosis führen,
            die über viele Stunden wirkt. Selbstgemachte Edibles sind besonders unsicher, weil der THC-Gehalt pro Portion stark schwanken kann.
          </p>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {OVERDOSE_SIGNS.map((s) => (
              <div key={s} className="rounded-lg border border-rose-400/10 bg-rose-500/[0.04] px-3 py-2 text-xs text-rose-100/90">
                {s}
              </div>
            ))}
          </div>
          <p className="hint mt-3">
            Bei starken Symptomen: ruhige Umgebung, nicht allein bleiben. Bei Bewusstseinsstörung, Brustschmerz oder schweren psychischen Symptomen den
            Notruf wählen (EU: 112). Edibles kindersicher und getrennt von Lebensmitteln aufbewahren.
          </p>
        </Card>
      </div>

      <Card title="Toleranz und individuelle Unterschiede" icon={<HeartPulse className="size-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INDIVIDUAL_FACTORS.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <div className="text-[13px] font-semibold text-ink-100">{f.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-400">{f.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
