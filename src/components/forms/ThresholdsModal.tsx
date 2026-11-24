import { type FormEvent, useId, useState } from 'react';
import { errorText, useToast } from '../../app/Toasts';
import { updateRecord } from '../../lib/db/repo';
import type { GrowProject, Thresholds } from '../../lib/db/types';
import { DERIVED, METRICS } from '../../lib/grow/series';
import { Modal } from '../ui/Modal';
import { numText, numberError, toOptionalNumber } from './Fields';

const ROWS = [...METRICS.map((m) => ({ id: m.key as string, label: m.label, unit: m.unit, min: m.min, max: m.max })), ...DERIVED.map((d) => ({ id: d.key as string, label: d.label, unit: d.unit, min: 0, max: d.key === 'vpd' ? 10 : 100 }))];

/**
 * Eigene Zielbereiche je Messgröße für einen Grow. Bewusst ohne Voreinstellungen:
 * TERPGRID gibt keine „idealen“ Werte vor – Bereiche sind persönliche Markierungen.
 */
export function ThresholdsModal({ grow, onClose }: { grow: GrowProject; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [texts, setTexts] = useState<Record<string, { min: string; max: string }>>(() => Object.fromEntries(ROWS.map((r) => [r.id, { min: numText(grow.thresholds?.[r.id]?.min), max: numText(grow.thresholds?.[r.id]?.max) }])));
  const [saving, setSaving] = useState(false);
  const errs = ROWS.map((r) => {
    const t = texts[r.id]!;
    const e = numberError(t.min, { min: r.min, max: r.max }) ?? numberError(t.max, { min: r.min, max: r.max });
    if (e) return e;
    const a = toOptionalNumber(t.min);
    const b = toOptionalNumber(t.max);
    return a !== undefined && b !== undefined && a > b ? 'Minimum größer als Maximum' : undefined;
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (errs.some(Boolean)) return;
    const th: Thresholds = {};
    for (const r of ROWS) {
      const min = toOptionalNumber(texts[r.id]!.min);
      const max = toOptionalNumber(texts[r.id]!.max);
      if (min !== undefined || max !== undefined) th[r.id] = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
    }
    setSaving(true);
    try {
      await updateRecord('grows', grow.id, { thresholds: Object.keys(th).length ? th : undefined });
      toast('Zielbereiche gespeichert');
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Eigene Zielbereiche"
      subtitle={grow.name}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form={formId} className="btn-primary" disabled={saving}>
            Speichern
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-3">
        <p className="hint">Persönliche Markierungen für die Diagramme dieses Grows. Es gibt keine allgemeingültigen Idealwerte – Sorte, Substrat, Phase und Messgerät spielen eine Rolle. Leere Felder = keine Grenze.</p>
        <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06]">
          {ROWS.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink-200">{r.label}</p>
                <p className="text-[11px] text-ink-500">{r.unit || 'ohne Einheit'}</p>
                {errs[i] && <p className="text-[11px] text-rose-300">{errs[i]}</p>}
              </div>
              {(['min', 'max'] as const).map((k) => (
                <input
                  key={k}
                  className="input-base h-9 font-mono text-[13px]"
                  inputMode="decimal"
                  aria-label={`${r.label} ${k === 'min' ? 'Minimum' : 'Maximum'}`}
                  placeholder={k === 'min' ? 'min' : 'max'}
                  value={texts[r.id]![k]}
                  onChange={(e) => setTexts((s) => ({ ...s, [r.id]: { ...s[r.id]!, [k]: e.target.value } }))}
                />
              ))}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
