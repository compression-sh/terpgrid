import { FileText, FlaskRound, Info, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { sampleLabel } from '../lib/vocab';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useConfirm } from '../app/Confirm';
import { useData } from '../app/DataProvider';
import { errorText, useToast } from '../app/Toasts';
import { href, setQuery, useRoute } from '../app/router';
import { OptionalNumber, SelectField, TextArea, TextField, numText, numberError, toOptionalNumber } from '../components/forms/Fields';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ContextHelp } from '../components/academy/ContextHelp';
import { PageHeader } from '../components/ui/PageHeader';
import { Segmented } from '../components/ui/Segmented';
import { TERPENES, matchTerpene, terpeneLabel } from '../lib/catalog/terpenes';
import { fmtDate } from '../lib/dates';
import { getOne, newId, writeBatch } from '../lib/db/database';
import { createRecord, deleteLabReport, updateRecord } from '../lib/db/repo';
import type { ConcentrationUnit, LabDocument, LabReport, LabValueOrigin } from '../lib/db/types';
import { fmt } from '../lib/format';
import { LAB_ORIGIN_LABEL, type TotalResult, plausibilityIssues, toPercent, totalCbd, totalThc } from '../lib/lab';
import { formatBytes, processImage } from '../lib/media/images';
import { SharePicker } from '../components/collab/ShareDialog';
import { t } from '../i18n';

const tooltipStyle = { background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 };
const MAX_DOC = 20 * 1024 * 1024;

function OriginBadge({ origin }: { origin: LabValueOrigin }) {
  return <Chip tone={origin === 'document' ? 'green' : origin === 'manual' ? 'sky' : 'amber'}>{LAB_ORIGIN_LABEL[origin]}</Chip>;
}

const CANNABINOIDS = [
  { key: 'thc', label: 'Δ9-THC', color: '#5fe39a' },
  { key: 'thca', label: 'THCA', color: '#34c77b' },
  { key: 'cbd', label: 'CBD', color: '#38bdf8' },
  { key: 'cbda', label: 'CBDA', color: '#0ea5e9' },
  { key: 'cbg', label: 'CBG', color: '#c084fc' },
  { key: 'cbn', label: 'CBN', color: '#fbbf24' },
] as const;
type CKey = (typeof CANNABINOIDS)[number]['key'];

function ReportForm({ report, defaultStrain, onClose }: { report?: LabReport; defaultStrain?: string; onClose: () => void }) {
  const { data } = useData();
  const toast = useToast();
  const formId = useId();
  const [title, setTitle] = useState(report?.title ?? '');
  const [strainId, setStrainId] = useState(report?.strainId ?? defaultStrain ?? '');
  const [labName, setLabName] = useState(report?.labName ?? '');
  const [batchId, setBatchId] = useState(report?.batchId ?? '');
  const [testDate, setTestDate] = useState(report?.testDate ?? '');
  const [sampleType, setSampleType] = useState(report?.sampleType ?? sampleLabel('Blüte'));
  const [unit, setUnit] = useState<ConcentrationUnit>(report?.unit ?? '%');
  const [origin, setOrigin] = useState<LabValueOrigin>(report?.origin ?? 'manual');
  const [vals, setVals] = useState<Record<CKey, string>>({
    thc: numText(report?.thc),
    thca: numText(report?.thca),
    cbd: numText(report?.cbd),
    cbda: numText(report?.cbda),
    cbg: numText(report?.cbg),
    cbn: numText(report?.cbn),
  });
  const [declThc, setDeclThc] = useState(numText(report?.declaredTotalThc));
  const [declCbd, setDeclCbd] = useState(numText(report?.declaredTotalCbd));
  const [terps, setTerps] = useState<{ name: string; value: string }[]>((report?.terpenes ?? []).map((tv) => ({ name: tv.name, value: numText(tv.value) })));
  const [notes, setNotes] = useState(report?.notes ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [removeDoc, setRemoveDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const max = unit === '%' ? 100 : 1000;
  const hasDoc = (!!report?.documentId && !removeDoc) || !!file;
  const errs = [
    ...Object.values(vals).map((v) => numberError(v, { min: 0, max })),
    numberError(declThc, { min: 0, max }),
    numberError(declCbd, { min: 0, max }),
    ...terps.map((tv) => (tv.name.trim() ? numberError(tv.value, { min: 0, max, required: true }) : undefined)),
  ].filter(Boolean);
  const titleErr = submitted && !title.trim() ? t('lab.li.titleMissing') : undefined;
  const docErr = submitted && origin === 'document' && !hasDoc ? t('lab.li.docRequired') : undefined;
  const fileErr = file && file.size > MAX_DOC ? t('lab.li.tooBig') : file && !/^(application\/pdf|image\/)/.test(file.type) ? t('lab.li.onlyPdf') : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!title.trim() || errs.length || fileErr || (origin === 'document' && !hasDoc)) return;
    setSaving(true);
    try {
      let doc: LabDocument | undefined;
      if (file) {
        if (file.type.startsWith('image/')) {
          const img = await processImage(file);
          doc = { id: newId(), data: img.full, mime: img.mime, name: file.name.replace(/\.\w+$/, '.jpg'), size: img.full.byteLength };
        } else {
          const data = await file.arrayBuffer();
          doc = { id: newId(), data, mime: 'application/pdf', name: file.name, size: data.byteLength };
        }
      }
      const prevDoc = report?.documentId;
      const payload = {
        title: title.trim(),
        strainId: strainId || undefined,
        labName: labName.trim() || undefined,
        batchId: batchId.trim() || undefined,
        testDate: testDate || undefined,
        sampleType: sampleType.trim() || undefined,
        unit,
        origin,
        thc: toOptionalNumber(vals.thc),
        thca: toOptionalNumber(vals.thca),
        cbd: toOptionalNumber(vals.cbd),
        cbda: toOptionalNumber(vals.cbda),
        cbg: toOptionalNumber(vals.cbg),
        cbn: toOptionalNumber(vals.cbn),
        declaredTotalThc: toOptionalNumber(declThc),
        declaredTotalCbd: toOptionalNumber(declCbd),
        terpenes: terps.filter((tv) => tv.name.trim() && toOptionalNumber(tv.value) !== undefined).map((tv) => ({ name: tv.name.trim(), value: toOptionalNumber(tv.value)! })),
        notes,
        documentId: doc ? doc.id : removeDoc ? undefined : prevDoc,
        documentName: doc ? doc.name : removeDoc ? undefined : report?.documentName,
        documentMime: doc ? doc.mime : removeDoc ? undefined : report?.documentMime,
      };
      if (doc) await writeBatch({ put: { labDocs: [doc] } });
      if (report) await updateRecord('labReports', report.id, payload);
      else await createRecord('labReports', payload);
      if (prevDoc && (doc || removeDoc)) await writeBatch({ delete: { labDocs: [prevDoc] } });
      toast(t('lab.li.saved'));
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
      title={report ? t('lab.li.edit') : t('lab.li.add')}
      subtitle={t('lab.li.formSub')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form={formId} className="btn-primary" disabled={saving}>
            {saving ? t('lab.li.saving') : t('common.save.button')}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('lab.li.titleLabel')} value={title} onChange={setTitle} required error={titleErr} maxLength={80} placeholder={t('lab.li.titlePh')} autoFocus />
          <SelectField label={t('lab.li.strain')} value={strainId} onChange={setStrainId} placeholder={t('lab.li.noLink')} options={data.strains.map((s) => ({ value: s.id, label: s.name }))} />
          <TextField label={t('lab.li.lab')} value={labName} onChange={setLabName} maxLength={80} />
          <TextField label={t('lab.li.batch')} value={batchId} onChange={setBatchId} maxLength={60} />
          <TextField label={t('lab.li.date')} type="date" value={testDate} onChange={setTestDate} />
          <TextField label={t('lab.li.sampleType')} value={sampleType} onChange={setSampleType} maxLength={40} list="sample-types" />
          <datalist id="sample-types">
            {['Blüte', 'Extrakt', 'Öl', 'Edible', 'Harz'].map((x) => (
              <option key={x} value={sampleLabel(x)} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="label">{t('lab.li.unit')}</span>
            <Segmented value={unit} onChange={setUnit} options={[{ value: '%', label: '% (w/w)' }, { value: 'mg/g', label: 'mg/g' }]} />
            <p className="hint">{t('lab.li.unitHint')}</p>
          </div>
          <SelectField
            label={t('lab.li.origin')}
            value={origin}
            onChange={(v) => setOrigin((v || 'manual') as LabValueOrigin)}
            options={(Object.keys(LAB_ORIGIN_LABEL) as LabValueOrigin[]).map((o) => ({ value: o, label: LAB_ORIGIN_LABEL[o] }))}
            hint={t('lab.li.originHint')}
          />
        </div>
        <fieldset className="space-y-3 rounded-xl border border-white/[0.06] p-4">
          <legend className="px-1 text-[13px] font-medium text-ink-200">{t('lab.li.cann')}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CANNABINOIDS.map((c) => (
              <OptionalNumber key={c.key} label={c.label} unit={unit} text={vals[c.key]} onText={(tv) => setVals((v) => ({ ...v, [c.key]: tv }))} min={0} max={max} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <OptionalNumber label={t('lab.li.totalThc')} unit={unit} text={declThc} onText={setDeclThc} min={0} max={max} hint={t('lab.li.onlyIfStated')} />
            <OptionalNumber label={t('lab.li.totalCbd')} unit={unit} text={declCbd} onText={setDeclCbd} min={0} max={max} />
          </div>
        </fieldset>
        <fieldset className="space-y-2 rounded-xl border border-white/[0.06] p-4">
          <legend className="px-1 text-[13px] font-medium text-ink-200">{t('lab.li.terps')}</legend>
          {terps.map((tv, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <TextField label={i === 0 ? t('lab.li.terp') : ''} aria-label={t('lab.li.terp')} value={tv.name} list="lab-terps" onChange={(v) => setTerps((s) => s.map((x, j) => (j === i ? { ...x, name: v } : x)))} maxLength={40} />
              <TextField
                label={i === 0 ? t('lab.li.valueUnit', { unit }) : ''}
                aria-label={t('lab.li.value')}
                inputMode="decimal"
                value={tv.value}
                onChange={(v) => setTerps((s) => s.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                error={tv.name.trim() ? numberError(tv.value, { min: 0, max, required: true }) : undefined}
              />
              <button type="button" className="btn-ghost mb-0.5 p-2" aria-label={t('lab.li.removeTerp')} onClick={() => setTerps((s) => s.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <datalist id="lab-terps">
            {TERPENES.map((tv) => (
              <option key={tv.id} value={tv.name} />
            ))}
          </datalist>
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setTerps((s) => [...s, { name: '', value: '' }])}>
            <Plus className="size-3.5" /> {t('lab.li.terp')}
          </button>
        </fieldset>
        <div className="space-y-1.5">
          <span className="label">{t('lab.li.doc')}</span>
          {report?.documentId && !removeDoc && !file && (
            <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-[13px]">
              <span className="flex items-center gap-2 truncate text-ink-200">
                <FileText className="size-4 text-ink-400" /> {report.documentName}
              </span>
              <button type="button" className="text-xs text-rose-300 hover:underline" onClick={() => setRemoveDoc(true)}>
                {t('lab.li.remove')}
              </button>
            </div>
          )}
          <input type="file" accept="application/pdf,image/*" className="input-base py-1.5 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.06] file:px-2.5 file:py-1 file:text-ink-100" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {(fileErr || docErr) && <p className="text-xs text-rose-300">{fileErr ?? docErr}</p>}
          <p className="hint">{t('lab.li.docNote')}</p>
        </div>
        <TextArea label={t('lab.li.notes')} value={notes} onChange={setNotes} rows={2} />
      </form>
    </Modal>
  );
}

function TotalCard({ label, tv, unit }: { label: string; tv: TotalResult; unit: ConcentrationUnit }) {
  const basisText = {
    get computed() { return t('lab.li.computed'); },
    'neutral-only': t('lab.li.neutralOnly'),
    'acid-only': t('lab.li.acidOnly'),
    'declared-only': t('lab.li.declaredOnly'),
    get missing() { return t('lab.li.missing'); },
  }[tv.basis];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular text-ink-50">{tv.computed !== undefined ? `${fmt(tv.computed)} ${unit}` : tv.declared !== undefined ? `${fmt(tv.declared)} ${unit}` : '–'}</div>
      <div className="mt-1 text-[11px] leading-snug text-ink-500">{basisText}</div>
      {tv.declared !== undefined && tv.computed !== undefined && (
        <div className="mt-2 text-[11px] text-ink-400">
          Im Bericht ausgewiesen: <span className="font-mono text-ink-200">{fmt(tv.declared)} {unit}</span>
          {tv.difference !== undefined && Math.abs(tv.difference) > 0.05 && <span className="text-amber-300"> (Abweichung {fmt(tv.difference)})</span>}
        </div>
      )}
    </div>
  );
}

function DocViewer({ report }: { report: LabReport }) {
  const [url, setUrl] = useState<string>();
  const [doc, setDoc] = useState<LabDocument>();
  useEffect(() => {
    let u: string | undefined;
    if (!report.documentId) return;
    getOne('labDocs', report.documentId).then((d) => {
      if (!d) return;
      setDoc(d);
      u = URL.createObjectURL(new Blob([d.data], { type: d.mime }));
      setUrl(u);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [report.documentId]);
  if (!report.documentId) return <p className="hint">{t('lab.li.noDoc')}</p>;
  if (!url || !doc) return <div className="h-40 animate-pulse rounded-xl bg-ink-800" />;
  return (
    <div className="space-y-2">
      {doc.mime === 'application/pdf' ? (
        <iframe src={url} title={doc.name} className="h-[60vh] w-full rounded-xl border border-white/[0.06] bg-white" />
      ) : (
        <img src={url} alt={doc.name} className="w-full rounded-xl border border-white/[0.06]" />
      )}
      <div className="flex items-center justify-between text-[12px] text-ink-400">
        <span className="truncate">
          {doc.name} · {formatBytes(doc.size)}
        </span>
        <a href={url} download={doc.name} className="text-leaf-300 hover:underline">
          {t('lab.li.download')}
        </a>
      </div>
    </div>
  );
}

function ReportDetail({ report, onEdit }: { report: LabReport; onEdit: () => void }) {
  const { data } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const route = useRoute();
  const strain = report.strainId ? data.strains.find((s) => s.id === report.strainId) : undefined;
  const thc = totalThc(report);
  const cbd = totalCbd(report);
  const cannabinoids = CANNABINOIDS.map((c) => ({ ...c, value: report[c.key] })).filter((c) => c.value !== undefined);
  const missing = CANNABINOIDS.filter((c) => report[c.key] === undefined).map((c) => c.label);
  const terps = [...report.terpenes].sort((a, b) => b.value - a.value);
  const issues = plausibilityIssues(report);

  async function remove() {
    if (!(await confirm({ get title() { return t('lab.li.deleteTitle'); }, message: t('lab.li.deleteMsg', { title: report.title }), confirmLabel: t('common.delete'), tone: 'danger' }))) return;
    try {
      await deleteLabReport(report.id);
      setQuery(route, { report: undefined });
      toast(t('lab.li.deleted'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <OriginBadge origin={report.origin} />
              {report.sampleType && <Chip>{sampleLabel(report.sampleType)}</Chip>}
              <Chip>{t('lab.li.unitChip', { unit: report.unit })}</Chip>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-ink-50">{report.title}</h2>
            <p className="mt-1 text-[13px] text-ink-400">
              {[report.labName, report.batchId && t('lab.li.batchN', { id: report.batchId }), report.testDate && fmtDate(report.testDate)].filter(Boolean).join(' · ') || t('lab.li.noLabInfo')}
            </p>
            {strain && (
              <a href={href(`strains/${strain.id}`)} className="mt-1 inline-block text-[13px] text-leaf-300 hover:underline">
                Sorte: {strain.name}
              </a>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onEdit}>
              <Pencil className="size-4" /> {t('common.edit')}
            </button>
            <button type="button" className="btn-ghost text-rose-300" onClick={remove} aria-label={t('common.delete')}>
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        {report.origin !== 'document' && (
          <div className="mt-4">
            <Callout tone={report.origin === 'unverified' ? 'warn' : 'info'}>
              {report.origin === 'unverified' ? t('lab.li.unverified') : t('lab.li.manual')}
            </Callout>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TotalCard label={t('lab.li.gesTHC')} tv={thc} unit={report.unit} />
        <TotalCard label={t('lab.li.gesCBD')} tv={cbd} unit={report.unit} />
      </div>
      {issues.map((i) => (
        <Callout key={i} tone="warn">
          {i}
        </Callout>
      ))}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t('lab.li.cannTitle')} subtitle={t('lab.li.reportedIn', { unit: report.unit })}>
          {cannabinoids.length === 0 ? (
            <p className="hint">{t('lab.li.noCann')}</p>
          ) : (
            <div className="h-56" role="img" aria-label={t('lab.li.cannValues')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cannabinoids} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} unit={` ${report.unit}`} width={76} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)} ${report.unit}`, t('lab.li.value')]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                    {cannabinoids.map((c) => (
                      <Cell key={c.key} fill={c.color} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {missing.length > 0 && <p className="hint mt-2">{t('lab.li.notReported', { list: missing.join(', ') })}</p>}
        </Card>
        <Card title={t('lab.li.terpTitle')} subtitle={terps.length ? t('lab.li.sum', { v: fmt(toPercent(terps.reduce((s, tv) => s + tv.value, 0), report.unit)!) }) : undefined}>
          {terps.length === 0 ? (
            <p className="hint">{t('lab.li.noTerps')}</p>
          ) : (
            <div className="h-56" role="img" aria-label={t('lab.li.terpValues')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={terps.map((tv) => ({ name: terpeneLabel(tv.name), value: tv.value, color: matchTerpene(tv.name)?.color ?? '#8c9a95' }))} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} unit={` ${report.unit}`} />
                  <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)} ${report.unit}`, t('lab.li.value')]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                    {terps.map((tv) => (
                      <Cell key={tv.name} fill={matchTerpene(tv.name)?.color ?? '#8c9a95'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
      <Card title={t('lab.li.original')} icon={<Paperclip className="size-4" />}>
        <DocViewer report={report} />
      </Card>
      {report.notes && (
        <Card title={t('lab.li.notes')}>
          <p className="whitespace-pre-wrap text-[13px] text-ink-300">{report.notes}</p>
        </Card>
      )}
    </div>
  );
}

export function LabInsights() {
  const { data } = useData();
  const route = useRoute();
  const selectedId = route.query.get('report') ?? undefined;
  const strainParam = route.query.get('strain') ?? undefined;
  const [form, setForm] = useState<{ report?: LabReport } | null>(strainParam || route.query.get('neu') === '1' ? {} : null);
  const reports = useMemo(() => [...data.labReports].sort((a, b) => (b.testDate ?? b.createdAt).localeCompare(a.testDate ?? a.createdAt)), [data.labReports]);
  const selected = reports.find((r) => r.id === selectedId) ?? (selectedId ? undefined : reports[0]);
  const strainName = (id?: string) => data.strains.find((s) => s.id === id)?.name;

  return (
    <div>
      <PageHeader
        title={t('lab.li.pageTitle')}
        subtitle={t('lab.li.pageSub')}
        actions={
          <>
            <ContextHelp ids={['laborberichte-lesen', 'terpene-analytik', 'thc-cbd']} />
            <SharePicker store="labReports" items={reports.map((r) => ({ id: r.id, title: r.title, sub: [r.labName, r.testDate].filter(Boolean).join(' · ') }))} label={t('lab.li.share')} />
            <button type="button" className="btn-primary" onClick={() => setForm({})}>
              <Plus className="size-4" /> {t('lab.li.addShort')}
            </button>
          </>
        }
      />
      {reports.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FlaskRound />}
            title={t('lab.li.emptyTitle')}
            text={t('lab.li.emptyText')}
            action={
              <button type="button" className="btn-primary" onClick={() => setForm({})}>
                <Plus className="size-4" /> {t('lab.li.first')}
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-2">
            {reports.map((r) => {
              const tv = totalThc(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setQuery(route, { report: r.id })}
                  aria-current={selected?.id === r.id}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${selected?.id === r.id ? 'border-leaf-500/30 bg-leaf-500/[0.05]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
                >
                  <div className="truncate text-[13px] font-medium text-ink-100">{r.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-500">{[strainName(r.strainId), r.testDate && fmtDate(r.testDate)].filter(Boolean).join(' · ') || '—'}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono text-[12px] text-ink-300">{tv.computed !== undefined ? `THC ${fmt(tv.computed)} ${r.unit}` : tv.declared !== undefined ? `THC ${fmt(tv.declared)} ${r.unit}` : 'THC –'}</span>
                    {r.documentId && <Paperclip className="size-3.5 text-ink-500" aria-label={t('lab.li.withDoc')} />}
                  </div>
                </button>
              );
            })}
            <div className="flex gap-2 rounded-xl border border-white/[0.05] p-3 text-[11px] leading-relaxed text-ink-500">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {t('lab.li.formulaNote')}
            </div>
          </aside>
          <div className="min-w-0">{selected ? <ReportDetail key={selected.id} report={selected} onEdit={() => setForm({ report: selected })} /> : <EmptyState title={t('lab.li.notFound')} />}</div>
        </div>
      )}
      {form && (
        <ReportForm
          report={form.report}
          defaultStrain={strainParam}
          onClose={() => {
            setForm(null);
            if (strainParam) setQuery(route, { strain: undefined });
          }}
        />
      )}
    </div>
  );
}
