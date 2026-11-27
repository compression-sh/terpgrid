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
import { intlLocale } from '../i18n';

const STORE_LABEL: Record<RecordStore, string> = {
  grows: 'Grows',
  plants: 'Pflanzen',
  activities: 'Einträge',
  photos: 'Fotos',
  reminders: 'Erinnerungen',
  strains: 'Sorten',
  journal: 'Journal',
  inventory: 'Sammlung',
  expenses: 'Ausgaben',
  calculations: 'Berechnungen',
  labReports: 'Laborberichte',
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
  const t = today();

  const refreshEstimate = () => storageEstimate().then(setEstimate);
  useEffect(() => {
    refreshEstimate();
  }, [data]);

  const photoBytes = data.photos.reduce((s, p) => s + p.size, 0);
  const counts = (Object.keys(STORE_LABEL) as RecordStore[]).map((k) => ({ k, n: data[k].length }));
  const lastBackupDays = settings.lastBackupAt ? daysBetween(today(new Date(settings.lastBackupAt)), t) : undefined;

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
      download(bytes, `terpgrid-backup-${t}${includePhotos ? '' : '-ohne-fotos'}.zip`, 'application/zip');
      await updateSettings({ lastBackupAt: manifest.exportedAt });
      toast(`Backup erstellt (${formatBytes(bytes.byteLength)})`);
    });

  async function onFile(file: File) {
    await run('parse', async () => {
      if (file.size > 2 * 1024 * 1024 * 1024) throw new Error('Datei ist zu groß.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      setParsed({ backup: parseBackupZip(bytes), fileName: file.name });
    });
  }

  async function doRestore() {
    if (!parsed) return;
    const ok = await confirm({
      title: mode === 'replace' ? 'Alle Daten ersetzen?' : 'Backup zusammenführen?',
      message:
        mode === 'replace'
          ? 'ALLE aktuellen TERPGRID-Daten auf diesem Gerät werden gelöscht und durch das Backup ersetzt. Dies kann nicht rückgängig gemacht werden. Tipp: vorher ein aktuelles Backup erstellen.'
          : 'Datensätze aus dem Backup werden ergänzt. Datensätze mit gleicher ID werden durch die Version aus dem Backup überschrieben.',
      confirmLabel: mode === 'replace' ? 'Ersetzen' : 'Importieren',
      tone: mode === 'replace' ? 'danger' : 'default',
    });
    if (!ok) return;
    await run('restore', async () => {
      if (mode === 'replace') data.photos.forEach((p) => forgetPhoto(p.id));
      const n = await restoreBackup(parsed.backup, mode);
      const total = Object.values(n).reduce((s, x) => s + x, 0);
      toast(`${total} Datensätze importiert`);
      setParsed(null);
    });
  }

  async function doDeleteAll() {
    await run('delete', async () => {
      data.photos.forEach((p) => forgetPhoto(p.id));
      await deleteAllLocalData();
      setDeleteOpen(false);
      setDeleteText('');
      toast('Alle lokalen Daten wurden gelöscht');
    });
  }

  const usagePct = estimate.usage !== undefined && estimate.quota ? Math.min(100, (estimate.usage / estimate.quota) * 100) : undefined;

  return (
    <div>
      <PageHeader
        title="Daten & Backup"
        subtitle={server ? 'Deine Daten liegen auf deinem Server und als Arbeitskopie in diesem Browser. Hier sicherst, überträgst und löschst du sie.' : 'Alles liegt lokal in diesem Browser. Hier sicherst, überträgst und löschst du deine Daten.'}
      />

      {!server && (lastBackupDays === undefined || lastBackupDays > 30) && data.grows.length + data.photos.length + data.journal.length > 0 && (
        <div className="mb-5">
          <Callout tone="warn" title={lastBackupDays === undefined ? 'Noch kein Backup erstellt' : `Letztes Backup vor ${lastBackupDays} Tagen`}>
            Browser-Daten können verloren gehen (Browserdaten löschen, Speicherplatzmangel, Geräteverlust). Ein Backup als ZIP-Datei schützt deine Einträge und Fotos.
          </Callout>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Speicher" subtitle="Belegung durch TERPGRID in diesem Browser" icon={<HardDrive className="size-4" />}>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <dt className="text-[11px] text-ink-500">Belegt (gesamt, laut Browser)</dt>
              <dd className="font-mono text-lg tabular text-ink-50">{formatBytes(estimate.usage)}</dd>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <dt className="text-[11px] text-ink-500">Fotos (Bilddaten)</dt>
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
                <ShieldCheck className="size-4" /> Dauerhafte Speicherung aktiv
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-ghost py-1.5 text-xs"
                  onClick={async () => {
                    const ok = await requestPersistentStorage();
                    toast(ok ? 'Browser gewährt dauerhafte Speicherung' : 'Der Browser hat die Anfrage abgelehnt oder unterstützt sie nicht', { tone: ok ? 'ok' : 'info' });
                    refreshEstimate();
                  }}
                >
                  <ShieldCheck className="size-3.5" /> Dauerhafte Speicherung anfragen
                </button>
                <span className="hint">Verringert das Risiko, dass der Browser Daten bei Platzmangel löscht – keine Garantie.</span>
              </>
            )}
          </div>
        </Card>

        <Card title="Backup exportieren" subtitle="ZIP mit versioniertem Manifest und Fotos" icon={<Archive className="size-4" />}>
          <p className="text-[13px] leading-relaxed text-ink-300">
            Enthält alle Grows, Pflanzen, Einträge, Fotos, Sorten, Journal, Sammlung, Ausgaben, Erinnerungen, gespeicherte Berechnungen und Einstellungen – inklusive aller
            Verknüpfungen.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!!busy} onClick={() => fullBackup(true)}>
              {busy === 'backup' ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />} Vollständiges Backup
            </button>
            <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => fullBackup(false)}>
              Ohne Fotos
            </button>
          </div>
          <p className="hint mt-3">{settings.lastBackupAt ? `Letztes Backup: ${fmtDateTime(nowLocal(new Date(settings.lastBackupAt)))}` : 'Noch kein Backup erstellt.'}</p>
          <Callout tone="info">Die Datei ist nicht verschlüsselt. Bewahre sie an einem sicheren Ort auf. TERPGRID bietet keine Synchronisation zwischen Geräten – übertrage Daten per Backup-Datei.</Callout>
        </Card>

        <Card title="Backup importieren" subtitle="Wird vor dem Schreiben vollständig geprüft" icon={<Upload className="size-4" />}>
          <p className="text-[13px] text-ink-300">TERPGRID-Backup (.zip) auswählen. Format, Version, Datensätze und Verknüpfungen werden geprüft, bevor etwas geändert wird.</p>
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

        <Card title="Einzelne Exporte" subtitle="Für Auswertungen oder Archiv" icon={<FileJson className="size-4" />}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost"
              disabled={!!busy}
              onClick={() => run('json', async () => download(await exportStructuredJson(), `terpgrid-daten-${t}.json`, 'application/json'))}
            >
              <FileJson className="size-4" /> Strukturierte Daten (JSON)
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!!busy || data.photos.length === 0}
              onClick={() =>
                run('photos', async () => {
                  const bytes = await exportPhotosZip();
                  download(bytes, `terpgrid-fotos-${t}.zip`, 'application/zip');
                  toast(`${data.photos.length} Fotos exportiert`);
                })
              }
            >
              {busy === 'photos' ? <Loader2 className="size-4 animate-spin" /> : <Images className="size-4" />} Alle Fotos (ZIP)
            </button>
          </div>
          <p className="hint mt-3">JSON enthält alle Datensätze ohne Bilder. Der Foto-Export benennt Dateien nach Aufnahmedatum, Grow und Pflanze.</p>
        </Card>

        <div className="lg:col-span-2">
          <Card title={server ? 'Alle Daten dieses Kontos löschen' : 'Alle lokalen Daten löschen'} icon={<ShieldAlert className="size-4" />} className="border-rose-400/15">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-[13px] leading-relaxed text-ink-300">
                {server && <strong className="text-rose-200">Im Servermodus werden die Löschungen synchronisiert – die Daten verschwinden auch vom Server und von deinen anderen Geräten. </strong>}
                Entfernt sämtliche TERPGRID-Daten {server ? 'dieses Kontos' : 'aus diesem Browser'}: Grows, Pflanzen, Fotos, Sorten, Journal, Sammlung, Kalender, Berechnungen, Einstellungen sowie die alten
                THC-Rechner-Eingaben. Dies kann nicht rückgängig gemacht werden.
              </p>
              <button type="button" className="btn shrink-0 border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" /> Alles löschen …
              </button>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-5 flex gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3 text-xs leading-relaxed text-ink-400">
        <Database className="mt-0.5 size-4 shrink-0 text-leaf-400" />
        {server ? (
          <span>
            Datenspeicherung: Auf deinem TERPGRID-Server (verschlüsselt, AES-256-GCM – der Betreiber könnte technisch entschlüsseln) und als Arbeitskopie in IndexedDB dieses Browsers
            (unverschlüsselt, je Konto getrennt). Eingaben des THC Lab bleiben in localStorage dieses Geräts. Discover-Anfragen laufen über deinen Server; die Anbieter erhalten keine
            persönlichen Daten. Ein vollständiger Export ist unter Konto → Daten möglich.
          </span>
        ) : (
          <span>
            Datenspeicherung: IndexedDB (Datensätze & Fotos) und localStorage (Eingaben des THC Lab). Daten sind an diesen Browser auf diesem Gerät gebunden, werden nicht
            synchronisiert, nicht verschlüsselt gespeichert und nie an einen Server gesendet. Ausnahme sind Suchanfragen im Bereich Discover: Sie gehen an die externen Sortendaten-Anbieter; zwischengespeicherte Antworten liegen lokal und sind nicht Teil des Backups.
          </span>
        )}
      </div>

      {parsed && (
        <Modal
          open
          onClose={() => setParsed(null)}
          title="Backup prüfen"
          subtitle={parsed.fileName}
          size="md"
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setParsed(null)}>
                Abbrechen
              </button>
              <button type="button" className={mode === 'replace' ? 'btn bg-rose-500/90 text-white hover:bg-rose-500' : 'btn-primary'} disabled={parsed.backup.errors.length > 0 || !!busy} onClick={doRestore}>
                {busy === 'restore' && <Loader2 className="size-4 animate-spin" />}
                {mode === 'replace' ? 'Daten ersetzen' : 'Importieren'}
              </button>
            </>
          }
        >
          {parsed.backup.errors.length > 0 ? (
            <Callout tone="danger" title="Import nicht möglich">
              <ul className="list-disc pl-4">
                {parsed.backup.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-300">
                Erstellt: {parsed.backup.manifest.exportedAt ? fmtDateTime(nowLocal(new Date(parsed.backup.manifest.exportedAt))) : 'unbekannt'} · Format {parsed.backup.manifest.format} · Schema{' '}
                {parsed.backup.manifest.schemaVersion}
              </p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-white/[0.06] p-3 text-xs">
                {(Object.keys(STORE_LABEL) as RecordStore[]).map((k) => (
                  <li key={k} className="flex justify-between text-ink-400">
                    <span>{STORE_LABEL[k]}</span>
                    <span className="font-mono text-ink-100">{parsed.backup.manifest.counts[k]}</span>
                  </li>
                ))}
                <li className="flex justify-between text-ink-400">
                  <span>Bilddateien</span>
                  <span className="font-mono text-ink-100">{parsed.backup.photoData.size}</span>
                </li>
              </ul>
              {parsed.backup.issues.length > 0 ? (
                <Callout tone="warn" title={`${parsed.backup.issues.length} Hinweise`}>
                  <ul className="max-h-32 list-disc overflow-y-auto pl-4">
                    {parsed.backup.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  <p className="mt-1">Verwaiste Verknüpfungen werden beim Import automatisch gelöst bzw. unvollständige Datensätze übersprungen.</p>
                </Callout>
              ) : (
                <Callout tone="ok">Struktur und Verknüpfungen sind konsistent.</Callout>
              )}
              <div className="space-y-1.5">
                <span className="label">Importmodus</span>
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'merge', label: 'Zusammenführen' },
                    { value: 'replace', label: 'Alles ersetzen' },
                  ]}
                />
                <p className="hint">{mode === 'merge' ? 'Bestehende Daten bleiben erhalten; gleiche Datensätze werden aktualisiert.' : 'Alle aktuellen Daten werden gelöscht und durch das Backup ersetzt.'}</p>
              </div>
            </div>
          )}
        </Modal>
      )}

      {deleteOpen && (
        <Modal
          open
          onClose={() => setDeleteOpen(false)}
          title="Wirklich alle Daten löschen?"
          size="sm"
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setDeleteOpen(false)}>
                Abbrechen
              </button>
              <button type="button" className="btn bg-rose-500/90 text-white hover:bg-rose-500" disabled={deleteText.trim().toUpperCase() !== 'LÖSCHEN' || !!busy} onClick={doDeleteAll}>
                Endgültig löschen
              </button>
            </>
          }
        >
          <div className="space-y-3 text-[13px] text-ink-300">
            <p>
              Es werden {data.grows.length} Grows, {data.plants.length} Pflanzen, {data.photos.length} Fotos und alle weiteren Daten unwiderruflich gelöscht.
            </p>
            <label className="block space-y-1.5">
              <span className="label">
                Zur Bestätigung <span className="font-mono text-rose-200">LÖSCHEN</span> eingeben
              </span>
              <input className="input-base" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
