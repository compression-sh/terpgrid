import { LanguageMenu } from './locale';
import { AlertTriangle, CheckCircle2, CloudOff, HardDrive, Loader2, LogOut, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type LastAccount, pendingChanges, useAuth } from './auth';
import { useConfirm } from './Confirm';
import { href } from './router';
import { isSharedDevice } from '../lib/device';
import { pendingSpaceOps } from '../lib/offline';
import { deriveSyncState, syncStateText } from '../lib/sync/status';
import { legacyDismissed, legacyExists, readImportMark } from '../lib/sync/legacy';
import { t } from '../i18n';

/** Kompakter Sync-Status. „Synchronisiert“ nur, wenn der Server alles bestätigt hat. */
export function SyncPill({ compact = false }: { compact?: boolean }) {
  const { sync, state } = useAuth();
  if (state.kind !== 'authenticated') return null;
  const input = { ...sync, offline: state.offline };
  const st = deriveSyncState(input);
  const text = syncStateText(input);
  const icon =
    st === 'offline' ? <CloudOff className="size-3.5 text-amber-300" />
    : st === 'conflict' ? <AlertTriangle className="size-3.5 text-amber-300" />
    : st === 'syncing' ? <Loader2 className="size-3.5 animate-spin text-leaf-300" />
    : st === 'failed' ? <AlertTriangle className="size-3.5 text-rose-300" />
    : st === 'pending' ? <RefreshCw className="size-3.5 text-amber-300" />
    : <CheckCircle2 className="size-3.5 text-leaf-400" />;
  const tone = st === 'offline' || st === 'conflict' ? 'text-amber-200' : st === 'failed' ? 'text-rose-200' : 'text-ink-300';
  return (
    <a href={href('account/sync')} className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11px] font-medium hover:border-white/[0.14] ${tone}`} title={t('shell.sync.title')}>
      {icon}
      {!compact && <span>{text}</span>}
      {compact && <span className="sr-only">{text}</span>}
    </a>
  );
}

/** Fußbereich der Seitenleiste: Modus, Konto, Abmelden. */
export function AccountFooter() {
  const auth = useAuth();
  const confirm = useConfirm();
  const { state } = auth;
  if (state.kind === 'local')
    return (
      <div className="flex items-start gap-2 border-t border-white/[0.05] px-5 py-4 text-[11px] leading-snug text-ink-500">
        <HardDrive className="mt-0.5 size-3 shrink-0 text-amber-400" />
        <span className="min-w-0 flex-1">{t('shell.localModeFooter')}</span>
        <LanguageMenu />
      </div>
    );
  if (state.kind !== 'authenticated') return null;
  const u = state.user;
  return (
    <div className="space-y-2 border-t border-white/[0.05] px-3 py-3">
      <div className="flex items-center gap-2.5">
        <a href={href('account')} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-white/[0.03]">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf-500/15 text-leaf-300">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-ink-100">{u.displayName || u.loginName}</span>
            {u.displayName && <span className="block truncate font-mono text-[10.5px] text-ink-500">{u.loginName}</span>}
          </span>
        </a>
        <button type="button" className="btn-ghost p-1.5" aria-label={t('shell.palette.logout')} title={t('shell.palette.logout')} onClick={() => void logoutFlow(auth, confirm)}>
          <LogOut className="size-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <SyncPill />
        <LanguageMenu />
      </div>
    </div>
  );
}

export async function logoutFlow(auth: Pick<ReturnType<typeof useAuth>, 'logout' | 'offlineEnabled' | 'state'>, confirm: ReturnType<typeof useConfirm>) {
  const key = auth.state.kind === 'authenticated' ? auth.state.user.accountKey : null;
  const pending = (await pendingChanges()) + (key ? pendingSpaceOps(key) : 0);
  const shared = isSharedDevice();
  if (pending > 0) {
    const ok = await confirm({
      title: t('shell.logout.pendingTitle'),
      message: shared
        ? t('shell.logout.pendingShared', { count: pending })
        : t('shell.logout.pendingKeep', { count: pending }),
      confirmLabel: shared ? t('shell.logout.deleteAndSignOut') : t('shell.logout.anyway'),
      tone: 'danger',
    });
    if (!ok) return;
    return auth.logout({ wipeLocal: shared });
  }
  // Ohne Offline-Freigabe (oder auf geteilten Geräten) wird die lokale Kopie automatisch gelöscht
  if (shared || !auth.offlineEnabled) return auth.logout({ wipeLocal: true });
  const wipe = await confirm({
    title: t('shell.palette.logout'),
    message: t('shell.logout.offlineText'),
    confirmLabel: t('shell.logout.deleteCopy'),
    cancelLabel: t('shell.logout.keepCopy'),
  });
  return auth.logout({ wipeLocal: wipe });
}

/** Hinweis auf Daten aus der bisherigen Einzelnutzer-Version in diesem Browser. */
export function LegacyBanner({ account }: { account: LastAccount | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (legacyDismissed()) return;
    const mark = readImportMark();
    if (mark?.verified && mark.accountKey === account?.accountKey) return;
    void legacyExists().then(setShow);
  }, [account?.accountKey]);
  if (!show) return null;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-leaf-500/20 bg-leaf-500/[0.06] p-4 text-[13px] text-leaf-100 sm:flex-row sm:items-center sm:justify-between">
      <span>{t('shell.legacy.text')}</span>
      <a href={href('account/import')} className="btn-primary shrink-0">
        {t('shell.legacy.action')}
      </a>
    </div>
  );
}

/** Dezenter Hinweis auf der Übersicht: 2FA noch nicht aktiv (ausblendbar). */
export function SecurityNudge() {
  const { state } = useAuth();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('terpgrid.nudge.totp') === '1';
    } catch {
      return false;
    }
  });
  if (state.kind !== 'authenticated' || state.offline || state.user.totpEnabled || hidden) return null;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[13px] text-ink-300 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-leaf-400" /> {t('shell.nudge.text')}
      </span>
      <span className="flex shrink-0 gap-2">
        <a href={href('account')} className="btn-primary py-1.5">
          {t('shell.nudge.action')}
        </a>
        <button
          type="button"
          className="btn-ghost py-1.5"
          onClick={() => {
            try {
              localStorage.setItem('terpgrid.nudge.totp', '1');
            } catch {
              /* ignorieren */
            }
            setHidden(true);
          }}
        >
          {t('shell.later')}
        </button>
      </span>
    </div>
  );
}
