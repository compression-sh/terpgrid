/**
 * Client für private Zusammenarbeit (Phase 5.5). Alle Rechte prüft der Server – die
 * Felder `permissions`/`role` dienen nur der Anzeige.
 */
import { api } from '../server/api';

export type Role = 'owner' | 'editor' | 'commenter' | 'viewer';
export type Access = 'members' | 'editors' | 'readonly';
export type Visibility = 'private' | 'friends';
export type SpaceKind = 'project' | 'collection' | 'general';
export type Accent = 'emerald' | 'teal' | 'sky' | 'violet' | 'amber' | 'rose' | 'lime';
export type SpaceStore = 'grows' | 'plants' | 'activities' | 'photos' | 'strains' | 'journal' | 'inventory' | 'labReports' | 'notes' | 'tasks';
export type ShareableStore = 'grows' | 'plants' | 'strains' | 'journal' | 'inventory' | 'labReports';

/** Identität eines anderen Kontos – nie der Anmeldename. */
export interface Identity {
  ref: string;
  handle: string | null;
  socialId: string;
  displayName: string | null;
  avatar?: string | null;
}

export interface ProfileFields {
  displayName?: string;
  bio?: string;
  accent?: Accent;
  avatar?: string;
  favoriteStrains?: string[];
  favoriteTerpenes?: string[];
  interests?: string[];
}
export type ProfileField = keyof ProfileFields;
export interface SelfProfile extends ProfileFields {
  ref: string;
  handle: string | null;
  socialId: string;
  requestsEnabled: boolean;
  visibility: Record<ProfileField, Visibility>;
  notifyPrefs: Record<string, boolean>;
}
export interface FriendProfile extends Identity, Omit<ProfileFields, 'displayName' | 'avatar'> {}

export interface Friend extends Identity {
  since: string;
  nickname: string | null;
  profileHidden: boolean;
}
export interface FriendRequestIn {
  id: string;
  from: Identity;
  createdAt: string;
  expiresAt: string;
}
export interface FriendRequestOut {
  id: string;
  target: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
}
export interface BlockEntry {
  ref: string;
  label: string;
  since: string;
}
export interface FriendInvite {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
}
export interface SocialOverview {
  profile: SelfProfile;
  friends: Friend[];
  requests: { incoming: FriendRequestIn[]; outgoing: FriendRequestOut[] };
  blocks: BlockEntry[];
  invites: FriendInvite[];
}

export interface SpaceSummary {
  id: string;
  kind: SpaceKind;
  name: string;
  description?: string;
  accent?: Accent;
  role: Role;
  owner: Identity;
  pendingTransferToMe: boolean;
  members: number;
  resources: number;
  allowExport: boolean;
  updatedAt: string;
}
export interface SpaceInvite {
  id: string;
  spaceId: string;
  kind: SpaceKind;
  name: string;
  description?: string;
  accent?: Accent;
  role: Role;
  from: Identity;
  createdAt: string;
  expiresAt: string;
}
export interface Member extends Identity {
  role: Role;
  since: string;
  isMe: boolean;
}
export interface SpaceDetail {
  space: {
    id: string;
    kind: SpaceKind;
    name: string;
    description?: string;
    accent?: Accent;
    role: Role;
    allowExport: boolean;
    storageBytes: number;
    createdAt: string;
    keyGeneration: number;
    pendingOwner: Identity | null;
    pendingTransferToMe: boolean;
  };
  me: string;
  permissions: Record<string, boolean>;
  members: Member[];
  invites: { id: string; invitee: Identity; role: Role; createdAt: string; expiresAt: string }[];
}

export interface SpaceRemoteChange {
  store: SpaceStore;
  id: string;
  version: number;
  seq: string;
  deleted: boolean;
  data: Record<string, unknown> | null;
  access: Access;
  origin: 'created' | 'copy' | 'move';
  hidden?: boolean;
  updatedAt?: string;
  updatedBy?: string | null;
}
export type SpaceChangeResult =
  | { store: string; id: string; status: 'ok'; version: number; seq: string }
  | { store: string; id: string; status: 'unchanged'; version: number }
  | { store: string; id: string; status: 'conflict'; server: { version: number; deleted: boolean; data: Record<string, unknown> | null } }
  | { store: string; id: string; status: 'rejected'; error: string };

export interface CommentView {
  id: string;
  store: string;
  targetId: string;
  parentId: string | null;
  author: Identity;
  mine: boolean;
  text: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  canEdit: boolean;
  canDelete: boolean;
}
export interface ActivityView {
  id: string;
  type: string;
  actor: Identity;
  subject: Identity | null;
  store: string | null;
  targetId: string | null;
  meta: Record<string, string | number | boolean>;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export type NotificationCategory = 'friends' | 'invites' | 'comments' | 'updates' | 'access';
export interface NotificationView {
  id: string;
  category: NotificationCategory;
  type: string;
  actor: Identity | null;
  spaceId: string | null;
  spaceName: string | null;
  store: string | null;
  targetId: string | null;
  ref: string | null;
  count: number;
  createdAt: string;
  updatedAt: string;
  read: boolean;
}

export interface ShareOptions {
  photos?: boolean;
  tasks?: boolean;
  quantities?: boolean;
  costs?: boolean;
  notes?: boolean;
  documents?: boolean;
}
export interface SharePreview {
  mode: 'copy' | 'move';
  role: Role;
  summary: {
    counts: Partial<Record<SpaceStore, number>>;
    titles: { store: SpaceStore; title: string }[];
    photos: number;
    documents: number;
    bytes: number;
    removed: string[];
    warnings: string[];
  };
}

export interface PrivacyOverview {
  profile: { handle: string | null; visibility: Record<ProfileField, Visibility>; requestsEnabled: boolean };
  friends: Friend[];
  blocks: BlockEntry[];
  requests: SocialOverview['requests'];
  friendInvites: FriendInvite[];
  ownedSpaces: SpaceSummary[];
  memberships: SpaceSummary[];
  outgoingShares: { spaceId: string; spaceName: string | null; mode: 'copy' | 'move'; count: number }[];
  spaceInvitesIncoming: SpaceInvite[];
  spaceInvitesOutgoing: { id: string; spaceId: string; spaceName: string | null; invitee: Identity; role: Role; expiresAt: string }[];
  notificationPrefs: Record<NotificationCategory, boolean>;
}

const enc = encodeURIComponent;

export const collab = {
  /* Profil & Freunde */
  profile: () => api<{ profile: SelfProfile }>('GET', '/api/social/profile'),
  updateProfile: (patch: Partial<ProfileFields> & { visibility?: Partial<Record<ProfileField, Visibility>>; handle?: string | null; requestsEnabled?: boolean }) =>
    api<{ profile: SelfProfile }>('PATCH', '/api/social/profile', patch),
  regenerateSocialId: () => api<{ profile: SelfProfile }>('POST', '/api/social/profile/social-id'),
  overview: () => api<SocialOverview>('GET', '/api/social/overview'),
  user: (ref: string) => api<{ profile: FriendProfile; relation: string; friend: { since: string; nickname: string | null; profileHidden: boolean } | null }>('GET', `/api/social/users/${enc(ref)}`),
  sendRequest: (target: string) => api<{ ok: true; message: string }>('POST', '/api/social/requests', { target }),
  answerRequest: (id: string, action: 'accept' | 'decline' | 'cancel') => api('POST', `/api/social/requests/${enc(id)}/${action}`),
  updateFriend: (ref: string, patch: { nickname?: string | null; profileHidden?: boolean }) => api('PATCH', `/api/social/friends/${enc(ref)}`, patch),
  removeFriend: (ref: string) => api('DELETE', `/api/social/friends/${enc(ref)}`),
  block: (ref: string, removeFromSpaces = true) => api<{ ok: true; removedFromSpaces: number }>('POST', '/api/social/blocks', { ref, removeFromSpaces }),
  unblock: (ref: string) => api('DELETE', `/api/social/blocks/${enc(ref)}`),
  createInvite: (days = 7) => api<{ id: string; token: string; expiresAt: string }>('POST', '/api/social/invites', { days }),
  revokeInvite: (id: string) => api('DELETE', `/api/social/invites/${enc(id)}`),
  previewInvite: (token: string) => api<{ inviter: Identity; expiresAt: string; alreadyFriends: boolean }>('POST', '/api/social/invites/preview', { token }),
  redeemInvite: (token: string) => api<{ ok: true; friend: Identity }>('POST', '/api/social/invites/redeem', { token }),

  /* Bereiche */
  spaces: () => api<{ spaces: SpaceSummary[]; invites: SpaceInvite[] }>('GET', '/api/spaces'),
  createSpace: (body: { name: string; description?: string; kind: SpaceKind; accent?: Accent }) => api<{ id: string }>('POST', '/api/spaces', body),
  space: (id: string) => api<SpaceDetail>('GET', `/api/spaces/${enc(id)}`),
  updateSpace: (id: string, patch: { name?: string; description?: string; accent?: Accent | null; allowExport?: boolean }) => api('PATCH', `/api/spaces/${enc(id)}`, patch),
  deleteSpace: (id: string, confirm: string) => api('DELETE', `/api/spaces/${enc(id)}`, { confirm }),
  invite: (id: string, ref: string, role: Role) => api<{ id: string }>('POST', `/api/spaces/${enc(id)}/invites`, { ref, role }),
  revokeSpaceInvite: (id: string, inviteId: string) => api('DELETE', `/api/spaces/${enc(id)}/invites/${enc(inviteId)}`),
  answerSpaceInvite: (inviteId: string, action: 'accept' | 'decline') => api<{ ok: true; spaceId?: string }>('POST', `/api/space-invites/${enc(inviteId)}/${action}`),
  changeRole: (id: string, ref: string, role: Role) => api('PATCH', `/api/spaces/${enc(id)}/members/${enc(ref)}`, { role }),
  removeMember: (id: string, ref: string) => api('DELETE', `/api/spaces/${enc(id)}/members/${enc(ref)}`),
  offerTransfer: (id: string, ref: string) => api('POST', `/api/spaces/${enc(id)}/transfer`, { ref }),
  cancelTransfer: (id: string) => api('DELETE', `/api/spaces/${enc(id)}/transfer`),
  acceptTransfer: (id: string) => api('POST', `/api/spaces/${enc(id)}/transfer/accept`),
  rotateKey: (id: string) => api<{ gen: number; records: number; files: number; comments: number; done: boolean }>('POST', `/api/spaces/${enc(id)}/rotate-key`),
  changes: (id: string, since: string) => api<{ changes: SpaceRemoteChange[]; cursor: string; more: boolean; role: Role }>('GET', `/api/spaces/${enc(id)}/changes?since=${enc(since)}&limit=300`),
  push: (id: string, changes: { store: string; id: string; baseVersion: number; deleted?: boolean; data?: unknown }[]) =>
    api<{ results: SpaceChangeResult[]; role: Role }>('POST', `/api/spaces/${enc(id)}/push`, { changes }),
  setAccess: (id: string, store: string, rid: string, access: Access) => api<{ ok: true; changed: number }>('POST', `/api/spaces/${enc(id)}/access`, { store, id: rid, access }),
  fileUrl: (id: string, kind: 'photo' | 'labdoc', fid: string, variant: string) => `/api/spaces/${enc(id)}/files/${kind}/${enc(fid)}/${variant}`,
  file: (id: string, kind: 'photo' | 'labdoc', fid: string, variant: string) => api<ArrayBuffer>('GET', `/api/spaces/${enc(id)}/files/${kind}/${enc(fid)}/${variant}`, undefined, { binary: true }),
  uploadFile: (id: string, kind: 'photo' | 'labdoc', fid: string, variant: string, data: Blob | ArrayBuffer, mime: string, record?: string) =>
    api('PUT', `/api/spaces/${enc(id)}/files/${kind}/${enc(fid)}/${variant}${record ? `?record=${enc(record)}` : ''}`, undefined, { raw: data, contentType: mime }),
  comments: (id: string, store?: string, target?: string) =>
    api<{ comments: CommentView[]; canComment: boolean }>('GET', `/api/spaces/${enc(id)}/comments${store && target ? `?store=${enc(store)}&target=${enc(target)}` : ''}`),
  addComment: (id: string, store: string, target: string, text: string, parentId?: string) => api<{ id: string }>('POST', `/api/spaces/${enc(id)}/comments`, { store, target, text, ...(parentId ? { parentId } : {}) }),
  editComment: (id: string, cid: string, text: string) => api('PATCH', `/api/spaces/${enc(id)}/comments/${enc(cid)}`, { text }),
  deleteComment: (id: string, cid: string) => api('DELETE', `/api/spaces/${enc(id)}/comments/${enc(cid)}`),
  activity: (id: string, before?: string) => api<{ activity: ActivityView[]; more: boolean }>('GET', `/api/spaces/${enc(id)}/activity${before ? `?before=${enc(before)}` : ''}`),
  exportSpace: (id: string) => api<ArrayBuffer>('GET', `/api/spaces/${enc(id)}/export`, undefined, { binary: true }),
  sharePreviewAny: (items: { store: ShareableStore; id: string }[], mode: 'copy' | 'move', options: ShareOptions) => api<SharePreview>('POST', '/api/share/preview', { items, mode, options }),
  sharePreview: (id: string, items: { store: ShareableStore; id: string }[], mode: 'copy' | 'move', options: ShareOptions) =>
    api<SharePreview>('POST', `/api/spaces/${enc(id)}/share/preview`, { items, mode, options }),
  share: (id: string, items: { store: ShareableStore; id: string }[], mode: 'copy' | 'move', options: ShareOptions) =>
    api<{ ok: true; mode: string; created: number; files: number; ids: { store: SpaceStore; id: string }[] }>('POST', `/api/spaces/${enc(id)}/share`, { items, mode, options }),

  /* Benachrichtigungen & Datenschutz */
  unread: () => api<{ count: number; byCategory: Partial<Record<NotificationCategory, number>> }>('GET', '/api/notifications/unread'),
  notifications: (opts: { before?: string; category?: NotificationCategory; unread?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.before) q.set('before', opts.before);
    if (opts.category) q.set('category', opts.category);
    if (opts.unread) q.set('unread', '1');
    return api<{ notifications: NotificationView[]; more: boolean }>('GET', `/api/notifications${q.size ? `?${q}` : ''}`);
  },
  markRead: (ids?: string[]) => api<{ updated: number }>('POST', '/api/notifications/read', ids ? { ids } : { all: true }),
  dismiss: (id: string) => api('POST', `/api/notifications/${enc(id)}/dismiss`),
  prefs: () => api<{ prefs: Record<NotificationCategory, boolean>; locked: NotificationCategory[] }>('GET', '/api/notifications/prefs'),
  setPrefs: (prefs: Partial<Record<NotificationCategory, boolean>>) => api<{ prefs: Record<NotificationCategory, boolean> }>('PUT', '/api/notifications/prefs', prefs),
  privacy: () => api<PrivacyOverview>('GET', '/api/privacy/overview'),
};
