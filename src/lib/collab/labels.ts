import { t, labels } from '../../i18n';
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
export const STORE_LABEL = labels('labels.store', ['grows', 'plants', 'activities', 'photos', 'strains', 'journal', 'inventory', 'labReports', 'notes', 'tasks'] as SpaceStore[]);
export const STORE_SINGULAR = labels('labels.storeOne', ['grows', 'plants', 'activities', 'photos', 'strains', 'journal', 'inventory', 'labReports', 'notes', 'tasks'] as SpaceStore[]);
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
  if (!i || !i.ref) return t('collab.deletedAccount');
  return nickname || i.displayName || (i.handle ? `@${i.handle}` : i.socialId || t('collab.member'));
}
export function initialsOf(i: Identity | null | undefined): string {
  const n = (i?.displayName || i?.handle || '?').replace(/^@/, '').trim();
  const parts = n.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const who = (n: NotificationView) => nameOf(n.actor);
const inSpace = (n: NotificationView) => (n.spaceName ? t('collab.inSpace', { space: n.spaceName }) : '');
const times = (n: NotificationView) => (n.count > 1 ? ` (${n.count}×)` : '');

/** Text einer Benachrichtigung – ohne Inhalte, nur Ereignis, Auslöser und Bereich. */
export function notificationText(n: NotificationView): string {
  const p = { who: who(n), inSpace: inSpace(n), times: times(n) };
  switch (n.type) {
    case 'friend.request':
      return t('collab.n.friendRequest', p);
    case 'friend.accepted':
      return t('collab.n.friendAccepted', p);
    case 'space.invite':
      return t('collab.n.invite', p);
    case 'space.invite.accepted':
    case 'member.joined':
      return t('collab.n.joined', p);
    case 'space.update':
      return t('collab.n.update', p);
    case 'comment.new':
      return t('collab.n.comment', p);
    case 'comment.reply':
      return t('collab.n.reply', p);
    case 'member.role':
      return t('collab.n.role', { ...p, role: ROLE_LABEL[(n.ref as Role) ?? 'viewer'] ?? t('collab.n.roleChanged') });
    case 'member.left':
      return t('collab.n.left', { ...p, inSpace: p.inSpace || t('collab.n.aSpace') });
    case 'member.removed':
      return t('collab.n.removed', p);
    case 'space.transfer.offered':
      return n.ref === 'declined' ? t('collab.n.transferDeclined', p) : t('collab.n.transferOffered', p);
    case 'space.transfer.accepted':
      return t('collab.n.transferAccepted', p);
    case 'space.deleted':
      return t('collab.n.deleted', p);
    default:
      return t('collab.n.default');
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
  const subject = a.subject ? nameOf(a.subject) : t('collab.a.aMember');
  const title = a.store && a.targetId ? titleOf(a.store, a.targetId) : undefined;
  const target = a.store && a.targetId ? (title ? t('collab.quoted', { title }) : (STORE_SINGULAR[a.store as SpaceStore] ?? t('collab.a.anEntry'))) : '';
  const n = a.count > 1 ? ` (${a.count}×)` : '';
  const p = { actor, subject, target, n };
  switch (a.type) {
    case 'space.created':
      return t('collab.a.created', p);
    case 'space.updated':
      return t('collab.a.updated', p);
    case 'space.key.rotated':
      return t('collab.a.keyRotated', p);
    case 'space.transfer.offered':
      return t('collab.a.transferOffered', p);
    case 'space.transfer.accepted':
      return t('collab.a.transferAccepted', p);
    case 'member.joined':
      return t('collab.a.joined', { ...p, role: ROLE_LABEL[a.meta.role as Role] ?? t('collab.member') });
    case 'member.left':
      return t('collab.a.left', p);
    case 'member.removed':
      return t('collab.a.removed', p);
    case 'member.role':
      return t('collab.a.role', { ...p, role: ROLE_LABEL[a.meta.role as Role] ?? '' });
    case 'member.invited':
      return t('collab.a.invited', p);
    case 'invite.revoked':
      return t('collab.a.revoked', p);
    case 'resource.created':
      return t('collab.a.resCreated', p);
    case 'resource.updated':
      return t('collab.a.resUpdated', p);
    case 'resource.deleted':
      return t('collab.a.resDeleted', { ...p, target: target || t('collab.a.anEntry') });
    case 'resource.shared':
      return t('collab.a.shared', { ...p, items: String(a.meta.items ?? ''), target: target ? ` (${target})` : '' });
    case 'resource.moved':
      return t('collab.a.moved', { ...p, items: String(a.meta.items ?? ''), target: target ? ` (${target})` : '' });
    case 'resource.access':
      return t('collab.a.access', { ...p, access: ACCESS_LABEL[a.meta.access as Access] ?? '' });
    case 'file.uploaded':
      return t('collab.a.file', p);
    case 'comment.created':
      return t('collab.a.comment', p);
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
