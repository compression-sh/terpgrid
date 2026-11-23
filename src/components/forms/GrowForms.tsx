import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { nowLocal, today } from '../../lib/dates';
import { createRecord, updateRecord } from '../../lib/db/repo';
import {
  ACTIVITY_TYPES,
  type Activity,
  type ActivityType,
  type CustomMeasurement,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  GROW_PHASES,
  type GrowProject,
  type GrowSetting,
  type GrowStatus,
  type Measurements,
  type PhaseDates,
  type Plant,
  type PlantType,
} from '../../lib/db/types';
import { ACTIVITY_LABEL, EXPENSE_CATEGORY_LABEL, PLANT_TYPE_LABEL, SETTING_LABEL, STATUS_LABEL } from '../../lib/grow/labels';
import { PHASE_LABEL, phaseOrderIssues } from '../../lib/grow/phases';
import { METRICS } from '../../lib/grow/series';
import { Callout } from '../ui/Callout';
import { Modal } from '../ui/Modal';
import { Field, OptionalNumber, SelectField, TextArea, TextField, numText, numberError, toOptionalNumber } from './Fields';

function FormFooter({ onCancel, saving, label = 'Speichern', formId }: { onCancel: () => void; saving: boolean; label?: string; formId: string }) {
  return (
    <>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Abbrechen
      </button>
      <button type="submit" form={formId} className="btn-primary" disabled={saving}>
        {saving ? 'Speichern …' : label}
      </button>
    </>
  );
}

/* ───────────── Phasen-Editor ───────────── */

export function PhaseDatesEditor({ value, onChange, hint }: { value: PhaseDates; onChange: (v: PhaseDates) => void; hint?: string }) {
  const issues = phaseOrderIssues(value);
  return (
    <fieldset className="space-y-3">
      <legend className="label">Meilensteine</legend>
      <p className="hint -mt-1">{hint ?? 'Beginn der jeweiligen Phase. Nur tatsächlich erreichte Phasen eintragen – es wird nichts vorhergesagt.'}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {GROW_PHASES.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <label className="w-36 shrink-0 text-[13px] text-ink-300" htmlFor={`phase-${p}`}>
              {PHASE_LABEL[p]}
            </label>
            <input
              id={`phase-${p}`}
              type="date"
              className="input-base min-w-0 py-1.5"
              value={value[p] ?? ''}
              onChange={(e) => {
                const next = { ...value };
                if (e.target.value) next[p] = e.target.value;
                else delete next[p];
                onChange(next);
              }}
            />
          </div>
        ))}
      </div>
      {issues.length > 0 && (
        <Callout tone="warn" title="Reihenfolge prüfen">
          {issues.join(' ')}
        </Callout>
      )}
    </fieldset>
  );
}

/* ───────────── Grow ───────────── */

export function GrowFormModal({ open, onClose, grow, onSaved }: { open: boolean; onClose: () => void; grow?: GrowProject; onSaved?: (g: GrowProject) => void }) {
  const toast = useToast();
  const formId = useId();
  const [name, setName] = useState(grow?.name ?? '');
  const [description, setDescription] = useState(grow?.description ?? '');
  const [startDate, setStartDate] = useState(grow?.startDate ?? today());
  const [setting, setSetting] = useState<GrowSetting>(grow?.setting ?? 'indoor');
  const [medium, setMedium] = useState(grow?.medium ?? '');
  const [environment, setEnvironment] = useState(grow?.environment ?? '');
  const [notes, setNotes] = useState(grow?.notes ?? '');
  const [status, setStatus] = useState<GrowStatus>(grow?.status ?? 'active');
  const [completedDate, setCompletedDate] = useState(grow?.completedDate ?? '');
  const [phaseDates, setPhaseDates] = useState<PhaseDates>(grow?.phaseDates ?? {});
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameErr = submitted && !name.trim() ? 'Bitte einen Namen eingeben.' : undefined;
  const dateErr = submitted && !startDate ? 'Bitte ein Startdatum wählen.' : undefined;
  const endErr = completedDate && startDate && completedDate < startDate ? 'Abschluss liegt vor dem Start.' : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !startDate || endErr) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      startDate,
      setting,
      medium: medium.trim() || undefined,
      environment: environment.trim() || undefined,
      notes,
      status,
      completedDate: status === 'active' ? undefined : completedDate || undefined,
      phaseDates,
    };
    try {
      const saved = grow ? await updateRecord('grows', grow.id, payload) : await createRecord('grows', payload);
      toast(grow ? 'Grow gespeichert' : `Grow „${saved.name}“ angelegt`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={grow ? 'Grow bearbeiten' : 'Neuer Grow'} subtitle="Ein Grow-Projekt bündelt Pflanzen, Fotos, Messwerte und Ausgaben." size="lg" footer={<FormFooter onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Projektname" value={name} onChange={setName} required error={nameErr} placeholder="z. B. Zelt 80×80 · Frühjahr" maxLength={80} autoFocus />
          <TextField label="Startdatum" type="date" value={startDate} onChange={setStartDate} required error={dateErr} />
        </div>
        <TextArea label="Beschreibung" value={description} onChange={setDescription} rows={2} maxLength={500} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Ort" value={setting} onChange={(v) => setSetting((v || 'indoor') as GrowSetting)} options={(Object.keys(SETTING_LABEL) as GrowSetting[]).map((v) => ({ value: v, label: SETTING_LABEL[v] }))} />
          <TextField label="Medium (optional)" value={medium} onChange={setMedium} placeholder="Erde, Coco, Hydro …" maxLength={60} />
          <TextField label="Umgebung (optional)" value={environment} onChange={setEnvironment} placeholder="Zelt 80×80, LED 240 W …" maxLength={80} />
        </div>
        {grow && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Status" value={status} onChange={(v) => setStatus((v || 'active') as GrowStatus)} options={(Object.keys(STATUS_LABEL) as GrowStatus[]).map((v) => ({ value: v, label: STATUS_LABEL[v] }))} />
            {status !== 'active' && <TextField label="Abschlussdatum" type="date" value={completedDate} onChange={setCompletedDate} error={endErr} hint="Beendet den Tageszähler." />}
          </div>
        )}
        <PhaseDatesEditor value={phaseDates} onChange={setPhaseDates} />
        <TextArea label="Notizen" value={notes} onChange={setNotes} rows={3} />
      </form>
    </Modal>
  );
}

/* ───────────── Pflanze ───────────── */

export function PlantFormModal({
  open,
  onClose,
  plant,
  growId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  plant?: Plant;
  growId?: string;
  onSaved?: (p: Plant) => void;
}) {
  const { data } = useData();
  const toast = useToast();
  const formId = useId();
  const listId = useId();
  const grows = data.grows.filter((g) => g.status !== 'archived' || g.id === (plant?.growId ?? growId));
  const [gid, setGid] = useState(plant?.growId ?? growId ?? grows.find((g) => g.status === 'active')?.id ?? '');
  const grow = data.grows.find((g) => g.id === gid);
  const [name, setName] = useState(plant?.name ?? '');
  const initialStrain = plant?.strainId ? (data.strains.find((s) => s.id === plant.strainId)?.name ?? '') : (plant?.strainName ?? '');
  const [strain, setStrain] = useState(initialStrain);
  const [startDate, setStartDate] = useState(plant?.startDate ?? grow?.startDate ?? today());
  const [type, setType] = useState<PlantType>(plant?.type ?? 'unknown');
  const [phaseDates, setPhaseDates] = useState<PhaseDates>(plant?.phaseDates ?? {});
  const [notes, setNotes] = useState(plant?.notes ?? '');
  const [harvestDate, setHarvestDate] = useState(plant?.outcome?.harvestDate ?? '');
  const [wet, setWet] = useState(numText(plant?.outcome?.wetWeightG));
  const [dry, setDry] = useState(numText(plant?.outcome?.dryWeightG));
  const [outcomeNotes, setOutcomeNotes] = useState(plant?.outcome?.notes ?? '');
  const [showOutcome, setShowOutcome] = useState(!!plant?.outcome);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameErr = submitted && !name.trim() ? 'Bitte einen Namen eingeben.' : undefined;
  const growErr = submitted && !gid ? 'Bitte einen Grow wählen.' : undefined;
  const numErr = numberError(wet, { min: 0, max: 100000 }) || numberError(dry, { min: 0, max: 100000 });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !gid || numErr) return;
    setSaving(true);
    const match = data.strains.find((s) => s.name.toLowerCase() === strain.trim().toLowerCase());
    const outcome =
      showOutcome && (harvestDate || wet || dry || outcomeNotes)
        ? { harvestDate: harvestDate || undefined, wetWeightG: toOptionalNumber(wet), dryWeightG: toOptionalNumber(dry), notes: outcomeNotes || undefined }
        : undefined;
    const payload = {
      growId: gid,
      name: name.trim(),
      strainId: match?.id,
      strainName: match ? undefined : strain.trim() || undefined,
      startDate,
      type,
      phaseDates,
      notes,
      outcome,
    };
    try {
      const saved = plant ? await updateRecord('plants', plant.id, payload) : await createRecord('plants', payload);
      toast(plant ? 'Pflanze gespeichert' : `Pflanze „${saved.name}“ hinzugefügt`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={plant ? 'Pflanze bearbeiten' : 'Pflanze hinzufügen'} size="lg" footer={<FormFooter onCancel={onClose} saving={saving} formId={formId} />}>
      {grows.length === 0 ? (
        <Callout tone="info" title="Zuerst einen Grow anlegen">
          Pflanzen gehören immer zu einem Grow-Projekt.
        </Callout>
      ) : (
        <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" value={name} onChange={setName} required error={nameErr} placeholder="z. B. Pflanze 1, Gelato #2" maxLength={60} autoFocus />
            <SelectField label="Grow" value={gid} onChange={setGid} options={grows.map((g) => ({ value: g.id, label: g.name }))} placeholder="Grow wählen …" disabled={!!plant && !!growId} />
          </div>
          {growErr && <p className="-mt-3 text-xs text-rose-300">{growErr}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Sorte" hint={data.strains.length ? 'Aus der Bibliothek wählen oder frei eingeben.' : 'Freitext; Sorten-Bibliothek optional.'}>
              {(id, d) => (
                <>
                  <input id={id} aria-describedby={d} list={listId} className="input-base" value={strain} onChange={(e) => setStrain(e.target.value)} maxLength={80} />
                  <datalist id={listId}>
                    {data.strains.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <TextField label="Startdatum" type="date" value={startDate} onChange={setStartDate} />
            <SelectField label="Typ (falls bekannt)" value={type} onChange={(v) => setType((v || 'unknown') as PlantType)} options={(Object.keys(PLANT_TYPE_LABEL) as PlantType[]).map((v) => ({ value: v, label: PLANT_TYPE_LABEL[v] }))} />
          </div>
          <PhaseDatesEditor value={phaseDates} onChange={setPhaseDates} hint="Optional eigene Meilensteine dieser Pflanze. Leer = es gelten die Daten des Grows." />
          <TextArea label="Notizen" value={notes} onChange={setNotes} />
          <div className="rounded-xl border border-white/[0.06] p-4">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-200">
              <input type="checkbox" checked={showOutcome} onChange={(e) => setShowOutcome(e.target.checked)} className="accent-leaf-500" />
              Ergebnis erfassen (Ernte)
            </label>
            {showOutcome && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <TextField label="Erntedatum" type="date" value={harvestDate} onChange={setHarvestDate} />
                <OptionalNumber label="Nassgewicht" unit="g" text={wet} onText={setWet} min={0} max={100000} />
                <OptionalNumber label="Trockengewicht" unit="g" text={dry} onText={setDry} min={0} max={100000} />
                <div className="sm:col-span-3">
                  <TextArea label="Notizen zum Ergebnis" value={outcomeNotes} onChange={setOutcomeNotes} rows={2} />
                </div>
              </div>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ───────────── Aktivität ───────────── */

type MetricTexts = Record<(typeof METRICS)[number]['key'], string>;

export function ActivityFormModal({
  open,
  onClose,
  activity,
  growId,
  plantId,
  defaultType,
}: {
  open: boolean;
  onClose: () => void;
  activity?: Activity;
  growId: string;
  plantId?: string;
  defaultType?: ActivityType;
}) {
  const { data } = useData();
  const toast = useToast();
  const formId = useId();
  const plants = useMemo(() => data.plants.filter((p) => p.growId === growId), [data.plants, growId]);
  const [type, setType] = useState<ActivityType>(activity?.type ?? defaultType ?? 'observation');
  const [pid, setPid] = useState(activity ? (activity.plantId ?? '') : (plantId ?? ''));
  const [date, setDate] = useState(activity?.date ?? nowLocal());
  const [title, setTitle] = useState(activity?.title ?? '');
  const [notes, setNotes] = useState(activity?.notes ?? '');
  const [volume, setVolume] = useState(numText(activity?.volumeMl));
  const m = activity?.measurements;
  const [metrics, setMetrics] = useState<MetricTexts>({
    heightCm: numText(m?.heightCm),
    temperatureC: numText(m?.temperatureC),
    humidityPct: numText(m?.humidityPct),
    ph: numText(m?.ph),
    ecMsCm: numText(m?.ecMsCm),
  });
  const [custom, setCustom] = useState<{ label: string; value: string; unit: string }[]>(
    (m?.custom ?? []).map((c) => ({ label: c.label, value: numText(c.value), unit: c.unit })),
  );
  const [saving, setSaving] = useState(false);
  const [forceMeasure, setForceMeasure] = useState(false);

  const showMeasurements = forceMeasure || type === 'measurement' || type === 'environment' || Object.values(metrics).some(Boolean) || custom.length > 0;
  const metricErrors = METRICS.map((d) => numberError(metrics[d.key], { min: d.min, max: d.max })).filter(Boolean);
  const customErrors = custom.filter((c) => c.label.trim() && numberError(c.value, { required: true }));
  const volErr = numberError(volume, { min: 0, max: 1_000_000 });
  const invalid = metricErrors.length > 0 || customErrors.length > 0 || !!volErr || !date;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    const measurements: Measurements = {};
    for (const d of METRICS) {
      const v = toOptionalNumber(metrics[d.key]);
      if (v !== undefined) measurements[d.key] = v;
    }
    const cm: CustomMeasurement[] = custom
      .filter((c) => c.label.trim() && toOptionalNumber(c.value) !== undefined)
      .map((c) => ({ label: c.label.trim(), value: toOptionalNumber(c.value)!, unit: c.unit.trim() }));
    if (cm.length) measurements.custom = cm;
    const payload = {
      growId,
      plantId: pid || undefined,
      type,
      date,
      title: title.trim(),
      notes,
      volumeMl: type === 'watering' || type === 'feeding' ? toOptionalNumber(volume) : undefined,
      measurements: Object.keys(measurements).length ? measurements : undefined,
      photoIds: activity?.photoIds,
    };
    setSaving(true);
    try {
      if (activity) await updateRecord('activities', activity.id, payload);
      else await createRecord('activities', payload);
      toast(activity ? 'Eintrag gespeichert' : 'Eintrag hinzugefügt');
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={activity ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'} subtitle="Aktivität, Beobachtung oder Messung mit Zeitstempel" size="lg" footer={<FormFooter onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <div className="label">Art</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Art des Eintrags">
            {ACTIVITY_TYPES.filter((t) => t !== 'photo' || type === 'photo').map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${type === t ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-200' : 'border-white/[0.08] text-ink-300 hover:text-ink-100'}`}
              >
                {ACTIVITY_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Zeitpunkt" type="datetime-local" value={date} onChange={setDate} required error={!date ? 'Bitte Zeitpunkt wählen.' : undefined} />
          <SelectField label="Pflanze" value={pid} onChange={setPid} options={plants.map((p) => ({ value: p.id, label: p.name }))} placeholder="Ganzer Grow" />
        </div>
        <TextField label="Titel (optional)" value={title} onChange={setTitle} maxLength={80} placeholder={ACTIVITY_LABEL[type]} />
        {(type === 'watering' || type === 'feeding') && <OptionalNumber label={type === 'feeding' ? 'Menge Nährlösung' : 'Wassermenge'} unit="ml" text={volume} onText={setVolume} min={0} max={1_000_000} />}
        <TextArea label="Notizen" value={notes} onChange={setNotes} rows={3} placeholder={type === 'feeding' ? 'Dünger, Dosierung laut Packung, …' : type === 'issue' ? 'Was ist aufgefallen? Wo? Seit wann?' : ''} />
        {showMeasurements ? (
          <fieldset className="space-y-3 rounded-xl border border-white/[0.06] p-4">
            <legend className="px-1 text-[13px] font-medium text-ink-200">Messwerte (optional)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {METRICS.map((d) => (
                <OptionalNumber key={d.key} label={d.label} unit={d.unit || undefined} text={metrics[d.key]} onText={(t) => setMetrics((s) => ({ ...s, [d.key]: t }))} min={d.min} max={d.max} />
              ))}
            </div>
            <div className="space-y-2">
              {custom.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_6rem_5rem_auto] items-end gap-2">
                  <TextField label="Messgröße" value={c.label} onChange={(v) => setCustom((s) => s.map((x, j) => (j === i ? { ...x, label: v } : x)))} maxLength={30} placeholder="z. B. VPD" />
                  <TextField label="Wert" inputMode="decimal" value={c.value} onChange={(v) => setCustom((s) => s.map((x, j) => (j === i ? { ...x, value: v } : x)))} error={c.label.trim() ? numberError(c.value, { required: true }) : undefined} />
                  <TextField label="Einheit" value={c.unit} onChange={(v) => setCustom((s) => s.map((x, j) => (j === i ? { ...x, unit: v } : x)))} maxLength={12} placeholder="kPa" />
                  <button type="button" className="btn-ghost mb-0.5 p-2" aria-label="Messgröße entfernen" onClick={() => setCustom((s) => s.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setCustom((s) => [...s, { label: '', value: '', unit: '' }])}>
                <Plus className="size-3.5" /> Eigene Messgröße
              </button>
            </div>
          </fieldset>
        ) : (
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setForceMeasure(true)}>
            <Plus className="size-3.5" /> Messwerte hinzufügen
          </button>
        )}
      </form>
    </Modal>
  );
}

/* ───────────── Ausgabe ───────────── */

export function ExpenseFormModal({ open, onClose, expense, growId }: { open: boolean; onClose: () => void; expense?: Expense; growId?: string }) {
  const { data, settings } = useData();
  const toast = useToast();
  const formId = useId();
  const [gid, setGid] = useState(expense?.growId ?? growId ?? '');
  const [date, setDate] = useState(expense?.date ?? today());
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'equipment');
  const [amount, setAmount] = useState(numText(expense?.amount));
  const [description, setDescription] = useState(expense?.description ?? '');
  const [saving, setSaving] = useState(false);
  const amountErr = numberError(amount, { min: 0, max: 1_000_000, required: true });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (amountErr || !date) return;
    setSaving(true);
    const payload = { growId: gid || undefined, date, category, amount: toOptionalNumber(amount)!, description: description.trim() };
    try {
      if (expense) await updateRecord('expenses', expense.id, payload);
      else await createRecord('expenses', payload);
      toast('Ausgabe gespeichert');
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={expense ? 'Ausgabe bearbeiten' : 'Ausgabe erfassen'} size="md" footer={<FormFooter onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <OptionalNumber label="Betrag" unit={settings.currency} text={amount} onText={setAmount} min={0} max={1_000_000} required />
          <TextField label="Datum" type="date" value={date} onChange={setDate} required />
          <SelectField label="Kategorie" value={category} onChange={(v) => setCategory((v || 'other') as ExpenseCategory)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] }))} />
          <SelectField label="Grow (optional)" value={gid} onChange={setGid} options={data.grows.map((g) => ({ value: g.id, label: g.name }))} placeholder="Keinem Grow zugeordnet" />
        </div>
        <TextField label="Beschreibung" value={description} onChange={setDescription} maxLength={120} placeholder="z. B. LED-Leuchte, Erde 50 l" />
      </form>
    </Modal>
  );
}
