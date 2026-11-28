import { Activity, AlertTriangle, Ban, CheckCircle2, Copy, Database, HardDrive, Link2, Loader2, Plus, RotateCcw, ShieldCheck, Users } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useConfirm } from '../../app/Confirm';
import { useReauth } from '../../app/reauth';
import { useToast } from '../../app/Toasts';
import { Callout } from '../../components/ui/Callout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { CatalogDataQuality } from './CatalogDataQuality';
import { CatalogAdmin } from './CatalogAdmin';
import { formatBytes } from '../../lib/media/images';
import { ApiError, api } from '../../lib/server/api';
import { t, intlLocale } from '../../i18n';

interface OverviewData {
  version: string;
  startedAt: string;
  inviteOnly: boolean;
  users: { total: number; active: number; suspended: number; storage: number };
  openInvites: number;
  activeSessions: number;
  errors: { count: number; last?: string };
  securityEvents7d: Record<string, number>;
  recentSecurityEvents: { type: string; created_at: string; ip_tag: string | null }[];
  disk: { freeBytes: number; totalBytes: number } | null;
  backup: { ok: boolean; lastSuccess: string | null; lastCheck: string | null } | null;
}
interface SystemData {
  version: string;
  node: string;
  memory: { rssBytes: number; heapUsedBytes: number };
  http: { uptimeSeconds: number; requestsTotal: number; window: { minutes: number; requests: number; p50Ms: number | null; p95Ms: number | null; p99Ms: number | null; serverErrorRate: number } };
  db: { ok: boolean; latencyMs?: number; sizeBytes?: number; connections?: number };
  schema: { applied: number; pending: string[]; unknown: string[] };
  storage: { trashBlobs: number; userFilesBytes?: number };
  catalog?: {
    dataset: { version: string; importedAt: string; cultivars: number } | null;
    claims: { active: number; expiringIn7d: number; expired: number; nextExpiry: string | null };
    lastRun: { id: number; status: string; startedBy: string; startedAt: string; finishedAt: string | null; errors: number } | null;
    status: 'unused' | 'ok' | 'due' | 'overdue';
  };
  keys: { rotationsInProgress: number };
  tasks: { failures: Record<string, number>; lastFailure: string | null };
}
interface AdminUser {
  id: string;
  login_name: string;
  login_kind: string;
  display_name: string | null;
  role: string;
  status: 'active' | 'suspended';
  totp_enabled: boolean;
  storage_bytes: number;
  created_at: string;
  last_login_at: string | null;
}
interface Invite {
  id: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  used_by: string | null;
}

const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '–');
const errText = (e: unknown) => (e instanceof ApiError ? e.message : t('admin.unexpected'));
const EVENT: Record<string, string> = {
  'login.failure': t('admin.ev.loginFail'),
  'login.throttled': t('admin.ev.throttled'),
  'recovery.failure': t('admin.ev.recFail'),
  'recovery.success': t('admin.ev.rec'),
  'admin.user.status': t('admin.ev.status'),
  'invite.create': t('admin.ev.inviteCreate'),
  'invite.revoke': t('admin.ev.inviteRevoke'),
  'account.delete': t('admin.ev.delete'),
};

function Stat({ icon, label, value, sub, tone = 'default' }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'warn' | 'ok' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-ink-500">
        {icon} {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold tabular ${tone === 'warn' ? 'text-amber-200' : tone === 'ok' ? 'text-leaf-200' : 'text-ink-50'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-500">{sub}</div>}
    </div>
  );
}

export function AdminPage() {
  const auth = useAuth();
  const reauth = useReauth();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = auth.state.kind === 'authenticated' && auth.state.user.role === 'admin';
  const [ov, setOv] = useState<OverviewData | null>(null);
  const [sys, setSys] = useState<SystemData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string>();
  const [newInvite, setNewInvite] = useState<{ url: string; expiresInDays: number } | null>(null);
  const [inviteForm, setInviteForm] = useState({ days: 7, note: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, u, i] = await Promise.all([
        api<OverviewData>('GET', '/api/admin/overview'),
        api<{ users: AdminUser[] }>('GET', '/api/admin/users'),
        api<{ invites: Invite[] }>('GET', '/api/admin/invites'),
      ]);
      setOv(o);
      api<SystemData>('GET', '/api/admin/system').then(setSys).catch(() => setSys(null));
      setUsers(u.users);
      setInvites(i.invites);
      setError(undefined);
    } catch (e) {
      setError(errText(e));
    }
  }, []);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) return <EmptyState icon={<ShieldCheck />} title={t('admin.noPerm')} text={t('admin.noPermText')} />;

  const backupAge = ov?.backup?.lastSuccess ? (Date.now() - new Date(ov.backup.lastSuccess).getTime()) / 3_600_000 : null;
  const backupTone = !ov?.backup ? 'warn' : ov.backup.ok && backupAge !== null && backupAge < 36 ? 'ok' : 'warn';

  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} crumbs={[{ label: t('admin.account'), to: 'account' }, { label: t('admin.title') }]} />
      <Callout tone="info">
        {t('admin.limited')}
      </Callout>
      {error && <Callout tone="danger">{error}</Callout>}

      {ov && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<Users className="size-3.5" />} label={t('admin.accounts')} value={ov.users.total} sub={t('admin.usersSub', { a: ov.users.active, s: ov.users.suspended })} />
          <Stat icon={<Link2 className="size-3.5" />} label={t('admin.openInvites')} value={ov.openInvites} sub={ov.inviteOnly ? t('admin.inviteOnly') : t('admin.publicReg')} tone={ov.inviteOnly ? 'default' : 'warn'} />
          <Stat icon={<HardDrive className="size-3.5" />} label={t('admin.storage')} value={formatBytes(ov.users.storage)} sub={ov.disk ? t('admin.diskFree', { free: formatBytes(ov.disk.freeBytes), total: formatBytes(ov.disk.totalBytes) }) : t('admin.diskUnknown')} />
          <Stat
            icon={<Database className="size-3.5" />}
            label={t('admin.backup')}
            value={ov.backup ? (ov.backup.ok ? t('admin.ok') : t('admin.error')) : t('admin.notConfigured')}
            sub={ov.backup?.lastSuccess ? t('admin.lastSuccess', { date: dt(ov.backup.lastSuccess) }) : t('admin.noBackup')}
            tone={backupTone}
          />
          <Stat icon={<Activity className="size-3.5" />} label={t('admin.system')} value={<span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-leaf-400" /> {t('admin.running')}</span>} sub={t('admin.versionSince', { v: ov.version, date: dt(ov.startedAt) })} />
          <Stat icon={<Users className="size-3.5" />} label={t('admin.sessions')} value={ov.activeSessions} />
          <Stat icon={<AlertTriangle className="size-3.5" />} label={t('admin.serverErrors')} value={ov.errors.count} sub={ov.errors.last ? t('admin.lastAt', { date: dt(ov.errors.last) }) : t('admin.noneSinceStart')} tone={ov.errors.count ? 'warn' : 'default'} />
          <Stat
            icon={<ShieldCheck className="size-3.5" />}
            label={t('admin.security7')}
            value={(ov.securityEvents7d['login.failure'] ?? 0) + (ov.securityEvents7d['login.throttled'] ?? 0)}
            sub={t('admin.failedThrottled')}
            tone={(ov.securityEvents7d['login.throttled'] ?? 0) > 0 ? 'warn' : 'default'}
          />
        </div>
      )}

      {sys && (
        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink-50">{t('admin.health')}</h2>
            <span className="text-[11.5px] text-ink-500">
              {t('admin.window', { m: sys.http.window.minutes, h: Math.round(sys.http.uptimeSeconds / 3600) })}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
            {[
              [t('admin.s.latency'), sys.http.window.p50Ms !== null ? `${sys.http.window.p50Ms} / ${sys.http.window.p95Ms} ms` : '–', false],
              [t('admin.s.errRate'), `${sys.http.window.serverErrorRate} %`, sys.http.window.serverErrorRate > 1],
              [t('admin.s.requests'), String(sys.http.window.requests), false],
              [t('admin.s.db'), sys.db.ok ? `${sys.db.latencyMs} ms · ${formatBytes(sys.db.sizeBytes ?? 0)}` : t('admin.s.unreachable'), !sys.db.ok],
              [t('admin.s.conns'), String(sys.db.connections ?? '–'), false],
              [t('admin.s.schema'), sys.schema.unknown.length ? t('admin.s.newer') : sys.schema.pending.length ? t('admin.schemaPending', { n: sys.schema.pending.length }) : t('admin.schemaOk', { n: sys.schema.applied }), sys.schema.unknown.length + sys.schema.pending.length > 0],
              [t('admin.s.rss'), formatBytes(sys.memory.rssBytes), false],
              [t('admin.s.files'), sys.storage.userFilesBytes !== undefined ? formatBytes(sys.storage.userFilesBytes) : '–', false],
              [t('admin.s.trash'), `${sys.storage.trashBlobs} Blobs`, false],
              [t('admin.s.catalog'), sys.catalog?.dataset ? t('admin.catalogInfo', { n: sys.catalog.dataset.cultivars, date: dt(sys.catalog.dataset.importedAt) }) : t('admin.s.notImported'), !sys.catalog?.dataset],
              [
                t('admin.s.cache'),
                !sys.catalog || sys.catalog.status === 'unused'
                  ? t('admin.s.unused')
                  : sys.catalog.status === 'overdue'
                    ? t('admin.claimsExpired', { n: sys.catalog.claims.expired })
                    : sys.catalog.status === 'due'
                      ? t('admin.claimsSoon', { n: sys.catalog.claims.expiringIn7d })
                      : t('admin.claimsOk', { n: sys.catalog.claims.active, date: dt(sys.catalog.claims.nextExpiry) }),
                sys.catalog?.status === 'overdue',
              ],
              [t('admin.s.lastRun'), sys.catalog?.lastRun ? `#${sys.catalog.lastRun.id} ${sys.catalog.lastRun.status === 'done' ? t('admin.runDone') : sys.catalog.lastRun.status === 'failed' ? t('admin.runFailed') : sys.catalog.lastRun.status} · ${dt(sys.catalog.lastRun.startedAt)}${sys.catalog.lastRun.startedBy === 'refresh' ? ' (Timer)' : ''}` : t('admin.s.none'), sys.catalog?.lastRun?.status === 'failed'],
              [t('admin.s.rotations'), String(sys.keys.rotationsInProgress), sys.keys.rotationsInProgress > 0],
              [t('admin.s.tasks'), Object.keys(sys.tasks.failures).length ? t('admin.taskErrors', { list: Object.entries(sys.tasks.failures).map(([k, v]) => `${k} ${v}×`).join(', ') }) : t('admin.s.noErrors'), Object.keys(sys.tasks.failures).length > 0],
              [t('admin.s.version'), `${sys.version} · ${sys.node}`, false],
            ].map(([label, value, warn]) => (
              <div key={label as string} className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2">
                <dt className="text-[11px] text-ink-500">{label}</dt>
                <dd className={`mt-0.5 tabular ${warn ? 'text-amber-200' : 'text-ink-100'}`}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="hint mt-3">{t('admin.compose')}</p>
        </section>
      )}

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink-50">{t('admin.invites')}</h2>
        </div>
        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setCreating(true);
            try {
              const r = await reauth(() => api<{ url: string; expiresInDays: number }>('POST', '/api/admin/invites', { days: inviteForm.days, ...(inviteForm.note.trim() ? { note: inviteForm.note.trim() } : {}) }));
              if (r) {
                setNewInvite(r);
                setInviteForm({ days: 7, note: '' });
                void load();
              }
            } catch (err) {
              toast(errText(err), { tone: 'error' });
            } finally {
              setCreating(false);
            }
          }}
        >
          <div className="flex-1 space-y-1.5">
            <label className="label" htmlFor="inv-note">
              {t('admin.note')}
            </label>
            <input id="inv-note" className="input-base" maxLength={120} value={inviteForm.note} placeholder={t('admin.notePh')} onChange={(e) => setInviteForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="label" htmlFor="inv-days">
              {t('admin.validDays')}
            </label>
            <input id="inv-days" type="number" min={1} max={30} className="input-base w-28" value={inviteForm.days} onChange={(e) => setInviteForm((f) => ({ ...f, days: Math.min(30, Math.max(1, Number(e.target.value) || 7)) }))} />
          </div>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t('admin.createInvite')}
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11px] text-ink-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{t('admin.noteCol')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.created')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.status')}</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => {
                const expired = new Date(i.expires_at).getTime() < Date.now();
                const status = i.used_at ? t('admin.usedBy', { name: i.used_by ?? t('admin.deletedAccount') }) : i.revoked_at ? t('admin.revoked') : expired ? t('admin.expired') : t('admin.openUntil', { date: dt(i.expires_at) });
                const open = !i.used_at && !i.revoked_at && !expired;
                return (
                  <tr key={i.id} className="border-t border-white/[0.04]">
                    <td className="py-2 pr-3 text-ink-200">{i.note ?? '–'}</td>
                    <td className="py-2 pr-3 text-ink-400">{dt(i.created_at)}</td>
                    <td className={`py-2 pr-3 ${open ? 'text-leaf-200' : 'text-ink-500'}`}>{status}</td>
                    <td className="py-2 text-right">
                      {open && (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-xs"
                          onClick={async () => {
                            try {
                              await reauth(() => api('DELETE', `/api/admin/invites/${i.id}`));
                              void load();
                            } catch (e) {
                              toast(errText(e), { tone: 'error' });
                            }
                          }}
                        >
                          {t('admin.revoke')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-ink-500">
                    {t('admin.noInvites')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-ink-50">{t('admin.accounts')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11px] text-ink-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{t('admin.loginId')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.role')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.twofa')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.storageCol')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.lastLogin')}</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = auth.state.kind === 'authenticated' && auth.state.user.loginName === u.login_name;
                return (
                  <tr key={u.id} className="border-t border-white/[0.04]">
                    <td className="py-2 pr-3">
                      <div className="font-mono text-ink-100">{u.login_name}</div>
                      {u.display_name && <div className="text-[11px] text-ink-500">{u.display_name}</div>}
                    </td>
                    <td className="py-2 pr-3 text-ink-300">{u.role === 'admin' ? t('admin.admin') : t('admin.member')}</td>
                    <td className="py-2 pr-3">{u.totp_enabled ? <span className="text-leaf-300">an</span> : <span className="text-ink-500">aus</span>}</td>
                    <td className="py-2 pr-3 tabular text-ink-300">{formatBytes(u.storage_bytes)}</td>
                    <td className="py-2 pr-3 text-ink-400">{dt(u.last_login_at)}</td>
                    <td className="py-2 text-right">
                      {!self && (
                        <button
                          type="button"
                          className={`btn-ghost px-2 py-1 text-xs ${u.status === 'active' ? 'text-rose-200' : 'text-leaf-200'}`}
                          onClick={async () => {
                            const suspend = u.status === 'active';
                            const ok = await confirm({
                              title: suspend ? t('admin.suspendTitle', { name: u.login_name }) : t('admin.unsuspendTitle', { name: u.login_name }),
                              message: suspend ? t('admin.suspendMsg') : t('admin.unsuspendMsg'),
                              confirmLabel: suspend ? t('admin.suspend') : t('admin.unsuspend'),
                              tone: suspend ? 'danger' : 'default',
                            });
                            if (!ok) return;
                            try {
                              await reauth(() => api('POST', `/api/admin/users/${u.id}/status`, { status: suspend ? 'suspended' : 'active' }));
                              void load();
                            } catch (e) {
                              toast(errText(e), { tone: 'error' });
                            }
                          }}
                        >
                          {u.status === 'active' ? (
                            <>
                              <Ban className="size-3.5" /> {t('admin.suspend')}
                            </>
                          ) : (
                            <>
                              <RotateCcw className="size-3.5" /> {t('admin.unsuspend')}
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {ov && ov.recentSecurityEvents.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-ink-50">{t('admin.events')}</h2>
          <ul className="space-y-1 text-[12.5px]">
            {ov.recentSecurityEvents.map((e, i) => (
              <li key={`${e.created_at}-${i}`} className="flex justify-between gap-3 text-ink-300">
                <span>{EVENT[e.type] ?? e.type}</span>
                <span className="tabular text-ink-500">
                  {dt(e.created_at)}
                  {e.ip_tag && <span className="ml-2 font-mono text-[11px]">#{e.ip_tag.slice(0, 6)}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="hint mt-2">{t('admin.ipHash')}</p>
        </section>
      )}

      <CatalogAdmin />
      <CatalogDataQuality />

      <Modal open={!!newInvite} onClose={() => setNewInvite(null)} title={t('admin.link')} subtitle={t('admin.linkSub', { n: newInvite?.expiresInDays ?? 7 })}>
        {newInvite && (
          <div className="space-y-3">
            <code className="block break-all select-all rounded-lg bg-ink-950 p-3 font-mono text-[12.5px] text-leaf-200">{newInvite.url}</code>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newInvite.url);
                  toast(t('admin.copied'), { tone: 'ok' });
                } catch {
                  toast(t('admin.copyFail'), { tone: 'error' });
                }
              }}
            >
              <Copy className="size-4" /> {t('admin.copyLink')}
            </button>
            <p className="hint">{t('admin.linkHint')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
