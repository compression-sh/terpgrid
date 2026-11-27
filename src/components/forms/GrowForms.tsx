import { parseTags } from '../../lib/grow/equipment';
import { Plus } from 'lucide-react';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { nowLocal, today } from '../../lib/dates';
import { createRecord, updateRecord } from '../../lib/db/repo';
import {
  ACTIVITY_TYPES,
  type Activity,
  type ActivityType,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  GROW_PHASES,
  type GrowProject,
  type GrowSetting,
  type GrowStatus,
  type PhaseDates,
  type Plant,
  type PlantType,
} from '../../lib/db/types';
import { ACTIVITY_LABEL, EXPENSE_CATEGORY_LABEL, PLANT_TYPE_LABEL, SETTING_LABEL, STATUS_LABEL } from '../../lib/grow/labels';
import { PHASE_LABEL, phaseOrderIssues } from '../../lib/grow/phases';
import { type MeasurementState, MeasurementFields, buildMeasurements, hasMeasurementInput, initialMeasurementState, measurementErrors } from './MeasurementFields';
import { Callout } from '../ui/Callout';
import { Modal } from '../ui/Modal';
import { Field, OptionalNumber, SelectField, TextArea, TextField, numText, numberError, toOptionalNumber } from './Fields';
import { t } from '../../i18n';

function FormFooter({ onCancel, saving, label = t('common.save.button'), formId }: { onCancel: () => void; saving: boolean; label?: string; formId: string }) {
  return (
    <>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        {t('common.cancel')}
      </button>
      <button type="submit" form={formId} className="btn-primary" disabled={saving}>
        {saving ? t('common.saving') : label}
      </button>
    </>
  );
}

/* ───────────── Phasen-Editor ───────────── */

export function PhaseDatesEditor({ value, onChange, hint }: { value: PhaseDates; onChange: (v: PhaseDates) => void; hint?: string }) {
  const issues = phaseOrderIssues(value);
  return (
    <fieldset className="space-y-3">
      <legend className="label">{t('grow.form.milestones')}</legend>
      <p className="hint -mt-1">{hint ?? t('grow.form.milestonesHint')}</p>
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
        <Callout tone="warn" title={t('grow.form.checkOrder')}>
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

  const nameErr = submitted && !name.trim() ? t('grow.form.nameRequired') : undefined;
  const dateErr = submitted && !startDate ? t('grow.form.startRequired') : undefined;
  const endErr = completedDate && startDate && completedDate < startDate ? t('grow.form.endBeforeStart') : undefined;

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
      toast(grow ? t('grow.form.growSaved') : t('grow.form.growCreated', { name: saved.name }));
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={grow ? t('grow.form.editGrow') : t('grow.form.newGrow')} subtitle={t('grow.form.growHint')} size="lg" footer={<FormFooter onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('grow.form.projectName')} value={name} onChange={setName} required error={nameErr} placeholder={t('grow.form.projectNamePh')} maxLength={80} autoFocus />
          <TextField label={t('common.field.startDate')} type="date" value={startDate} onChange={setStartDate} required error={dateErr} />
        </div>
        <TextArea label={t('common.field.description')} value={description} onChange={setDescription} rows={2} maxLength={500} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label={t('grow.form.location')} value={setting} onChange={(v) => setSetting((v || 'indoor') as GrowSetting)} options={(Object.keys(SETTING_LABEL) as GrowSetting[]).map((v) => ({ value: v, label: SETTING_LABEL[v] }))} />
          <TextField label={t('grow.form.medium')} value={medium} onChange={setMedium} placeholder={t('grow.form.mediumPh')} maxLength={60} />
          <TextField label={t('grow.form.environment')} value={environment} onChange={setEnvironment} placeholder={t('grow.form.environmentPh')} maxLength={80} />
        </div>
        {grow && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label={t('common.field.status')} value={status} onChange={(v) => setStatus((v || 'active') as GrowStatus)} options={(Object.keys(STATUS_LABEL) as GrowStatus[]).map((v) => ({ value: v, label: STATUS_LABEL[v] }))} />
            {status !== 'active' && <TextField label={t('grow.form.endDate')} type="date" value={completedDate} onChange={setCompletedDate} error={endErr} hint={t('grow.form.endDateHint')} />}
          </div>
        )}
        <PhaseDatesEditor value={phaseDates} onChange={setPhaseDates} />
        <TextArea label={t('common.field.notes')} value={notes} onChange={setNotes} rows={3} />
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
  const [spaceId, setSpaceId] = useState(plant?.spaceId ?? '');
  const [tags, setTags] = useState((plant?.tags ?? []).join(', '));
  const spaces = data.inventory.filter((i) => i.category === 'space' && (!i.archived || i.id === plant?.spaceId));
  const [harvestDate, setHarvestDate] = useState(plant?.outcome?.harvestDate ?? '');
  const [wet, setWet] = useState(numText(plant?.outcome?.wetWeightG));
  const [dry, setDry] = useState(numText(plant?.outcome?.dryWeightG));
  const [outcomeNotes, setOutcomeNotes] = useState(plant?.outcome?.notes ?? '');
  const [showOutcome, setShowOutcome] = useState(!!plant?.outcome);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameErr = submitted && !name.trim() ? t('grow.form.nameRequired') : undefined;
  const growErr = submitted && !gid ? t('grow.form.growRequired') : undefined;
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
      spaceId: spaceId || undefined,
      tags: parseTags(tags),
    };
    try {
      const saved = plant ? await updateRecord('plants', plant.id, payload) : await createRecord('plants', payload);
      toast(plant ? t('grow.form.plantSaved') : t('grow.form.plantAdded', { name: saved.name }));
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={plant ? t('grow.form.editPlant') : t('grow.form.addPlant')} size="lg" footer={<FormFooter onCancel={onClose} saving={saving} formId={formId} />}>
      {grows.length === 0 ? (
        <Callout tone="info" title={t('grow.form.growFirst')}>
          {t('grow.form.growFirstText')}
        </Callout>
      ) : (
        <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('common.field.name')} value={name} onChange={setName} required error={nameErr} placeholder={t('grow.form.plantNamePh')} maxLength={60} autoFocus />
            <SelectField label={t('grow.form.grow')} value={gid} onChange={setGid} options={grows.map((g) => ({ value: g.id, label: g.name }))} placeholder={t('grow.form.chooseGrow')} disabled={!!plant && !!growId} />
          </div>
          {growErr && <p className="-mt-3 text-xs text-rose-300">{growErr}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('grow.form.strain')} hint={data.strains.length ? t('grow.form.strainHintLib') : t('grow.form.strainHintFree')}>
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
            <TextField label={t('common.field.startDate')} type="date" value={startDate} onChange={setStartDate} />
            <SelectField label={t('grow.form.typeKnown')} value={type} onChange={(v) => setType((v || 'unknown') as PlantType)} options={(Object.keys(PLANT_TYPE_LABEL) as PlantType[]).map((v) => ({ value: v, label: PLANT_TYPE_LABEL[v] }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('grow.form.spaceLabel')}
              value={spaceId}
              onChange={setSpaceId}
              options={spaces.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={spaces.length ? '—' : t('grow.form.noSpaces')}
              hint={spaces.length ? undefined : t('grow.form.noSpacesHint')}
            />
            <TextField label={t('grow.form.tags')} value={tags} onChange={setTags} maxLength={200} placeholder={t('grow.form.tagsPh')} />
          </div>
          <PhaseDatesEditor value={phaseDates} onChange={setPhaseDates} hint={t('grow.form.plantMilestonesHint')} />
          <TextArea label={t('common.field.notes')} value={notes} onChange={setNotes} />
          <div className="rounded-xl border border-white/[0.06] p-4">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-200">
              <input type="checkbox" checked={showOutcome} onChange={(e) => setShowOutcome(e.target.checked)} className="accent-leaf-500" />
              {t('grow.form.recordHarvest')}
            </label>
            {showOutcome && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <TextField label={t('grow.form.harvestDate')} type="date" value={harvestDate} onChange={setHarvestDate} />
                <OptionalNumber label={t('grow.form.wetWeight')} unit="g" text={wet} onText={setWet} min={0} max={100000} />
                <OptionalNumber label={t('grow.form.dryWeight')} unit="g" text={dry} onText={setDry} min={0} max={100000} />
                <div className="sm:col-span-3">
                  <TextArea label={t('grow.form.outcomeNotes')} value={outcomeNotes} onChange={setOutcomeNotes} rows={2} />
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
  const [ms, setMs] = useState<MeasurementState>(() => initialMeasurementState(activity?.measurements));
  const [saving, setSaving] = useState(false);
  const [forceMeasure, setForceMeasure] = useState(false);

  const showMeasurements = forceMeasure || type === 'measurement' || type === 'environment' || hasMeasurementInput(ms) || (activity?.measurements?.custom?.length ?? 0) > 0;
  const volErr = numberError(volume, { min: 0, max: 1_000_000 });
  const invalid = measurementErrors(ms) > 0 || !!volErr || !date;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    const measurements = buildMeasurements(ms);
    const payload = {
      growId,
      plantId: pid || undefined,
      type,
      date,
      title: title.trim(),
      notes,
      volumeMl: type === 'watering' || type === 'feeding' ? toOptionalNumber(volume) : undefined,
      measurements,
      photoIds: activity?.photoIds,
    };
    setSaving(true);
    try {
      if (activity) await updateRecord('activities', activity.id, payload);
      else await createRecord('activities', payload);
      toast(activity ? t('grow.form.entrySaved') : t('grow.form.entryAdded'));
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={activity ? t('grow.form.editEntry') : t('grow.form.addEntry')} subtitle={t('grow.form.entryHint')} size="lg" footer={<FormFooter onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <div className="label">{t('grow.form.kind')}</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('grow.form.kindLabel')}>
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
          <TextField label={t('common.field.time')} type="datetime-local" value={date} onChange={setDate} required error={!date ? t('grow.form.timeRequired') : undefined} />
          <SelectField label={t('grow.form.plant')} value={pid} onChange={setPid} options={plants.map((p) => ({ value: p.id, label: p.name }))} placeholder={t('grow.form.wholeGrow')} />
        </div>
        <TextField label={t('grow.form.titleOptional')} value={title} onChange={setTitle} maxLength={80} placeholder={ACTIVITY_LABEL[type]} />
        {(type === 'watering' || type === 'feeding') && <OptionalNumber label={type === 'feeding' ? t('grow.form.nutrientAmount') : t('grow.form.waterAmount')} unit="ml" text={volume} onText={setVolume} min={0} max={1_000_000} />}
        <TextArea label={t('common.field.notes')} value={notes} onChange={setNotes} rows={3} placeholder={type === 'feeding' ? t('grow.form.notesFeedPh') : type === 'issue' ? t('grow.form.notesIssuePh') : ''} />
        {showMeasurements ? (
          <fieldset className="space-y-3 rounded-xl border border-white/[0.06] p-4">
            <legend className="px-1 text-[13px] font-medium text-ink-200">{t('grow.form.measurementsOptional')}</legend>
            <MeasurementFields state={ms} onChange={setMs} />
          </fieldset>
        ) : (
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setForceMeasure(true)}>
            <Plus className="size-3.5" /> {t('grow.form.addMeasurements')}
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
      toast(t('grow.form.expenseSaved'));
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={expense ? t('grow.form.editExpense') : t('grow.form.addExpense')} size="md" footer={<FormFooter onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <OptionalNumber label={t('common.field.amount')} unit={settings.currency} text={amount} onText={setAmount} min={0} max={1_000_000} required />
          <TextField label={t('common.field.date')} type="date" value={date} onChange={setDate} required />
          <SelectField label={t('common.field.category')} value={category} onChange={(v) => setCategory((v || 'other') as ExpenseCategory)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] }))} />
          <SelectField label={t('grow.form.growOptional')} value={gid} onChange={setGid} options={data.grows.map((g) => ({ value: g.id, label: g.name }))} placeholder={t('grow.form.noGrow')} />
        </div>
        <TextField label={t('common.field.description')} value={description} onChange={setDescription} maxLength={120} placeholder={t('grow.form.expenseDescPh')} />
      </form>
    </Modal>
  );
}
