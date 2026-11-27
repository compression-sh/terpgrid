import { labels } from '../../i18n';
/**
 * Deutsche Texte für Zusammenarbeit. Benachrichtigungs- und Verlaufstexte enthalten nie
 * Inhalte (Notizen, Kommentartexte, Messwerte) – nur, wer was in welchem Bereich getan hat.
 */
import type { Access, Accent, ActivityView, Identity, NotificationCategory, NotificationView, Role, SpaceKind, SpaceStore } from './api';

export const ROLE_LABEL = labels('labels.role', ['owner', 'editor', 'commenter', 'viewer'] as Role[]);
export const ROLE_HINT = labels('labels.roleHint', ['owner', 'editor', 'commenter', 'viewer'] as Role[]);
export const ACCESS_LABEL = labels('labels.access', ['members', 'editors', 'readonly'] as Access[]);
export const ACCESS_HINT = labels('labels.accessHint', ['members', 'editors', 'readonly'] as Access[]);
export const KIND_LABEL = labels('labels.spaceType', ['project', 'collection', 'general'] as SpaceKind[]);
export const STORE_LABEL: Record<SpaceStore, string> = {
  grows: 'Grows',
  plants: 'Pflanzen',
  activities: 'Einträge',
  photos: 'Fotos',
  strains: 'Sorten',
  journal: 'Journal',
  inventory: 'Sammlung',
  labReports: 'Laborberichte',
  notes: 'Projektnotizen',
  tasks: 'Aufgaben',
};
export const STORE_SINGULAR: Record<SpaceStore, string> = {
  grows: 'Grow',
  plants: 'Pflanze',
  activities: 'Eintrag',
  photos: 'Foto',
  strains: 'Sorte',
  journal: 'Journal-Eintrag',
  inventory: 'Sammlungsstück',
  labReports: 'Laborbericht',
  notes: 'Notiz',
  tasks: 'Aufgabe',
};
export const CATEGORY_LABEL = labels('labels.notifCategory', ['friends', 'invites', 'comments', 'updates', 'access'] as NotificationCategory[]);
export const CATEGORY_HINT = labels('labels.notifCategoryHint', ['friends', 'invites', 'comments', 'updates', 'access'] as NotificationCategory[]);

/** Akzentfarben (Tailwind-Klassen statisch, damit sie im Build erhalten bleiben). */
export const ACCENT_CLASS: Record<Accent, { dot: string; ring: string; soft: string; text: string }> = {
  emerald: { dot: 'bg-leaf-400', ring: 'ring-leaf-400/40', soft: 'bg-leaf-500/12', text: 'text-leaf-300' },
  teal: { dot: 'bg-teal-400', ring: 'ring-teal-400/40', soft: 'bg-teal-500/12', text: 'text-teal-300' },
  sky: { dot: 'bg-sky-400', ring: 'ring-sky-400/40', soft: 'bg-sky-500/12', text: 'text-sky-300' },
  violet: { dot: 'bg-violet-400', ring: 'ring-violet-400/40', soft: 'bg-violet-500/12', text: 'text-violet-300' },
  amber: { dot: 'bg-amber-400', ring: 'ring-amber-400/40', soft: 'bg-amber-500/12', text: 'text-amber-300' },
  rose: { dot: 'bg-rose-400', ring: 'ring-rose-400/40', soft: 'bg-rose-500/12', text: 'text-rose-300' },
  lime: { dot: 'bg-lime-400', ring: 'ring-lime-400/40', soft: 'bg-lime-500/12', text: 'text-lime-300' },
};
export const ACCENTS: Accent[] = ['emerald', 'teal', 'sky', 'violet', 'amber', 'rose', 'lime'];
export const ACCENT_LABEL = labels('labels.accent', ['emerald', 'teal', 'sky', 'violet', 'amber', 'rose', 'lime'] as Accent[]);

/** Anzeigename einer Identität (privater Spitzname hat Vorrang) – nie der Anmeldename. */
export function nameOf(i: Identity | null | undefined, nickname?: string | null): string {
  if (!i || !i.ref) return 'Gelöschtes Konto';
  return nickname || i.displayName || (i.handle ? `@${i.handle}` : i.socialId || 'Mitglied');
}
export function initialsOf(i: Identity | null | undefined): string {
  const n = (i?.displayName || i?.handle || '?').replace(/^@/, '').trim();
  const parts = n.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const who = (n: NotificationView) => nameOf(n.actor);
const inSpace = (n: NotificationView) => (n.spaceName ? ` in „${n.spaceName}“` : '');
const times = (n: NotificationView) => (n.count > 1 ? ` (${n.count}×)` : '');

/** Text einer Benachrichtigung – ohne Inhalte, nur Ereignis, Auslöser und Bereich. */
export function notificationText(n: NotificationView): string {
  switch (n.type) {
    case 'friend.request':
      return `${who(n)} möchte mit dir befreundet sein.`;
    case 'friend.accepted':
      return `${who(n)} ist jetzt mit dir befreundet.`;
    case 'space.invite':
      return `${who(n)} lädt dich in einen gemeinsamen Bereich ein.`;
    case 'space.invite.accepted':
    case 'member.joined':
      return `${who(n)} ist${inSpace(n)} beigetreten.`;
    case 'space.update':
      return `${who(n)} hat${inSpace(n)} Inhalte hinzugefügt oder geändert${times(n)}.`;
    case 'comment.new':
      return `${who(n)} hat${inSpace(n)} kommentiert${times(n)}.`;
    case 'comment.reply':
      return `${who(n)} hat${inSpace(n)} auf deinen Kommentar geantwortet.`;
    case 'member.role':
      return `${who(n)} hat deine Rolle${inSpace(n)} auf „${ROLE_LABEL[(n.ref as Role) ?? 'viewer'] ?? 'geändert'}“ gesetzt.`;
    case 'member.left':
      return `${who(n)} hat${inSpace(n) || ' einen Bereich'} verlassen.`;
    case 'member.removed':
      return `${who(n)} hat dich aus einem gemeinsamen Bereich entfernt. Dein Zugriff wurde beendet.`;
    case 'space.transfer.offered':
      return n.ref === 'declined' ? `${who(n)} hat die Eigentumsübertragung${inSpace(n)} abgelehnt.` : `${who(n)} möchte dir das Eigentum${inSpace(n)} übertragen.`;
    case 'space.transfer.accepted':
      return `${who(n)} ist jetzt Eigentümer${inSpace(n)}.`;
    case 'space.deleted':
      return `${who(n)} hat einen gemeinsamen Bereich gelöscht, in dem du Mitglied warst.`;
    default:
      return 'Neue Benachrichtigung';
  }
}

/** Ziel eines Deep-Links (wird beim Öffnen regulär autorisiert). */
export function notificationLink(n: NotificationView): string {
  if (n.category === 'friends') return 'together/friends';
  if (n.type === 'space.invite') return 'together';
  if (n.type === 'member.removed' || n.type === 'space.deleted' || !n.spaceId) return 'together';
  if (n.store && n.targetId) return `together/spaces/${n.spaceId}/${n.store}/${encodeURIComponent(n.targetId)}`;
  return `together/spaces/${n.spaceId}`;
}

export function activityText(a: ActivityView, titleOf: (store: string, id: string) => string | undefined): string {
  const actor = nameOf(a.actor);
  const subject = a.subject ? nameOf(a.subject) : 'ein Mitglied';
  const target = a.store && a.targetId ? (titleOf(a.store, a.targetId) ? `„${titleOf(a.store, a.targetId)}“` : (STORE_SINGULAR[a.store as SpaceStore] ?? 'einen Eintrag')) : '';
  const n = a.count > 1 ? ` (${a.count}×)` : '';
  switch (a.type) {
    case 'space.created':
      return `${actor} hat den Bereich angelegt.`;
    case 'space.updated':
      return `${actor} hat Name oder Einstellungen geändert.`;
    case 'space.key.rotated':
      return `${actor} hat den Bereichsschlüssel erneuert.`;
    case 'space.transfer.offered':
      return `${actor} hat ${subject} das Eigentum angeboten.`;
    case 'space.transfer.accepted':
      return `${actor} hat das Eigentum übernommen.`;
    case 'member.joined':
      return `${actor} ist als „${ROLE_LABEL[a.meta.role as Role] ?? 'Mitglied'}“ beigetreten.`;
    case 'member.left':
      return `${actor} hat den Bereich verlassen.`;
    case 'member.removed':
      return `${actor} hat ${subject} entfernt.`;
    case 'member.role':
      return `${actor} hat ${subject} die Rolle „${ROLE_LABEL[a.meta.role as Role] ?? ''}“ gegeben.`;
    case 'member.invited':
      return `${actor} hat ${subject} eingeladen.`;
    case 'invite.revoked':
      return `${actor} hat die Einladung an ${subject} widerrufen.`;
    case 'resource.created':
      return `${actor} hat ${target} angelegt.`;
    case 'resource.updated':
      return `${actor} hat ${target} bearbeitet${n}.`;
    case 'resource.deleted':
      return `${actor} hat ${target || 'einen Eintrag'} gelöscht.`;
    case 'resource.shared':
      return `${actor} hat ${a.meta.items ?? ''} private Einträge als Kopie geteilt${target ? ` (${target})` : ''}.`;
    case 'resource.moved':
      return `${actor} hat ${a.meta.items ?? ''} Einträge in den Bereich verschoben${target ? ` (${target})` : ''}.`;
    case 'resource.access':
      return `${actor} hat die Zugriffsstufe von ${target} auf „${ACCESS_LABEL[a.meta.access as Access] ?? ''}“ gesetzt.`;
    case 'file.uploaded':
      return `${actor} hat zu ${target} eine Datei hochgeladen${n}.`;
    case 'comment.created':
      return `${actor} hat ${target} kommentiert${n}.`;
    default:
      return `${actor}: ${a.type}`;
  }
}

/** Titel eines Bereichseintrags für Listen. */
export function entryTitle(store: SpaceStore, d: Record<string, unknown>): string {
  const t = (d.name ?? d.title ?? '') as string;
  if (t) return t;
  if (store === 'journal') return `Journal ${String(d.date ?? '').slice(0, 10)}`;
  if (store === 'photos') return (d.note as string) || 'Foto';
  if (store === 'activities') return 'Eintrag';
  return 'Ohne Titel';
}
