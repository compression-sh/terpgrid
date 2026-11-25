import { withQuantityChange } from '../../lib/inventory';
import { useIsServerMode } from '../../app/auth';
import { parseTags } from '../../lib/grow/equipment';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { clearDraft, loadDraft, saveDraft } from '../../lib/drafts';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { nowLocal, today } from '../../lib/dates';
import { createRecord, updateRecord } from '../../lib/db/repo';
import {
  type ClaimSource,
  CONSUMPTION_METHODS,
  type ConsumptionMethod,
  INVENTORY_CATEGORIES,
  type InventoryCategory,
  SPACE_KINDS,
  type SpaceKind,
  type InventoryItem,
  type JournalEntry,
  REMINDER_CATEGORIES,
  type Reminder,
  type ReminderCategory,
  type RepeatRule,
  type Strain,
  type Terpene,
} from '../../lib/db/types';
import {
  AROMA_OPTIONS,
  CLAIM_SOURCE_LABEL,
  INVENTORY_CATEGORY_LABEL,
  METHOD_LABEL,
  SPACE_KIND_LABEL,
  MOOD_OPTIONS,
  REMINDER_CATEGORY_LABEL,
  TERPENE_SUGGESTIONS,
} from '../../lib/grow/labels';
import { Callout } from '../ui/Callout';
import { Modal } from '../ui/Modal';
import { ChipSelect, Field, OptionalNumber, RatingInput, SelectField, TextArea, TextField, numText, numberError, toOptionalNumber } from './Fields';

function Footer({ onCancel, saving, formId }: { onCancel: () => void; saving: boolean; formId: string }) {
  return (
    <>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Abbrechen
      </button>
      <button type="submit" form={formId} className="btn-primary" disabled={saving}>
        {saving ? 'Speichern …' : 'Speichern'}
      </button>
    </>
  );
}

const SOURCE_OPTIONS = (Object.keys(CLAIM_SOURCE_LABEL) as ClaimSource[]).map((v) => ({ value: v, label: CLAIM_SOURCE_LABEL[v] }));

/** Sorten-Combobox: verknüpft mit Bibliothek, sonst Freitext. */
function StrainInput({ value, onChange, label = 'Sorte' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { data } = useData();
  const listId = useId();
  return (
    <Field label={label} hint={data.strains.length ? 'Aus der Bibliothek wählen oder frei eingeben.' : undefined}>
      {(id, d) => (
        <>
          <input id={id} aria-describedby={d} list={listId} className="input-base" value={value} onChange={(e) => onChange(e.target.value)} maxLength={80} />
          <datalist id={listId}>
            {data.strains.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </>
      )}
    </Field>
  );
}

function resolveStrain(strains: Strain[], text: string): { strainId?: string; strainName?: string } {
  const t = text.trim();
  if (!t) return {};
  const match = strains.find((s) => s.name.toLowerCase() === t.toLowerCase());
  return match ? { strainId: match.id } : { strainName: t };
}

/* ───────────── Journal ───────────── */

interface JournalDraft {
  date: string;
  strain: string;
  method: string;
  amount: string;
  unit: NonNullable<JournalEntry['amount']>['unit'];
  thc: string;
  notes: string;
  moods: string[];
  duration: string;
  rating?: number;
}

export function JournalFormModal({ open, onClose, entry, strainId }: { open: boolean; onClose: () => void; entry?: JournalEntry; strainId?: string }) {
  const server = useIsServerMode();
  const { data, settings } = useData();
  const toast = useToast();
  const formId = useId();
  const initialStrain = entry?.strainId
    ? (data.strains.find((s) => s.id === entry.strainId)?.name ?? '')
    : (entry?.strainName ?? data.strains.find((s) => s.id === strainId)?.name ?? '');
  // Entwurf nur für neue Einträge (nicht beim Bearbeiten und nicht bei vorgewählter Sorte)
  const [draft] = useState(() => (!entry && !strainId ? loadDraft<JournalDraft>('journal', (d) => typeof d.method === 'string' && typeof d.notes === 'string') : null));
  const [date, setDate] = useState(entry?.date ?? draft?.date ?? nowLocal());
  const [strain, setStrain] = useState(draft?.strain ?? initialStrain);
  const [method, setMethod] = useState<ConsumptionMethod>(entry?.method ?? (CONSUMPTION_METHODS.includes(draft?.method as ConsumptionMethod) ? (draft!.method as ConsumptionMethod) : 'vaporizer'));
  const [amount, setAmount] = useState(draft?.amount ?? numText(entry?.amount?.value));
  const [unit, setUnit] = useState<NonNullable<JournalEntry['amount']>['unit']>(entry?.amount?.unit ?? draft?.unit ?? 'g');
  const [thc, setThc] = useState(draft?.thc ?? numText(entry?.thcPercent));
  const [notes, setNotes] = useState(entry?.notes ?? draft?.notes ?? '');
  const [moods, setMoods] = useState<string[]>(entry?.moods ?? (Array.isArray(draft?.moods) ? draft!.moods.filter((m) => typeof m === 'string') : []));
  const [duration, setDuration] = useState(entry?.durationNote ?? draft?.duration ?? '');
  const [rating, setRating] = useState<number | undefined>(entry?.rating ?? (typeof draft?.rating === 'number' ? draft.rating : undefined));
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(!!draft);
  const trackDraft = !entry && !strainId;
  useEffect(() => {
    if (!trackDraft) return;
    const touched = notes.trim() || strain.trim() || amount || thc || moods.length || duration.trim() || rating !== undefined;
    if (touched) saveDraft('journal', { date, strain, method, amount, unit, thc, notes, moods, duration, rating } satisfies JournalDraft);
    else clearDraft('journal');
  }, [trackDraft, date, strain, method, amount, unit, thc, notes, moods, duration, rating]);
  const discardDraft = () => {
    clearDraft('journal');
    setDate(nowLocal());
    setStrain('');
    setMethod('vaporizer');
    setAmount('');
    setUnit('g');
    setThc('');
    setNotes('');
    setMoods([]);
    setDuration('');
    setRating(undefined);
    setRestored(false);
  };
  const err = numberError(amount, { min: 0, max: 100000 }) || numberError(thc, { min: 0, max: 100 });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (err || !date) return;
    setSaving(true);
    const a = toOptionalNumber(amount);
    const payload = {
      date,
      ...resolveStrain(data.strains, strain),
      method,
      amount: a !== undefined ? { value: a, unit } : undefined,
      thcPercent: toOptionalNumber(thc),
      notes,
      moods,
      durationNote: duration.trim(),
      rating,
    };
    try {
      if (entry) await updateRecord('journal', entry.id, { strainId: undefined, strainName: undefined, ...payload });
      else await createRecord('journal', payload);
      if (trackDraft) clearDraft('journal');
      toast('Journal-Eintrag gespeichert');
      onClose();
    } catch (e2) {
      toast(errorText(e2), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={entry ? 'Eintrag bearbeiten' : 'Neuer Journal-Eintrag'} subtitle={server ? 'Privat – nur in deinem Konto, verschlüsselt gespeichert.' : 'Privat – nur in diesem Browser.'} size="lg" footer={<Footer onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        {restored && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-leaf-500/20 bg-leaf-500/[0.06] px-3 py-2 text-[12.5px] text-leaf-100" role="status">
            Entwurf wiederhergestellt (nur in diesem Tab gespeichert).
            <button type="button" className="shrink-0 text-ink-300 underline-offset-2 hover:text-ink-50 hover:underline" onClick={discardDraft}>
              Verwerfen
            </button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Datum & Uhrzeit" type="datetime-local" value={date} onChange={setDate} required />
          <StrainInput value={strain} onChange={setStrain} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_7rem_1fr]">
          <SelectField label="Konsumform" value={method} onChange={(v) => setMethod((v || 'other') as ConsumptionMethod)} options={CONSUMPTION_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          <OptionalNumber label="Menge (eigene Angabe)" text={amount} onText={setAmount} min={0} max={100000} />
          <SelectField label="Einheit" value={unit} onChange={(v) => setUnit((v || 'g') as typeof unit)} options={(['g', 'mg', 'ml', 'Stück', 'Züge'] as const).map((u) => ({ value: u, label: u }))} />
          <OptionalNumber label="THC laut Angabe" unit="%" text={thc} onText={setThc} min={0} max={100} />
        </div>
        <ChipSelect label="Stimmung / Empfinden" options={MOOD_OPTIONS} value={moods} onChange={setMoods} />
        <TextArea label="Erfahrung & Notizen" value={notes} onChange={setNotes} rows={4} placeholder="Wie war es? Umgebung, Mahlzeit, Besonderheiten …" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Dauer (Notiz)" value={duration} onChange={setDuration} maxLength={80} placeholder="z. B. ca. 3 Std., abends abgeklungen" />
          <RatingInput label="Persönliche Bewertung" value={rating} onChange={setRating} />
        </div>
        {settings.showHarmReduction && method === 'edible' && (
          <Callout tone="info">Edibles wirken verzögert (30 Min. – 2 Std.) und lange. Vor einem weiteren Konsum die volle Wirkzeit abwarten.</Callout>
        )}
      </form>
    </Modal>
  );
}

/* ───────────── Sorte ───────────── */

export function StrainFormModal({ open, onClose, strain, onSaved }: { open: boolean; onClose: () => void; strain?: Strain; onSaved?: (s: Strain) => void }) {
  const { data } = useData();
  const toast = useToast();
  const formId = useId();
  const [name, setName] = useState(strain?.name ?? '');
  const [breeder, setBreeder] = useState(strain?.breeder ?? '');
  const [genetics, setGenetics] = useState(strain?.genetics ?? '');
  const [reportedType, setReportedType] = useState<NonNullable<Strain['reportedType']> | ''>(strain?.reportedType ?? '');
  const [thc, setThc] = useState(numText(strain?.thc?.value));
  const [thcSource, setThcSource] = useState<ClaimSource>(strain?.thc?.source ?? 'reported');
  const [cbd, setCbd] = useState(numText(strain?.cbd?.value));
  const [cbdSource, setCbdSource] = useState<ClaimSource>(strain?.cbd?.source ?? 'reported');
  const [terpenes, setTerpenes] = useState<{ name: string; percent: string; source: ClaimSource }[]>(
    (strain?.terpenes ?? []).map((t) => ({ name: t.name, percent: numText(t.percent), source: t.source })),
  );
  const [aromas, setAromas] = useState<string[]>(strain?.aromas ?? []);
  const [flavorNotes, setFlavorNotes] = useState(strain?.flavorNotes ?? '');
  const [rating, setRating] = useState<number | undefined>(strain?.rating);
  const [observations, setObservations] = useState(strain?.observations ?? '');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dup = data.strains.some((s) => s.id !== strain?.id && s.name.toLowerCase() === name.trim().toLowerCase());
  const nameErr = submitted && !name.trim() ? 'Bitte einen Namen eingeben.' : dup ? 'Eine Sorte mit diesem Namen existiert bereits.' : undefined;
  const numErr =
    numberError(thc, { min: 0, max: 100 }) || numberError(cbd, { min: 0, max: 100 }) || terpenes.map((t) => numberError(t.percent, { min: 0, max: 100 })).find(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || dup || numErr) return;
    setSaving(true);
    const t = toOptionalNumber(thc);
    const c = toOptionalNumber(cbd);
    const payload = {
      name: name.trim(),
      breeder: breeder.trim() || undefined,
      genetics: genetics.trim() || undefined,
      reportedType: reportedType || undefined,
      thc: t !== undefined ? { value: t, source: thcSource } : undefined,
      cbd: c !== undefined ? { value: c, source: cbdSource } : undefined,
      terpenes: terpenes.filter((x) => x.name.trim()).map<Terpene>((x) => ({ name: x.name.trim(), percent: toOptionalNumber(x.percent), source: x.source })),
      aromas,
      flavorNotes,
      rating,
      observations,
      favorite: strain?.favorite ?? false,
    };
    try {
      const saved = strain ? await updateRecord('strains', strain.id, payload) : await createRecord('strains', payload);
      toast(strain ? 'Sorte gespeichert' : `„${saved.name}“ zur Bibliothek hinzugefügt`);
      onSaved?.(saved);
      onClose();
    } catch (e2) {
      toast(errorText(e2), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={strain ? 'Sorte bearbeiten' : 'Neue Sorte'} subtitle="Nur eigene Angaben – nichts wird automatisch ergänzt." size="lg" footer={<Footer onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={name} onChange={setName} required error={nameErr} maxLength={80} autoFocus />
          <TextField label="Breeder (optional)" value={breeder} onChange={setBreeder} maxLength={80} />
          <TextField label="Genetik / Kreuzung (optional)" value={genetics} onChange={setGenetics} maxLength={120} placeholder="laut Quelle, z. B. A × B" />
          <SelectField
            label="Typ laut Quelle (optional)"
            value={reportedType}
            onChange={(v) => setReportedType(v)}
            options={[
              { value: 'indica', label: 'Indica (angegeben)' },
              { value: 'sativa', label: 'Sativa (angegeben)' },
              { value: 'hybrid', label: 'Hybrid (angegeben)' },
              { value: 'unknown', label: 'Unbekannt' },
            ]}
            placeholder="—"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <OptionalNumber label="THC" unit="%" text={thc} onText={setThc} min={0} max={100} />
          <SelectField label="Herkunft THC" value={thcSource} onChange={(v) => setThcSource((v || 'reported') as ClaimSource)} options={SOURCE_OPTIONS} />
          <OptionalNumber label="CBD" unit="%" text={cbd} onText={setCbd} min={0} max={100} />
          <SelectField label="Herkunft CBD" value={cbdSource} onChange={(v) => setCbdSource((v || 'reported') as ClaimSource)} options={SOURCE_OPTIONS} />
        </div>
        <fieldset className="space-y-2">
          <legend className="label">Terpene (optional)</legend>
          {terpenes.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_9rem_auto] items-end gap-2">
              <TextField label="Terpen" value={t.name} list="terpene-suggestions" onChange={(v) => setTerpenes((s) => s.map((x, j) => (j === i ? { ...x, name: v } : x)))} maxLength={40} />
              <TextField label="%" inputMode="decimal" value={t.percent} onChange={(v) => setTerpenes((s) => s.map((x, j) => (j === i ? { ...x, percent: v } : x)))} error={numberError(t.percent, { min: 0, max: 100 })} />
              <SelectField label="Herkunft" value={t.source} onChange={(v) => setTerpenes((s) => s.map((x, j) => (j === i ? { ...x, source: (v || 'reported') as ClaimSource } : x)))} options={SOURCE_OPTIONS} />
              <button type="button" className="btn-ghost mb-0.5 p-2" aria-label="Terpen entfernen" onClick={() => setTerpenes((s) => s.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <datalist id="terpene-suggestions">
            {TERPENE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setTerpenes((s) => [...s, { name: '', percent: '', source: 'reported' }])}>
            <Plus className="size-3.5" /> Terpen hinzufügen
          </button>
        </fieldset>
        <ChipSelect label="Aroma (eigener Eindruck)" options={AROMA_OPTIONS} value={aromas} onChange={setAromas} />
        <TextArea label="Geschmack & Aroma – Notizen" value={flavorNotes} onChange={setFlavorNotes} rows={2} />
        <TextArea label="Persönliche Beobachtungen" value={observations} onChange={setObservations} rows={3} />
        <RatingInput label="Persönliche Bewertung" value={rating} onChange={setRating} />
      </form>
    </Modal>
  );
}

/* ───────────── Sammlung ───────────── */

export function InventoryFormModal({ open, onClose, item, defaults }: { open: boolean; onClose: () => void; item?: InventoryItem; defaults?: Partial<InventoryItem> }) {
  const { data, settings } = useData();
  const toast = useToast();
  const formId = useId();
  const base = item ?? defaults;
  const [name, setName] = useState(base?.name ?? '');
  const [category, setCategory] = useState<InventoryCategory>(base?.category ?? 'accessory');
  const [quantity, setQuantity] = useState(numText(base?.quantity));
  const [unit, setUnit] = useState(base?.unit ?? 'Stück');
  const [purchaseDate, setPurchaseDate] = useState(base?.purchaseDate ?? '');
  const [cost, setCost] = useState(numText(base?.cost));
  const [notes, setNotes] = useState(base?.notes ?? '');
  const [strain, setStrain] = useState(base?.strainId ? (data.strains.find((s) => s.id === base.strainId)?.name ?? '') : '');
  const [growId, setGrowId] = useState(base?.growId ?? '');
  const [spaceKind, setSpaceKind] = useState<SpaceKind | ''>(base?.spaceKind ?? '');
  const [dimensions, setDimensions] = useState(base?.dimensions ?? '');
  const [manufacturer, setManufacturer] = useState(base?.manufacturer ?? '');
  const [model, setModel] = useState(base?.model ?? '');
  const [powerW, setPowerW] = useState(numText(base?.powerW));
  const [hours, setHours] = useState(numText(base?.hoursPerDay));
  const [warranty, setWarranty] = useState(base?.warrantyUntil ?? '');
  const [spaceId, setSpaceId] = useState(base?.spaceId ?? '');
  const [tags, setTags] = useState((base?.tags ?? []).join(', '));
  const [archived, setArchived] = useState(!!base?.archived);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const nameErr = submitted && !name.trim() ? 'Bitte einen Namen eingeben.' : undefined;
  const numErr = numberError(quantity, { min: 0, max: 1_000_000 }) || numberError(cost, { min: 0, max: 1_000_000 }) || numberError(powerW, { min: 0, max: 100_000 }) || numberError(hours, { min: 0, max: 24 });
  const spaces = data.inventory.filter((i) => i.category === 'space' && i.id !== item?.id && !i.archived);
  const completedGrows = data.grows.filter((g) => g.status !== 'active' || g.id === growId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || numErr) return;
    setSaving(true);
    const match = data.strains.find((s) => s.name.toLowerCase() === strain.trim().toLowerCase());
    const payload = {
      name: name.trim(),
      category,
      quantity: toOptionalNumber(quantity),
      unit: unit.trim() || 'Stück',
      purchaseDate: purchaseDate || undefined,
      cost: toOptionalNumber(cost),
      notes,
      strainId: match?.id,
      growId: growId || undefined,
      spaceKind: category === 'space' ? spaceKind || undefined : undefined,
      dimensions: category === 'space' ? dimensions.trim() || undefined : undefined,
      manufacturer: category === 'equipment' ? manufacturer.trim() || undefined : undefined,
      model: category === 'equipment' ? model.trim() || undefined : undefined,
      powerW: category === 'equipment' ? toOptionalNumber(powerW) : undefined,
      hoursPerDay: category === 'equipment' ? toOptionalNumber(hours) : undefined,
      warrantyUntil: category === 'equipment' ? warranty || undefined : undefined,
      spaceId: category !== 'space' ? spaceId || undefined : undefined,
      tags: parseTags(tags),
      archived: archived || undefined,
      quantityLog: item ? withQuantityChange(item.quantityLog, item.quantity, toOptionalNumber(quantity), new Date().toISOString()) : undefined,
      maintenanceLog: item?.maintenanceLog,
    };
    try {
      if (item) await updateRecord('inventory', item.id, payload);
      else await createRecord('inventory', payload);
      toast('Eintrag gespeichert');
      onClose();
    } catch (e2) {
      toast(errorText(e2), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Eintrag bearbeiten' : 'Zur Sammlung hinzufügen'} size="lg" footer={<Footer onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={name} onChange={setName} required error={nameErr} maxLength={80} autoFocus />
          <SelectField label="Kategorie" value={category} onChange={(v) => setCategory((v || 'other') as InventoryCategory)} options={INVENTORY_CATEGORIES.map((c) => ({ value: c, label: INVENTORY_CATEGORY_LABEL[c] }))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <OptionalNumber label="Menge" text={quantity} onText={setQuantity} min={0} max={1_000_000} />
          <TextField label="Einheit" value={unit} onChange={setUnit} maxLength={16} list="unit-suggestions" />
          <datalist id="unit-suggestions">
            {['Stück', 'g', 'ml', 'l', 'Packung', 'Samen'].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <TextField label="Kaufdatum" type="date" value={purchaseDate} onChange={setPurchaseDate} />
          <OptionalNumber label="Preis" unit={settings.currency} text={cost} onText={setCost} min={0} max={1_000_000} />
        </div>
        {(category === 'cannabis' || category === 'seeds') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <StrainInput value={strain} onChange={setStrain} label="Sorte (aus Bibliothek)" />
            <SelectField label="Aus Grow (optional)" value={growId} onChange={setGrowId} options={completedGrows.map((g) => ({ value: g.id, label: g.name }))} placeholder="—" hint="Verknüpfung, z. B. Ernte eines abgeschlossenen Grows." />
          </div>
        )}
        {category === 'space' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Art des Bereichs" value={spaceKind} onChange={(v) => setSpaceKind(v as SpaceKind | '')} options={SPACE_KINDS.map((k) => ({ value: k, label: SPACE_KIND_LABEL[k] }))} placeholder="—" />
            <TextField label="Maße (optional)" value={dimensions} onChange={setDimensions} maxLength={40} placeholder="z. B. 80 × 80 × 160 cm" />
          </div>
        )}
        {category === 'equipment' && (
          <div className="space-y-4 rounded-xl border border-white/[0.06] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Hersteller" value={manufacturer} onChange={setManufacturer} maxLength={60} />
              <TextField label="Modell" value={model} onChange={setModel} maxLength={60} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <OptionalNumber label="Leistung" unit="W" text={powerW} onText={setPowerW} min={0} max={100_000} hint="laut Typenschild" />
              <OptionalNumber label="Betrieb pro Tag" unit="h" text={hours} onText={setHours} min={0} max={24} hint="eigene Schätzung" />
              <TextField label="Garantie bis" type="date" value={warranty} onChange={setWarranty} />
            </div>
          </div>
        )}
        {category !== 'space' && spaces.length > 0 && (
          <SelectField label="Standort (Grow-Bereich)" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} placeholder="—" />
        )}
        <TextField label="Tags (optional)" value={tags} onChange={setTags} maxLength={200} placeholder="durch Komma getrennt, z. B. zelt-1, ersatz" />
        <TextArea label="Notizen" value={notes} onChange={setNotes} />
        <label className="flex items-center gap-2 text-[13px] text-ink-300">
          <input type="checkbox" className="accent-leaf-500" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archiviert (in der Liste ausgeblendet, Daten bleiben erhalten)
        </label>
        <p className="hint">Mengen werden nie automatisch verändert – nur über dieses Formular oder die bestätigten Schnellanpassungen.</p>
      </form>
    </Modal>
  );
}

/* ───────────── Erinnerung ───────────── */

export function ReminderFormModal({ open, onClose, reminder, date, growId, plantId, defaults }: { open: boolean; onClose: () => void; reminder?: Reminder; date?: string; growId?: string; plantId?: string; defaults?: { title?: string; category?: ReminderCategory } }) {
  const { data } = useData();
  const toast = useToast();
  const formId = useId();
  const [title, setTitle] = useState(reminder?.title ?? defaults?.title ?? '');
  const [d, setD] = useState(reminder?.date ?? date ?? today());
  const [time, setTime] = useState(reminder?.time ?? '');
  const [category, setCategory] = useState<ReminderCategory>(reminder?.category ?? defaults?.category ?? 'watering');
  const [gid, setGid] = useState(reminder?.growId ?? growId ?? '');
  const [pid, setPid] = useState(reminder?.plantId ?? plantId ?? '');
  const [repeatKind, setRepeatKind] = useState<RepeatRule['kind']>(reminder?.repeat.kind ?? 'none');
  const [interval, setInterval] = useState(String(reminder && reminder.repeat.kind !== 'none' ? reminder.repeat.interval : 1));
  const [until, setUntil] = useState(reminder && reminder.repeat.kind !== 'none' ? (reminder.repeat.until ?? '') : '');
  const [notes, setNotes] = useState(reminder?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const titleErr = submitted && !title.trim() ? 'Bitte einen Titel eingeben.' : undefined;
  const intErr = repeatKind !== 'none' ? numberError(interval, { min: 1, max: 365, required: true }) : undefined;
  const untilErr = until && until < d ? 'Ende liegt vor dem Start.' : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!title.trim() || intErr || untilErr || !d) return;
    setSaving(true);
    const repeat: RepeatRule =
      repeatKind === 'none' ? { kind: 'none' } : { kind: repeatKind, interval: Math.max(1, Math.round(toOptionalNumber(interval) ?? 1)), until: until || undefined };
    const payload = { title: title.trim(), date: d, time: time || undefined, category, growId: gid || undefined, plantId: pid || undefined, repeat, notes, completedDates: reminder?.completedDates ?? [] };
    try {
      if (reminder) await updateRecord('reminders', reminder.id, payload);
      else await createRecord('reminders', payload);
      toast('Erinnerung gespeichert');
      onClose();
    } catch (e2) {
      toast(errorText(e2), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={reminder ? 'Erinnerung bearbeiten' : 'Neue Erinnerung'} subtitle="Wird in TERPGRID angezeigt – keine Push-Benachrichtigung." size="md" footer={<Footer onCancel={onClose} saving={saving} formId={formId} />}>
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Titel" value={title} onChange={setTitle} required error={titleErr} maxLength={80} autoFocus placeholder="z. B. Gießen, pH prüfen" />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Datum" type="date" value={d} onChange={setD} required />
          <TextField label="Uhrzeit (optional)" type="time" value={time} onChange={setTime} />
          <SelectField label="Kategorie" value={category} onChange={(v) => setCategory((v || 'other') as ReminderCategory)} options={REMINDER_CATEGORIES.map((c) => ({ value: c, label: REMINDER_CATEGORY_LABEL[c] }))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Grow (optional)" value={gid} onChange={(v) => { setGid(v); setPid(''); }} options={data.grows.filter((g) => g.status === 'active' || g.id === gid).map((g) => ({ value: g.id, label: g.name }))} placeholder="—" />
          <SelectField label="Pflanze (optional)" value={pid} onChange={setPid} options={data.plants.filter((p) => p.growId === gid).map((p) => ({ value: p.id, label: p.name }))} placeholder="—" disabled={!gid} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Wiederholung"
            value={repeatKind}
            onChange={(v) => setRepeatKind((v || 'none') as RepeatRule['kind'])}
            options={[
              { value: 'none', label: 'Einmalig' },
              { value: 'daily', label: 'Alle n Tage' },
              { value: 'weekly', label: 'Alle n Wochen' },
            ]}
          />
          {repeatKind !== 'none' && (
            <>
              <OptionalNumber label={repeatKind === 'daily' ? 'Alle … Tage' : 'Alle … Wochen'} text={interval} onText={setInterval} min={1} max={365} required />
              <Field label="Endet am (optional)" error={untilErr}>
                {(id) => <input id={id} type="date" className="input-base" value={until} onChange={(e) => setUntil(e.target.value)} />}
              </Field>
            </>
          )}
        </div>
        <TextArea label="Notizen" value={notes} onChange={setNotes} rows={2} />
      </form>
    </Modal>
  );
}
