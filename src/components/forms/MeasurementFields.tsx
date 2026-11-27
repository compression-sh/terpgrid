import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type CustomMeasurement, type EcUnit, MEASURE_CONTEXTS, type MeasureContext, type Measurements } from '../../lib/db/types';
import { CONTEXT_LABEL, EC_LIMITS, EC_UNITS, VPD_BASIS_LABEL, dli, ecToMsCm, vpd } from '../../lib/grow/measure';
import { GROUP_LABEL, METRICS, type MetricGroup, type MetricKey } from '../../lib/grow/series';
import { fmt } from '../../lib/format';
import { OptionalNumber, SelectField, TextField, numText, numberError, toOptionalNumber } from './Fields';
import { t } from '../../i18n';

type Texts = Record<MetricKey, string>;

export interface MeasurementState {
  texts: Texts;
  ecText: string;
  ecUnit: EcUnit;
  phContext: MeasureContext | '';
  ecContext: MeasureContext | '';
  leafEstimated: boolean;
  device: string;
  custom: { label: string; value: string; unit: string }[];
}

export function initialMeasurementState(m?: Measurements): MeasurementState {
  const texts = Object.fromEntries(METRICS.map((d) => [d.key, numText(m?.[d.key])])) as Texts;
  const ecUnit = m?.ecInput?.unit ?? 'mS/cm';
  return {
    texts,
    ecText: m?.ecInput ? numText(m.ecInput.value) : numText(m?.ecMsCm),
    ecUnit,
    phContext: m?.phContext ?? '',
    ecContext: m?.ecContext ?? '',
    leafEstimated: !!m?.leafTempEstimated,
    device: m?.device ?? '',
    custom: (m?.custom ?? []).map((c) => ({ label: c.label, value: numText(c.value), unit: c.unit })),
  };
}

export function measurementErrors(s: MeasurementState): number {
  let n = METRICS.filter((d) => d.key !== 'ecMsCm' && numberError(s.texts[d.key], { min: d.min, max: d.max })).length;
  if (numberError(s.ecText, { min: 0, max: EC_LIMITS[s.ecUnit] })) n++;
  n += s.custom.filter((c) => c.label.trim() && numberError(c.value, { required: true })).length;
  return n;
}

export function hasMeasurementInput(s: MeasurementState): boolean {
  return METRICS.some((d) => d.key !== 'ecMsCm' && s.texts[d.key].trim()) || !!s.ecText.trim() || s.custom.some((c) => c.label.trim());
}

/** Baut die zu speichernden Messwerte (nur ausgefüllte Felder; EC kanonisch in mS/cm). */
export function buildMeasurements(s: MeasurementState): Measurements | undefined {
  const m: Measurements = {};
  for (const d of METRICS) {
    if (d.key === 'ecMsCm') continue;
    const v = toOptionalNumber(s.texts[d.key]);
    if (v !== undefined) m[d.key] = v;
  }
  const ec = toOptionalNumber(s.ecText);
  if (ec !== undefined) {
    m.ecMsCm = ecToMsCm(ec, s.ecUnit);
    if (s.ecUnit !== 'mS/cm') m.ecInput = { value: ec, unit: s.ecUnit };
    if (s.ecContext) m.ecContext = s.ecContext;
  }
  if (m.ph !== undefined && s.phContext) m.phContext = s.phContext;
  if (m.leafTempC !== undefined && s.leafEstimated) m.leafTempEstimated = true;
  if (s.device.trim()) m.device = s.device.trim().slice(0, 60);
  const cm: CustomMeasurement[] = s.custom
    .filter((c) => c.label.trim() && toOptionalNumber(c.value) !== undefined)
    .map((c) => ({ label: c.label.trim(), value: toOptionalNumber(c.value)!, unit: c.unit.trim() }));
  if (cm.length) m.custom = cm;
  const keys = Object.keys(m).filter((k) => k !== 'device');
  return keys.length ? m : undefined;
}

const CONTEXT_OPTIONS = MEASURE_CONTEXTS.map((c) => ({ value: c, label: CONTEXT_LABEL[c] }));
const PRIMARY: MetricGroup[] = ['plant', 'climate', 'water'];
const MORE: MetricGroup[] = ['root', 'light'];

/**
 * Messwert-Eingabe, gegliedert nach Pflanze, Klima, Wasser, Wurzelraum und Licht.
 * Dezimalkomma wird akzeptiert; VPD und DLI werden nur angezeigt (berechnet), nicht gespeichert.
 */
export function MeasurementFields({ state, onChange }: { state: MeasurementState; onChange: (s: MeasurementState) => void }) {
  const set = (patch: Partial<MeasurementState>) => onChange({ ...state, ...patch });
  const setText = (k: MetricKey, t: string) => set({ texts: { ...state.texts, [k]: t } });
  const hasMore = MORE.some((g) => METRICS.some((d) => d.group === g && state.texts[d.key].trim()));
  const [showMore, setShowMore] = useState(hasMore);
  const preview = useMemo(() => buildMeasurements(state), [state]);
  const v = preview ? vpd(preview) : undefined;
  const d = preview ? dli(preview) : undefined;
  const ecPreview = toOptionalNumber(state.ecText);

  const group = (g: MetricGroup) => (
    <div key={g} className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-500">{GROUP_LABEL[g]}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {METRICS.filter((m) => m.group === g).map((m) => {
          if (m.key === 'ecMsCm') {
            return (
              <div key="ec" className="sm:col-span-2">
                <div className="grid grid-cols-[1fr_9.5rem] items-start gap-2">
                  <OptionalNumber label="EC / TDS" text={state.ecText} onText={(t) => set({ ecText: t })} min={0} max={EC_LIMITS[state.ecUnit]} hint={ecPreview !== undefined && state.ecUnit !== 'mS/cm' ? `= ${fmt(ecToMsCm(ecPreview, state.ecUnit), 2)} mS/cm` : undefined} />
                  <SelectField label={t('grow.meas.unit')} value={state.ecUnit} onChange={(u) => set({ ecUnit: (u || 'mS/cm') as EcUnit })} options={EC_UNITS.map((u) => ({ value: u.id, label: u.label }))} />
                </div>
                {state.ecUnit.startsWith('ppm') && <p className="hint mt-1">{EC_UNITS.find((u) => u.id === state.ecUnit)?.hint}. Die Skala steht im Handbuch des Messgeräts.</p>}
              </div>
            );
          }
          return (
            <div key={m.key}>
              <OptionalNumber label={m.label} unit={m.unit || undefined} text={state.texts[m.key]} onText={(t) => setText(m.key, t)} min={m.min} max={m.max} />
              {m.key === 'leafTempC' && state.texts.leafTempC.trim() && (
                <label className="mt-1 flex items-center gap-2 text-[11px] text-ink-400">
                  <input type="checkbox" className="accent-leaf-500" checked={state.leafEstimated} onChange={(e) => set({ leafEstimated: e.target.checked })} /> {t('grow.mf.estimatedOnly')}
                </label>
              )}
            </div>
          );
        })}
      </div>
      {g === 'water' && (state.texts.ph.trim() || state.ecText.trim()) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {state.texts.ph.trim() && <SelectField label={t('grow.meas.phIn')} value={state.phContext} onChange={(c) => set({ phContext: c as MeasureContext | '' })} options={CONTEXT_OPTIONS} placeholder={t('grow.meas.unspecified')} />}
          {state.ecText.trim() && <SelectField label={t('grow.meas.ecIn')} value={state.ecContext} onChange={(c) => set({ ecContext: c as MeasureContext | '' })} options={CONTEXT_OPTIONS} placeholder={t('grow.meas.unspecified')} />}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {PRIMARY.map(group)}
      {showMore ? (
        MORE.map(group)
      ) : (
        <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setShowMore(true)}>
          <ChevronDown className="size-3.5" /> Wurzelraum & Licht (Substrat, PPFD, Lichtstunden)
        </button>
      )}

      {(v || d !== undefined) && (
        <div className="grid gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-[12px] sm:grid-cols-2" aria-live="polite">
          {v && (
            <p>
              <span className="text-ink-400">{t('grow.meas.vpdCalc')} </span>
              <span className="font-mono tabular text-ink-100">{fmt(v.value, 2)} kPa</span>
              <span className="block text-[11px] text-ink-500">{VPD_BASIS_LABEL[v.basis]}</span>
            </p>
          )}
          {d !== undefined && (
            <p>
              <span className="text-ink-400">{t('grow.meas.dliCalc')} </span>
              <span className="font-mono tabular text-ink-100">{fmt(d, 1)} {t('grow.meas.dliUnit')}</span>
              <span className="block text-[11px] text-ink-500">{t('grow.meas.dliNote')}</span>
            </p>
          )}
        </div>
      )}

      <TextField label={t('grow.meas.device')} value={state.device} onChange={(t) => set({ device: t })} maxLength={60} placeholder={t('grow.meas.devicePh')} />

      <div className="space-y-2">
        {state.custom.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_5rem_auto] items-end gap-2">
            <TextField label={t('grow.meas.custom')} value={c.label} onChange={(t) => set({ custom: state.custom.map((x, j) => (j === i ? { ...x, label: t } : x)) })} maxLength={30} placeholder={t('grow.meas.customPh')} />
            <TextField label={t('grow.meas.value')} inputMode="decimal" value={c.value} onChange={(t) => set({ custom: state.custom.map((x, j) => (j === i ? { ...x, value: t } : x)) })} error={c.label.trim() ? numberError(c.value, { required: true }) : undefined} />
            <TextField label={t('grow.meas.unit')} value={c.unit} onChange={(t) => set({ custom: state.custom.map((x, j) => (j === i ? { ...x, unit: t } : x)) })} maxLength={12} placeholder="lx" />
            <button type="button" className="btn-ghost mb-0.5 p-2" aria-label={t('grow.meas.removeCustom')} onClick={() => set({ custom: state.custom.filter((_, j) => j !== i) })}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => set({ custom: [...state.custom, { label: '', value: '', unit: '' }] })}>
          <Plus className="size-3.5" /> {t('grow.mf.custom')}
        </button>
      </div>
    </div>
  );
}
