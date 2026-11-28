import { Ban, Check, Clipboard, KeyRound, Link2, Loader2, MoreHorizontal, Send, ShieldOff, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useLoad } from '../../app/collab';
import { href } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { PersonRow, SectionTitle, relTime } from '../../components/collab/ui';
import { Callout } from '../../components/ui/Callout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { type Friend, collab } from '../../lib/collab/api';
import { nameOf } from '../../lib/collab/labels';
import { TogetherTabs } from './TogetherTabs';
import { t, intlLocale } from '../../i18n';

export function FriendsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const ov = useLoad(() => collab.overview(), []);
  const [target, setTarget] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState<string>();
  const [invite, setInvite] = useState<{ token: string; expiresAt: string } | null>(null);
  const [menu, setMenu] = useState<Friend | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const r = await collab.sendRequest(target.trim());
      setSentMsg(r.message);
      setTarget('');
      await ov.reload();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSending(false);
    }
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      await ov.reload();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    }
  };
  const newInvite = async () => {
    try {
      const r = await collab.createInvite(7);
      setInvite({ token: r.token, expiresAt: r.expiresAt });
      await ov.reload();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    }
  };
  const remove = async (f: Friend) => {
    const ok = await confirm({
      title: t('collab.pc.unfriendTitle', { name: nameOf(f, f.nickname) }),
      message: (
        <ul className="ml-4 list-disc space-y-1">
          <li>{t('collab.fr.u1')}</li>
          <li>{t('collab.fr.u2')}</li>
          <li>{t('collab.fr.u3')}</li>
          <li>{t('collab.fr.u4')}</li>
        </ul>
      ),
      confirmLabel: t('collab.fr.unfriend'),
      tone: 'danger',
    });
    if (ok) await act(() => collab.removeFriend(f.ref), t('collab.fr.unfriended'));
  };
  const block = async (ref: string, label: string) => {
    const ok = await confirm({
      title: t('collab.pc.blockTitle', { name: label }),
      message: (
        <ul className="ml-4 list-disc space-y-1">
          <li>{t('collab.fr.b1')}</li>
          <li>{t('collab.fr.b2')}</li>
          <li>{t('collab.fr.b3')}</li>
          <li>{t('collab.fr.b4')}</li>
        </ul>
      ),
      confirmLabel: t('collab.fr.block'),
      tone: 'danger',
    });
    if (ok) await act(() => collab.block(ref, true), t('collab.fr.blocked'));
  };

  const d = ov.data;
  const link = invite ? `${location.origin}${location.pathname}#/together/invite/${invite.token}` : '';
  return (
    <div className="space-y-6">
      <PageHeader title={t('collab.fr.title')} subtitle={t('collab.fr.subtitle')} />
      <TogetherTabs active="friends" />
      {ov.error && <Callout tone="danger">{ov.error}</Callout>}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-4 sm:p-5" aria-label={t('collab.fr.add')}>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <UserPlus className="size-3.5" /> {t('collab.fr.add')}
            </span>
          </SectionTitle>
          <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="friend-target">
              {t('collab.fr.handle')}
            </label>
            <input id="friend-target" className="input-base flex-1" placeholder={t('collab.fr.handlePh')} maxLength={60} value={target} onChange={(e) => setTarget(e.target.value)} autoComplete="off" />
            <button type="submit" className="btn-primary" disabled={sending || target.trim().length < 3}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t('collab.fr.send')}
            </button>
          </form>
          <p className="hint mt-2">
            {t('collab.fr.exact')}
          </p>
          {sentMsg && <p className="mt-2 rounded-lg bg-leaf-500/10 px-3 py-2 text-[12.5px] text-leaf-200">{sentMsg}</p>}
          {d && (
            <p className="mt-3 text-[12.5px] text-ink-400">
              {t('collab.fr.yourIds')} {d.profile.handle ? <strong className="text-ink-200">@{d.profile.handle}</strong> : <a className="text-leaf-300 hover:underline" href={href('together/profile')}>{t('collab.fr.setHandle')}</a>} ·{' '}
              <strong className="font-mono text-ink-200">{d.profile.socialId}</strong>
            </p>
          )}
        </section>

        <section className="card p-4 sm:p-5" aria-label={t('collab.fr.code')}>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="size-3.5" /> {t('collab.fr.code')}
            </span>
          </SectionTitle>
          <p className="text-[12.5px] text-ink-400">{t('collab.fr.codeHint')}</p>
          <button type="button" className="btn-ghost mt-3" onClick={newInvite}>
            <Link2 className="size-4" /> {t('collab.fr.newLink')}
          </button>
          {d && d.invites.filter((i) => i.status === 'active').length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {d.invites
                .filter((i) => i.status === 'active')
                .map((i) => (
                  <li key={i.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-1.5 text-[12px] text-ink-300">
                    <span>{t('collab.fr.activeLink', { created: relTime(i.createdAt), until: new Date(i.expiresAt).toLocaleDateString(intlLocale()) })}</span>
                    <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-rose-300" onClick={() => act(() => collab.revokeInvite(i.id), t('collab.fr.revokeInvite'))}>
                      <X className="size-3.5" /> {t('collab.fr.revoke')}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      {d && d.requests.incoming.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label={t('collab.fr.incoming')}>
          <SectionTitle>{t('collab.fr.incoming')}</SectionTitle>
          <div className="divide-y divide-white/[0.05]">
            {d.requests.incoming.map((r) => (
              <PersonRow
                key={r.id}
                identity={r.from}
                meta={relTime(r.createdAt)}
                actions={
                  <>
                    <button type="button" className="btn-primary py-1.5 text-[12.5px]" onClick={() => act(() => collab.answerRequest(r.id, 'accept'), t('collab.fr.nowFriends'))}>
                      <Check className="size-3.5" /> {t('collab.fr.accept')}
                    </button>
                    <button type="button" className="btn-ghost py-1.5 text-[12.5px]" onClick={() => act(() => collab.answerRequest(r.id, 'decline'), t('collab.fr.declinedSilent'))}>
                      {t('collab.fr.decline')}
                    </button>
                    <button type="button" className="btn-ghost p-1.5" aria-label={t('collab.pc.blockTitle', { name: nameOf(r.from) }).replace('?', '')} title={t('collab.fr.block')} onClick={() => block(r.from.ref, nameOf(r.from))}>
                      <Ban className="size-3.5" />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="card p-4 sm:p-5" aria-label={t('collab.fr.title')}>
        <SectionTitle>{t('collab.fr.title')} {d && <span className="text-ink-500">({d.friends.length})</span>}</SectionTitle>
        {!d ? (
          <div className="skeleton h-16" />
        ) : d.friends.length === 0 ? (
          <EmptyState compact icon={<UserPlus />} title={t('collab.fr.noFriends')} text={t('collab.fr.noFriendsText')} />
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {d.friends.map((f) => (
              <PersonRow
                key={f.ref}
                identity={f}
                nickname={f.nickname}
                href={href(`together/friends/${f.ref}`)}
                meta={f.profileHidden ? t('collab.fr.hidden') : t('collab.fr.since', { date: new Date(f.since).toLocaleDateString(intlLocale()) })}
                actions={
                  <button type="button" className="btn-ghost p-1.5" aria-label={t('collab.fr.actionsFor', { name: nameOf(f, f.nickname) })} onClick={() => setMenu(f)}>
                    <MoreHorizontal className="size-4" />
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {d && d.requests.outgoing.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label={t('collab.fr.sent')}>
          <SectionTitle>{t('collab.fr.sent')}</SectionTitle>
          <ul className="divide-y divide-white/[0.05]">
            {d.requests.outgoing.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-ink-200">
                  {r.target} <span className="text-ink-500">· {r.status === 'accepted' ? t('collab.fr.accepted') : r.status === 'pending' ? t('collab.fr.pending', { when: relTime(r.createdAt) }) : r.status === 'expired' ? t('collab.fr.expired') : t('collab.fr.withdrawn')}</span>
                </span>
                {r.status === 'pending' && (
                  <button type="button" className="inline-flex min-h-6 items-center gap-1 text-[12px] text-ink-400 hover:text-ink-100" onClick={() => act(() => collab.answerRequest(r.id, 'cancel'), t('collab.fr.withdrawnToast'))}>
                    <X className="size-3.5" /> {t('collab.fr.withdraw')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d && d.blocks.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label={t('collab.fr.blocked')}>
          <SectionTitle>{t('collab.fr.blocked')}</SectionTitle>
          <ul className="divide-y divide-white/[0.05]">
            {d.blocks.map((b) => (
              <li key={b.ref} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="text-ink-200">
                  {b.label} <span className="text-ink-500">· seit {new Date(b.since).toLocaleDateString(intlLocale())}</span>
                </span>
                <button type="button" className="inline-flex min-h-6 items-center gap-1 text-[12px] text-ink-400 hover:text-ink-100" onClick={() => act(() => collab.unblock(b.ref), t('collab.fr.unblocked'))}>
                  <ShieldOff className="size-3.5" /> {t('collab.fr.unblock')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {invite && (
        <Modal open onClose={() => setInvite(null)} title={t('collab.fr.link')} subtitle={t('collab.fr.linkSub')} size="sm">
          <div className="space-y-3">
            <input readOnly className="input-base font-mono text-[12px]" value={link} aria-label={t('collab.fr.link')} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn-primary w-full"
              onClick={async () => {
                await navigator.clipboard?.writeText(link).catch(() => {});
                toast(t('collab.fr.copied'));
              }}
            >
              <Clipboard className="size-4" /> {t('collab.fr.copy')}
            </button>
            <p className="hint">{t('collab.fr.shareHint')} {t('collab.fr.validUntil', { date: new Date(invite.expiresAt).toLocaleString(intlLocale()) })}</p>
          </div>
        </Modal>
      )}

      {menu && <FriendMenu friend={menu} onClose={() => setMenu(null)} onChanged={ov.reload} onRemove={() => remove(menu)} onBlock={() => block(menu.ref, nameOf(menu, menu.nickname))} />}
    </div>
  );
}

function FriendMenu({ friend, onClose, onChanged, onRemove, onBlock }: { friend: Friend; onClose: () => void; onChanged: () => Promise<void>; onRemove: () => void; onBlock: () => void }) {
  const toast = useToast();
  const [nickname, setNickname] = useState(friend.nickname ?? '');
  const [hidden, setHidden] = useState(friend.profileHidden);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await collab.updateFriend(friend.ref, { nickname: nickname.trim() || null, profileHidden: hidden });
      toast(t('collab.fr.saved'));
      await onChanged();
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
      size="sm"
      title={nameOf(friend, friend.nickname)}
      subtitle={friend.handle ? `@${friend.handle}` : friend.socialId}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>
            {t('common.save.button')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="label">{t('collab.fr.nickname')}</span>
          <input className="input-base" maxLength={40} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t('collab.fr.nickHint')} />
          <span className="hint block">{t('collab.fr.nickEnc')}</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-200">
          <input type="checkbox" className="mt-0.5 accent-[var(--color-leaf-400)]" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          <span>
            {t('collab.fr.hideProfile')}
            <span className="hint block">{t('collab.fr.hideHint')}</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            className="btn-ghost text-[12.5px]"
            onClick={() => {
              onClose();
              onRemove();
            }}
          >
            <UserMinus className="size-3.5" /> {t('collab.fr.unfriend')}
          </button>
          <button
            type="button"
            className="btn-ghost text-[12.5px] text-rose-200"
            onClick={() => {
              onClose();
              onBlock();
            }}
          >
            <Trash2 className="size-3.5" /> {t('collab.fr.block')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
