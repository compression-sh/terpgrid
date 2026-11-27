import {
  Share2,
  Download,
  Fingerprint,
  HardDrive,
  KeyRound,
  Laptop,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { accountDbName, useAuth } from '../../app/auth';
import { useConfirm } from '../../app/Confirm';
import { useReauth } from '../../app/reauth';
import { href, useRoute } from '../../app/router';
import { logoutFlow } from '../../app/SyncIndicator';
import { useToast } from '../../app/Toasts';
import { Callout } from '../../components/ui/Callout';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { deleteDatabase, storageEstimate, selectDatabase } from '../../lib/db/database';
import { SYNC_STORE_LABEL } from '../../lib/sync/labels';
import { isSharedDevice, setSharedDevice } from '../../lib/device';
import { PrivacyCenter2 } from './PrivacyCenter2';
import { useData } from '../../app/DataProvider';
import { formatBytes } from '../../lib/media/images';
import { ApiError, type ServerUser, api } from '../../lib/server/api';
import { type PasskeyInfo, passkeyErrorText, passkeysSupported, registerPasskey, suggestPasskeyName } from '../../lib/server/passkeys';
import { FormError, PasswordField, PasswordStrength, passwordHints } from '../auth/fields';
import { RecoveryCodesPanel } from '../auth/RecoveryCodes';
import { t, intlLocale } from '../../i18n';

interface Overview {
  createdAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string;
  storageBytes: number;
  quotaBytes: number;
  recoveryCodesRemaining: number;
  sessions: number;
  passkeys: number;
  totpEnabled: boolean;
  securityEvents: { type: string; created_at: string; factor?: string | null }[];
}
interface SessionRow {
  handle: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  authMethod: 'password' | 'totp' | 'passkey' | 'recovery' | 'register' | null;
}

const METHOD_LABEL: Record<string, string> = {
  get password() { return t('account.m.password'); },
  get totp() { return t('account.m.totp'); },
  get passkey() { return t('account.m.passkey'); },
  get recovery() { return t('account.m.recovery'); },
  get register() { return t('account.m.register'); },
};

const EVENT_LABEL: Record<string, string> = {
  'login.success': t('account.ev.login'),
  'login.failure': t('account.ev.loginFail'),
  'password.change': t('account.ev.pw'),
  'recovery.success': t('account.ev.recovery'),
  'recovery.regenerate': t('account.ev.regen'),
  'totp.enable': t('account.ev.totpOn'),
  'totp.disable': t('account.ev.totpOff'),
  'session.revoke': t('account.ev.revoke'),
  'recovery.failure': t('account.ev.recoveryFail'),
  'passkey.add': t('account.ev.pkAdd'),
  'passkey.remove': t('account.ev.pkRemove'),
  get logout() { return t('account.ev.logout'); },
};

const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const errText = (e: unknown) => (e instanceof ApiError ? e.message : t('account.ac.unexpected'));

function describeUa(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { get label() { return t('account.ac.unknownDevice'); }, mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/.test(ua);
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? 'macOS' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: `${browser}${os ? ` · ${os}` : ''}`, mobile };
}

function Section({ id, icon, title, subtitle, children }: { id: string; icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-leaf-500/10 text-leaf-300">{icon}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Sitzungen, die ohne Aufklappen sichtbar sind */
const SESSION_PREVIEW = 5;

export function AccountPage() {
  const auth = useAuth();
  const reauth = useReauth();
  const toast = useToast();
  const confirm = useConfirm();
  const user = auth.state.kind === 'authenticated' ? auth.state.user : null;
  const offline = auth.state.kind === 'authenticated' && auth.state.offline;
  const [ov, setOv] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [allSessions, setAllSessions] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const section = useRoute().query.get('abschnitt');
  useEffect(() => {
    if (section) window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 150);
  }, [section]);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api<Overview>('GET', '/api/account/overview'), api<{ sessions: SessionRow[] }>('GET', '/api/auth/sessions')]);
      setOv(o);
      setSessions(s.sessions);
      setLoadError(undefined);
    } catch (e) {
      setLoadError(errText(e));
    }
  }, []);
  useEffect(() => {
    if (!offline) void load();
  }, [load, offline]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('account.ac.title')} subtitle={t('account.ac.subtitle')} />
      <nav aria-label={t('account.ac.sections')} className="-mt-2 flex flex-wrap gap-1.5 text-[12px]">
        {[
          ['profil', t('account.ac.secProfile')],
          ['sicherheit', t('account.ac.secSecurity')],
          ['passkeys', t('account.ac.secPasskeys')],
          ['sitzungen', t('account.ac.secSessions')],
          ['daten', t('account.ac.secData')],
          ['geraet', t('account.ac.secDevice')],
          ['datenschutz', t('account.ac.secPrivacy')],
          ['zusammenarbeit', t('account.ac.secCollab')],
          ['loeschen', t('account.ac.secDelete')],
          ...(user.role === 'admin' ? [['admin', t('account.ac.secAdmin')]] : []),
        ].map(([id, label]) =>
          id === 'admin' ? (
            <a key={id} href={href('admin')} className="rounded-full border border-leaf-500/25 bg-leaf-500/[0.07] px-2.5 py-1 text-leaf-200">
              {label}
            </a>
          ) : (
            <a key={id} href={`#/account`} onClick={(e) => { e.preventDefault(); document.getElementById(id!)?.scrollIntoView({ behavior: 'smooth' }); }} className="rounded-full border border-white/[0.06] px-2.5 py-1 text-ink-300 hover:text-ink-50">
              {label}
            </a>
          ),
        )}
      </nav>

      {offline && <Callout tone="warn">{t('account.ac.offline')}</Callout>}
      {ov && <SecurityStatus ov={ov} totp={user.totpEnabled} />}
      {loadError && <Callout tone="danger">{loadError}</Callout>}

      <ProfileSection user={user} ov={ov} onSaved={(displayName) => auth.setUser({ displayName })} disabled={offline} />
      <SecuritySection user={user} ov={ov} reload={load} disabled={offline} />
      <PasskeySection disabled={offline} />

      <Section id="sitzungen" icon={<Laptop className="size-4" />} title={t('account.ac.sessions')} subtitle={t('account.ac.sessionsSub')}>
        <ul className="divide-y divide-white/[0.05]">
          {/* 6.0.1: aktuelle und zuletzt aktive Sitzungen zuerst; lange Listen eingeklappt (alle bleiben einsehbar) */}
          {[...sessions]
            .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt))
            .slice(0, allSessions ? undefined : SESSION_PREVIEW)
            .map((s) => {
            const d = describeUa(s.userAgent);
            return (
              <li key={s.handle} className="flex items-center gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-ink-300">{d.mobile ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13.5px] text-ink-100">
                    {d.label}
                    {s.current && <span className="rounded-full bg-leaf-500/15 px-2 py-0.5 text-[10.5px] text-leaf-200">{t('account.ac.secDevice')}</span>}
                  </div>
                  <div className="text-[11.5px] text-ink-500">
                    Angemeldet {dt(s.createdAt)}
                    {s.authMethod ? ` ${METHOD_LABEL[s.authMethod]}` : ''} · {t('account.ac.lastActive', { date: dt(s.lastSeenAt) })}
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                    onClick={async () => {
                      try {
                        await api('DELETE', `/api/auth/sessions/${s.handle}`);
                        toast(t('account.ac.sessionEnded'), { tone: 'ok' });
                        void load();
                      } catch (e) {
                        toast(errText(e), { tone: 'error' });
                      }
                    }}
                  >
                    {t('account.ac.end')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {sessions.length > SESSION_PREVIEW && (
          <button type="button" className="mt-1 text-[12.5px] text-ink-300 underline-offset-2 hover:text-ink-50 hover:underline" aria-expanded={allSessions} onClick={() => setAllSessions((v) => !v)}>
            {allSessions ? t('account.ac.showLess') : t('account.ac.showAll', { n: sessions.length })}
          </button>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={offline || sessions.length < 2}
            onClick={async () => {
              const r = await api<{ revoked: number }>('POST', '/api/auth/sessions/revoke-others').catch((e) => (toast(errText(e), { tone: 'error' }), null));
              if (r) toast(t('account.ac.revoked', { count: r.revoked }), { tone: 'ok' });
              void load();
            }}
          >
            <LogOut className="size-4" /> {t('account.ac.endOthers')}
          </button>
          <button
            type="button"
            className="btn-ghost text-rose-200"
            disabled={offline}
            onClick={async () => {
              const ok = await confirm({
                title: t('account.ac.endAllTitle'),
                message: t('account.ac.endAllMsg'),
                confirmLabel: t('account.ac.endAll'),
                tone: 'danger',
              });
              if (!ok) return;
              const r = await api<{ revoked: number }>('POST', '/api/auth/sessions/revoke-all').catch((e) => (toast(errText(e), { tone: 'error' }), null));
              if (r) await logoutFlow(auth, confirm);
            }}
          >
            <LogOut className="size-4" /> {t('account.ac.endAllIncl')}
          </button>
          <button type="button" className="btn-ghost" onClick={() => void logoutFlow(auth, confirm)}>
            <LogOut className="size-4" /> {t('account.ac.signOutHere')}
          </button>
        </div>
      </Section>

      <Section id="daten" icon={<Download className="size-4" />} title={t('account.ac.data')} subtitle={t('account.ac.dataSub')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            className="btn-ghost justify-start"
            disabled={offline}
            onClick={async () => {
              try {
                const buf = await reauth(() => api<ArrayBuffer>('GET', '/api/account/export', undefined, { binary: true }));
                if (!buf) return;
                const url = URL.createObjectURL(new Blob([buf], { type: 'application/zip' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `terpgrid-export-${new Date().toISOString().slice(0, 10)}.zip`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              } catch (e) {
                toast(errText(e), { tone: 'error' });
              }
            }}
          >
            <Download className="size-4" /> {t('account.ac.exportZip')}
          </button>
          <a className="btn-ghost justify-start" href={href('account/sync')}>
            <RefreshCw className="size-4" /> {t('account.ac.sync')}
          </a>
          <a className="btn-ghost justify-start" href={href('account/import')}>
            <HardDrive className="size-4" /> {t('account.ac.import')}
          </a>
        </div>
        <p className="hint mt-3">{t('account.ac.exportHint')}</p>
        {ov && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[12px] text-ink-400">
              <span>{t('account.ac.storage')}</span>
              <span className="tabular">
                {formatBytes(ov.storageBytes)} von {formatBytes(ov.quotaBytes)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full bg-leaf-400" style={{ width: `${Math.min(100, (ov.storageBytes / ov.quotaBytes) * 100)}%` }} />
            </div>
          </div>
        )}
      </Section>

      <DeviceSection />
      <PrivacyCenter />
      <PrivacyCenter2 disabled={offline} />
      <DeleteSection user={user} disabled={offline} />
    </div>
  );
}

function ProfileSection({ user, ov, onSaved, disabled }: { user: ServerUser; ov: Overview | null; onSaved: (n: string | null) => void; disabled: boolean }) {
  const [name, setName] = useState(user.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Section id="profil" icon={<UserRound className="size-4" />} title={t('account.ac.secProfile')} subtitle={t('account.ac.profileSub')}>
      <dl className="mb-4 grid gap-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-ink-500">{t('account.ac.idLabel', { kind: user.loginKind === 'generated' ? t('account.ac.accountId') : t('account.ac.username') })}</dt>
          <dd className="mt-0.5 select-all font-mono text-ink-100">{user.loginName}</dd>
        </div>
        <div>
          <dt className="text-ink-500">{t('account.ac.created')}</dt>
          <dd className="mt-0.5 text-ink-100">{dt(ov?.createdAt)}</dd>
        </div>
      </dl>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api<{ displayName: string | null }>('PATCH', '/api/account', { displayName: name.trim() || null });
            onSaved(r.displayName);
            toast(t('account.ac.nameSaved'), { tone: 'ok' });
          } catch (err) {
            toast(errText(err), { tone: 'error' });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex-1 space-y-1.5">
          <label className="label" htmlFor="display-name">
            {t('account.ac.displayName')}
          </label>
          <input id="display-name" className="input-base" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} disabled={disabled} />
        </div>
        <button type="submit" className="btn-primary" disabled={busy || disabled || name === (user.displayName ?? '')}>
          {t('common.save.button')}
        </button>
      </form>
    </Section>
  );
}

function SecuritySection({ user, ov, reload, disabled }: { user: ServerUser; ov: Overview | null; reload: () => void; disabled: boolean }) {
  const auth = useAuth();
  const reauth = useReauth();
  const toast = useToast();
  const confirm = useConfirm();
  const [pwOpen, setPwOpen] = useState(false);
  const [totpOpen, setTotpOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <Section id="sicherheit" icon={<ShieldCheck className="size-4" />} title={t('account.ac.secSecurity')} subtitle={t('account.ac.securitySub')}>
      <div className="divide-y divide-white/[0.05]">
        <Row icon={<KeyRound className="size-4" />} title={t('account.ac.password')} text={t('account.ac.changedAt', { date: dt(ov?.passwordChangedAt) })}>
          <button type="button" className="btn-ghost" disabled={disabled} onClick={() => setPwOpen(true)}>
            {t('account.ac.change')}
          </button>
        </Row>
        <Row
          icon={<LockKeyhole className="size-4" />}
          title={t('account.ac.totp')}
          text={user.totpEnabled ? t('account.ac.totpOn') : t('account.ac.totpOff')}
          badge={user.totpEnabled ? <span className="rounded-full bg-leaf-500/15 px-2 py-0.5 text-[10.5px] text-leaf-200">{t('account.ac.active')}</span> : <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10.5px] text-amber-200">{t('account.ac.off')}</span>}
        >
          {user.totpEnabled ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={disabled}
              onClick={async () => {
                const ok = await confirm({ title: t('account.ac.totpDisableTitle'), message: t('account.ac.totpDisableMsg'), confirmLabel: t('account.ac.disable'), tone: 'danger' });
                if (!ok) return;
                try {
                  const r = await reauth(() => api<{ user: ServerUser }>('POST', '/api/auth/totp/disable'));
                  if (r) {
                    auth.setUser({ totpEnabled: false });
                    toast(t('account.ac.totpDisabled'), { tone: 'ok' });
                    reload();
                  }
                } catch (e) {
                  toast(errText(e), { tone: 'error' });
                }
              }}
            >
              {t('account.ac.disable')}
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={disabled} onClick={() => setTotpOpen(true)}>
              {t('account.ac.setup')}
            </button>
          )}
        </Row>
        <Row
          icon={<ShieldAlert className="size-4" />}
          title={t('account.ac.codes')}
          text={ov ? `${t('account.ac.codesLeft', { n: ov.recoveryCodesRemaining })} ${ov.recoveryCodesRemaining <= 3 ? t('account.ac.codesRenew') : ''}` : '…'}
        >
          <button
            type="button"
            className="btn-ghost"
            disabled={disabled}
            onClick={async () => {
              const ok = await confirm({ title: t('account.ac.regenTitle'), message: t('account.ac.regenMsg'), confirmLabel: t('account.ac.regenConfirm') });
              if (!ok) return;
              try {
                const r = await reauth(() => api<{ recoveryCodes: string[] }>('POST', '/api/auth/recovery-codes'));
                if (r) setCodes(r.recoveryCodes);
              } catch (e) {
                toast(errText(e), { tone: 'error' });
              }
            }}
          >
            {t('account.ac.regen')}
          </button>
        </Row>
      </div>

      {ov && ov.securityEvents.length > 0 && (
        <details className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3">
          <summary className="cursor-pointer text-[13px] text-ink-300">{t('account.ac.events')}</summary>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            {ov.securityEvents.map((e, i) => (
              <li key={`${e.created_at}-${i}`} className={`flex justify-between gap-3 ${e.type === 'login.failure' ? 'text-amber-200' : 'text-ink-300'}`}>
                <span>
                  {EVENT_LABEL[e.type] ?? e.type}
                  {e.factor === 'passkey' ? t('account.ac.viaPasskey') : e.factor === 'totp' ? t('account.ac.viaTotp') : ''}
                </span>
                <span className="tabular text-ink-500">{dt(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} login={user.loginName} onDone={reload} />
      <TotpModal open={totpOpen} onClose={() => setTotpOpen(false)} onDone={() => { auth.setUser({ totpEnabled: true }); reload(); }} />
      <Modal open={!!codes} onClose={() => setCodes(null)} title={t('account.ac.newCodes')} subtitle={t('account.ac.newCodesSub')}>
        {codes && <RecoveryCodesPanel codes={codes} loginName={user.loginName} doneLabel={t('account.ac.done')} onDone={() => { setCodes(null); reload(); }} />}
      </Modal>
    </Section>
  );
}

function PasskeySection({ disabled }: { disabled: boolean }) {
  const reauth = useReauth();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<PasskeyInfo[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(suggestPasskeyName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const supported = passkeysSupported();

  useEffect(() => {
    if (disabled) return;
    api<{ passkeys: PasskeyInfo[] }>('GET', '/api/auth/passkeys')
      .then((r) => setList(r.passkeys))
      .catch(() => setList([]));
  }, [disabled]);

  return (
    <Section id="passkeys" icon={<Fingerprint className="size-4" />} title={t('account.ac.secPasskeys')} subtitle={t('account.ac.passkeysSub')}>
      {!supported && <Callout tone="warn">{t('account.ac.noPasskeys')}</Callout>}
      {list && list.length > 0 && (
        <ul className="mb-3 divide-y divide-white/[0.05]">
          {list.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-leaf-500/10 text-leaf-300">
                <Fingerprint className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                {editing?.id === p.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const r = await reauth(() => api<{ passkeys: PasskeyInfo[] }>('PATCH', `/api/auth/passkeys/${p.id}`, { name: editing.name.trim() }));
                        if (r) setList(r.passkeys);
                        setEditing(null);
                      } catch (err) {
                        toast(passkeyErrorText(err), { tone: 'error' });
                      }
                    }}
                  >
                    <input className="input-base py-1.5" aria-label={t('account.ac.pkName')} value={editing.name} maxLength={60} autoFocus onChange={(e) => setEditing({ id: p.id, name: e.target.value })} />
                    <button type="submit" className="btn-primary py-1.5" disabled={!editing.name.trim()}>
                      {t('common.save.button')}
                    </button>
                    <button type="button" className="btn-ghost py-1.5" onClick={() => setEditing(null)}>
                      {t('common.cancel')}
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-[13.5px] text-ink-100">
                      {p.name}
                      {p.backedUp && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10.5px] text-ink-300">synchronisiert</span>}
                    </div>
                    <div className="text-[11.5px] text-ink-500">
                      {t('account.ac.pkAdded', { date: dt(p.createdAt) })} · {p.lastUsedAt ? t('account.ac.pkUsed', { date: dt(p.lastUsedAt) }) : t('account.ac.pkUnused')}
                    </div>
                  </>
                )}
              </div>
              {editing?.id !== p.id && (
                <div className="flex gap-1.5 pl-11 sm:pl-0">
                  <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" disabled={disabled} onClick={() => setEditing({ id: p.id, name: p.name })}>
                    {t('account.ac.rename')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-2.5 py-1.5 text-xs text-rose-200"
                    disabled={disabled}
                    onClick={async () => {
                      const ok = await confirm({ title: t('account.ac.pkRemoveTitle', { name: p.name }), message: t('account.ac.pkRemoveMsg'), confirmLabel: t('account.ac.remove'), tone: 'danger' });
                      if (!ok) return;
                      try {
                        const r = await reauth(() => api<{ passkeys: PasskeyInfo[] }>('DELETE', `/api/auth/passkeys/${p.id}`));
                        if (r) setList(r.passkeys);
                      } catch (err) {
                        toast(passkeyErrorText(err), { tone: 'error' });
                      }
                    }}
                  >
                    {t('account.ac.remove')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {list && list.length === 0 && <p className="mb-3 text-[13px] text-ink-400">{t('account.ac.noPasskey')}</p>}
      {adding ? (
        <form
          className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              const r = await reauth(() => registerPasskey(name.trim()));
              if (r) {
                setList(r);
                setAdding(false);
                toast(t('account.ac.pkAddedToast'), { tone: 'ok' });
              }
            } catch (err) {
              setError(passkeyErrorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex-1 space-y-1.5">
            <label className="label" htmlFor="pk-name">
              {t('account.ac.pkNameHint')}
            </label>
            <input id="pk-name" className="input-base" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <FormError message={error} />
          </div>
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />} {t('account.ac2.pkCreate')}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
            {t('common.cancel')}
          </button>
        </form>
      ) : (
        <button type="button" className="btn-primary" disabled={disabled || !supported} onClick={() => setAdding(true)}>
          <Fingerprint className="size-4" /> {t('account.ac.pkAdd')}
        </button>
      )}
      <p className="hint mt-3">
        Passkeys werden auf deinem Gerät oder in deinem Passwort-Manager gespeichert; der Server kennt nur den öffentlichen Schlüssel. Eine Anmeldung mit Passkey ersetzt Passwort und
        2FA-Code. Bei einer Wiederherstellung per Recovery-Code werden alle Passkeys entfernt.
      </p>
    </Section>
  );
}

function Row({ icon, title, text, badge, children }: { icon: ReactNode; title: string; text: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="mt-0.5 text-ink-400">{icon}</span>
        <div>
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink-100">
            {title} {badge}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-400">{text}</p>
        </div>
      </div>
      <div className="shrink-0 pl-7 sm:pl-0">{children}</div>
    </div>
  );
}

function PasswordModal({ open, onClose, login, onDone }: { open: boolean; onClose: () => void; login: string; onDone: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ok = passwordHints(next, login).ok && next === confirmPw && current.length > 0;
  const close = () => {
    setCurrent('');
    setNext('');
    setConfirmPw('');
    setError(undefined);
    onClose();
  };
  return (
    <Modal open={open} onClose={close} title={t('account.ac2.pwChange')} subtitle={t('account.ac2.pwChangeSub')}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const r = await api<{ user: ServerUser }>('POST', '/api/auth/password', { currentPassword: current, newPassword: next });
            auth.setUser(r.user);
            toast(t('account.ac2.pwChanged'), { tone: 'ok' });
            close();
            onDone();
          } catch (err) {
            setError(errText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <PasswordField label={t('account.ac2.pwCurrent')} value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <PasswordField label={t('account.ac2.pwNew')} value={next} onChange={setNext} autoComplete="new-password" />
        {next && <PasswordStrength password={next} login={login} />}
        <PasswordField label={t('account.ac2.pwRepeat')} value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" />
        <FormError message={error} />
        <button type="submit" className="btn-primary w-full" disabled={busy || !ok}>
          {busy && <Loader2 className="size-4 animate-spin" />} {t('account.ac2.pwChange')}
        </button>
      </form>
    </Modal>
  );
}

function TotpModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const reauth = useReauth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setSetup(null);
      setCode('');
      setError(undefined);
      return;
    }
    reauth(() => api<{ secret: string; qrSvg: string }>('POST', '/api/auth/totp/setup'))
      .then((r) => (r ? setSetup(r) : onClose()))
      .catch((e) => setError(errText(e)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const qrUrl = useMemo(() => (setup ? URL.createObjectURL(new Blob([setup.qrSvg], { type: 'image/svg+xml' })) : ''), [setup]);
  useEffect(() => () => {
    if (qrUrl) URL.revokeObjectURL(qrUrl);
  }, [qrUrl]);

  return (
    <Modal open={open} onClose={onClose} title={t('account.ac2.totpSetup')} subtitle={t('account.ac2.totpSetupSub')}>
      {!setup ? (
        error ? <FormError message={error} /> : <div className="flex items-center gap-2 text-sm text-ink-400"><Loader2 className="size-4 animate-spin" /> {t('account.ac2.preparing')}</div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              await reauth(() => api('POST', '/api/auth/totp/enable', { code }));
              toast(t('account.ac2.totpActiveToast'), { tone: 'ok' });
              onDone();
              onClose();
            } catch (err) {
              setError(errText(err));
              setCode('');
            } finally {
              setBusy(false);
            }
          }}
        >
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-ink-300">
            <li>{t('account.ac2.scan')}</li>
            <li>{t('account.ac2.enterCode')}</li>
          </ol>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <img src={qrUrl} alt={t('account.ac2.qr')} className="size-44 rounded-xl bg-white p-2" />
            <div className="min-w-0 space-y-1">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">{t('account.ac2.key')}</div>
              <code className="block break-all select-all font-mono text-[13px] text-leaf-200">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              <p className="hint">{t('account.ac2.keyHint')}</p>
            </div>
          </div>
          <input
            className="input-base text-center font-mono text-xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={t('account.ac2.code')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <FormError message={error} />
          <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy && <Loader2 className="size-4 animate-spin" />} {t('account.ac2.activate')}
          </button>
        </form>
      )}
    </Modal>
  );
}

/** Zurückhaltende Übersicht – Status statt Alarm, ohne „100 % sicher“-Versprechen. */
function SecurityStatus({ ov, totp }: { ov: Overview; totp: boolean }) {
  const { offlineEnabled } = useAuth();
  const secondFactor = totp || ov.passkeys > 0;
  const codesOk = ov.recoveryCodesRemaining >= 4;
  const items: { label: string; value: string; ok: boolean; to: string }[] = [
    { get label() { return t('account.ac2.second'); }, value: totp ? t('account.ac2.totpActive') : ov.passkeys > 0 ? 'Passkey' : t('account.ac2.missing'), ok: secondFactor, to: 'sicherheit' },
    { label: t('account.ac.secPasskeys'), value: String(ov.passkeys), ok: true, to: 'passkeys' },
    { label: t('account.ac2.codes'), value: `${ov.recoveryCodesRemaining} / 10`, ok: codesOk, to: 'sicherheit' },
    { label: t('account.ac.sessions'), value: String(ov.sessions), ok: true, to: 'sitzungen' },
    { label: t('account.ac2.offlineCopy'), value: offlineEnabled ? t('account.ac2.permanent') : t('account.ac2.sessionOnly'), ok: true, to: 'geraet' },
  ];
  return (
    <div className="card flex flex-col gap-4 p-4 xl:flex-row xl:items-center">
      <div className="flex items-center gap-3 sm:w-56">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${secondFactor && codesOk ? 'bg-leaf-500/12 text-leaf-300' : 'bg-amber-400/10 text-amber-200'}`}>
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <div className="text-[13.5px] font-medium text-ink-50">{secondFactor && codesOk ? t('account.ac2.good') : t('account.ac2.improve')}</div>
          <div className="text-[11.5px] text-ink-500">{secondFactor ? (codesOk ? t('account.ac2.allGood') : t('account.ac2.newCodesRec')) : t('account.ac2.factorRec')}</div>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
        {items.map((i) => (
          <button key={i.label} type="button" onClick={() => document.getElementById(i.to)?.scrollIntoView({ behavior: 'smooth' })} className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2 text-left hover:border-white/[0.12]">
            <span className="block text-[11px] text-ink-500">{i.label}</span>
            <span className={`mt-0.5 flex items-center gap-1.5 text-[13px] ${i.ok ? 'text-ink-100' : 'text-amber-200'}`}>
              <span className={`size-1.5 rounded-full ${i.ok ? 'bg-leaf-400' : 'bg-amber-300'}`} aria-hidden />
              {i.value}
              {!i.ok && <span className="sr-only">{t('account.ac2.toImprove')}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DeviceSection() {
  const auth = useAuth();
  const confirm = useConfirm();
  const { data } = useData();
  const [shared, setShared] = useState(isSharedDevice);
  const [usage, setUsage] = useState<number | undefined>();
  const [persisted, setPersisted] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);
  const user = auth.state.kind === 'authenticated' ? auth.state.user : null;
  useEffect(() => {
    void storageEstimate().then((e) => {
      setUsage(e.usage);
      setPersisted(e.persisted);
    });
  }, []);
  const records = Object.values(data).reduce((n, l) => n + l.length, 0);
  return (
    <Section id="geraet" icon={<Smartphone className="size-4" />} title={t('account.ac.secDevice')} subtitle={t('account.ac2.deviceSub')}>
      <dl className="mb-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-ink-500">{t('account.ac2.records')}</dt>
          <dd className="mt-0.5 tabular text-ink-100">{records}</dd>
        </div>
        <div>
          <dt className="text-ink-500">{t('account.ac2.usage')}</dt>
          <dd className="mt-0.5 tabular text-ink-100">{usage !== undefined ? formatBytes(usage) : 'unbekannt'}</dd>
        </div>
        <div>
          <dt className="text-ink-500">{t('account.ac2.pending')}</dt>
          <dd className={`mt-0.5 tabular ${auth.sync.pending ? 'text-amber-200' : 'text-ink-100'}`}>{auth.sync.pending}</dd>
        </div>
      </dl>
      <details className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5 text-[13px]">
        <summary className="cursor-pointer text-ink-200">{t('account.ac2.breakdown')}</summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {Object.entries(data)
            .filter(([, l]) => l.length > 0)
            .map(([k, l]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-ink-400">{SYNC_STORE_LABEL[k] ?? k}</dt>
                <dd className="tabular text-ink-100">{l.length}</dd>
              </div>
            ))}
        </dl>
        <p className="hint mt-2">{t('account.ac2.sharedMem')}</p>
      </details>
      <label className={`mb-3 flex items-start gap-3 rounded-xl border p-3.5 ${auth.offlineEnabled ? 'border-leaf-500/25 bg-leaf-500/[0.05]' : 'border-white/[0.06] bg-white/[0.015]'}`}>
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-leaf-500"
          checked={auth.offlineEnabled}
          disabled={shared || !user}
          onChange={async (e) => {
            const on = e.target.checked;
            if (!on) {
              const ok = await confirm({
                title: t('account.ac2.offOffTitle'),
                message: t('account.ac2.offOffMsg'),
                confirmLabel: t('account.ac2.turnOff'),
              });
              if (!ok) return;
            }
            auth.setOfflineMode(on);
            if (on) void storageEstimate().then((x) => setPersisted(x.persisted));
          }}
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink-100">{t('account.ac2.offline')}</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-400">
            {shared
              ? t('account.ac2.notOnShared')
              : t('account.ac2.offlineText')}
          </span>
          {auth.offlineEnabled && persisted !== undefined && (
            <span className="mt-1 block text-[12px] text-ink-500">{persisted ? t('account.ac2.persisted') : t('account.ac2.notPersisted')}</span>
          )}
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-leaf-500"
          checked={shared}
          onChange={(e) => {
            setSharedDevice(e.target.checked);
            setShared(e.target.checked);
            if (e.target.checked) auth.setOfflineMode(false);
          }}
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink-100">{t('account.ac2.sharedDevice')}</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-400">
            {t('account.ac2.sharedText')}
          </span>
        </span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={!auth.engine || auth.state.kind !== 'authenticated' || auth.state.offline || auth.sync.phase === 'syncing'} onClick={() => void auth.engine?.syncNow()}>
          <RefreshCw className={`size-4 ${auth.sync.phase === 'syncing' ? 'animate-spin' : ''}`} /> {auth.sync.phase === 'syncing' ? t('account.ac2.syncing') : t('account.ac2.syncNow')}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || !user}
          onClick={async () => {
            if (!user) return;
            const pending = auth.sync.pending;
            const ok = await confirm({
              title: t('account.ac2.wipeTitle'),
              message:
                pending > 0
                  ? t('account.ac2.pendingLoss', { count: pending })
                  : t('account.ac2.wipeMsg'),
              confirmLabel: pending > 0 ? t('account.ac2.wipeAnyway') : t('account.ac2.wipeReload'),
              tone: pending > 0 ? 'danger' : 'default',
            });
            if (!ok) return;
            setBusy(true);
            auth.engine?.stop();
            selectDatabase(accountDbName(user.accountKey));
            await deleteDatabase().catch(() => {});
            window.location.reload();
          }}
        >
          <HardDrive className="size-4" /> {t('account.ac2.wipeButton')}
        </button>
      </div>
      <p className="hint mt-3">
        {t('account.ac2.unencrypted')}
      </p>
    </Section>
  );
}

function PrivacyCenter() {
  const Item = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
    <div className="flex gap-3">
      <span className="mt-0.5 text-leaf-400">{icon}</span>
      <div>
        <div className="text-[13.5px] font-medium text-ink-100">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-400">{children}</div>
      </div>
    </div>
  );
  return (
    <Section id="datenschutz" icon={<ShieldCheck className="size-4" />} title={t('account.ac.secPrivacy')} subtitle={t('account.ac2.pcSub')}>
      <div className="space-y-4">
        <Item icon={<Server className="size-4" />} title={t('account.ac2.pcServer')}>
          {t('account.pc.serverA')} <strong className="text-ink-200">{t('account.pc.noE2ee')}</strong> {t('account.pc.serverB')}
        </Item>
        <Item icon={<UserRound className="size-4" />} title={t('account.ac2.pcMeta')}>
          {t('account.pc.meta')}
        </Item>
        <Item icon={<Laptop className="size-4" />} title={t('account.ac2.pcBrowser')}>
          {t('account.pc.browserA')} <strong className="text-ink-200">{t('account.pc.unencrypted')}</strong>{t('account.pc.browserB')}
        </Item>
        <Item icon={<RefreshCw className="size-4" />} title={t('account.ac2.pcExternal')}>
          {t('account.pc.external')}
        </Item>
        <Item icon={<Share2 className="size-4" />} title={t('account.ac2.pcShared')}>
          {t('account.pc.shared')}
        </Item>
        <Item icon={<Users className="size-4" />} title={t('account.ac.secAdmin')}>
          {t('account.pc.admin')}
        </Item>
        <Item icon={<HardDrive className="size-4" />} title={t('account.ac2.pcBackups')}>
          {t('account.pc.backups')}
        </Item>
        <Item icon={<ShieldCheck className="size-4" />} title={t('account.ac2.pcTracking')}>{t('account.ac2.pcTrackingText')}</Item>
      </div>
    </Section>
  );
}

function DeleteSection({ user, disabled }: { user: ServerUser; disabled: boolean }) {
  const auth = useAuth();
  const reauth = useReauth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Section id="loeschen" icon={<Trash2 className="size-4" />} title={t('account.ac.secDelete')} subtitle={t('account.ac2.delSub')}>
      <button type="button" className="btn border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" disabled={disabled} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> {t('account.ac2.delButton')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('account.ac2.delTitle')} size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              const r = await reauth(() => api('DELETE', '/api/account', { confirm: typed }));
              if (!r) return;
              // Lokale Kopie und Offline-Freigabe dieses Geräts entfernen (das Konto existiert nicht mehr)
              auth.setOfflineMode(false);
              await auth.logout({ wipeLocal: true });
              toast(t('account.ac2.deleted'), { tone: 'ok' });
            } catch (err) {
              setError(errText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Callout tone="danger">
            {t('account.ac2.deleteWarn')}
          </Callout>
          <div className="space-y-1.5">
            <label className="label" htmlFor="del-confirm">
              {t('account.ac2.typeId')} <span className="font-mono text-ink-100">{user.loginName}</span>
            </label>
            <input id="del-confirm" className="input-base font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <FormError message={error} />
          <button type="submit" className="btn w-full border border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30" disabled={busy || typed.trim().toLowerCase() !== user.loginName}>
            {busy && <Loader2 className="size-4 animate-spin" />} {t('account.ac2.deleteFinal')}
          </button>
        </form>
      </Modal>
    </Section>
  );
}
