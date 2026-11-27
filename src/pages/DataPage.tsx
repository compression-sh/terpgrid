import { useIsServerMode } from '../app/auth';
import { Archive, Database, FileJson, HardDrive, Images, Loader2, ShieldAlert, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '../app/Confirm';
import { useData } from '../app/DataProvider';
import { errorText, useToast } from '../app/Toasts';
import { forgetPhoto } from '../components/photos/usePhotoUrl';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Segmented } from '../components/ui/Segmented';
import {
  type ParsedBackup,
  type RecordStore,
  type RestoreMode,
  createFullBackup,
  deleteAllLocalData,
  exportPhotosZip,
  exportStructuredJson,
  parseBackupZip,
  restoreBackup,
} from '../lib/backup';
import { daysBetween, fmtDateTime, nowLocal, today } from '../lib/dates';
import { requestPersistentStorage, storageEstimate } from '../lib/db/database';
import { formatBytes } from '../lib/media/images';
import { t, intlLocale } from '../i18n';

const STORE_LABEL: Record<RecordStore, string> = {
  get grows() { return t('data.store.grows'); },
  get plants() { return t('data.store.plants'); },
  get activities() { return t('data.store.activities'); },
  get photos() { return t('data.store.photos'); },
  get reminders() { return t('data.store.reminders'); },
  get strains() { return t('data.store.strains'); },
  get journal() { return t('data.store.journal'); },
  get inventory() { return t('data.store.inventory'); },
  get expenses() { return t('data.store.expenses'); },
  get calculations() { return t('data.store.calculations'); },
  get labReports() { return t('data.store.labReports'); },
};

function download(bytes: Uint8Array | string, name: string, mime: string) {
  const blob = new Blob([typeof bytes === 'string' ? bytes : (bytes as BlobPart)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function DataPage() {
  const server = useIsServerMode();
  const { data, settings, updateSettings } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ backup: ParsedBackup; fileName: string } | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const todayStr = today();

  const refreshEstimate = () => storageEstimate().then(setEstimate);
  useEffect(() => {
    refreshEstimate();
  }, [data]);

  const photoBytes = data.photos.reduce((s, p) => s + p.size, 0);
  const counts = (Object.keys(STORE_LABEL) as RecordStore[]).map((k) => ({ k, n: data[k].length }));
  const lastBackupDays = settings.lastBackupAt ? daysBetween(today(new Date(settings.lastBackupAt)), todayStr) : undefined;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const fullBackup = (includePhotos: boolean) =>
    run(includePhotos ? 'backup' : 'backup-nophotos', async () => {
      const { bytes, manifest } = await createFullBackup({ includePhotos });
      download(bytes, `terpgrid-backup-${todayStr}${includePhotos ? '' : t('data.noPhotosSuffix')}.zip`, 'application/zip');
      await updateSettings({ lastBackupAt: manifest.exportedAt });
      toast(t('data.created', { size: formatBytes(bytes.byteLength) }));
    });

  async function onFile(file: File) {
    await run('parse', async () => {
      if (file.size > 2 * 1024 * 1024 * 1024) throw new Error(t('data.tooBig'));
      const bytes = new Uint8Array(await file.arrayBuffer());
      setParsed({ backup: parseBackupZip(bytes), fileName: file.name });
    });
  }

  async function doRestore() {
    if (!parsed) return;
    const ok = await confirm({
      title: mode === 'replace' ? t('data.replaceTitle') : t('data.mergeTitle'),
      message:
        mode === 'replace'
          ? t('data.replaceMsg')
          : t('data.mergeMsg'),
      confirmLabel: mode === 'replace' ? t('data.replace') : t('data.import'),
      tone: mode === 'replace' ? 'danger' : 'default',
    });
    if (!ok) return;
    await run('restore', async () => {
      if (mode === 'replace') data.photos.forEach((p) => forgetPhoto(p.id));
      const n = await restoreBackup(parsed.backup, mode);
      const total = Object.values(n).reduce((s, x) => s + x, 0);
      toast(t('data.imported', { count: total }));
      setParsed(null);
    });
  }

  async function doDeleteAll() {
    await run('delete', async () => {
      data.photos.forEach((p) => forgetPhoto(p.id));
      await deleteAllLocalData();
      setDeleteOpen(false);
      setDeleteText('');
      toast(t('data.deletedAll'));
    });
  }

  const usagePct = estimate.usage !== undefined && estimate.quota ? Math.min(100, (estimate.usage / estimate.quota) * 100) : undefined;

  return (
    <div>
      <PageHeader
        title={t('data.title')}
        subtitle={server ? t('data.subServer') : t('data.subLocal')}
      />

      {!server && (lastBackupDays === undefined || lastBackupDays > 30) && data.grows.length + data.photos.length + data.journal.length > 0 && (
        <div className="mb-5">
          <Callout tone="warn" title={lastBackupDays === undefined ? t('data.noBackup') : t('data.lastDays', { count: lastBackupDays })}>
            {t('data.risk')}
          </Callout>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t('data.storage')} subtitle={t('data.storageSub')} icon={<HardDrive className="size-4" />}>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <dt className="text-[11px] text-ink-500">{t('data.used')}</dt>
              <dd className="font-mono text-lg tabular text-ink-50">{formatBytes(estimate.usage)}</dd>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <dt className="text-[11px] text-ink-500">{t('data.photoBytes')}</dt>
              <dd className="font-mono text-lg tabular text-ink-50">{formatBytes(photoBytes)}</dd>
            </div>
          </dl>
          {usagePct !== undefined && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full bg-leaf-500" style={{ width: `${Math.max(1, usagePct)}%` }} />
              </div>
              <p className="hint mt-1">
                {usagePct.toLocaleString(intlLocale(), { maximumFractionDigits: 2 })} % des vom Browser gemeldeten Kontingents ({formatBytes(estimate.quota)}). Der Wert ist eine Schätzung des Browsers.
              </p>
            </div>
          )}
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            {counts.map(({ k, n }) => (
              <li key={k} className="flex justify-between text-ink-400">
                <span>{STORE_LABEL[k]}</span>
                <span className="font-mono text-ink-200">{n}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-4">
            {estimate.persisted ? (
              <span className="flex items-center gap-1.5 text-xs text-leaf-300">
                <ShieldCheck className="size-4" /> {t('data.persistOn')}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-ghost py-1.5 text-xs"
                  onClick={async () => {
                    const ok = await requestPersistentStorage();
                    toast(ok ? t('data.persistGranted') : t('data.persistDenied'), { tone: ok ? 'ok' : 'info' });
                    refreshEstimate();
                  }}
                >
                  <ShieldCheck className="size-3.5" /> {t('data.persistAsk')}
                </button>
                <span className="hint">{t('data.persistHint')}</span>
              </>
            )}
          </div>
        </Card>

        <Card title={t('data.export')} subtitle={t('data.exportSub')} icon={<Archive className="size-4" />}>
          <p className="text-[13px] leading-relaxed text-ink-300">
            {t('data.contains')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!!busy} onClick={() => fullBackup(true)}>
              {busy === 'backup' ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />} Vollständiges Backup
            </button>
            <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => fullBackup(false)}>
              {t('data.noPhotos')}
            </button>
          </div>
          <p className="hint mt-3">{settings.lastBackupAt ? t('data.last', { date: fmtDateTime(nowLocal(new Date(settings.lastBackupAt))) }) : t('data.noBackupDot')}</p>
          <Callout tone="info">{t('data.unencrypted')}</Callout>
        </Card>

        <Card title={t('data.importTitle')} subtitle={t('data.importSub')} icon={<Upload className="size-4" />}>
          <p className="text-[13px] text-ink-300">{t('data.importHint')}</p>
          <button type="button" className="btn-ghost mt-4" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy === 'parse' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Backup-Datei wählen
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onFile(f);
            }}
          />
        </Card>

        <Card title={t('data.single')} subtitle={t('data.singleSub')} icon={<FileJson className="size-4" />}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost"
              disabled={!!busy}
              onClick={() => run('json', async () => download(await exportStructuredJson(), `terpgrid-daten-${todayStr}.json`, 'application/json'))}
            >
              <FileJson className="size-4" /> {t('data.json')}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!!busy || data.photos.length === 0}
              onClick={() =>
                run('photos', async () => {
                  const bytes = await exportPhotosZip();
                  download(bytes, `terpgrid-fotos-${todayStr}.zip`, 'application/zip');
                  toast(t('data.photosExported', { count: data.photos.length }));
                })
              }
            >
              {busy === 'photos' ? <Loader2 className="size-4 animate-spin" /> : <Images className="size-4" />} Alle Fotos (ZIP)
            </button>
          </div>
          <p className="hint mt-3">{t('data.singleHint')}</p>
        </Card>

        <div className="lg:col-span-2">
          <Card title={server ? t('data.deleteAccount') : t('data.deleteLocal')} icon={<ShieldAlert className="size-4" />} className="border-rose-400/15">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-[13px] leading-relaxed text-ink-300">
                {server && <strong className="text-rose-200">{t('data.serverSync')} </strong>}
                {server ? t('data.removesAccount') : t('data.removesLocal')}
              </p>
              <button type="button" className="btn shrink-0 border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" /> {t('data.deleteAll')}
              </button>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-5 flex gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3 text-xs leading-relaxed text-ink-400">
        <Database className="mt-0.5 size-4 shrink-0 text-leaf-400" />
        {server ? (
          <span>
            {t('data.storageServer')}
          </span>
        ) : (
          <span>
            {t('data.storageLocal')}
          </span>
        )}
      </div>

      {parsed && (
        <Modal
          open
          onClose={() => setParsed(null)}
          title={t('data.check')}
          subtitle={parsed.fileName}
          size="md"
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setParsed(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className={mode === 'replace' ? 'btn bg-rose-500/90 text-white hover:bg-rose-500' : 'btn-primary'} disabled={parsed.backup.errors.length > 0 || !!busy} onClick={doRestore}>
                {busy === 'restore' && <Loader2 className="size-4 animate-spin" />}
                {mode === 'replace' ? t('data.replaceData') : t('data.import')}
              </button>
            </>
          }
        >
          {parsed.backup.errors.length > 0 ? (
            <Callout tone="danger" title={t('data.impossible')}>
              <ul className="list-disc pl-4">
                {parsed.backup.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-300">
                {t('data.manifest', { date: parsed.backup.manifest.exportedAt ? fmtDateTime(nowLocal(new Date(parsed.backup.manifest.exportedAt))) : t('data.unknown'), format: parsed.backup.manifest.format, schema: parsed.backup.manifest.schemaVersion })}
              </p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-white/[0.06] p-3 text-xs">
                {(Object.keys(STORE_LABEL) as RecordStore[]).map((k) => (
                  <li key={k} className="flex justify-between text-ink-400">
                    <span>{STORE_LABEL[k]}</span>
                    <span className="font-mono text-ink-100">{parsed.backup.manifest.counts[k]}</span>
                  </li>
                ))}
                <li className="flex justify-between text-ink-400">
                  <span>{t('data.images')}</span>
                  <span className="font-mono text-ink-100">{parsed.backup.photoData.size}</span>
                </li>
              </ul>
              {parsed.backup.issues.length > 0 ? (
                <Callout tone="warn" title={t('data.issues', { count: parsed.backup.issues.length })}>
                  <ul className="max-h-32 list-disc overflow-y-auto pl-4">
                    {parsed.backup.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  <p className="mt-1">{t('data.orphans')}</p>
                </Callout>
              ) : (
                <Callout tone="ok">{t('data.consistent')}</Callout>
              )}
              <div className="space-y-1.5">
                <span className="label">{t('data.mode')}</span>
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'merge', label: t('data.merge') },
                    { value: 'replace', label: t('data.replaceAll') },
                  ]}
                />
                <p className="hint">{mode === 'merge' ? t('data.mergeHint') : t('data.replaceHint')}</p>
              </div>
            </div>
          )}
        </Modal>
      )}

      {deleteOpen && (
        <Modal
          open
          onClose={() => setDeleteOpen(false)}
          title={t('data.really')}
          size="sm"
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setDeleteOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn bg-rose-500/90 text-white hover:bg-rose-500" disabled={deleteText.trim().toUpperCase() !== t('data.word') || !!busy} onClick={doDeleteAll}>
                {t('data.final')}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-[13px] text-ink-300">
            <p>
              {t('data.willDelete', { g: data.grows.length, p: data.plants.length, f: data.photos.length })}
            </p>
            <label className="block space-y-1.5">
              <span className="label">
                {t('data.typeA')} <span className="font-mono text-rose-200">{t('data.word')}</span> {t('data.typeB')}
              </span>
              <input className="input-base" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
