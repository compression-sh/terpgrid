import { ArrowRight, CheckCircle2, Database, Download, HardDriveDownload, Loader2, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useConfirm } from '../../app/Confirm';
import { href } from '../../app/router';
import { useToast } from '../../app/Toasts';
import { Callout } from '../../components/ui/Callout';
import { PageHeader } from '../../components/ui/PageHeader';
import { SYNC_STORE_LABEL } from '../../lib/sync/labels';
import { type ImportReport, type LegacySnapshot, deleteLegacy, dismissLegacy, importLegacy, legacyBackupZip, legacyExists, readImportMark, readLegacy } from '../../lib/sync/legacy';
import { t, intlLocale } from '../../i18n';

type Step = 'loading' | 'none' | 'preview' | 'running' | 'done';

function save(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ImportPage() {
  const { state } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const user = state.kind === 'authenticated' ? state.user : null;
  const [step, setStep] = useState<Step>('loading');
  const [snap, setSnap] = useState<LegacySnapshot | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [report, setReport] = useState<ImportReport | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [error, setError] = useState<string>();
  const mark = readImportMark();
  const offline = state.kind === 'authenticated' && state.offline;

  useEffect(() => {
    (async () => {
      if (!(await legacyExists())) return setStep('none');
      try {
        const s = await readLegacy();
        setSnap(s);
        setStep(s.total === 0 ? 'none' : 'preview');
      } catch (e) {
        setError((e as Error).message);
        setStep('none');
      }
    })();
  }, []);

  if (!user) return null;
  const who = user.displayName ? `${user.displayName} (${user.loginName})` : user.loginName;

  const run = async () => {
    if (!snap) return;
    const ok = await confirm({
      title: t('account.im.confirmTitle'),
      message: (
        <>
          {t('account.im.confirmA')} <strong className="text-ink-50">{who}</strong> {t('account.im.confirmB')}
        </>
      ),
      confirmLabel: t('account.im.confirm'),
    });
    if (!ok) return;
    setStep('running');
    setError(undefined);
    try {
      const r = await importLegacy(snap, { accountKey: user.accountKey, loginName: user.loginName }, (done, total, label) => setProgress({ done, total, label }));
      setReport(r);
      setStep('done');
    } catch (e) {
      setError(t('account.im.partial', { msg: (e as Error).message }));
      setStep('preview');
    }
  };

  const cleanup = async () => {
    const ok = await confirm({
      title: t('account.im.deleteTitle'),
      message: t('account.im.deleteMsg'),
      confirmLabel: t('account.im.deleteFinal'),
      tone: 'danger',
    });
    if (!ok) return;
    await deleteLegacy();
    toast(t('account.im.deleted'), { tone: 'ok' });
    setStep('none');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('account.im.title')} subtitle={t('account.im.subtitle')} crumbs={[{ label: t('account.im.account'), to: 'account' }, { label: t('account.im.crumb') }]} />

      {error && <Callout tone="danger">{error}</Callout>}

      {step === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-ink-400">
          <Loader2 className="size-4 animate-spin" /> {t('account.im.searching')}
        </div>
      )}

      {step === 'none' && (
        <Callout tone="ok" title={t('account.im.none')}>
          In diesem Browser gibt es keine Daten aus der bisherigen Einzelnutzer-Version (mehr). <a className="underline" href={href('')}>{t('account.im.toOverview')}</a>
        </Callout>
      )}

      {(step === 'preview' || step === 'running') && snap && (
        <>
          {mark && (
            <Callout tone={mark.accountKey === user.accountKey ? 'info' : 'warn'} title={t('account.im.already')}>
              {t('account.im.doneA', { date: new Date(mark.at).toLocaleString(intlLocale()) })} <strong>{mark.loginName}</strong> {t('account.im.doneB')}
              {mark.accountKey === user.accountKey ? t('account.im.same') : t('account.im.other')}
            </Callout>
          )}
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink-50">
              <Database className="size-4 text-leaf-400" /> {t('account.im.found')}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {Object.entries(snap.counts)
                .filter(([, n]) => n > 0)
                .map(([s, n]) => (
                  <div key={s} className="flex items-baseline justify-between gap-2 border-b border-white/[0.04] pb-1.5">
                    <dt className="text-[13px] text-ink-400">{SYNC_STORE_LABEL[s] ?? s}</dt>
                    <dd className="tabular font-medium text-ink-100">{n}</dd>
                  </div>
                ))}
              <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.04] pb-1.5">
                <dt className="text-[13px] text-ink-400">{t('account.im.photoFiles')}</dt>
                <dd className="tabular font-medium text-ink-100">{snap.photoData.length}</dd>
              </div>
              {snap.labDocs.length > 0 && (
                <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.04] pb-1.5">
                  <dt className="text-[13px] text-ink-400">{t('account.im.labDocs')}</dt>
                  <dd className="tabular font-medium text-ink-100">{snap.labDocs.length}</dd>
                </div>
              )}
            </dl>
            {snap.issues.length > 0 && (
              <div className="mt-4">
                <Callout tone="warn" title={t('account.im.linkHints')}>
                  <ul className="list-disc pl-4">
                    {snap.issues.slice(0, 6).map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  Die Daten werden unverändert übernommen; bestehende Verknüpfungen bleiben über gleiche IDs erhalten.
                </Callout>
              </div>
            )}
          </div>

          <div className="card space-y-4 p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[12px] text-ink-300">1</span>
              <div className="flex-1">
                <div className="font-medium text-ink-100">{t('account.im.backup')}</div>
                <p className="mt-0.5 text-[13px] text-ink-400">{t('account.im.backupHint')}</p>
                <button
                  type="button"
                  className="btn-ghost mt-2"
                  onClick={() => {
                    save(legacyBackupZip(snap), `terpgrid-lokal-vor-uebernahme-${new Date().toISOString().slice(0, 10)}.zip`);
                    setBackedUp(true);
                  }}
                >
                  {backedUp ? <CheckCircle2 className="size-4 text-leaf-300" /> : <Download className="size-4" />} {t('account.im.saveBackup')}
                </button>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[12px] text-ink-300">2</span>
              <div className="flex-1">
                <div className="font-medium text-ink-100">{t('account.im.target')}</div>
                <p className="mt-1 inline-flex items-center gap-2 rounded-lg border border-leaf-500/25 bg-leaf-500/[0.07] px-3 py-1.5 text-[13px] text-leaf-100">
                  <UserRound className="size-4" /> {who}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-[12px] text-ink-300">3</span>
              <div className="flex-1">
                <div className="font-medium text-ink-100">{t('account.im.transfer')}</div>
                {step === 'running' ? (
                  <div className="mt-2 space-y-1.5" role="status" aria-live="polite">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full bg-leaf-400 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                    </div>
                    <div className="text-[12px] text-ink-400">
                      {progress.label} · {progress.done} / {progress.total}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" onClick={run} disabled={offline}>
                      <HardDriveDownload className="size-4" /> {t('account.im.toMine')} <ArrowRight className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        dismissLegacy();
                        location.hash = '#/';
                      }}
                    >
                      {t('account.im.later')}
                    </button>
                  </div>
                )}
                {offline && <p className="mt-2 text-[12px] text-amber-200">{t('account.im.needServer')}</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {step === 'done' && report && (
        <div className="space-y-4">
          <Callout tone={report.verified ? 'ok' : 'warn'} title={report.verified ? t('account.im.done') : t('account.im.doneHints')}>
            {t('account.im.report', { a: report.created, b: report.unchanged, c: report.files })}
            {report.conflicts > 0 && <> · {t('account.im.conflictsA', { n: report.conflicts })} <a className="underline" href={href('account/sync')}>{t('account.sy.title')}</a>{t('account.im.conflictsB')}</>}
          </Callout>
          {(report.rejected.length > 0 || report.fileErrors.length > 0 || report.mismatches.length > 0) && (
            <div className="card space-y-2 p-4 text-[13px] text-ink-300">
              {[...report.rejected.map((r) => `${SYNC_STORE_LABEL[r.store] ?? r.store} ${r.id}: ${r.error}`), ...report.fileErrors, ...report.mismatches].slice(0, 20).map((msg) => (
                <p key={msg}>• {msg}</p>
              ))}
            </div>
          )}
          <div className="card space-y-3 p-5">
            <div className="flex items-center gap-2 font-medium text-ink-100">
              <ShieldCheck className="size-4 text-leaf-400" /> {t('account.im.cleanup')}
            </div>
            <p className="text-[13px] text-ink-400">
              {t('account.im.cleanupText')}
              {!report.verified && ` ${t('account.im.cleanupLater')}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost text-rose-200" disabled={!report.verified} onClick={cleanup}>
                <Trash2 className="size-4" /> {t('account.im.deleteOld')}
              </button>
              <a className="btn-primary" href={href('')}>
                {t('account.im.toOverview')}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
