/**
 * Datenschutz-Center 2.0 (Phase 5.5): vollständige, aktuelle Übersicht über Freunde,
 * Blockierungen, Profil-Sichtbarkeit, Freigaben, Mitgliedschaften, Einladungen und
 * Benachrichtigungen – mit sofortigem Widerruf und ehrlichen Erklärungen der Folgen.
 */
import { Ban, ChevronDown, Eye, Info, Lock, LogOut, Share2, ShieldCheck, UserMinus, Users, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useLoad } from '../../app/collab';
import { href } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { RoleBadge } from '../../components/collab/ui';
import { Callout } from '../../components/ui/Callout';
import { type ProfileField, collab } from '../../lib/collab/api';
import { CATEGORY_LABEL, ROLE_LABEL, nameOf } from '../../lib/collab/labels';
import { t, intlLocale, labels } from '../../i18n';

const FIELD = labels('collab.field', ['displayName', 'bio', 'accent', 'avatar', 'favoriteStrains', 'favoriteTerpenes', 'interests'] as ProfileField[]);

function Block({ title, count, icon, children, open: initial = false }: { title: string; count?: number; icon: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="rounded-xl border border-white/[0.06]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left">
        <span className="text-leaf-400">{icon}</span>
        <span className="flex-1 text-[13.5px] font-medium text-ink-100">{title}</span>
        {count !== undefined && <span className="rounded-full bg-white/[0.06] px-2 text-[11.5px] text-ink-300">{count}</span>}
        <ChevronDown className={`size-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-white/[0.05] px-3.5 py-3">{children}</div>}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-[12.5px] text-ink-400">{children}</p>;

export function PrivacyCenter2({ disabled }: { disabled: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const ov = useLoad(() => (disabled ? Promise.resolve(null) : collab.privacy()), [disabled]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      await ov.reload();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  const ask = async (title: string, message: ReactNode, label: string, fn: () => Promise<unknown>, ok: string) => {
    if (await confirm({ title, message, confirmLabel: label, tone: 'danger' })) await run(fn, ok);
  };

  const d = ov.data;
  return (
    <section id="zusammenarbeit" className="card scroll-mt-24 p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-leaf-500/10 text-leaf-300">
          <Users className="size-4" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink-50">{t('collab.pc.title')}</h2>
          <p className="mt-0.5 text-[13px] text-ink-400">{t('collab.pc.subtitle')}</p>
        </div>
      </div>
      {disabled ? (
        <Callout tone="info">{t('collab.pc.needServer')}</Callout>
      ) : ov.error ? (
        <Callout tone="danger">{ov.error}</Callout>
      ) : !d ? (
        <div className="skeleton h-40" />
      ) : (
        <div className="space-y-2.5">
          <Block title={t('collab.pc.visibility')} icon={<Eye className="size-4" />} open>
            <ul className="grid gap-1 sm:grid-cols-2">
              {(Object.keys(FIELD) as ProfileField[]).map((f) => (
                <li key={f} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-[12.5px]">
                  <span className="text-ink-300">{FIELD[f]}</span>
                  <span className={d.profile.visibility[f] === 'friends' ? 'text-leaf-200' : 'text-ink-400'}>{d.profile.visibility[f] === 'friends' ? t('collab.pc.friendsVis') : t('collab.pc.onlyMe')}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-ink-400">
              {t('collab.pc.handle', { h: d.profile.handle ? `@${d.profile.handle}` : t('collab.pc.notSet'), req: d.profile.requestsEnabled ? t('collab.pc.allowed') : t('collab.pc.off') })} ·{' '}
              <a className="text-leaf-300 hover:underline" href={href('together/profile')}>
                {t('collab.pc.editProfile')}
              </a>
            </p>
            <p className="hint mt-1">{t('collab.pc.noLogin')}</p>
          </Block>

          <Block title={t('collab.pc.friendsVis')} count={d.friends.length} icon={<Users className="size-4" />}>
            {d.friends.length === 0 ? (
              <Empty>{t('collab.pc.noFriends')}</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {d.friends.map((f) => (
                  <li key={f.ref} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px]">
                    <span className="text-ink-200">
                      {nameOf(f, f.nickname)} {f.profileHidden && <span className="text-[11.5px] text-ink-500">{t('collab.pc.hidden')}</span>}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className="btn-ghost py-1 text-[12px]"
                        onClick={() => ask(t('collab.pc.unfriendTitle', { name: nameOf(f, f.nickname) }), t('collab.pc.unfriendMsg'), t('collab.pc.end'), () => collab.removeFriend(f.ref), t('collab.pc.ended'))}
                      >
                        <UserMinus className="size-3.5" /> {t('collab.pc.end')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost py-1 text-[12px]"
                        onClick={() => ask(t('collab.pc.blockTitle', { name: nameOf(f, f.nickname) }), t('collab.pc.blockMsg'), t('collab.pc.block'), () => collab.block(f.ref, true), t('collab.pc.blocked'))}
                      >
                        <Ban className="size-3.5" /> {t('collab.pc.block')}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title={t('collab.pc.blockedList')} count={d.blocks.length} icon={<Ban className="size-4" />}>
            {d.blocks.length === 0 ? (
              <Empty>{t('collab.pc.noBlocked')}</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {d.blocks.map((b) => (
                  <li key={b.ref} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                    <span className="text-ink-200">{b.label}</span>
                    <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => run(() => collab.unblock(b.ref), t('collab.pc.unblocked'))}>
                      {t('collab.pc.unblock')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title={t('collab.pc.own')} count={d.ownedSpaces.length} icon={<Share2 className="size-4" />}>
            {d.ownedSpaces.length === 0 ? (
              <Empty>{t('collab.pc.noOwn')}</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {d.ownedSpaces.map((s) => {
                  const shares = d.outgoingShares.filter((x) => x.spaceId === s.id);
                  return (
                    <li key={s.id} className="py-2 text-[13px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a className="font-medium text-ink-100 hover:text-leaf-200" href={href(`together/spaces/${s.id}?tab=members`)}>
                          {s.name}
                        </a>
                        <span className="text-[12px] text-ink-400">{s.members} Mitglieder</span>
                      </div>
                      <div className="text-[12px] text-ink-400">
                        {shares.length ? shares.map((x) => x.mode === 'copy' ? t('collab.pc.copied', { n: x.count }) : t('collab.pc.moved', { n: x.count })).join(' · ') : t('collab.pc.noShared')}
                        {' · '}
                        <a className="text-leaf-300 hover:underline" href={href(`together/spaces/${s.id}?tab=members`)}>
                          {t('collab.pc.manage')}
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          <Block title={t('collab.pc.memberships')} count={d.memberships.length} icon={<Lock className="size-4" />}>
            {d.memberships.length === 0 ? (
              <Empty>{t('collab.pc.noMemberships')}</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {d.memberships.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px]">
                    <span className="min-w-0">
                      <a className="text-ink-100 hover:text-leaf-200" href={href(`together/spaces/${s.id}`)}>
                        {s.name}
                      </a>
                      <span className="text-[12px] text-ink-400"> · von {nameOf(s.owner)}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <RoleBadge role={s.role} />
                      <button
                        type="button"
                        className="btn-ghost py-1 text-[12px]"
                        onClick={async () => {
                          const me = (await collab.space(s.id)).members.find((m) => m.isMe);
                          if (me) await ask(t('collab.pc.leaveTitle', { name: s.name }), t('collab.pc.leaveMsg'), t('collab.pc.leave'), () => collab.removeMember(s.id, me.ref), t('collab.pc.left'));
                        }}
                      >
                        <LogOut className="size-3.5" /> {t('collab.pc.leave')}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block
            title={t('collab.pc.open')}
            count={d.spaceInvitesIncoming.length + d.spaceInvitesOutgoing.length + d.requests.incoming.length + d.requests.outgoing.filter((r) => r.status === 'pending').length + d.friendInvites.filter((i) => i.status === 'active').length}
            icon={<Info className="size-4" />}
          >
            <ul className="space-y-1.5 text-[12.5px] text-ink-300">
              {d.spaceInvitesIncoming.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span>{t('collab.pc.inviteFrom', { space: i.name, name: nameOf(i.from), role: ROLE_LABEL[i.role] })}</span>
                  <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => run(() => collab.answerSpaceInvite(i.id, 'decline'), t('collab.pc.declined'))}>
                    <X className="size-3.5" /> {t('collab.pc.decline')}
                  </button>
                </li>
              ))}
              {d.spaceInvitesOutgoing.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span>
                    Du hast {nameOf(i.invitee)} in „{i.spaceName}“ eingeladen ({ROLE_LABEL[i.role]})
                  </span>
                  <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => run(() => collab.revokeSpaceInvite(i.spaceId, i.id), t('collab.pc.revokeInvite'))}>
                    <X className="size-3.5" /> {t('collab.pc.revoke')}
                  </button>
                </li>
              ))}
              {d.requests.incoming.map((r) => (
                <li key={r.id}>{t('collab.pc.requestFrom', { name: nameOf(r.from) })} – <a className="text-leaf-300 hover:underline" href={href('together/friends')}>{t('collab.pc.answer')}</a></li>
              ))}
              {d.requests.outgoing
                .filter((r) => r.status === 'pending')
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>{t('collab.pc.requestTo', { name: r.target })}</span>
                    <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => run(() => collab.answerRequest(r.id, 'cancel'), t('collab.pc.withdrawn'))}>
                      <X className="size-3.5" /> {t('collab.pc.withdraw')}
                    </button>
                  </li>
                ))}
              {d.friendInvites
                .filter((i) => i.status === 'active')
                .map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span>{t('collab.pc.linkUntil', { date: new Date(i.expiresAt).toLocaleDateString(intlLocale()) })}</span>
                    <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => run(() => collab.revokeInvite(i.id), t('collab.pc.revokeLink'))}>
                      <X className="size-3.5" /> {t('collab.pc.revoke')}
                    </button>
                  </li>
                ))}
            </ul>
          </Block>

          <Block title={t('collab.pc.notifications')} icon={<ShieldCheck className="size-4" />}>
            <ul className="grid gap-1 sm:grid-cols-2">
              {Object.entries(d.notificationPrefs).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-[12.5px]">
                  <span className="text-ink-300">{CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]}</span>
                  <span className={v ? 'text-leaf-200' : 'text-ink-400'}>{v ? t('collab.pc.on') : t('collab.pc.off')}</span>
                </li>
              ))}
            </ul>
            <a className="mt-2 inline-flex text-[12.5px] text-leaf-300 hover:underline" href={href('together/notifications?tab=prefs')}>
              {t('collab.pc.changeSettings')}
            </a>
          </Block>

          <Block title={t('collab.pc.whatIf')} icon={<Info className="size-4" />}>
            <dl className="space-y-2.5 text-[12.5px] leading-relaxed">
              {[
                [t('collab.pc.q1'), t('collab.pc.a1')],
                [t('collab.pc.q2'), t('collab.pc.a2')],
                [t('collab.pc.q3'), t('collab.pc.a3')],
                [t('collab.pc.q4'), t('collab.pc.a4')],
                [t('collab.pc.q5'), t('collab.pc.a5')],
                [t('collab.pc.q6'), t('collab.pc.a6')],
                [t('collab.pc.q7'), t('collab.pc.a7')],
                [t('collab.pc.q8'), t('collab.pc.a8')],
              ].map(([q, a]) => (
                <div key={q}>
                  <dt className="font-medium text-ink-100">{q}</dt>
                  <dd className="text-ink-400">{a}</dd>
                </div>
              ))}
            </dl>
          </Block>
          <p className="hint">
            {t('collab.pc.encryption')}
          </p>
        </div>
      )}
    </section>
  );
}
