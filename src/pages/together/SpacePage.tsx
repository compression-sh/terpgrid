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
          title="Kein Zugriff"
          text="Dieser Bereich existiert nicht (mehr) oder du bist kein Mitglied mehr. Zwischengespeicherte Inhalte wurden aus diesem Browser entfernt."
          action={
            <a className="btn-primary" href={href('together')}>
              Zur Übersicht
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
    { id: 'content', label: 'Inhalte' },
    { id: 'members', label: `Mitglieder (${d.members.length})` },
    { id: 'activity', label: 'Aktivität' },
    { id: 'settings', label: 'Einstellungen' },
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Gemeinsam', to: 'together' }, { label: d.space.name }]}
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
      <nav aria-label="Bereich" className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/[0.06] px-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setQuery(route, { tab: t.id === 'content' ? undefined : t.id })}
            className={`relative min-h-10 shrink-0 px-3 text-[13px] font-medium ${tab === t.id ? 'text-ink-50' : 'text-ink-400 hover:text-ink-100'}`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-leaf-400" />}
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
  const label = st.phase === 'offline' ? 'Offline – Änderungen warten' : st.phase === 'syncing' || st.phase === 'loading' ? 'Synchronisiert …' : st.phase === 'error' ? 'Fehler beim Abgleich' : st.pending ? `${st.pending} ausstehend` : 'Aktuell';
  const Icon = st.phase === 'offline' || st.phase === 'error' ? CloudOff : st.phase === 'syncing' || st.phase === 'loading' ? Loader2 : Cloud;
  return (
    <button type="button" onClick={() => session.schedule(0)} title="Jetzt abgleichen" className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-white/[0.08] px-2 py-0.5 text-[11.5px] text-ink-300 hover:text-ink-100">
      <Icon className={`size-3.5 ${st.phase === 'syncing' || st.phase === 'loading' ? 'animate-spin' : ''} ${st.phase === 'error' ? 'text-rose-300' : st.phase === 'offline' ? 'text-amber-300' : 'text-leaf-400'}`} /> {label}
    </button>
  );
}

function SyncNotices({ session }: { session: SpaceSession }) {
  const st = session.state;
  return (
    <>
      {st.conflicts.map((c) => (
        <Callout key={c.key} tone="warn" title={`Konflikt: ${STORE_LABEL[c.store]} „${entryTitle(c.store, c.local ?? c.server.data ?? {})}“`}>
          <p>Jemand anderes hat diesen Eintrag gleichzeitig geändert{c.fields.length && c.fields[0] !== '(gesamt)' ? ` (Felder: ${c.fields.join(', ')})` : ''}. Nichts wurde überschrieben – entscheide bewusst.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => session.resolve(c.key, 'server')}>
              Andere Version übernehmen
            </button>
            {c.local && (
              <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => session.resolve(c.key, 'mine')}>
                Meine Version behalten
              </button>
            )}
          </div>
        </Callout>
      ))}
      {st.rejected.length > 0 && (
        <Callout tone="danger" title="Änderungen abgelehnt">
          <ul className="ml-4 list-disc">
            {st.rejected.slice(0, 5).map((r, i) => (
              <li key={i}>{r.error}</li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-[12px] underline" onClick={() => session.dismissRejected()}>
            Ausblenden
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
    <Callout tone="warn" title={`${items.length} eigene Änderungen wurden nicht übertragen`}>
      Dein Zugriff endete, bevor diese Änderungen gesendet wurden. Sie werden nicht mehr übertragen. Du kannst sie als Datei für dich sichern.
      <button type="button" className="btn-ghost mt-2 text-[12.5px]" onClick={download}>
        <Download className="size-4" /> Als Datei sichern
      </button>
    </Callout>
  );
}

function TransferOffer({ d, onDone }: { d: SpaceDetail; onDone: () => Promise<void> }) {
  const toast = useToast();
  const reauth = useReauth();
  const owner = d.members.find((m) => m.role === 'owner');
  return (
    <Callout tone="info" title="Eigentumsübertragung angeboten">
      {nameOf(owner)} möchte dir das Eigentum an diesem Bereich übertragen. Als Eigentümer verwaltest du Mitglieder und Rechte; die Dateien des Bereichs zählen dann zu deinem Speicherkontingent. {nameOf(owner)} wird „Bearbeiten“.
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-primary py-1.5 text-[12.5px]"
          onClick={async () => {
            try {
              await reauth(() => collab.acceptTransfer(d.space.id));
              toast('Du bist jetzt Eigentümer');
              await onDone();
            } catch (e) {
              toast(errorText(e), { tone: 'error' });
            }
          }}
        >
          <Crown className="size-3.5" /> Annehmen
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5 text-[12.5px]"
          onClick={async () => {
            await collab.cancelTransfer(d.space.id).catch(() => {});
            await onDone();
          }}
        >
          Ablehnen
        </button>
      </div>
    </Callout>
  );
}

/* ───────────── Inhalte ───────────── */

const ROOTS: { store: SpaceStore; icon: typeof Sprout; create?: string }[] = [
  { store: 'grows', icon: Sprout, create: 'Grow' },
  { store: 'plants', icon: Leaf },
  { store: 'tasks', icon: CheckSquare, create: 'Aufgabe' },
  { store: 'notes', icon: StickyNote, create: 'Notiz' },
  { store: 'strains', icon: Leaf, create: 'Sorte' },
  { store: 'journal', icon: FileText, create: 'Journal-Eintrag' },
  { store: 'inventory', icon: Package, create: 'Sammlungsstück' },
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
          title="Noch keine Inhalte"
          text={
            canCreate ? (
              <>
                Lege hier direkt etwas an – oder teile gezielt private Einträge über „Teilen“ auf der Seite eines Grows, einer Sorte, eines Journal-Eintrags, Sammlungsstücks oder Laborberichts.
              </>
            ) : (
              'Sobald Mitglieder mit Bearbeitungsrecht Inhalte hinzufügen, erscheinen sie hier.'
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
      return `${plants} Pflanzen · ${acts} Einträge`;
    }
    if (e.store === 'journal') return String(e.data.date ?? '').slice(0, 10);
    if (e.store === 'strains') return [e.data.breeder, e.data.genetics].filter(Boolean).join(' · ') || 'Sorte';
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
        .map((t) => {
          const done = ((t.data.completedDates as string[]) ?? []).length > 0;
          return (
            <li key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <input
                type="checkbox"
                aria-label={`${entryTitle('tasks', t.data)} erledigt`}
                className="size-4 accent-[var(--color-leaf-400)]"
                checked={done}
                disabled={!canEdit}
                onChange={() => session.save('tasks', { ...t.data, id: t.id, completedDates: done ? [] : [today] })}
              />
              <a href={href(`together/spaces/${spaceId}/tasks/${encodeURIComponent(t.id)}`)} className={`min-w-0 flex-1 truncate text-[13px] ${done ? 'text-ink-500 line-through' : 'text-ink-100'}`}>
                {entryTitle('tasks', t.data)}
              </a>
              {typeof t.data.date === 'string' && <span className="shrink-0 text-[12px] text-ink-400">{new Date(t.data.date).toLocaleDateString('de-DE')}</span>}
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
      title: `${nameOf(m)} entfernen?`,
      message: 'Der Zugriff endet sofort – auch auf allen Geräten dieser Person; nicht gesendete Änderungen werden abgelehnt. Bereits heruntergeladene Kopien (z. B. Exporte) können nicht aus der Ferne gelöscht werden. Inhalte und Kommentare der Person bleiben im Bereich.',
      confirmLabel: 'Entfernen',
      tone: 'danger',
    });
    if (ok) await run(() => collab.removeMember(d.space.id, m.ref), 'Mitglied entfernt');
  };
  const leave = async () => {
    const me = d.members.find((m) => m.isMe)!;
    const ok = await confirm({
      title: 'Bereich verlassen?',
      message: 'Du verlierst sofort den Zugriff auf alle Inhalte. Deine Beiträge und Kommentare bleiben im Bereich (sie gehören zum Bereich). Exportiere vorher, was du behalten möchtest. Wieder beitreten kannst du nur mit neuer Einladung.',
      confirmLabel: 'Verlassen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await collab.removeMember(d.space.id, me.ref);
      toast('Bereich verlassen');
      navigate('together');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  const transfer = async (m: Member) => {
    const ok = await confirm({
      title: `Eigentum an ${nameOf(m)} übertragen?`,
      message: `${nameOf(m)} muss die Übertragung annehmen. Danach verwaltet ${nameOf(m)} Mitglieder und Rechte, du wirst „Bearbeiten“. Die Dateien des Bereichs zählen dann zum Kontingent von ${nameOf(m)}.`,
      confirmLabel: 'Übertragung anbieten',
    });
    if (ok) await run(() => reauth(() => collab.offerTransfer(d.space.id, m.ref)), 'Übertragung angeboten – wartet auf Annahme');
  };
  return (
    <div className="space-y-5">
      <section className="card p-4 sm:p-5" aria-label="Mitglieder">
        <SectionTitle
          action={
            owner && (
              <button type="button" className="btn-primary py-1.5 text-[12.5px]" onClick={() => setInviting(true)}>
                <UserPlus className="size-3.5" /> Freund einladen
              </button>
            )
          }
        >
          Mitglieder
        </SectionTitle>
        <div className="divide-y divide-white/[0.05]">
          {d.members.map((m) => (
            <PersonRow
              key={m.ref}
              identity={m}
              meta={m.isMe ? 'du' : `seit ${new Date(m.since).toLocaleDateString('de-DE')}`}
              actions={
                <>
                  {owner && m.role !== 'owner' ? (
                    <select
                      aria-label={`Rolle von ${nameOf(m)}`}
                      className="input-base w-auto py-1 text-[12.5px]"
                      value={m.role}
                      onChange={(e) => run(() => collab.changeRole(d.space.id, m.ref, e.target.value as Role), 'Rolle geändert')}
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
                      <button type="button" className="btn-ghost p-1.5" title="Eigentum übertragen" aria-label={`Eigentum an ${nameOf(m)} übertragen`} onClick={() => transfer(m)}>
                        <Crown className="size-3.5" />
                      </button>
                      <button type="button" className="btn-ghost p-1.5" title="Entfernen" aria-label={`${nameOf(m)} entfernen`} onClick={() => remove(m)}>
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
            <button type="button" className="underline" onClick={() => run(() => collab.cancelTransfer(d.space.id), 'Übertragung zurückgezogen')}>
              Zurückziehen
            </button>
          </p>
        )}
      </section>
      {owner && d.invites.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label="Offene Einladungen">
          <SectionTitle>Offene Einladungen</SectionTitle>
          <div className="divide-y divide-white/[0.05]">
            {d.invites.map((i) => (
              <PersonRow
                key={i.id}
                identity={i.invitee}
                meta={`${ROLE_LABEL[i.role]} · läuft ${relTime(i.expiresAt).replace('vor', 'in')} ab`}
                actions={
                  <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => run(() => collab.revokeSpaceInvite(d.space.id, i.id), 'Einladung widerrufen')}>
                    Widerrufen
                  </button>
                }
              />
            ))}
          </div>
        </section>
      )}
      {!owner && (
        <button type="button" className="btn-ghost text-rose-200" onClick={leave}>
          <LogOut className="size-4" /> Bereich verlassen
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
      toast('Einladung gesendet');
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
      title="Freund einladen"
      subtitle="Nur bestätigte Freunde. Die Einladung gilt 14 Tage und kann widerrufen werden."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn-primary" disabled={!ref || busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Einladen
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!friends.data ? (
          <div className="skeleton h-24" />
        ) : candidates.length === 0 ? (
          <p className="text-[13px] text-ink-400">
            Keine weiteren Freunde zum Einladen. <a className="text-leaf-300 hover:underline" href={href('together/friends')}>Freunde hinzufügen</a>
          </p>
        ) : (
          <fieldset className="max-h-56 space-y-1 overflow-y-auto">
            <legend className="label mb-1.5">Freund</legend>
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
    <section className="card p-4 sm:p-5" aria-label="Aktivitätsverlauf">
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-400">Noch keine Aktivität.</p>
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
          Ältere laden
        </button>
      )}
      <p className="hint mt-4">Der Verlauf enthält nur, wer was wann getan hat – keine Inhalte. Einträge zu Inhalten, die du nicht sehen darfst, sind ausgeblendet.</p>
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
        <section className="card space-y-4 p-4 sm:p-5" aria-label="Bereich bearbeiten">
          <SectionTitle>Bereich</SectionTitle>
          <label className="block space-y-1.5">
            <span className="label">Name</span>
            <input className="input-base" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Beschreibung</span>
            <textarea className="input-base min-h-20 resize-y" maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <fieldset>
            <legend className="label mb-1.5">Akzentfarbe</legend>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button key={a} type="button" aria-label={ACCENT_LABEL[a]} aria-pressed={accent === a} onClick={() => setAccent(a)} className={`size-8 rounded-full ${ACCENT_CLASS[a].dot} ring-offset-2 ring-offset-ink-900 ${accent === a ? 'ring-2 ring-white/80' : 'opacity-70 hover:opacity-100'}`} />
              ))}
            </div>
          </fieldset>
          <button type="button" className="btn-primary" disabled={busy === 'meta' || name.trim().length < 2} onClick={() => run('meta', () => collab.updateSpace(d.space.id, { name: name.trim(), description: description.trim(), accent }), 'Gespeichert')}>
            <Settings className="size-4" /> Speichern
          </button>
          <div className="border-t border-white/[0.06] pt-4">
            <Toggle
              label="Export für „Kommentieren“ und „Ansehen“ erlauben"
              hint="Eigentümer und Bearbeitende können immer exportieren. Bildschirmfotos oder Abschriften lassen sich technisch nie verhindern."
              checked={d.space.allowExport}
              onChange={(v) => run('export-opt', () => collab.updateSpace(d.space.id, { allowExport: v }), 'Gespeichert')}
            />
          </div>
        </section>
      )}

      <section className="card space-y-3 p-4 sm:p-5" aria-label="Export">
        <SectionTitle>Export</SectionTitle>
        <p className="text-[12.5px] text-ink-400">ZIP mit allen Inhalten, die deine Rolle sehen darf (inkl. Fotos und Dokumente). Exporte liegen danach unverschlüsselt auf deinem Gerät und können nicht aus der Ferne widerrufen werden.</p>
        <button type="button" className="btn-ghost" disabled={!d.permissions['space.export'] || busy === 'export'} onClick={exportZip}>
          {busy === 'export' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Bereich exportieren
        </button>
        {!d.permissions['space.export'] && <p className="hint">Der Eigentümer hat den Export für deine Rolle nicht freigegeben.</p>}
      </section>

      <section className="card space-y-2 p-4 sm:p-5" aria-label="Sicherheit">
        <SectionTitle>Sicherheit</SectionTitle>
        <ul className="space-y-1 text-[12.5px] text-ink-300">
          <li>Eigener Bereichsschlüssel, Generation {d.space.keyGeneration} – serverseitig verschlüsselt (AES-256-GCM), getrennt von allen Kontoschlüsseln.</li>
          <li>Keine Ende-zu-Ende-Verschlüsselung: Der Server-Betreiber könnte technisch entschlüsseln.</li>
          <li>Speicher der Bereichsdateien: {formatBytes(d.space.storageBytes)} (zählt zum Kontingent des Eigentümers).</li>
        </ul>
        {owner && (
          <button type="button" className="btn-ghost mt-2 text-[12.5px]" disabled={busy === 'rotate'} onClick={() => run('rotate', () => reauth(() => collab.rotateKey(d.space.id)), 'Bereichsschlüssel erneuert')}>
            {busy === 'rotate' ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Bereichsschlüssel erneuern
          </button>
        )}
      </section>

      {owner && (
        <section className="card space-y-3 border-rose-500/20 p-4 sm:p-5" aria-label="Bereich löschen">
          <SectionTitle>Bereich löschen</SectionTitle>
          {!deleting ? (
            <button type="button" className="btn-ghost text-rose-200" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" /> Bereich löschen …
            </button>
          ) : (
            <div className="space-y-3">
              <Callout tone="danger" title="Endgültig für alle Mitglieder">
                Alle Inhalte, Fotos, Kommentare und der Verlauf werden gelöscht – auch Beiträge anderer Mitglieder ({d.members.length - 1} weitere). Mitglieder werden benachrichtigt. Exportierte Kopien bleiben bei ihren Besitzern. Der Bereichsschlüssel wird vernichtet;
                verschlüsselte Reste in Backups sind danach nicht mehr lesbar.
              </Callout>
              <label className="block space-y-1.5">
                <span className="label">Zur Bestätigung den Namen „{d.space.name}“ eingeben</span>
                <input className="input-base" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => setDeleting(false)}>
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="btn bg-rose-500/90 text-white hover:bg-rose-500"
                  disabled={confirmName.trim() !== d.space.name || busy === 'delete'}
                  onClick={async () => {
                    setBusy('delete');
                    try {
                      await reauth(() => collab.deleteSpace(d.space.id, confirmName.trim()));
                      toast('Bereich gelöscht');
                      navigate('together');
                    } catch (e) {
                      toast(errorText(e), { tone: 'error' });
                    } finally {
                      setBusy(undefined);
                    }
                  }}
                >
                  <Trash2 className="size-4" /> Endgültig löschen
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <p className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
        <AlertTriangle className="size-3.5" /> Angelegt {new Date(d.space.createdAt).toLocaleDateString('de-DE')} · <RefreshCw className="size-3" /> Rechte werden bei jeder Aktion serverseitig geprüft.
      </p>
    </div>
  );
}
