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

const FIELD: Record<ProfileField, string> = { displayName: 'Anzeigename', bio: 'Über mich', accent: 'Akzentfarbe', avatar: 'Profilbild', favoriteStrains: 'Lieblingssorten', favoriteTerpenes: 'Lieblingsterpene', interests: 'Interessen' };

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
          <h2 className="text-[15px] font-semibold text-ink-50">Zusammenarbeit & Freigaben</h2>
          <p className="mt-0.5 text-[13px] text-ink-400">Wer was sehen kann – mit sofortigem Widerruf. Nichts wird automatisch geteilt.</p>
        </div>
      </div>
      {disabled ? (
        <Callout tone="info">Für diese Übersicht ist eine Verbindung zum Server nötig.</Callout>
      ) : ov.error ? (
        <Callout tone="danger">{ov.error}</Callout>
      ) : !d ? (
        <div className="skeleton h-40" />
      ) : (
        <div className="space-y-2.5">
          <Block title="Profil-Sichtbarkeit" icon={<Eye className="size-4" />} open>
            <ul className="grid gap-1 sm:grid-cols-2">
              {(Object.keys(FIELD) as ProfileField[]).map((f) => (
                <li key={f} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-[12.5px]">
                  <span className="text-ink-300">{FIELD[f]}</span>
                  <span className={d.profile.visibility[f] === 'friends' ? 'text-leaf-200' : 'text-ink-400'}>{d.profile.visibility[f] === 'friends' ? 'Freunde' : 'Nur ich'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-ink-400">
              Handle: {d.profile.handle ? `@${d.profile.handle}` : 'nicht festgelegt'} · Anfragen über Handle/Social-ID: {d.profile.requestsEnabled ? 'erlaubt' : 'aus'} ·{' '}
              <a className="text-leaf-300 hover:underline" href={href('together/profile')}>
                Profil bearbeiten
              </a>
            </p>
            <p className="hint mt-1">Niemand sieht deinen Anmeldenamen. Es gibt kein öffentliches Profil und kein Verzeichnis.</p>
          </Block>

          <Block title="Freunde" count={d.friends.length} icon={<Users className="size-4" />}>
            {d.friends.length === 0 ? (
              <Empty>Keine Freunde.</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {d.friends.map((f) => (
                  <li key={f.ref} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px]">
                    <span className="text-ink-200">
                      {nameOf(f, f.nickname)} {f.profileHidden && <span className="text-[11.5px] text-ink-500">· Profil verborgen</span>}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className="btn-ghost py-1 text-[12px]"
                        onClick={() => ask(`Freundschaft mit ${nameOf(f, f.nickname)} beenden?`, 'Ihr seht eure freigegebenen Profilangaben nicht mehr; offene Einladungen zwischen euch werden zurückgezogen. Gemeinsame Bereiche bleiben unverändert.', 'Beenden', () => collab.removeFriend(f.ref), 'Freundschaft beendet')}
                      >
                        <UserMinus className="size-3.5" /> Beenden
                      </button>
                      <button
                        type="button"
                        className="btn-ghost py-1 text-[12px]"
                        onClick={() => ask(`${nameOf(f, f.nickname)} blockieren?`, 'Freundschaft endet, keine neuen Anfragen, Einladungen oder Benachrichtigungen mehr; Entfernung aus deinen eigenen Bereichen.', 'Blockieren', () => collab.block(f.ref, true), 'Blockiert')}
                      >
                        <Ban className="size-3.5" /> Blockieren
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Blockierte Konten" count={d.blocks.length} icon={<Ban className="size-4" />}>
            {d.blocks.length === 0 ? (
              <Empty>Niemand blockiert.</Empty>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {d.blocks.map((b) => (
                  <li key={b.ref} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                    <span className="text-ink-200">{b.label}</span>
                    <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => run(() => collab.unblock(b.ref), 'Blockierung aufgehoben')}>
                      Aufheben
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Eigene Bereiche (ausgehende Freigaben)" count={d.ownedSpaces.length} icon={<Share2 className="size-4" />}>
            {d.ownedSpaces.length === 0 ? (
              <Empty>Du besitzt keine gemeinsamen Bereiche.</Empty>
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
                        {shares.length ? shares.map((x) => `${x.count} ${x.mode === 'copy' ? 'als Kopie geteilt' : 'verschoben'}`).join(' · ') : 'Keine geteilten privaten Einträge'}
                        {' · '}
                        <a className="text-leaf-300 hover:underline" href={href(`together/spaces/${s.id}?tab=members`)}>
                          Mitglieder & Rechte verwalten
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          <Block title="Mitgliedschaften (mit dir geteilt)" count={d.memberships.length} icon={<Lock className="size-4" />}>
            {d.memberships.length === 0 ? (
              <Empty>Du bist in keinem fremden Bereich Mitglied.</Empty>
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
                          if (me) await ask(`„${s.name}“ verlassen?`, 'Du verlierst sofort den Zugriff. Deine Beiträge bleiben im Bereich (sie gehören zum Bereich). Exportiere vorher, was du behalten möchtest.', 'Verlassen', () => collab.removeMember(s.id, me.ref), 'Bereich verlassen');
                        }}
                      >
                        <LogOut className="size-3.5" /> Verlassen
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block
            title="Offene Einladungen & Anfragen"
            count={d.spaceInvitesIncoming.length + d.spaceInvitesOutgoing.length + d.requests.incoming.length + d.requests.outgoing.filter((r) => r.status === 'pending').length + d.friendInvites.filter((i) => i.status === 'active').length}
            icon={<Info className="size-4" />}
          >
            <ul className="space-y-1.5 text-[12.5px] text-ink-300">
              {d.spaceInvitesIncoming.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span>Einladung in „{i.name}“ von {nameOf(i.from)} ({ROLE_LABEL[i.role]})</span>
                  <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => run(() => collab.answerSpaceInvite(i.id, 'decline'), 'Abgelehnt')}>
                    <X className="size-3.5" /> Ablehnen
                  </button>
                </li>
              ))}
              {d.spaceInvitesOutgoing.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span>
                    Du hast {nameOf(i.invitee)} in „{i.spaceName}“ eingeladen ({ROLE_LABEL[i.role]})
                  </span>
                  <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => run(() => collab.revokeSpaceInvite(i.spaceId, i.id), 'Einladung widerrufen')}>
                    <X className="size-3.5" /> Widerrufen
                  </button>
                </li>
              ))}
              {d.requests.incoming.map((r) => (
                <li key={r.id}>Freundschaftsanfrage von {nameOf(r.from)} – <a className="text-leaf-300 hover:underline" href={href('together/friends')}>beantworten</a></li>
              ))}
              {d.requests.outgoing
                .filter((r) => r.status === 'pending')
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>Deine Anfrage an {r.target}</span>
                    <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => run(() => collab.answerRequest(r.id, 'cancel'), 'Zurückgezogen')}>
                      <X className="size-3.5" /> Zurückziehen
                    </button>
                  </li>
                ))}
              {d.friendInvites
                .filter((i) => i.status === 'active')
                .map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span>Aktiver Einladungslink (bis {new Date(i.expiresAt).toLocaleDateString('de-DE')})</span>
                    <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => run(() => collab.revokeInvite(i.id), 'Link widerrufen')}>
                      <X className="size-3.5" /> Widerrufen
                    </button>
                  </li>
                ))}
            </ul>
          </Block>

          <Block title="Benachrichtigungen" icon={<ShieldCheck className="size-4" />}>
            <ul className="grid gap-1 sm:grid-cols-2">
              {Object.entries(d.notificationPrefs).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-[12.5px]">
                  <span className="text-ink-300">{CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]}</span>
                  <span className={v ? 'text-leaf-200' : 'text-ink-400'}>{v ? 'an' : 'aus'}</span>
                </li>
              ))}
            </ul>
            <a className="mt-2 inline-flex text-[12.5px] text-leaf-300 hover:underline" href={href('together/notifications?tab=prefs')}>
              Einstellungen ändern
            </a>
          </Block>

          <Block title="Was passiert, wenn …" icon={<Info className="size-4" />}>
            <dl className="space-y-2.5 text-[12.5px] leading-relaxed">
              {[
                ['… ich einen Freund entferne?', 'Ihr seht eure freigegebenen Profilangaben nicht mehr, offene Einladungen zwischen euch enden. Gemeinsame Bereiche bleiben unverändert. Die Person wird nicht benachrichtigt.'],
                ['… ich jemanden blockiere?', 'Die Freundschaft endet, offene Anfragen und Einladungen werden beendet, die Person wird aus deinen eigenen Bereichen entfernt und kann dir nichts mehr senden. In Bereichen anderer Eigentümer bleibt ihr Mitglied – du kannst sie verlassen.'],
                ['… ich einen Bereich verlasse?', 'Dein Zugriff endet sofort. Deine Beiträge und Kommentare bleiben im Bereich, weil sie dort gemeinsam genutzt werden.'],
                ['… ich eine Freigabe widerrufe (Mitglied entferne)?', 'Der Zugriff endet beim nächsten Abruf – auch Offline-Geräte erhalten ihn nicht zurück; dort zwischengespeicherte Bereichsinhalte werden verworfen.'],
                ['… ein geteilter Eintrag gelöscht wird?', 'Er verschwindet für alle Mitglieder samt Unterinhalten. Geteilte Kopien sind unabhängig: Dein privates Original bleibt bestehen.'],
                ['… ich mein Konto lösche?', 'Bereiche, in denen nur du Mitglied bist, werden mitgelöscht. Besitzt du Bereiche mit weiteren Mitgliedern, musst du sie zuerst übertragen oder ausdrücklich löschen – Daten anderer werden nie still gelöscht. Deine Kommentare bleiben als „Gelöschtes Konto“ stehen.'],
                ['… ich das Eigentum übertrage?', 'Das Ziel muss annehmen. Danach verwaltet es Mitglieder und Rechte, du wirst „Bearbeiten“. Die Dateien zählen zu seinem Speicherkontingent.'],
                ['… jemand Inhalte heruntergeladen hat?', 'Exporte, Downloads und Bildschirmfotos liegen auf dem Gerät der Person und können nicht aus der Ferne widerrufen werden. Teile nur mit Menschen, denen du vertraust.'],
              ].map(([q, a]) => (
                <div key={q}>
                  <dt className="font-medium text-ink-100">{q}</dt>
                  <dd className="text-ink-400">{a}</dd>
                </div>
              ))}
            </dl>
          </Block>
          <p className="hint">
            Geteilte Inhalte sind serverseitig mit einem eigenen Bereichsschlüssel verschlüsselt (AES-256-GCM) – getrennt von deinem Kontoschlüssel. Keine Ende-zu-Ende-Verschlüsselung: Der Server-Betreiber könnte technisch entschlüsseln.
          </p>
        </div>
      )}
    </section>
  );
}
