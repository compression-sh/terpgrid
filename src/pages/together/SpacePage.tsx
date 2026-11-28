import { syncStateText } from '../../lib/sync/status';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckSquare,
  Cloud,
  CloudOff,
  Crown,
  Download,
  FileText,
  FlaskRound,
  KeyRound,
  Leaf,
  Loader2,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Settings,
  Sprout,
  StickyNote,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useAccountKey, useLoad, useSpaceSession } from '../../app/collab';
import { useReauth } from '../../app/reauth';
import { href, navigate, setQuery, useRoute } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { AccessBadge, Avatar, OriginBadge, PersonRow, RoleBadge, RolePicker, SectionTitle, relTime } from '../../components/collab/ui';
import { Callout } from '../../components/ui/Callout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Toggle } from '../../components/ui/Toggle';
import { type Accent, type ActivityView, type Member, type Role, type SpaceDetail, type SpaceStore, collab } from '../../lib/collab/api';
import { ACCENTS, ACCENT_CLASS, ACCENT_LABEL, KIND_LABEL, ROLE_LABEL, STORE_LABEL, activityText, entryTitle, nameOf } from '../../lib/collab/labels';
import { type SpaceEntry, type SpaceSession, forgetSpaceSession } from '../../lib/collab/spaceSync';
import { formatBytes } from '../../lib/media/images';
import { EntryEditor } from './SharedResource';
import { t, intlLocale } from '../../i18n';

type Tab = 'content' | 'members' | 'activity' | 'settings';

export function SpacePage({ spaceId }: { spaceId: string }) {
  const route = useRoute();
  const tab = (route.query.get('tab') as Tab) || 'content';
  const detail = useLoad(() => collab.space(spaceId), [spaceId]);
  const session = useSpaceSession(spaceId);
  const accountKey = useAccountKey();
  const st = session?.state;

  // Rolle hat sich geändert (z. B. vom Eigentümer angepasst) → Details neu laden
  useEffect(() => {
    if (st?.role && detail.data && st.role !== detail.data.space.role) void detail.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.role]);

  if (detail.error || st?.phase === 'revoked')
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<CloudOff />}
          title={st?.phase === 'revoked' && st.hadAccess ? t('collab.sp.revoked') : t('collab.sp.noAccess')}
          text={
            st?.phase === 'revoked' && st.hadAccess
              ? t('collab.sp.revokedText')
              : t('collab.sp.noAccessText')
          }
          action={
            <a className="btn-primary" href={href('together')}>
              {t('collab.sp.toOverview')}
            </a>
          }
        />
        {st && st.orphaned.length > 0 && <OrphanedDownload items={st.orphaned} onDone={() => accountKey && forgetSpaceSession(accountKey, spaceId)} />}
      </div>
    );
  if (!detail.data || !session) return <div className="skeleton h-72" />;
  const d = detail.data;
  const a = ACCENT_CLASS[d.space.accent ?? 'emerald'];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'content', label: t('collab.sp.content') },
    { id: 'members', label: t('collab.sp.membersN', { n: d.members.length }) },
    { id: 'activity', label: t('collab.sp.activity') },
    { id: 'settings', label: t('collab.sp.settings') },
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: t('collab.sp.together'), to: 'together' }, { label: d.space.name }]}
        title={
          <span className="inline-flex items-center gap-3">
            <span className={`grid size-10 place-items-center rounded-xl ring-1 ${a.soft} ${a.text} ${a.ring}`}>
              <Users className="size-5" />
            </span>
            <span className="min-w-0 truncate">{d.space.name}</span>
          </span>
        }
        subtitle={d.space.description || KIND_LABEL[d.space.kind]}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={d.space.role} />
            <SyncPill session={session} />
            <div className="flex -space-x-2">
              {d.members.slice(0, 6).map((m) => (
                <span key={m.ref} title={nameOf(m)}>
                  <Avatar identity={m} size="xs" />
                </span>
              ))}
            </div>
          </div>
        }
      />
      {d.space.pendingTransferToMe && <TransferOffer d={d} onDone={detail.reload} />}
      <nav aria-label={t('collab.sp.space')} className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/[0.06] px-1 [scrollbar-width:none]">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            aria-current={tab === tb.id ? 'page' : undefined}
            onClick={() => setQuery(route, { tab: tb.id === 'content' ? undefined : tb.id })}
            className={`relative min-h-10 shrink-0 px-3 text-[13px] font-medium ${tab === tb.id ? 'text-ink-50' : 'text-ink-400 hover:text-ink-100'}`}
          >
            {tb.label}
            {tab === tb.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-leaf-400" />}
          </button>
        ))}
      </nav>
      <SyncNotices session={session} />
      {tab === 'content' && <ContentTab d={d} session={session} />}
      {tab === 'members' && <MembersTab d={d} reload={detail.reload} />}
      {tab === 'activity' && <ActivityTab spaceId={spaceId} session={session} />}
      {tab === 'settings' && <SettingsTab d={d} reload={detail.reload} />}
    </div>
  );
}

function SyncPill({ session }: { session: SpaceSession }) {
  const st = session.state;
  const label = syncStateText({ phase: st.phase, pending: st.pending, conflicts: st.conflicts.length });
  const Icon = st.phase === 'offline' || st.phase === 'error' ? CloudOff : st.phase === 'syncing' || st.phase === 'loading' ? Loader2 : Cloud;
  return (
    <button type="button" onClick={() => session.schedule(0)} title={t('collab.sp.syncNow')} className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-white/[0.08] px-2 py-0.5 text-[11.5px] text-ink-300 hover:text-ink-100">
      <Icon className={`size-3.5 ${st.phase === 'syncing' || st.phase === 'loading' ? 'animate-spin' : ''} ${st.phase === 'error' ? 'text-rose-300' : st.phase === 'offline' ? 'text-amber-300' : 'text-leaf-400'}`} /> {label}
    </button>
  );
}

function SyncNotices({ session }: { session: SpaceSession }) {
  const st = session.state;
  return (
    <>
      {st.conflicts.map((c) => (
        <Callout key={c.key} tone="warn" title={t('collab.sp.conflict', { store: STORE_LABEL[c.store], title: entryTitle(c.store, c.local ?? c.server.data ?? {}) })}>
          <p>{t('collab.sp.conflictA')}{c.fields.length && c.fields[0] !== '(gesamt)' ? t('collab.sp.fields', { list: c.fields.join(', ') }) : ''}. {t('collab.sp.conflictB')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => session.resolve(c.key, 'server')}>
              {t('collab.sp.takeOther')}
            </button>
            {c.local && (
              <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => session.resolve(c.key, 'mine')}>
                {t('collab.sp.keepMine')}
              </button>
            )}
          </div>
        </Callout>
      ))}
      {st.rejected.length > 0 && (
        <Callout tone="danger" title={t('collab.sp.rejected')}>
          <ul className="ml-4 list-disc">
            {st.rejected.slice(0, 5).map((r, i) => (
              <li key={i}>{r.error}</li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-[12px] underline" onClick={() => session.dismissRejected()}>
            {t('collab.sp.hide')}
          </button>
        </Callout>
      )}
    </>
  );
}

/** Nach Entzug: eigene, nicht übertragene Änderungen nur lokal herunterladen – nie erneut senden. */
function OrphanedDownload({ items, onDone }: { items: unknown[]; onDone: () => void }) {
  const download = () => {
    const blob = new Blob([JSON.stringify({ app: 'TERPGRID', kind: 'nicht-uebertragene-aenderungen', exportedAt: new Date().toISOString(), items }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `terpgrid-nicht-uebertragen-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    onDone();
  };
  return (
    <Callout tone="warn" title={t('collab.sp.notSent', { count: items.length })}>
      {t('collab.sp.notSentText')}
      <button type="button" className="btn-ghost mt-2 text-[12.5px]" onClick={download}>
        <Download className="size-4" /> {t('collab.sp.saveFile')}
      </button>
    </Callout>
  );
}

function TransferOffer({ d, onDone }: { d: SpaceDetail; onDone: () => Promise<void> }) {
  const toast = useToast();
  const reauth = useReauth();
  const owner = d.members.find((m) => m.role === 'owner');
  return (
    <Callout tone="info" title={t('collab.sp.transferOffered')}>
      {nameOf(owner)} möchte dir das Eigentum an diesem Bereich übertragen. Als Eigentümer verwaltest du Mitglieder und Rechte; die Dateien des Bereichs zählen dann zu deinem Speicherkontingent. {nameOf(owner)} wird „Bearbeiten“.
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-primary py-1.5 text-[12.5px]"
          onClick={async () => {
            try {
              await reauth(() => collab.acceptTransfer(d.space.id));
              toast(t('collab.sp.nowOwner'));
              await onDone();
            } catch (e) {
              toast(errorText(e), { tone: 'error' });
            }
          }}
        >
          <Crown className="size-3.5" /> {t('collab.sp.accept')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5 text-[12.5px]"
          onClick={async () => {
            await collab.cancelTransfer(d.space.id).catch(() => {});
            await onDone();
          }}
        >
          {t('collab.sp.decline')}
        </button>
      </div>
    </Callout>
  );
}

/* ───────────── Inhalte ───────────── */

const ROOTS: { store: SpaceStore; icon: typeof Sprout; create?: string }[] = [
  { store: 'grows', icon: Sprout, get create() { return t('collab.sp.cGrow'); } },
  { store: 'plants', icon: Leaf },
  { store: 'tasks', icon: CheckSquare, get create() { return t('collab.sp.cTask'); } },
  { store: 'notes', icon: StickyNote, get create() { return t('collab.sp.cNote'); } },
  { store: 'strains', icon: Leaf, get create() { return t('collab.sp.cStrain'); } },
  { store: 'journal', icon: FileText, get create() { return t('collab.sp.cJournal'); } },
  { store: 'inventory', icon: Package, get create() { return t('collab.sp.cInventory'); } },
  { store: 'labReports', icon: FlaskRound },
];

function ContentTab({ d, session }: { d: SpaceDetail; session: SpaceSession }) {
  const [creating, setCreating] = useState<SpaceStore | null>(null);
  const canCreate = d.permissions['resource.create'];
  const loading = session.state.phase === 'loading';
  const groups = ROOTS.map((r) => ({
    ...r,
    items: session
      .list(r.store)
      .filter((e) => (r.store === 'plants' ? !e.data.growId || !session.get('grows', e.data.growId as string) : r.store === 'notes' || r.store === 'tasks' ? !e.data.growId : true))
      .sort((a, b) => String(b.data.updatedAt ?? '').localeCompare(String(a.data.updatedAt ?? ''))),
  })).filter((g) => g.items.length);
  const empty = !loading && groups.length === 0;

  return (
    <div className="space-y-5">
      {canCreate && (
        <div className="flex flex-wrap gap-2">
          {ROOTS.filter((r) => r.create).map((r) => (
            <button key={r.store} type="button" className="btn-ghost text-[12.5px]" onClick={() => setCreating(r.store)}>
              <Plus className="size-3.5" /> {r.create}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      ) : empty ? (
        <EmptyState
          icon={<ArrowRightLeft />}
          title={t('collab.sp.noContent')}
          text={
            canCreate ? (
              <>
                {t('collab.sp.noContentOwner')}
              </>
            ) : (
              t('collab.sp.noContentMember')
            )
          }
        />
      ) : (
        groups.map((g) => (
          <section key={g.store} aria-label={STORE_LABEL[g.store]}>
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5">
                <g.icon className="size-3.5" /> {STORE_LABEL[g.store]} <span className="text-ink-500">({g.items.length})</span>
              </span>
            </SectionTitle>
            {g.store === 'tasks' ? (
              <TaskList items={g.items} session={session} canEdit={!!d.permissions['resource.update']} spaceId={d.space.id} />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((e) => (
                  <EntryCard key={e.id} e={e} spaceId={d.space.id} session={session} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
      {creating && (
        <EntryEditor
          spaceId={d.space.id}
          session={session}
          store={creating}
          onClose={() => setCreating(null)}
          onSaved={(id) => {
            setCreating(null);
            if (creating !== 'tasks') navigate(`together/spaces/${d.space.id}/${creating}/${encodeURIComponent(id)}`);
          }}
        />
      )}
    </div>
  );
}

function EntryCard({ e, spaceId, session }: { e: SpaceEntry; spaceId: string; session: SpaceSession }) {
  const sub = useMemo(() => {
    if (e.store === 'grows') {
      const plants = session.list('plants').filter((p) => p.data.growId === e.id).length;
      const acts = session.list('activities').filter((a) => a.data.growId === e.id).length;
      return t('collab.sp.growSub', { p: plants, a: acts });
    }
    if (e.store === 'journal') return String(e.data.date ?? '').slice(0, 10);
    if (e.store === 'strains') return [e.data.breeder, e.data.genetics].filter(Boolean).join(' · ') || t('collab.sp.cStrain');
    if (e.store === 'labReports') return [e.data.labName, String(e.data.testDate ?? '')].filter(Boolean).join(' · ') || 'Laborbericht';
    if (e.store === 'notes') return String(e.data.text ?? '').slice(0, 80);
    return '';
  }, [e, session]);
  return (
    <a href={href(`together/spaces/${spaceId}/${e.store}/${encodeURIComponent(e.id)}`)} className="card flex flex-col gap-1.5 p-3.5 transition-colors hover:border-white/[0.12]">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[14px] font-medium text-ink-100">{entryTitle(e.store, e.data)}</span>
        {e.pending && <span className="shrink-0 text-[10.5px] text-amber-300">ausstehend</span>}
      </div>
      {sub && <span className="line-clamp-2 text-[12px] text-ink-400">{sub}</span>}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <OriginBadge origin={e.origin} />
        <AccessBadge access={e.access} />
      </div>
    </a>
  );
}

function TaskList({ items, session, canEdit, spaceId }: { items: SpaceEntry[]; session: SpaceSession; canEdit: boolean; spaceId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="card divide-y divide-white/[0.05]">
      {items
        .sort((a, b) => String(a.data.date ?? '').localeCompare(String(b.data.date ?? '')))
        .map((tb) => {
          const done = ((tb.data.completedDates as string[]) ?? []).length > 0;
          return (
            <li key={tb.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <input
                type="checkbox"
                aria-label={t('collab.sp.taskDone', { title: entryTitle('tasks', tb.data) })}
                className="size-4 accent-[var(--color-leaf-400)]"
                checked={done}
                disabled={!canEdit}
                onChange={() => session.save('tasks', { ...tb.data, id: tb.id, completedDates: done ? [] : [today] })}
              />
              <a href={href(`together/spaces/${spaceId}/tasks/${encodeURIComponent(tb.id)}`)} className={`min-w-0 flex-1 truncate text-[13px] ${done ? 'text-ink-500 line-through' : 'text-ink-100'}`}>
                {entryTitle('tasks', tb.data)}
              </a>
              {typeof tb.data.date === 'string' && <span className="shrink-0 text-[12px] text-ink-400">{new Date(tb.data.date).toLocaleDateString(intlLocale())}</span>}
            </li>
          );
        })}
    </ul>
  );
}

/* ───────────── Mitglieder ───────────── */

function MembersTab({ d, reload }: { d: SpaceDetail; reload: () => Promise<void> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const reauth = useReauth();
  const [inviting, setInviting] = useState(false);
  const owner = d.space.role === 'owner';
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      await reload();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  const remove = async (m: Member) => {
    const ok = await confirm({
      title: t('collab.sp.removeTitle', { name: nameOf(m) }),
      message: t('collab.sp.removeMsg'),
      confirmLabel: t('collab.sp.remove'),
      tone: 'danger',
    });
    if (ok) await run(() => collab.removeMember(d.space.id, m.ref), t('collab.sp.removed'));
  };
  const leave = async () => {
    const me = d.members.find((m) => m.isMe)!;
    const ok = await confirm({
      title: t('collab.sp.leaveTitle'),
      message: t('collab.sp.leaveMsg'),
      confirmLabel: t('collab.sp.leave'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await collab.removeMember(d.space.id, me.ref);
      toast(t('collab.sp.left'));
      navigate('together');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  const transfer = async (m: Member) => {
    const ok = await confirm({
      title: t('collab.sp.transferTitle', { name: nameOf(m) }),
      message: t('collab.sp.transferMsg', { name: nameOf(m) }),
      confirmLabel: t('collab.sp.offer'),
    });
    if (ok) await run(() => reauth(() => collab.offerTransfer(d.space.id, m.ref)), t('collab.sp.offered'));
  };
  return (
    <div className="space-y-5">
      <section className="card p-4 sm:p-5" aria-label={t('collab.sp.members')}>
        <SectionTitle
          action={
            owner && (
              <button type="button" className="btn-primary py-1.5 text-[12.5px]" onClick={() => setInviting(true)}>
                <UserPlus className="size-3.5" /> {t('collab.sp.invite')}
              </button>
            )
          }
        >
          {t('collab.sp.members')}
        </SectionTitle>
        <div className="divide-y divide-white/[0.05]">
          {d.members.map((m) => (
            <PersonRow
              key={m.ref}
              identity={m}
              meta={m.isMe ? t('collab.sp.you') : t('collab.fr.since', { date: new Date(m.since).toLocaleDateString(intlLocale()) })}
              actions={
                <>
                  {owner && m.role !== 'owner' ? (
                    <select
                      aria-label={t('collab.sp.roleOf', { name: nameOf(m) })}
                      className="input-base w-auto py-1 text-[12.5px]"
                      value={m.role}
                      onChange={(e) => run(() => collab.changeRole(d.space.id, m.ref, e.target.value as Role), t('collab.sp.roleChanged'))}
                    >
                      {(['editor', 'commenter', 'viewer'] as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                  {owner && m.role !== 'owner' && (
                    <>
                      <button type="button" className="btn-ghost p-1.5" title={t('collab.sp.transferOwn')} aria-label={t('collab.sp.transferTo', { name: nameOf(m) })} onClick={() => transfer(m)}>
                        <Crown className="size-3.5" />
                      </button>
                      <button type="button" className="btn-ghost p-1.5" title={t('collab.sp.remove')} aria-label={t('collab.sp.removeX', { name: nameOf(m) })} onClick={() => remove(m)}>
                        <X className="size-3.5" />
                      </button>
                    </>
                  )}
                </>
              }
            />
          ))}
        </div>
        {d.space.pendingOwner && owner && (
          <p className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200">
            Übertragung an {nameOf(d.space.pendingOwner)} angeboten – wartet auf Annahme.
            <button type="button" className="underline" onClick={() => run(() => collab.cancelTransfer(d.space.id), t('collab.sp.withdrawn'))}>
              {t('collab.sp.withdraw')}
            </button>
          </p>
        )}
      </section>
      {owner && d.invites.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label={t('collab.sp.openInvites')}>
          <SectionTitle>{t('collab.sp.openInvites')}</SectionTitle>
          <div className="divide-y divide-white/[0.05]">
            {d.invites.map((i) => (
              <PersonRow
                key={i.id}
                identity={i.invitee}
                meta={t('collab.sp.inviteMeta', { role: ROLE_LABEL[i.role], date: new Date(i.expiresAt).toLocaleDateString(intlLocale()) })}
                actions={
                  <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => run(() => collab.revokeSpaceInvite(d.space.id, i.id), t('collab.sp.revokeInvite'))}>
                    {t('collab.sp.revoke')}
                  </button>
                }
              />
            ))}
          </div>
        </section>
      )}
      {!owner && (
        <button type="button" className="btn-ghost text-rose-200" onClick={leave}>
          <LogOut className="size-4" /> {t('collab.sp.left')}
        </button>
      )}
      {inviting && <InviteModal d={d} onClose={() => setInviting(false)} onDone={reload} />}
    </div>
  );
}

function InviteModal({ d, onClose, onDone }: { d: SpaceDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast();
  const friends = useLoad(() => collab.overview(), []);
  const [ref, setRef] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [busy, setBusy] = useState(false);
  const candidates = (friends.data?.friends ?? []).filter((f) => !d.members.some((m) => m.ref === f.ref) && !d.invites.some((i) => i.invitee.ref === f.ref));
  const submit = async () => {
    setBusy(true);
    try {
      await collab.invite(d.space.id, ref, role);
      toast(t('collab.sp.inviteSent'));
      await onDone();
      onClose();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('collab.sp.invite')}
      subtitle={t('collab.sp.inviteSub')}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={!ref || busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} {t('collab.sp.inviteBtn')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!friends.data ? (
          <div className="skeleton h-24" />
        ) : candidates.length === 0 ? (
          <p className="text-[13px] text-ink-400">
            Keine weiteren Freunde zum Einladen. <a className="text-leaf-300 hover:underline" href={href('together/friends')}>{t('collab.sp.addFriends')}</a>
          </p>
        ) : (
          <fieldset className="max-h-56 space-y-1 overflow-y-auto">
            <legend className="label mb-1.5">{t('collab.sp.friend')}</legend>
            {candidates.map((f) => (
              <label key={f.ref} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${ref === f.ref ? 'border-leaf-500/40 bg-leaf-500/[0.07]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
                <input type="radio" name="invite-friend" className="accent-[var(--color-leaf-400)]" checked={ref === f.ref} onChange={() => setRef(f.ref)} />
                <Avatar identity={f} size="xs" />
                <span className="truncate text-[13px] text-ink-100">{nameOf(f, f.nickname)}</span>
              </label>
            ))}
          </fieldset>
        )}
        <RolePicker name="invite-role" value={role} onChange={setRole} />
      </div>
    </Modal>
  );
}

/* ───────────── Aktivität ───────────── */

function ActivityTab({ spaceId, session }: { spaceId: string; session: SpaceSession }) {
  const [items, setItems] = useState<ActivityView[] | null>(null);
  const [more, setMore] = useState(false);
  const load = useCallback(
    async (before?: string) => {
      const r = await collab.activity(spaceId, before);
      setItems((cur) => (before && cur ? [...cur, ...r.activity] : r.activity));
      setMore(r.more);
    },
    [spaceId],
  );
  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);
  const titleOf = (store: string, id: string) => {
    const e = session.get(store as SpaceStore, id);
    return e ? entryTitle(e.store, e.data) : undefined;
  };
  if (!items) return <div className="skeleton h-40" />;
  return (
    <section className="card p-4 sm:p-5" aria-label={t('collab.sp.history')}>
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-400">{t('collab.sp.noActivity')}</p>
      ) : (
        <ol className="relative space-y-3 border-l border-white/[0.06] pl-5">
          {items.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[1.6rem] top-0.5">
                <Avatar identity={a.actor} size="xs" />
              </span>
              <p className="text-[13px] leading-snug text-ink-200">{activityText(a, titleOf)}</p>
              <p className="text-[11px] text-ink-500">{relTime(a.updatedAt)}</p>
            </li>
          ))}
        </ol>
      )}
      {more && (
        <button type="button" className="btn-ghost mt-3 text-[12.5px]" onClick={() => load(items[items.length - 1]?.id)}>
          {t('collab.sp.older')}
        </button>
      )}
      <p className="hint mt-4">{t('collab.sp.historyNote')}</p>
    </section>
  );
}

/* ───────────── Einstellungen ───────────── */

function SettingsTab({ d, reload }: { d: SpaceDetail; reload: () => Promise<void> }) {
  const toast = useToast();
  const reauth = useReauth();
  const owner = d.space.role === 'owner';
  const [name, setName] = useState(d.space.name);
  const [description, setDescription] = useState(d.space.description ?? '');
  const [accent, setAccent] = useState<Accent>(d.space.accent ?? 'emerald');
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<string>();
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      await reload();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    } finally {
      setBusy(undefined);
    }
  };
  const exportZip = async () => {
    setBusy('export');
    try {
      const buf = await collab.exportSpace(d.space.id);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/zip' }));
      a.download = `terpgrid-bereich-${d.space.name.replace(/[^\w-]+/g, '-').slice(0, 40)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <div className="space-y-5">
      {owner && (
        <section className="card space-y-4 p-4 sm:p-5" aria-label={t('collab.sp.edit')}>
          <SectionTitle>{t('collab.sp.space')}</SectionTitle>
          <label className="block space-y-1.5">
            <span className="label">{t('collab.sp.name')}</span>
            <input className="input-base" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="label">{t('collab.sp.desc')}</span>
            <textarea className="input-base min-h-20 resize-y" maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <fieldset>
            <legend className="label mb-1.5">{t('collab.sp.accent')}</legend>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button key={a} type="button" aria-label={ACCENT_LABEL[a]} aria-pressed={accent === a} onClick={() => setAccent(a)} className={`size-8 rounded-full ${ACCENT_CLASS[a].dot} ring-offset-2 ring-offset-ink-900 ${accent === a ? 'ring-2 ring-white/80' : 'opacity-70 hover:opacity-100'}`} />
              ))}
            </div>
          </fieldset>
          <button type="button" className="btn-primary" disabled={busy === 'meta' || name.trim().length < 2} onClick={() => run('meta', () => collab.updateSpace(d.space.id, { name: name.trim(), description: description.trim(), accent }), t('collab.sp.saved'))}>
            <Settings className="size-4" /> {t('common.save.button')}
          </button>
          <div className="border-t border-white/[0.06] pt-4">
            <Toggle
              label={t('collab.sp.allowExport')}
              hint={t('collab.sp.exportHint')}
              checked={d.space.allowExport}
              onChange={(v) => run('export-opt', () => collab.updateSpace(d.space.id, { allowExport: v }), t('collab.sp.saved'))}
            />
          </div>
        </section>
      )}

      <section className="card space-y-3 p-4 sm:p-5" aria-label={t('collab.sp.export')}>
        <SectionTitle>{t('collab.sp.export')}</SectionTitle>
        <p className="text-[12.5px] text-ink-400">{t('collab.sp.exportText')}</p>
        <button type="button" className="btn-ghost" disabled={!d.permissions['space.export'] || busy === 'export'} onClick={exportZip}>
          {busy === 'export' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {t('collab.sp.exportBtn')}
        </button>
        {!d.permissions['space.export'] && <p className="hint">{t('collab.sp.exportDenied')}</p>}
      </section>

      <section className="card space-y-2 p-4 sm:p-5" aria-label={t('collab.sp.security')}>
        <SectionTitle>{t('collab.sp.security')}</SectionTitle>
        <ul className="space-y-1 text-[12.5px] text-ink-300">
          <li>{t('collab.sp.keyGen', { n: d.space.keyGeneration })}</li>
          <li>{t('collab.sp.noE2ee')}</li>
          <li>{t('collab.sp.storage', { size: formatBytes(d.space.storageBytes) })}</li>
        </ul>
        {owner && (
          <button type="button" className="btn-ghost mt-2 text-[12.5px]" disabled={busy === 'rotate'} onClick={() => run('rotate', () => reauth(() => collab.rotateKey(d.space.id)), t('collab.sp.keyRenewed'))}>
            {busy === 'rotate' ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} {t('collab.sp.rotate')}
          </button>
        )}
      </section>

      {owner && (
        <section className="card space-y-3 border-rose-500/20 p-4 sm:p-5" aria-label={t('collab.sp.delete')}>
          <SectionTitle>{t('collab.sp.delete')}</SectionTitle>
          {!deleting ? (
            <button type="button" className="btn-ghost text-rose-200" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" /> {t('collab.sp.deleteDots')}
            </button>
          ) : (
            <div className="space-y-3">
              <Callout tone="danger" title={t('collab.sp.final')}>
                {t('collab.sp.deleteWarn', { n: d.members.length - 1 })}
              </Callout>
              <label className="block space-y-1.5">
                <span className="label">{t('collab.sp.typeName', { name: d.space.name })}</span>
                <input className="input-base" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => setDeleting(false)}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn bg-rose-500/90 text-white hover:bg-rose-500"
                  disabled={confirmName.trim() !== d.space.name || busy === 'delete'}
                  onClick={async () => {
                    setBusy('delete');
                    try {
                      await reauth(() => collab.deleteSpace(d.space.id, confirmName.trim()));
                      toast(t('collab.sp.deleted'));
                      navigate('together');
                    } catch (e) {
                      toast(errorText(e), { tone: 'error' });
                    } finally {
                      setBusy(undefined);
                    }
                  }}
                >
                  <Trash2 className="size-4" /> {t('collab.sp.deleteFinal')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <p className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
        <AlertTriangle className="size-3.5" /> {t('collab.sp.created')} {new Date(d.space.createdAt).toLocaleDateString(intlLocale())} · <RefreshCw className="size-3" /> {t('collab.sp.rightsChecked')}
      </p>
    </div>
  );
}
