import { ArrowLeft, FlaskConical, Leaf, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { href } from '../../app/router';
import { TextArea, TextField } from '../../components/forms/Fields';
import { PhotoImg } from '../../components/photos/PhotoImg';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Segmented } from '../../components/ui/Segmented';
import { fmtDate, today } from '../../lib/dates';
import { updateRecord } from '../../lib/db/repo';
import type { Experiment, GrowProject, PhenotypeNotes, Plant } from '../../lib/db/types';
import { fmt } from '../../lib/format';
import { METRICS, metricSeries, seriesStats } from '../../lib/grow/series';
import { t } from '../../i18n';


const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

const PHENO_FIELDS: { key: keyof Omit<PhenotypeNotes, 'updatedAt'>; label: string; hint: string }[] = [
  { key: 'appearance', get label() { return t('grow.ex.f.appearance'); }, get hint() { return t('grow.ex.f.appearanceH'); } },
  { key: 'growth', get label() { return t('grow.ex.f.growth'); }, get hint() { return t('grow.ex.f.growthH'); } },
  { key: 'leaves', get label() { return t('grow.ex.f.leaves'); }, get hint() { return t('grow.ex.f.leavesH'); } },
  { key: 'variation', get label() { return t('grow.ex.f.variation'); }, get hint() { return t('grow.ex.f.variationH'); } },
  { key: 'aroma', get label() { return t('grow.ex.f.aroma'); }, get hint() { return t('grow.ex.f.aromaH'); } },
  { key: 'notes', get label() { return t('grow.ex.f.notes'); }, hint: '' },
];

function ExperimentForm({ grow, plants, exp, onClose }: { grow: GrowProject; plants: Plant[]; exp?: Experiment; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [x, setX] = useState<Experiment>(exp ?? { id: newId(), name: '', purpose: '', plantIds: [], startDate: today(), metrics: ['heightCm'], observations: '', outcome: '', notes: '' });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Experiment>) => setX((v) => ({ ...v, ...p }));
  const err = !x.name.trim() ? t('grow.ex.nameMissing') : x.endDate && x.endDate < x.startDate ? t('grow.ex.endBefore') : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (err) return;
    setSaving(true);
    try {
      const list = grow.experiments ?? [];
      const next = { ...x, name: x.name.trim().slice(0, 80), purpose: x.purpose.slice(0, 500) };
      await updateRecord('grows', grow.id, { experiments: exp ? list.map((y) => (y.id === exp.id ? next : y)) : [...list, next] });
      toast(t('grow.ex.saved'));
      onClose();
    } catch (er) {
      toast(errorText(er), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={exp ? t('grow.ex.edit') : t('grow.ex.new')}
      subtitle={grow.name}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form={formId} className="btn-primary" disabled={saving}>
            {t('common.save.button')}
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <TextField label={t('grow.ex.name')} value={x.name} onChange={(v) => set({ name: v })} required maxLength={80} error={submitted ? err : undefined} placeholder={t('grow.ex.namePh')} />
        <TextArea label={t('grow.ex.goal')} value={x.purpose} onChange={(v) => set({ purpose: v })} rows={2} placeholder={t('grow.ex.goalPh')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('grow.ex.start')} type="date" value={x.startDate} onChange={(v) => set({ startDate: v })} />
          <TextField label={t('grow.ex.end')} type="date" value={x.endDate ?? ''} onChange={(v) => set({ endDate: v || undefined })} />
        </div>
        <fieldset>
          <legend className="label mb-1.5">{t('grow.ex.plantsL')}</legend>
          {plants.length === 0 ? (
            <p className="hint">{t('grow.ex.noPlants')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {plants.map((p) => {
                const on = x.plantIds.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => set({ plantIds: on ? x.plantIds.filter((i) => i !== p.id) : [...x.plantIds, p.id] })} className={`min-h-9 rounded-full border px-3 text-[12px] ${on ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-100' : 'border-white/[0.08] text-ink-300'}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend className="label mb-1.5">{t('grow.ex.metrics')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((m) => {
              const on = x.metrics.includes(m.key);
              return (
                <button key={m.key} type="button" aria-pressed={on} onClick={() => set({ metrics: on ? x.metrics.filter((k) => k !== m.key) : [...x.metrics, m.key] })} className={`min-h-9 rounded-full border px-3 text-[12px] ${on ? 'border-sky-400/40 bg-sky-400/10 text-sky-100' : 'border-white/[0.08] text-ink-400'}`}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <TextArea label={t('grow.ex.obs')} value={x.observations} onChange={(v) => set({ observations: v })} rows={3} />
        <TextArea label={t('grow.ex.outcome')} value={x.outcome} onChange={(v) => set({ outcome: v })} rows={2} />
        <TextArea label={t('grow.ex.f.notes')} value={x.notes} onChange={(v) => set({ notes: v })} rows={2} />
        <p className="hint">{t('grow.ex.personal')}</p>
      </form>
    </Modal>
  );
}

function PhenotypeForm({ plant, onClose }: { plant: Plant; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [v, setV] = useState<PhenotypeNotes>(plant.phenotype ?? {});
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const clean = Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== 'updatedAt' && typeof x === 'string' && x.trim()).map(([k, x]) => [k, (x as string).trim().slice(0, 1000)]));
      await updateRecord('plants', plant.id, { phenotype: Object.keys(clean).length ? { ...clean, updatedAt: new Date().toISOString() } : undefined });
      toast(t('grow.ex.phenoSaved'));
      onClose();
    } catch (er) {
      toast(errorText(er), { tone: 'error' });
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('grow.ex.pheno')}
      subtitle={plant.name}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form={formId} className="btn-primary">
            {t('common.save.button')}
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-3" noValidate>
        {PHENO_FIELDS.map((f) => (
          <TextArea key={f.key} label={f.label} value={v[f.key] ?? ''} onChange={(val) => setV((o) => ({ ...o, [f.key]: val }))} rows={2} placeholder={f.hint} />
        ))}
        <p className="hint">{t('grow.ex.subjective')}</p>
      </form>
    </Modal>
  );
}

/** Experimente und Phänotyp-Journal eines Grows (gespeichert im Grow bzw. in den Pflanzen-Datensätzen). */
export function ExperimentsPage({ growId }: { growId: string }) {
  const { data } = useData();
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState<'experiments' | 'phenotypes'>('experiments');
  const [edit, setEdit] = useState<Experiment | 'new' | null>(null);
  const [pheno, setPheno] = useState<Plant | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const grow = data.grows.find((g) => g.id === growId);
  const plants = useMemo(() => data.plants.filter((p) => p.growId === growId), [data.plants, growId]);
  if (!grow) return <EmptyState title={t('grow.ex.notFound')} action={<a href={href('grows')} className="btn-primary">{t('grow.ex.toGrows')}</a>} />;
  const exps = grow.experiments ?? [];
  const cover = (p: Plant) => p.coverPhotoId ?? [...data.photos].filter((x) => x.plantId === p.id).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]?.id;

  async function remove(x: Experiment) {
    if (!(await confirm({ title: t('grow.pd.deleteTitle', { name: x.name }), get message() { return t('grow.ex.deleteMsg'); }, confirmLabel: t('common.delete'), tone: 'danger' }))) return;
    try {
      await updateRecord('grows', grow!.id, { experiments: exps.filter((y) => y.id !== x.id) });
      toast(t('grow.ex.deleted'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  const shown = plants.filter((p) => compare.includes(p.id));
  return (
    <div>
      <PageHeader
        crumbs={[{ label: t('grow.ex.grows'), to: 'grows' }, { label: grow.name, to: `grows/${grow.id}` }, { label: t('grow.ex.title') }]}
        title={t('grow.ex.title')}
        subtitle={t('grow.ex.subtitle')}
        actions={
          <>
            <a href={href(`grows/${grow.id}`)} className="btn-ghost">
              <ArrowLeft className="size-4" /> {t('grow.ex.grow')}
            </a>
            {tab === 'experiments' && (
              <button type="button" className="btn-primary" onClick={() => setEdit('new')}>
                <Plus className="size-4" /> {t('grow.ex.experiment')}
              </button>
            )}
          </>
        }
      />
      <div className="mb-5 max-w-sm">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'experiments', label: t('grow.ex.countTab', { n: exps.length }) },
            { value: 'phenotypes', label: t('grow.ex.phenos') },
          ]}
        />
      </div>

      {tab === 'experiments' &&
        (exps.length === 0 ? (
          <div className="card">
            <EmptyState icon={<FlaskConical />} title={t('grow.ex.emptyTitle')} text={t('grow.ex.emptyText')} action={<button type="button" className="btn-primary" onClick={() => setEdit('new')}><Plus className="size-4" /> {t('grow.ex.create')}</button>} />
          </div>
        ) : (
          <div className="space-y-4">
            {exps.map((x) => {
              const ps = plants.filter((p) => x.plantIds.includes(p.id));
              const inRange = data.activities.filter((a) => a.growId === grow.id && a.date.slice(0, 10) >= x.startDate && (!x.endDate || a.date.slice(0, 10) <= x.endDate));
              return (
                <Card
                  key={x.id}
                  title={x.name}
                  subtitle={`${fmtDate(x.startDate)}${x.endDate ? ` – ${fmtDate(x.endDate)}` : t('grow.ex.running')} · ${t('grow.ex.plants', { count: ps.length })}`}
                  icon={<FlaskConical className="size-4" />}
                  actions={
                    <div className="flex gap-1">
                      <button type="button" className="btn-ghost p-1.5" aria-label={t('common.edit')} onClick={() => setEdit(x)}>
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" className="btn-ghost p-1.5 hover:text-rose-300" aria-label={t('common.delete')} onClick={() => remove(x)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  }
                >
                  {x.purpose && <p className="mb-3 text-[13px] text-ink-300">{x.purpose}</p>}
                  {ps.length > 0 && x.metrics.length > 0 && (
                    <div className="mb-3 overflow-x-auto">
                      <table className="w-full min-w-[28rem] text-left text-[12px]">
                        <thead className="text-ink-400">
                          <tr>
                            <th className="py-1 pr-2 font-medium" scope="col">
                              {t('grow.ex.metricPeriod')}
                            </th>
                            {ps.map((p) => (
                              <th key={p.id} className="py-1 pr-2 font-medium" scope="col">
                                {p.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {METRICS.filter((m) => x.metrics.includes(m.key)).map((m) => (
                            <tr key={m.key} className="border-t border-white/[0.05]">
                              <th scope="row" className="py-1.5 pr-2 font-normal text-ink-300">
                                {m.label}
                              </th>
                              {ps.map((p) => {
                                const st = seriesStats(metricSeries(inRange, m.key, { plantId: p.id }));
                                return (
                                  <td key={p.id} className="py-1.5 pr-2 font-mono tabular text-ink-100">
                                    {st.count ? `${fmt(st.latest!.value)}${m.unit ? ` ${m.unit}` : ''}` : <span className="font-sans text-ink-500">{t('grow.ex.noMeasure')}</span>}
                                    {st.count > 1 && <span className="ml-1 font-sans text-[10px] text-ink-500">({st.count} Mess., {fmt(st.min!)}–{fmt(st.max!)})</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] text-ink-500">{t('grow.ex.obs')}</dt>
                      <dd className="whitespace-pre-wrap text-ink-200">{x.observations || '–'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-500">{t('grow.ex.outcome')}</dt>
                      <dd className="whitespace-pre-wrap text-ink-200">{x.outcome || '–'}</dd>
                    </div>
                  </dl>
                  {ps.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {ps.map((p) => (
                        <a key={p.id} href={href(`grows/${grow.id}/plants/${p.id}`)} className="w-28 shrink-0">
                          <PhotoImg photoId={cover(p)} alt={p.name} className="aspect-square w-full rounded-lg" />
                          <span className="mt-1 block truncate text-[11px] text-ink-300">{p.name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
            <p className="hint">{t('grow.ex.latestNote')}</p>
          </div>
        ))}

      {tab === 'phenotypes' &&
        (plants.length === 0 ? (
          <div className="card">
            <EmptyState icon={<Leaf />} title={t('grow.ex.noPlantsT')} text={t('grow.ex.noPlantsText')} />
          </div>
        ) : (
          <div className="space-y-5">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plants.map((p) => {
                const n = p.phenotype;
                const filled = n ? PHENO_FIELDS.filter((f) => n[f.key]).length : 0;
                const on = compare.includes(p.id);
                return (
                  <li key={p.id} className="card flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-3">
                      <PhotoImg photoId={cover(p)} alt="" className="size-12 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-ink-50">{p.name}</p>
                        <p className="text-[11px] text-ink-400">{filled ? t('grow.ex.filled', { a: filled, b: PHENO_FIELDS.length }) : t('grow.ex.noNotes')}</p>
                      </div>
                    </div>
                    <div className="mt-auto flex gap-2">
                      <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" onClick={() => setPheno(p)}>
                        <Pencil className="size-3.5" /> {t('grow.ex.notes')}
                      </button>
                      <button type="button" aria-pressed={on} className={`btn-ghost flex-1 py-1.5 text-xs ${on ? 'border-sky-400/30 text-sky-200' : ''}`} onClick={() => setCompare((c) => (on ? c.filter((x) => x !== p.id) : c.length < 4 ? [...c, p.id] : c))}>
                        {on ? t('grow.ex.inCompare') : t('grow.ex.compare')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {shown.length >= 2 ? (
              <Card title={t('grow.ex.side')} subtitle={t('grow.ex.plants', { count: shown.length })}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-[12px]">
                    <thead>
                      <tr>
                        <th className="w-32 py-1" scope="col">
                          <span className="sr-only">{t('grow.ex.trait')}</span>
                        </th>
                        {shown.map((p) => (
                          <th key={p.id} className="py-1 pr-3 align-bottom" scope="col">
                            <PhotoImg photoId={cover(p)} alt={p.name} className="mb-1 aspect-square w-24 rounded-lg" />
                            <span className="text-[13px] font-medium text-ink-50">{p.name}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PHENO_FIELDS.map((f) => (
                        <tr key={f.key} className="border-t border-white/[0.05] align-top">
                          <th scope="row" className="py-2 pr-2 font-normal text-ink-400">
                            {f.label}
                          </th>
                          {shown.map((p) => (
                            <td key={p.id} className="whitespace-pre-wrap py-2 pr-3 text-ink-200">
                              {p.phenotype?.[f.key] || <span className="text-ink-500">–</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t border-white/[0.05]">
                        <th scope="row" className="py-2 pr-2 font-normal text-ink-400">
                          {t('grow.ex.height')}
                        </th>
                        {shown.map((p) => {
                          const h = metricSeries(data.activities, 'heightCm', { plantId: p.id }).at(-1);
                          return (
                            <td key={p.id} className="py-2 pr-3 font-mono text-ink-100">
                              {h ? `${fmt(h.value)} cm` : <span className="font-sans text-ink-500">{t('grow.ex.noMeasure')}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <p className="hint">{t('grow.ex.hint')}</p>
            )}
          </div>
        ))}

      {edit && <ExperimentForm grow={grow} plants={plants} exp={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {pheno && <PhenotypeForm plant={pheno} onClose={() => setPheno(null)} />}
    </div>
  );
}

