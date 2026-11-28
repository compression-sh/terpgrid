import { ArrowRight, Check, FolderPlus, Inbox, Loader2, Lock, Plus, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useLoad } from '../../app/collab';
import { href, navigate } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { Avatar, RoleBadge, SectionTitle, relTime } from '../../components/collab/ui';
import { Callout } from '../../components/ui/Callout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Segmented } from '../../components/ui/Segmented';
import { type Accent, type SpaceKind, type SpaceSummary, collab } from '../../lib/collab/api';
import { ACCENTS, ACCENT_CLASS, ACCENT_LABEL, KIND_LABEL, ROLE_LABEL, nameOf } from '../../lib/collab/labels';
import { TogetherTabs } from './TogetherTabs';
import { t } from '../../i18n';

export function TogetherHome() {
  const toast = useToast();
  const spaces = useLoad(() => collab.spaces(), []);
  const social = useLoad(() => collab.overview(), []);
  const [create, setCreate] = useState(false);

  const answer = async (id: string, action: 'accept' | 'decline', spaceId?: string) => {
    try {
      await collab.answerSpaceInvite(id, action);
      toast(action === 'accept' ? t('collab.th.accepted') : t('collab.th.declined'), { tone: 'ok' });
      if (action === 'accept' && spaceId) navigate(`together/spaces/${spaceId}`);
      else await spaces.reload();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  const answerFriend = async (id: string, action: 'accept' | 'decline') => {
    try {
      await collab.answerRequest(id, action);
      toast(action === 'accept' ? t('collab.th.friends') : t('collab.th.reqDeclined'));
      await social.reload();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };

  const mine = spaces.data?.spaces.filter((s) => s.role === 'owner') ?? [];
  const shared = spaces.data?.spaces.filter((s) => s.role !== 'owner') ?? [];
  const invites = spaces.data?.invites ?? [];
  const requests = social.data?.requests.incoming ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('collab.th.title')}
        subtitle={t('collab.th.subtitle')}
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreate(true)}>
            <FolderPlus className="size-4" /> {t('collab.th.newSpace')}
          </button>
        }
      />
      <TogetherTabs active="overview" />

      {(spaces.error || social.error) && <Callout tone="danger">{spaces.error ?? social.error}</Callout>}

      {(invites.length > 0 || requests.length > 0) && (
        <section className="card p-4 sm:p-5" aria-label={t('collab.th.open')}>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="size-3.5" /> {t('collab.th.waiting')}
            </span>
          </SectionTitle>
          <ul className="divide-y divide-white/[0.05]">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${ACCENT_CLASS[i.accent ?? 'emerald'].soft} ${ACCENT_CLASS[i.accent ?? 'emerald'].text}`}>
                  <Users className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink-100">„{i.name}“</div>
                  <div className="text-[12px] text-ink-400">
                    {nameOf(i.from)} lädt dich ein · Rolle {ROLE_LABEL[i.role]} · läuft {relTime(i.expiresAt).replace('vor', 'in')} ab
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className="btn-primary py-1.5 text-[12.5px]" onClick={() => answer(i.id, 'accept', i.spaceId)}>
                    <Check className="size-3.5" /> {t('collab.th.join')}
                  </button>
                  <button type="button" className="btn-ghost py-1.5 text-[12.5px]" onClick={() => answer(i.id, 'decline')}>
                    {t('collab.th.decline')}
                  </button>
                </div>
              </li>
            ))}
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar identity={r.from} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink-100">{nameOf(r.from)}</div>
                  <div className="text-[12px] text-ink-400">möchte mit dir befreundet sein · {r.from.handle ? `@${r.from.handle}` : r.from.socialId}</div>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className="btn-primary py-1.5 text-[12.5px]" onClick={() => answerFriend(r.id, 'accept')}>
                    <Check className="size-3.5" /> {t('collab.th.accept')}
                  </button>
                  <button type="button" className="btn-ghost py-1.5 text-[12.5px]" onClick={() => answerFriend(r.id, 'decline')} aria-label={t('collab.th.declineFrom', { name: nameOf(r.from) })}>
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {spaces.loading && !spaces.data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
        </div>
      ) : (
        <>
          <section aria-label={t('collab.th.mine')}>
            <SectionTitle>{t('collab.th.mine')}</SectionTitle>
            {mine.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mine.map((s) => (
                  <SpaceCard key={s.id} s={s} />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<FolderPlus />}
                title={t('collab.th.noneOwn')}
                text={t('collab.th.noneOwnText')}
                action={
                  <button type="button" className="btn-primary" onClick={() => setCreate(true)}>
                    <Plus className="size-4" /> {t('collab.th.create')}
                  </button>
                }
              />
            )}
          </section>
          <section aria-label={t('collab.th.shared')}>
            <SectionTitle>{t('collab.th.shared')}</SectionTitle>
            {shared.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shared.map((s) => (
                  <SpaceCard key={s.id} s={s} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/[0.08] px-4 py-5 text-[13px] text-ink-400">
                {t('collab.th.sharedNone')}
              </p>
            )}
          </section>
        </>
      )}

      <section className="grid gap-3 sm:grid-cols-3" aria-label={t('collab.th.how')}>
        {[
          { icon: <Lock className="size-4" />, get ti() { return t('collab.th.p1'); }, get d() { return t('collab.th.p1d'); } },
          { icon: <ShieldCheck className="size-4" />, get ti() { return t('collab.th.p2'); }, get d() { return t('collab.th.p2d'); } },
          { icon: <UserPlus className="size-4" />, get ti() { return t('collab.th.p3'); }, get d() { return t('collab.th.p3d'); } },
        ].map((x) => (
          <div key={x.ti} className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-ink-100">
              <span className="text-leaf-400">{x.icon}</span> {x.ti}
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-400">{x.d}</p>
          </div>
        ))}
      </section>

      {create && <CreateSpaceModal onClose={() => setCreate(false)} />}
    </div>
  );
}

function SpaceCard({ s }: { s: SpaceSummary }) {
  const a = ACCENT_CLASS[s.accent ?? 'emerald'];
  return (
    <a href={href(`together/spaces/${s.id}`)} className="card group flex flex-col gap-3 p-4 transition-colors hover:border-white/[0.12]">
      <div className="flex items-start justify-between gap-2">
        <span className={`grid size-10 place-items-center rounded-xl ring-1 ${a.soft} ${a.text} ${a.ring}`}>
          <Users className="size-5" />
        </span>
        <RoleBadge role={s.role} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold text-ink-50">{s.name}</div>
        <div className="mt-0.5 line-clamp-2 min-h-[2.4em] text-[12.5px] text-ink-400">{s.description || KIND_LABEL[s.kind]}</div>
      </div>
      <div className="mt-auto flex items-center justify-between text-[11.5px] text-ink-500">
        <span>
          {t('collab.th.members', { count: s.members })} · {t('collab.th.entries', { count: s.resources })}
          {s.role !== 'owner' && t('collab.th.byOwner', { name: nameOf(s.owner) })}
        </span>
        <ArrowRight className="size-3.5 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-leaf-300" />
      </div>
      {s.pendingTransferToMe && <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-[11.5px] text-amber-200">{t('collab.th.transfer')}</span>}
    </a>
  );
}

export function CreateSpaceModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<SpaceKind>('project');
  const [accent, setAccent] = useState<Accent>('emerald');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await collab.createSpace({ name: name.trim(), description: description.trim() || undefined, kind, accent });
      toast(t('collab.th.created'), { tone: 'ok' });
      onClose();
      navigate(`together/spaces/${r.id}`);
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
      title={t('collab.th.newTitle')}
      subtitle={t('collab.th.newSub')}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={busy || name.trim().length < 2} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />} {t('collab.th.createBtn')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="label">{t('collab.th.name')}</span>
          <input className="input-base" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('collab.th.namePh')} />
        </label>
        <label className="block space-y-1.5">
          <span className="label">{t('collab.th.desc')}</span>
          <textarea className="input-base min-h-20 resize-y" maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('collab.th.descPh')} />
        </label>
        <Segmented label={t('collab.th.kind')} value={kind} onChange={setKind} options={(['project', 'collection', 'general'] as SpaceKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <fieldset>
          <legend className="label mb-1.5">{t('collab.th.accent')}</legend>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={ACCENT_LABEL[a]}
                aria-pressed={accent === a}
                onClick={() => setAccent(a)}
                className={`size-8 rounded-full ${ACCENT_CLASS[a].dot} ring-offset-2 ring-offset-ink-900 ${accent === a ? 'ring-2 ring-white/80' : 'opacity-70 hover:opacity-100'}`}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
