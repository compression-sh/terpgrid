import { Check, Loader2, Lock, ShieldAlert, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLoad } from '../../app/collab';
import { href, navigate } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { NotificationList } from '../../components/collab/Notifications';
import { Avatar, SectionTitle } from '../../components/collab/ui';
import { Callout } from '../../components/ui/Callout';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Segmented } from '../../components/ui/Segmented';
import { Toggle } from '../../components/ui/Toggle';
import { type Identity, type NotificationCategory, collab } from '../../lib/collab/api';
import { ACCENT_CLASS, CATEGORY_HINT, CATEGORY_LABEL, nameOf } from '../../lib/collab/labels';
import { TogetherTabs } from './TogetherTabs';
import { t, intlLocale } from '../../i18n';

/** Profil eines Freundes bzw. Bereichsmitglieds – nur freigegebene Felder. */
export function FriendProfilePage({ refId }: { refId: string }) {
  const r = useLoad(() => collab.user(refId), [refId]);
  if (r.error)
    return <EmptyState icon={<Lock />} title={t('collab.pp.unavailable')} text={t('collab.pp.unavailableText')} action={<a className="btn-primary" href={href('together/friends')}>{t('collab.pp.toFriends')}</a>} />;
  if (!r.data) return <div className="skeleton h-64" />;
  const p = r.data.profile;
  const f = r.data.friend;
  const a = ACCENT_CLASS[(p.accent as keyof typeof ACCENT_CLASS) ?? 'emerald'];
  const lists: [string, string[] | undefined][] = [
    [t('collab.pp.favStrains'), p.favoriteStrains],
    [t('collab.pp.favTerps'), p.favoriteTerpenes],
    [t('collab.pp.interests'), p.interests],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={nameOf(p, f?.nickname)} crumbs={[{ label: t('collab.pp.together'), to: 'together' }, { label: t('collab.pp.friends'), to: 'together/friends' }, { label: nameOf(p, f?.nickname) }]} />
      <section className={`card overflow-hidden`}>
        <div className={`h-20 ${a.soft}`} />
        <div className="-mt-10 space-y-4 p-5">
          <Avatar identity={p as Identity} size="xl" accent={p.accent as never} />
          <div>
            <div className="text-xl font-semibold text-ink-50">{p.displayName || (p.handle ? `@${p.handle}` : p.socialId)}</div>
            <div className="text-[13px] text-ink-400">
              {p.handle && `@${p.handle} · `}
              <span className="font-mono">{p.socialId}</span>
              {f?.nickname && t('collab.pp.nickname', { name: f.nickname })}
            </div>
            {f && <div className="mt-1 text-[12px] text-ink-500">{t('collab.pp.friendsSince', { date: new Date(f.since).toLocaleDateString(intlLocale()) })}</div>}
          </div>
          {p.bio && <p className="max-w-2xl whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-200">{p.bio}</p>}
          {lists
            .filter(([, v]) => v?.length)
            .map(([t, v]) => (
              <div key={t}>
                <SectionTitle>{t}</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {v!.map((x) => (
                    <span key={x} className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-0.5 text-[12px] text-ink-200">
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          {!p.bio && !lists.some(([, v]) => v?.length) && <p className="text-[12.5px] text-ink-400">{t('collab.pp.noMore')}</p>}
          <p className="hint">{t('collab.pp.onlyShared')}</p>
        </div>
      </section>
    </div>
  );
}

/** Einladungslink öffnen: Vorschau, dann bewusst annehmen. Token nur im URL-Fragment (nie an Server-Logs). */
export function InvitePage({ token }: { token: string }) {
  const toast = useToast();
  const [state, setState] = useState<{ inviter: Identity; expiresAt: string; alreadyFriends: boolean } | 'invalid' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    collab
      .previewInvite(token)
      .then(setState)
      .catch(() => setState('invalid'));
  }, [token]);
  const accept = async () => {
    setBusy(true);
    try {
      const r = await collab.redeemInvite(token);
      toast(t('collab.pp.nowFriends', { name: nameOf(r.friend) }));
      navigate('together/friends', { replace: true });
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
      setState('invalid');
    } finally {
      setBusy(false);
    }
  };
  if (state === null) return <div className="skeleton mx-auto h-48 max-w-md" />;
  if (state === 'invalid')
    return (
      <EmptyState
        icon={<ShieldAlert />}
        title={t('collab.pp.invalid')}
        text={t('collab.pp.invalidText')}
        action={
          <a className="btn-primary" href={href('together/friends')}>
            {t('collab.pp.toFriends')}
          </a>
        }
      />
    );
  return (
    <div className="mx-auto max-w-md space-y-5 py-6">
      <div className="card space-y-4 p-6 text-center">
        <div className="flex justify-center">
          <Avatar identity={state.inviter} size="xl" />
        </div>
        <div>
          <div className="text-lg font-semibold text-ink-50">{nameOf(state.inviter)}</div>
          <div className="text-[13px] text-ink-400">{state.inviter.handle ? `@${state.inviter.handle}` : state.inviter.socialId}</div>
        </div>
        <p className="text-[13.5px] text-ink-300">{t('collab.pp.invites')}</p>
        {state.alreadyFriends ? (
          <Callout tone="ok">{t('collab.pp.already')}</Callout>
        ) : (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={accept}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} {t('collab.pp.accept')}
          </button>
        )}
        <ul className="space-y-1 text-left text-[12px] text-ink-400">
          <li className="flex gap-1.5">
            <Check className="mt-0.5 size-3.5 shrink-0 text-leaf-400" /> {t('collab.pp.f1')}
          </li>
          <li className="flex gap-1.5">
            <Check className="mt-0.5 size-3.5 shrink-0 text-leaf-400" /> {t('collab.pp.f2')}
          </li>
          <li className="flex gap-1.5">
            <Check className="mt-0.5 size-3.5 shrink-0 text-leaf-400" /> {t('collab.pp.f3')}
          </li>
        </ul>
      </div>
    </div>
  );
}

export function NotificationsPage({ tab }: { tab?: string }) {
  const toast = useToast();
  const [view, setView] = useState<'all' | 'prefs'>(tab === 'prefs' ? 'prefs' : 'all');
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');
  const prefs = useLoad(() => collab.prefs(), []);
  const save = async (k: NotificationCategory, v: boolean) => {
    try {
      await collab.setPrefs({ ...prefs.data!.prefs, [k]: v });
      await prefs.reload();
      toast(t('collab.pp.prefSaved'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  const cats: NotificationCategory[] = ['friends', 'invites', 'comments', 'updates', 'access'];
  return (
    <div className="space-y-6">
      <PageHeader title={t('collab.pp.notifs')} subtitle={t('collab.pp.notifsSub')} />
      <TogetherTabs active="notifications" />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'all', label: t('collab.pp.all') },
          { value: 'prefs', label: t('collab.pp.settings') },
        ]}
      />
      {view === 'all' ? (
        <section className="card overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-3 py-2 [scrollbar-width:none]">
            {(['all', ...cats] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`min-h-7 shrink-0 rounded-full px-3 text-[12px] ${category === c ? 'bg-leaf-500/15 text-leaf-200' : 'text-ink-400 hover:text-ink-100'}`}
              >
                {c === 'all' ? t('collab.pp.allCats') : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <NotificationList key={category} category={category === 'all' ? undefined : category} />
        </section>
      ) : (
        <section className="card space-y-4 p-4 sm:p-5" aria-label={t('collab.pp.prefs')}>
          {!prefs.data ? (
            <div className="skeleton h-40" />
          ) : (
            cats.map((c) => (
              <Toggle key={c} label={CATEGORY_LABEL[c]} hint={CATEGORY_HINT[c]} checked={prefs.data!.prefs[c]} onChange={(v) => (c === 'access' ? toast(t('collab.pp.alwaysOn'), { tone: 'info' }) : save(c, v))} />
            ))
          )}
          <p className="hint border-t border-white/[0.06] pt-3">
            {t('collab.pp.retention')}
          </p>
        </section>
      )}
    </div>
  );
}
