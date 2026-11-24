import { FileText, FlaskRound, Info, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
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
  const [sampleType, setSampleType] = useState(report?.sampleType ?? 'Blüte');
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
  const [terps, setTerps] = useState<{ name: string; value: string }[]>((report?.terpenes ?? []).map((t) => ({ name: t.name, value: numText(t.value) })));
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
    ...terps.map((t) => (t.name.trim() ? numberError(t.value, { min: 0, max, required: true }) : undefined)),
  ].filter(Boolean);
  const titleErr = submitted && !title.trim() ? 'Bitte einen Titel eingeben.' : undefined;
  const docErr = submitted && origin === 'document' && !hasDoc ? 'Für „Aus Laborbericht übertragen“ bitte das Originaldokument anhängen – oder Herkunft ändern.' : undefined;
  const fileErr = file && file.size > MAX_DOC ? 'Datei ist größer als 20 MB.' : file && !/^(application\/pdf|image\/)/.test(file.type) ? 'Nur PDF oder Bilddateien.' : undefined;

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
        terpenes: terps.filter((t) => t.name.trim() && toOptionalNumber(t.value) !== undefined).map((t) => ({ name: t.name.trim(), value: toOptionalNumber(t.value)! })),
        notes,
        documentId: doc ? doc.id : removeDoc ? undefined : prevDoc,
        documentName: doc ? doc.name : removeDoc ? undefined : report?.documentName,
        documentMime: doc ? doc.mime : removeDoc ? undefined : report?.documentMime,
      };
      if (doc) await writeBatch({ put: { labDocs: [doc] } });
      if (report) await updateRecord('labReports', report.id, payload);
      else await createRecord('labReports', payload);
      if (prevDoc && (doc || removeDoc)) await writeBatch({ delete: { labDocs: [prevDoc] } });
      toast('Laborbericht gespeichert');
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
      title={report ? 'Laborbericht bearbeiten' : 'Laborbericht erfassen'}
      subtitle="Werte werden so gespeichert, wie du sie einträgst – TERPGRID zertifiziert nichts."
      size="lg"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form={formId} className="btn-primary" disabled={saving}>
            {saving ? 'Speichern …' : 'Speichern'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Titel" value={title} onChange={setTitle} required error={titleErr} maxLength={80} placeholder="z. B. COA Gelato Charge 0425" autoFocus />
          <SelectField label="Sorte (Meine Sorten)" value={strainId} onChange={setStrainId} placeholder="Keine Verknüpfung" options={data.strains.map((s) => ({ value: s.id, label: s.name }))} />
          <TextField label="Labor" value={labName} onChange={setLabName} maxLength={80} />
          <TextField label="Chargen-/Probenkennung" value={batchId} onChange={setBatchId} maxLength={60} />
          <TextField label="Untersuchungsdatum" type="date" value={testDate} onChange={setTestDate} />
          <TextField label="Probenart" value={sampleType} onChange={setSampleType} maxLength={40} list="sample-types" />
          <datalist id="sample-types">
            {['Blüte', 'Extrakt', 'Öl', 'Edible', 'Harz'].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="label">Einheit der Werte</span>
            <Segmented value={unit} onChange={setUnit} options={[{ value: '%', label: '% (w/w)' }, { value: 'mg/g', label: 'mg/g' }]} />
            <p className="hint">1 % = 10 mg/g</p>
          </div>
          <SelectField
            label="Herkunft der Werte"
            value={origin}
            onChange={(v) => setOrigin((v || 'manual') as LabValueOrigin)}
            options={(Object.keys(LAB_ORIGIN_LABEL) as LabValueOrigin[]).map((o) => ({ value: o, label: LAB_ORIGIN_LABEL[o] }))}
            hint="„Aus Laborbericht übertragen“ setzt ein angehängtes Originaldokument voraus."
          />
        </div>
        <fieldset className="space-y-3 rounded-xl border border-white/[0.06] p-4">
          <legend className="px-1 text-[13px] font-medium text-ink-200">Cannabinoide (leer = nicht berichtet)</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CANNABINOIDS.map((c) => (
              <OptionalNumber key={c.key} label={c.label} unit={unit} text={vals[c.key]} onText={(t) => setVals((v) => ({ ...v, [c.key]: t }))} min={0} max={max} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <OptionalNumber label="Gesamt-THC laut Bericht" unit={unit} text={declThc} onText={setDeclThc} min={0} max={max} hint="Nur übernehmen, wenn ausgewiesen." />
            <OptionalNumber label="Gesamt-CBD laut Bericht" unit={unit} text={declCbd} onText={setDeclCbd} min={0} max={max} />
          </div>
        </fieldset>
        <fieldset className="space-y-2 rounded-xl border border-white/[0.06] p-4">
          <legend className="px-1 text-[13px] font-medium text-ink-200">Terpene (nur gemessene Werte)</legend>
          {terps.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <TextField label={i === 0 ? 'Terpen' : ''} aria-label="Terpen" value={t.name} list="lab-terps" onChange={(v) => setTerps((s) => s.map((x, j) => (j === i ? { ...x, name: v } : x)))} maxLength={40} />
              <TextField
                label={i === 0 ? `Wert (${unit})` : ''}
                aria-label="Wert"
                inputMode="decimal"
                value={t.value}
                onChange={(v) => setTerps((s) => s.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                error={t.name.trim() ? numberError(t.value, { min: 0, max, required: true }) : undefined}
              />
              <button type="button" className="btn-ghost mb-0.5 p-2" aria-label="Terpen entfernen" onClick={() => setTerps((s) => s.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <datalist id="lab-terps">
            {TERPENES.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setTerps((s) => [...s, { name: '', value: '' }])}>
            <Plus className="size-3.5" /> Terpen
          </button>
        </fieldset>
        <div className="space-y-1.5">
          <span className="label">Originaldokument (PDF oder Bild, lokal gespeichert)</span>
          {report?.documentId && !removeDoc && !file && (
            <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-[13px]">
              <span className="flex items-center gap-2 truncate text-ink-200">
                <FileText className="size-4 text-ink-400" /> {report.documentName}
              </span>
              <button type="button" className="text-xs text-rose-300 hover:underline" onClick={() => setRemoveDoc(true)}>
                Entfernen
              </button>
            </div>
          )}
          <input type="file" accept="application/pdf,image/*" className="input-base py-1.5 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.06] file:px-2.5 file:py-1 file:text-ink-100" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {(fileErr || docErr) && <p className="text-xs text-rose-300">{fileErr ?? docErr}</p>}
          <p className="hint">Wird nicht automatisch ausgelesen. Bilder werden verkleinert und ohne Metadaten gespeichert; PDFs unverändert (inkl. eventueller Dokument-Metadaten).</p>
        </div>
        <TextArea label="Notizen" value={notes} onChange={setNotes} rows={2} />
      </form>
    </Modal>
  );
}

function TotalCard({ label, t, unit }: { label: string; t: TotalResult; unit: ConcentrationUnit }) {
  const basisText = {
    computed: 'berechnet: neutral + 0,877 × Säureform',
    'neutral-only': 'nur neutrale Form angegeben – Säureform fehlt, Wert ist eine Untergrenze',
    'acid-only': 'nur Säureform angegeben: 0,877 × Säureform',
    'declared-only': 'nur der im Bericht ausgewiesene Wert',
    missing: 'keine Ergebnisse angegeben',
  }[t.basis];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular text-ink-50">{t.computed !== undefined ? `${fmt(t.computed)} ${unit}` : t.declared !== undefined ? `${fmt(t.declared)} ${unit}` : '–'}</div>
      <div className="mt-1 text-[11px] leading-snug text-ink-500">{basisText}</div>
      {t.declared !== undefined && t.computed !== undefined && (
        <div className="mt-2 text-[11px] text-ink-400">
          Im Bericht ausgewiesen: <span className="font-mono text-ink-200">{fmt(t.declared)} {unit}</span>
          {t.difference !== undefined && Math.abs(t.difference) > 0.05 && <span className="text-amber-300"> (Abweichung {fmt(t.difference)})</span>}
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
  if (!report.documentId) return <p className="hint">Kein Originaldokument angehängt.</p>;
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
          Herunterladen
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
    if (!(await confirm({ title: 'Laborbericht löschen?', message: `„${report.title}“ inkl. angehängtem Dokument löschen?`, confirmLabel: 'Löschen', tone: 'danger' }))) return;
    try {
      await deleteLabReport(report.id);
      setQuery(route, { report: undefined });
      toast('Laborbericht gelöscht');
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
              {report.sampleType && <Chip>{report.sampleType}</Chip>}
              <Chip>Einheit: {report.unit}</Chip>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-ink-50">{report.title}</h2>
            <p className="mt-1 text-[13px] text-ink-400">
              {[report.labName, report.batchId && `Charge ${report.batchId}`, report.testDate && fmtDate(report.testDate)].filter(Boolean).join(' · ') || 'Keine Angaben zu Labor und Charge'}
            </p>
            {strain && (
              <a href={href(`strains/${strain.id}`)} className="mt-1 inline-block text-[13px] text-leaf-300 hover:underline">
                Sorte: {strain.name}
              </a>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onEdit}>
              <Pencil className="size-4" /> Bearbeiten
            </button>
            <button type="button" className="btn-ghost text-rose-300" onClick={remove} aria-label="Löschen">
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        {report.origin !== 'document' && (
          <div className="mt-4">
            <Callout tone={report.origin === 'unverified' ? 'warn' : 'info'}>
              {report.origin === 'unverified' ? 'Unbestätigte Angabe – nicht durch ein Labordokument belegt.' : 'Manuell eingetragen – ohne angehängtes Originaldokument.'}
            </Callout>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TotalCard label="Gesamt-THC" t={thc} unit={report.unit} />
        <TotalCard label="Gesamt-CBD" t={cbd} unit={report.unit} />
      </div>
      {issues.map((i) => (
        <Callout key={i} tone="warn">
          {i}
        </Callout>
      ))}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Cannabinoide" subtitle={`Berichtete Werte in ${report.unit}`}>
          {cannabinoids.length === 0 ? (
            <p className="hint">Keine Cannabinoid-Ergebnisse.</p>
          ) : (
            <div className="h-56" role="img" aria-label="Cannabinoidwerte">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cannabinoids} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} unit={` ${report.unit}`} width={58} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)} ${report.unit}`, 'Wert']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                    {cannabinoids.map((c) => (
                      <Cell key={c.key} fill={c.color} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {missing.length > 0 && <p className="hint mt-2">Nicht berichtet: {missing.join(', ')}</p>}
        </Card>
        <Card title="Terpene" subtitle={terps.length ? `Summe ${fmt(toPercent(terps.reduce((s, t) => s + t.value, 0), report.unit)!)} %` : undefined}>
          {terps.length === 0 ? (
            <p className="hint">Keine Terpenwerte erfasst.</p>
          ) : (
            <div className="h-56" role="img" aria-label="Terpenwerte">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={terps.map((t) => ({ name: terpeneLabel(t.name), value: t.value, color: matchTerpene(t.name)?.color ?? '#8c9a95' }))} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} unit={` ${report.unit}`} />
                  <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)} ${report.unit}`, 'Wert']} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                    {terps.map((t) => (
                      <Cell key={t.name} fill={matchTerpene(t.name)?.color ?? '#8c9a95'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
      <Card title="Originaldokument" icon={<Paperclip className="size-4" />}>
        <DocViewer report={report} />
      </Card>
      {report.notes && (
        <Card title="Notizen">
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
  const [form, setForm] = useState<{ report?: LabReport } | null>(strainParam ? {} : null);
  const reports = useMemo(() => [...data.labReports].sort((a, b) => (b.testDate ?? b.createdAt).localeCompare(a.testDate ?? a.createdAt)), [data.labReports]);
  const selected = reports.find((r) => r.id === selectedId) ?? (selectedId ? undefined : reports[0]);
  const strainName = (id?: string) => data.strains.find((s) => s.id === id)?.name;

  return (
    <div>
      <PageHeader
        title="Lab Insights"
        subtitle="Eigene Laboranalysen dokumentieren und verstehen – Originaldokumente bleiben lokal."
        actions={
          <>
            <ContextHelp ids={['laborberichte-lesen', 'terpene-analytik', 'thc-cbd']} />
            <button type="button" className="btn-primary" onClick={() => setForm({})}>
              <Plus className="size-4" /> Bericht erfassen
            </button>
          </>
        }
      />
      {reports.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FlaskRound />}
            title="Noch keine Laborberichte"
            text="Werte aus einem Analysezertifikat (COA) eintragen und das Dokument lokal anhängen. Gesamt-THC/-CBD werden nur mit passender Formel berechnet; selbst eingetragene Werte werden nie als „zertifiziert“ dargestellt."
            action={
              <button type="button" className="btn-primary" onClick={() => setForm({})}>
                <Plus className="size-4" /> Ersten Bericht erfassen
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-2">
            {reports.map((r) => {
              const t = totalThc(r);
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
                    <span className="font-mono text-[12px] text-ink-300">{t.computed !== undefined ? `THC ${fmt(t.computed)} ${r.unit}` : t.declared !== undefined ? `THC ${fmt(t.declared)} ${r.unit}` : 'THC –'}</span>
                    {r.documentId && <Paperclip className="size-3.5 text-ink-500" aria-label="mit Dokument" />}
                  </div>
                </button>
              );
            })}
            <div className="flex gap-2 rounded-xl border border-white/[0.05] p-3 text-[11px] leading-relaxed text-ink-500">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Gesamt-THC = THC + 0,877 × THCA · Gesamt-CBD = CBD + 0,877 × CBDA (Molmassenverhältnisse).
            </div>
          </aside>
          <div className="min-w-0">{selected ? <ReportDetail key={selected.id} report={selected} onEdit={() => setForm({ report: selected })} /> : <EmptyState title="Bericht nicht gefunden" />}</div>
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
