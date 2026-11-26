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

/** Profil eines Freundes bzw. Bereichsmitglieds – nur freigegebene Felder. */
export function FriendProfilePage({ refId }: { refId: string }) {
  const r = useLoad(() => collab.user(refId), [refId]);
  if (r.error)
    return <EmptyState icon={<Lock />} title="Profil nicht verfügbar" text="Dieses Profil ist nicht (mehr) für dich freigegeben." action={<a className="btn-primary" href={href('together/friends')}>Zu den Freunden</a>} />;
  if (!r.data) return <div className="skeleton h-64" />;
  const p = r.data.profile;
  const f = r.data.friend;
  const a = ACCENT_CLASS[(p.accent as keyof typeof ACCENT_CLASS) ?? 'emerald'];
  const lists: [string, string[] | undefined][] = [
    ['Lieblingssorten', p.favoriteStrains],
    ['Lieblingsterpene', p.favoriteTerpenes],
    ['Interessen', p.interests],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={nameOf(p, f?.nickname)} crumbs={[{ label: 'Gemeinsam', to: 'together' }, { label: 'Freunde', to: 'together/friends' }, { label: nameOf(p, f?.nickname) }]} />
      <section className={`card overflow-hidden`}>
        <div className={`h-20 ${a.soft}`} />
        <div className="-mt-10 space-y-4 p-5">
          <Avatar identity={p as Identity} size="xl" accent={p.accent as never} />
          <div>
            <div className="text-xl font-semibold text-ink-50">{p.displayName || (p.handle ? `@${p.handle}` : p.socialId)}</div>
            <div className="text-[13px] text-ink-400">
              {p.handle && `@${p.handle} · `}
              <span className="font-mono">{p.socialId}</span>
              {f?.nickname && ` · dein Spitzname: ${f.nickname}`}
            </div>
            {f && <div className="mt-1 text-[12px] text-ink-500">Befreundet seit {new Date(f.since).toLocaleDateString('de-DE')}</div>}
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
          {!p.bio && !lists.some(([, v]) => v?.length) && <p className="text-[12.5px] text-ink-400">Keine weiteren Profilangaben für dich freigegeben.</p>}
          <p className="hint">Du siehst nur Angaben, die diese Person ausdrücklich für Freunde freigegeben hat. Freundschaft gewährt keinen Zugriff auf private Daten.</p>
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
      toast(`Du bist jetzt mit ${nameOf(r.friend)} befreundet`);
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
        title="Einladung ungültig"
        text="Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte um einen neuen Link."
        action={
          <a className="btn-primary" href={href('together/friends')}>
            Zu den Freunden
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
        <p className="text-[13.5px] text-ink-300">lädt dich ein, auf dieser TERPGRID-Instanz befreundet zu sein.</p>
        {state.alreadyFriends ? (
          <Callout tone="ok">Ihr seid bereits befreundet.</Callout>
        ) : (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={accept}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Einladung annehmen
          </button>
        )}
        <ul className="space-y-1 text-left text-[12px] text-ink-400">
          <li className="flex gap-1.5">
            <Check className="mt-0.5 size-3.5 shrink-0 text-leaf-400" /> Freunde sehen nur Profilangaben, die du freigibst.
          </li>
          <li className="flex gap-1.5">
            <Check className="mt-0.5 size-3.5 shrink-0 text-leaf-400" /> Kein Zugriff auf private Daten – geteilt wird nur, was ihr bewusst in einen Bereich legt.
          </li>
          <li className="flex gap-1.5">
            <Check className="mt-0.5 size-3.5 shrink-0 text-leaf-400" /> Jederzeit lösbar oder blockierbar.
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
      toast('Einstellung gespeichert');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  const cats: NotificationCategory[] = ['friends', 'invites', 'comments', 'updates', 'access'];
  return (
    <div className="space-y-6">
      <PageHeader title="Benachrichtigungen" subtitle="Nur in der App – keine Push-Dienste Dritter, keine E-Mails. Vorschauen enthalten keine Inhalte." />
      <TogetherTabs active="notifications" />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'all', label: 'Alle' },
          { value: 'prefs', label: 'Einstellungen' },
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
                {c === 'all' ? 'Alle Kategorien' : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <NotificationList key={category} category={category === 'all' ? undefined : category} />
        </section>
      ) : (
        <section className="card space-y-4 p-4 sm:p-5" aria-label="Benachrichtigungseinstellungen">
          {!prefs.data ? (
            <div className="skeleton h-40" />
          ) : (
            cats.map((c) => (
              <Toggle key={c} label={CATEGORY_LABEL[c]} hint={CATEGORY_HINT[c]} checked={prefs.data!.prefs[c]} onChange={(v) => (c === 'access' ? toast('Rechte- und Zugriffsmeldungen bleiben aus Sicherheitsgründen immer an.', { tone: 'info' }) : save(c, v))} />
            ))
          )}
          <p className="hint border-t border-white/[0.06] pt-3">
            Benachrichtigungen werden nur in TERPGRID angezeigt und nach 90 Tagen (gelesen) bzw. 30 Tagen (entfernt) gelöscht. Betreiber-Meldungen (z. B. Backup-Fehler) sind davon vollständig getrennt.
          </p>
        </section>
      )}
    </div>
  );
}
