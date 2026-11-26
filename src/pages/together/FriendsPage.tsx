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
      title: `Freundschaft mit ${nameOf(f, f.nickname)} beenden?`,
      message: (
        <ul className="ml-4 list-disc space-y-1">
          <li>Ihr seht eure freigegebenen Profilangaben nicht mehr.</li>
          <li>Offene Einladungen zwischen euch werden zurückgezogen.</li>
          <li>Gemeinsame Bereiche bleiben unverändert – Mitgliedschaften enden nicht automatisch.</li>
          <li>Die andere Person wird nicht benachrichtigt.</li>
        </ul>
      ),
      confirmLabel: 'Freundschaft beenden',
      tone: 'danger',
    });
    if (ok) await act(() => collab.removeFriend(f.ref), 'Freundschaft beendet');
  };
  const block = async (ref: string, label: string) => {
    const ok = await confirm({
      title: `${label} blockieren?`,
      message: (
        <ul className="ml-4 list-disc space-y-1">
          <li>Die Freundschaft endet; offene Anfragen und Einladungen zwischen euch werden beendet.</li>
          <li>Diese Person kann dir keine Anfragen, Einladungen oder Benachrichtigungen mehr senden und sieht dein Profil nicht.</li>
          <li>Sie wird aus deinen eigenen Bereichen entfernt. In Bereichen anderer Eigentümer bleibt ihr beide Mitglied – du kannst diese verlassen.</li>
          <li>Bereits heruntergeladene Kopien kann niemand aus der Ferne löschen.</li>
        </ul>
      ),
      confirmLabel: 'Blockieren',
      tone: 'danger',
    });
    if (ok) await act(() => collab.block(ref, true), 'Blockiert');
  };

  const d = ov.data;
  const link = invite ? `${location.origin}${location.pathname}#/together/invite/${invite.token}` : '';
  return (
    <div className="space-y-6">
      <PageHeader title="Freunde" subtitle="Private Freundschaften – ohne Verzeichnis, ohne öffentliche Suche." />
      <TogetherTabs active="friends" />
      {ov.error && <Callout tone="danger">{ov.error}</Callout>}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-4 sm:p-5" aria-label="Freund hinzufügen">
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <UserPlus className="size-3.5" /> Freund hinzufügen
            </span>
          </SectionTitle>
          <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="friend-target">
              Handle oder Social-ID
            </label>
            <input id="friend-target" className="input-base flex-1" placeholder="@handle oder TG-XXXX-XXXX" maxLength={60} value={target} onChange={(e) => setTarget(e.target.value)} autoComplete="off" />
            <button type="submit" className="btn-primary" disabled={sending || target.trim().length < 3}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Anfrage senden
            </button>
          </form>
          <p className="hint mt-2">
            Nur exakte Angaben. Aus Datenschutzgründen sagt TERPGRID nicht, ob es ein passendes Konto gibt – auch abgelehnte Anfragen bleiben für dich „ausstehend“ bis zum Ablauf nach 30 Tagen.
          </p>
          {sentMsg && <p className="mt-2 rounded-lg bg-leaf-500/10 px-3 py-2 text-[12.5px] text-leaf-200">{sentMsg}</p>}
          {d && (
            <p className="mt-3 text-[12.5px] text-ink-400">
              Deine Kennungen: {d.profile.handle ? <strong className="text-ink-200">@{d.profile.handle}</strong> : <a className="text-leaf-300 hover:underline" href={href('together/profile')}>Handle festlegen</a>} ·{' '}
              <strong className="font-mono text-ink-200">{d.profile.socialId}</strong>
            </p>
          )}
        </section>

        <section className="card p-4 sm:p-5" aria-label="Einladungscode">
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="size-3.5" /> Einladungscode
            </span>
          </SectionTitle>
          <p className="text-[12.5px] text-ink-400">Ein Link für genau eine Person, 7 Tage gültig, jederzeit widerrufbar. Wer ihn öffnet und annimmt, wird sofort dein Freund.</p>
          <button type="button" className="btn-ghost mt-3" onClick={newInvite}>
            <Link2 className="size-4" /> Neuen Einladungslink erstellen
          </button>
          {d && d.invites.filter((i) => i.status === 'active').length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {d.invites
                .filter((i) => i.status === 'active')
                .map((i) => (
                  <li key={i.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-1.5 text-[12px] text-ink-300">
                    <span>Aktiv · erstellt {relTime(i.createdAt)} · läuft {relTime(i.expiresAt).replace('vor', 'in')} ab</span>
                    <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-rose-300" onClick={() => act(() => collab.revokeInvite(i.id), 'Einladung widerrufen')}>
                      <X className="size-3.5" /> Widerrufen
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      {d && d.requests.incoming.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label="Eingehende Anfragen">
          <SectionTitle>Eingehende Anfragen</SectionTitle>
          <div className="divide-y divide-white/[0.05]">
            {d.requests.incoming.map((r) => (
              <PersonRow
                key={r.id}
                identity={r.from}
                meta={relTime(r.createdAt)}
                actions={
                  <>
                    <button type="button" className="btn-primary py-1.5 text-[12.5px]" onClick={() => act(() => collab.answerRequest(r.id, 'accept'), 'Ihr seid jetzt befreundet')}>
                      <Check className="size-3.5" /> Annehmen
                    </button>
                    <button type="button" className="btn-ghost py-1.5 text-[12.5px]" onClick={() => act(() => collab.answerRequest(r.id, 'decline'), 'Abgelehnt – die Person wird nicht informiert')}>
                      Ablehnen
                    </button>
                    <button type="button" className="btn-ghost p-1.5" aria-label={`${nameOf(r.from)} blockieren`} title="Blockieren" onClick={() => block(r.from.ref, nameOf(r.from))}>
                      <Ban className="size-3.5" />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="card p-4 sm:p-5" aria-label="Freunde">
        <SectionTitle>Freunde {d && <span className="text-ink-500">({d.friends.length})</span>}</SectionTitle>
        {!d ? (
          <div className="skeleton h-16" />
        ) : d.friends.length === 0 ? (
          <EmptyState compact icon={<UserPlus />} title="Noch keine Freunde" text="Sende eine Anfrage an ein exaktes Handle oder eine Social-ID – oder teile einen Einladungslink mit jemandem, dem du vertraust." />
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {d.friends.map((f) => (
              <PersonRow
                key={f.ref}
                identity={f}
                nickname={f.nickname}
                href={href(`together/friends/${f.ref}`)}
                meta={f.profileHidden ? 'Profil vor dieser Person verborgen' : `seit ${new Date(f.since).toLocaleDateString('de-DE')}`}
                actions={
                  <button type="button" className="btn-ghost p-1.5" aria-label={`Aktionen für ${nameOf(f, f.nickname)}`} onClick={() => setMenu(f)}>
                    <MoreHorizontal className="size-4" />
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {d && d.requests.outgoing.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label="Gesendete Anfragen">
          <SectionTitle>Gesendete Anfragen</SectionTitle>
          <ul className="divide-y divide-white/[0.05]">
            {d.requests.outgoing.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-ink-200">
                  {r.target} <span className="text-ink-500">· {r.status === 'accepted' ? 'angenommen' : r.status === 'pending' ? `ausstehend · gesendet ${relTime(r.createdAt)}` : r.status === 'expired' ? 'abgelaufen' : 'zurückgezogen'}</span>
                </span>
                {r.status === 'pending' && (
                  <button type="button" className="inline-flex min-h-6 items-center gap-1 text-[12px] text-ink-400 hover:text-ink-100" onClick={() => act(() => collab.answerRequest(r.id, 'cancel'), 'Anfrage zurückgezogen')}>
                    <X className="size-3.5" /> Zurückziehen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d && d.blocks.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label="Blockiert">
          <SectionTitle>Blockiert</SectionTitle>
          <ul className="divide-y divide-white/[0.05]">
            {d.blocks.map((b) => (
              <li key={b.ref} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="text-ink-200">
                  {b.label} <span className="text-ink-500">· seit {new Date(b.since).toLocaleDateString('de-DE')}</span>
                </span>
                <button type="button" className="inline-flex min-h-6 items-center gap-1 text-[12px] text-ink-400 hover:text-ink-100" onClick={() => act(() => collab.unblock(b.ref), 'Blockierung aufgehoben – eine Freundschaft entsteht dadurch nicht')}>
                  <ShieldOff className="size-3.5" /> Aufheben
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {invite && (
        <Modal open onClose={() => setInvite(null)} title="Einladungslink" subtitle="Wird nur jetzt angezeigt – gespeichert ist nur ein Prüfwert." size="sm">
          <div className="space-y-3">
            <input readOnly className="input-base font-mono text-[12px]" value={link} aria-label="Einladungslink" onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn-primary w-full"
              onClick={async () => {
                await navigator.clipboard?.writeText(link).catch(() => {});
                toast('Link kopiert');
              }}
            >
              <Clipboard className="size-4" /> Link kopieren
            </button>
            <p className="hint">Teile den Link nur mit der Person, die du einladen möchtest (z. B. persönlich oder per verschlüsseltem Messenger). Gültig bis {new Date(invite.expiresAt).toLocaleString('de-DE')}.</p>
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
      toast('Gespeichert');
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
            Abbrechen
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="label">Privater Spitzname</span>
          <input className="input-base" maxLength={40} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nur für dich sichtbar" />
          <span className="hint block">Verschlüsselt mit deinem Kontoschlüssel – die andere Person sieht ihn nie.</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-200">
          <input type="checkbox" className="mt-0.5 accent-[var(--color-leaf-400)]" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          <span>
            Mein Profil vor dieser Person verbergen
            <span className="hint block">Sie sieht dann nur noch Handle bzw. Social-ID und deinen Anzeigenamen, sonst keine Profilangaben.</span>
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
            <UserMinus className="size-3.5" /> Freundschaft beenden
          </button>
          <button
            type="button"
            className="btn-ghost text-[12.5px] text-rose-200"
            onClick={() => {
              onClose();
              onBlock();
            }}
          >
            <Trash2 className="size-3.5" /> Blockieren
          </button>
        </div>
      </div>
    </Modal>
  );
}
