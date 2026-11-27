/**
 * Rechtematrix für gemeinsame Bereiche (Phase 5.5) – die einzige Quelle der Wahrheit.
 * docs/PHASE5-5-PERMISSION-MATRIX.md wird gegen diese Tabelle geprüft (Test).
 *
 * Jede serverseitige Operation ruft `can()` bzw. `requireSpace()` auf; zusätzlich
 * erzwingen die RLS-Policies der Datenbank (Migration 008) dieselben Grenzen.
 */
export const ROLES = ['owner', 'editor', 'commenter', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { owner: 'Eigentümer', editor: 'Bearbeiten', commenter: 'Kommentieren', viewer: 'Ansehen' };

/** Zugriffsstufe je Ressource (Wurzel-Ressource; Kinder erben sie). */
export const ACCESS = ['members', 'editors', 'readonly'] as const;
export type Access = (typeof ACCESS)[number];
export const ACCESS_LABEL: Record<Access, string> = { members: 'Alle Mitglieder', editors: 'Nur Bearbeitende', readonly: 'Schreibgeschützt' };

export type Action =
  | 'space.read'
  | 'space.update'
  | 'space.delete'
  | 'space.transfer'
  | 'space.rotateKey'
  | 'space.export'
  | 'members.read'
  | 'members.invite'
  | 'members.changeRole'
  | 'members.remove'
  | 'members.leave'
  | 'invites.revoke'
  | 'resource.read'
  | 'resource.create'
  | 'resource.update'
  | 'resource.delete'
  | 'resource.setAccess'
  | 'resource.shareInto'
  | 'file.read'
  | 'file.write'
  | 'comment.read'
  | 'comment.create'
  | 'comment.editOwn'
  | 'comment.deleteOwn'
  | 'comment.moderate'
  | 'activity.read';

const ALL: readonly Role[] = ROLES;
const OE: readonly Role[] = ['owner', 'editor'];
const O: readonly Role[] = ['owner'];
const OEC: readonly Role[] = ['owner', 'editor', 'commenter'];

/** Grundmatrix (Rollen, die eine Aktion ausführen dürfen – vor Zugriffsstufe und Bereichsoptionen). */
export const MATRIX: Record<Action, readonly Role[]> = {
  'space.read': ALL,
  'space.update': O,
  'space.delete': O,
  'space.transfer': O,
  'space.rotateKey': O,
  'space.export': ALL, // Kommentieren/Ansehen nur, wenn der Bereich Export erlaubt (allowExport)
  'members.read': ALL,
  'members.invite': O,
  'members.changeRole': O,
  'members.remove': O,
  'members.leave': ['editor', 'commenter', 'viewer'], // Eigentümer muss zuerst übertragen
  'invites.revoke': O,
  'resource.read': ALL, // „Nur Bearbeitende“: nur Eigentümer/Bearbeiten
  'resource.create': OE, // in „Schreibgeschützt“-Bäumen nur Eigentümer
  'resource.update': OE, // „Schreibgeschützt“: nur Eigentümer
  'resource.delete': OE, // „Schreibgeschützt“: nur Eigentümer
  'resource.setAccess': O,
  'resource.shareInto': OE,
  'file.read': ALL, // wie resource.read der zugehörigen Ressource
  'file.write': OE, // wie resource.update der zugehörigen Ressource
  'comment.read': ALL, // wie resource.read der kommentierten Ressource
  'comment.create': OEC,
  'comment.editOwn': OEC,
  'comment.deleteOwn': OEC,
  'comment.moderate': O,
  'activity.read': ALL, // Einträge zu Ressourcen, die man nicht lesen darf, werden ausgeblendet
};

export interface Ctx {
  /** Zugriffsstufe der betroffenen Ressource (falls ressourcenbezogen) */
  access?: Access;
  /** Bereichsoption „Export erlauben“ */
  allowExport?: boolean;
}

const READ_LIKE = new Set<Action>(['resource.read', 'file.read', 'comment.read']);
const WRITE_LIKE = new Set<Action>(['resource.create', 'resource.update', 'resource.delete', 'file.write']);

/** Darf eine Rolle die Aktion ausführen? (rein, ohne Datenbank – testbar) */
export function can(role: Role | null | undefined, action: Action, ctx: Ctx = {}): boolean {
  if (!role || !ROLES.includes(role)) return false;
  if (!MATRIX[action].includes(role)) return false;
  if (READ_LIKE.has(action) && ctx.access === 'editors') return role === 'owner' || role === 'editor';
  if (WRITE_LIKE.has(action) && ctx.access === 'readonly') return role === 'owner';
  if (action === 'space.export' && (role === 'commenter' || role === 'viewer')) return ctx.allowExport === true;
  return true;
}

export const isAccess = (a: unknown): a is Access => typeof a === 'string' && (ACCESS as readonly string[]).includes(a);
/** Rollen, die ein Eigentümer vergeben kann (Eigentum nur per Übertragung). */
export const ASSIGNABLE: readonly Role[] = ['editor', 'commenter', 'viewer'];

/** Deutsche Beschreibung je Aktion (für Dokumentation und Oberfläche). */
export const ACTION_LABEL: Record<Action, string> = {
  'space.read': 'Bereich öffnen',
  'space.update': 'Name, Beschreibung, Optionen ändern',
  'space.delete': 'Bereich löschen',
  'space.transfer': 'Eigentum übertragen',
  'space.rotateKey': 'Bereichsschlüssel erneuern',
  'space.export': 'Bereich exportieren',
  'members.read': 'Mitglieder sehen',
  'members.invite': 'Freunde einladen',
  'members.changeRole': 'Rollen ändern',
  'members.remove': 'Mitglieder entfernen',
  'members.leave': 'Bereich verlassen',
  'invites.revoke': 'Einladungen widerrufen',
  'resource.read': 'Inhalte lesen',
  'resource.create': 'Inhalte anlegen',
  'resource.update': 'Inhalte bearbeiten',
  'resource.delete': 'Inhalte löschen',
  'resource.setAccess': 'Zugriffsstufe festlegen',
  'resource.shareInto': 'Private Inhalte teilen (Kopie/Verschieben)',
  'file.read': 'Fotos/Dokumente ansehen',
  'file.write': 'Fotos/Dokumente hochladen',
  'comment.read': 'Kommentare lesen',
  'comment.create': 'Kommentieren und antworten',
  'comment.editOwn': 'Eigene Kommentare bearbeiten',
  'comment.deleteOwn': 'Eigene Kommentare löschen',
  'comment.moderate': 'Fremde Kommentare entfernen',
  'activity.read': 'Aktivitätsverlauf sehen',
};

/** Markdown-Tabelle der Rechtematrix (Dokumentation; per Test mit dem Dokument abgeglichen). */
export function matrixTable(): string {
  const cell = (r: Role, a: Action, ctx: Ctx = {}) => (can(r, a, ctx) ? '✅' : '—');
  const head = `| Aktion | ${ROLES.map((r) => ROLE_LABEL[r]).join(' | ')} |\n| --- | ${ROLES.map(() => ':---:').join(' | ')} |`;
  const rows = (Object.keys(MATRIX) as Action[]).map((a) => `| ${ACTION_LABEL[a]} (\`${a}\`) | ${ROLES.map((r) => cell(r, a, a === 'space.export' ? { allowExport: false } : {})).join(' | ')} |`);
  const special = [
    `| Export bei „Export erlauben“ | ${ROLES.map((r) => cell(r, 'space.export', { allowExport: true })).join(' | ')} |`,
    `| Lesen „Nur Bearbeitende“ | ${ROLES.map((r) => cell(r, 'resource.read', { access: 'editors' })).join(' | ')} |`,
    `| Bearbeiten „Schreibgeschützt“ | ${ROLES.map((r) => cell(r, 'resource.update', { access: 'readonly' })).join(' | ')} |`,
  ];
  return [head, ...rows, ...special].join('\n');
}
export const ACTIONS_FOR_TEST = Object.keys(MATRIX) as Action[];
