import { AlertTriangle, CheckCircle2, CloudOff, HardDrive, Loader2, LogOut, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type LastAccount, pendingChanges, useAuth } from './auth';
import { useConfirm } from './Confirm';
import { href } from './router';
import { legacyDismissed, legacyExists, readImportMark } from '../lib/sync/legacy';

/** Kompakter Sync-Status. „Synchronisiert“ nur, wenn der Server alles bestätigt hat. */
export function SyncPill({ compact = false }: { compact?: boolean }) {
  const { sync, state } = useAuth();
  if (state.kind !== 'authenticated') return null;
  let icon = <CheckCircle2 className="size-3.5 text-leaf-400" />;
  let text = 'Synchronisiert';
  let tone = 'text-ink-300';
  if (state.offline) {
    icon = <CloudOff className="size-3.5 text-amber-300" />;
    text = 'Offline';
    tone = 'text-amber-200';
  } else if (sync.conflicts > 0) {
    icon = <AlertTriangle className="size-3.5 text-amber-300" />;
    text = `${sync.conflicts} Konflikt${sync.conflicts === 1 ? '' : 'e'}`;
    tone = 'text-amber-200';
  } else if (sync.phase === 'syncing') {
    icon = <Loader2 className="size-3.5 animate-spin text-leaf-300" />;
    text = 'Synchronisiere …';
  } else if (sync.phase === 'offline' || sync.phase === 'error') {
    icon = <CloudOff className="size-3.5 text-amber-300" />;
    text = sync.pending ? `${sync.pending} ausstehend` : 'Nicht verbunden';
    tone = 'text-amber-200';
  } else if (sync.pending > 0) {
    icon = <RefreshCw className="size-3.5 text-amber-300" />;
    text = `${sync.pending} ausstehend`;
  }
  return (
    <a href={href('account/sync')} className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11px] font-medium hover:border-white/[0.14] ${tone}`} title="Synchronisation">
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
        <span>Lokalmodus: Daten nur auf diesem Gerät · keine Synchronisation · Online-Sortendaten von externen Quellen</span>
      </div>
    );
  if (state.kind !== 'authenticated') return null;
  const u = state.user;
  return (
    <div className="space-y-3 border-t border-white/[0.05] px-4 py-4">
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
        <button type="button" className="btn-ghost p-1.5" aria-label="Abmelden" title="Abmelden" onClick={() => void logoutFlow(auth.logout, confirm)}>
          <LogOut className="size-4" />
        </button>
      </div>
      <SyncPill />
      <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-ink-500">
        <ShieldCheck className="mt-0.5 size-3 shrink-0 text-leaf-500" /> Self-hosted · Private Daten geschützt · Online-Sortendaten über deinen Server
      </p>
    </div>
  );
}

export async function logoutFlow(logout: (o?: { wipeLocal?: boolean }) => Promise<void>, confirm: ReturnType<typeof useConfirm>) {
  const pending = await pendingChanges();
  if (pending > 0) {
    const ok = await confirm({
      title: 'Nicht synchronisierte Änderungen',
      message: `${pending} Änderung${pending === 1 ? ' wurde' : 'en wurden'} noch nicht vom Server bestätigt. Sie bleiben auf diesem Gerät gespeichert und werden beim nächsten Anmelden mit diesem Konto übertragen. Trotzdem abmelden?`,
      confirmLabel: 'Trotzdem abmelden',
      tone: 'danger',
    });
    if (!ok) return;
    return logout();
  }
  const wipe = await confirm({
    title: 'Abmelden',
    message: 'Soll die lokale Kopie deiner Daten auf diesem Gerät gelöscht werden? Empfohlen auf gemeinsam genutzten Geräten. Deine Daten bleiben auf dem Server erhalten.',
    confirmLabel: 'Abmelden und lokale Kopie löschen',
  });
  return logout({ wipeLocal: wipe });
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
      <span>In diesem Browser liegen noch Daten aus der bisherigen lokalen Version. Du kannst sie geprüft in dein Konto übernehmen.</span>
      <a href={href('account/import')} className="btn-primary shrink-0">
        Ansehen und übernehmen
      </a>
    </div>
  );
}
