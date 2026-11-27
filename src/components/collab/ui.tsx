import { Copy, Eye, EyeOff, Lock, MessageSquare, Pencil, Shield, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Access, Accent, Identity, Role } from '../../lib/collab/api';
import { ACCENT_CLASS, ACCESS_HINT, ACCESS_LABEL, ROLE_HINT, ROLE_LABEL, initialsOf, nameOf } from '../../lib/collab/labels';
import { intlLocale } from '../../i18n';

const SIZES = { xs: 'size-6 text-[10px]', sm: 'size-8 text-[11px]', md: 'size-10 text-[13px]', lg: 'size-16 text-lg', xl: 'size-24 text-2xl' } as const;

/** Avatar: eigenes Bild (nur für Freunde freigegeben) oder Initialen auf Akzentfarbe. */
export function Avatar({ identity, size = 'sm', accent }: { identity: Identity | null | undefined; size?: keyof typeof SIZES; accent?: Accent }) {
  const a = ACCENT_CLASS[accent ?? 'emerald'];
  if (identity?.avatar)
    return <img src={identity.avatar} alt="" className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-1 ring-white/10`} referrerPolicy="no-referrer" />;
  return (
    <span aria-hidden className={`${SIZES[size]} grid shrink-0 place-items-center rounded-full font-semibold ring-1 ${a.soft} ${a.text} ${a.ring}`}>
      {identity?.ref ? initialsOf(identity) : '–'}
    </span>
  );
}

/** Name, Handle bzw. Social-ID – nie der Anmeldename. */
export function PersonRow({ identity, nickname, meta, actions, href }: { identity: Identity; nickname?: string | null; meta?: ReactNode; actions?: ReactNode; href?: string }) {
  const name = nameOf(identity, nickname);
  const sub = [nickname && identity.displayName && nickname !== identity.displayName ? identity.displayName : null, identity.handle ? `@${identity.handle}` : identity.socialId].filter(Boolean).join(' · ');
  const body = (
    <>
      <Avatar identity={identity} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink-100">{name}</div>
        <div className="truncate text-[12px] text-ink-400">
          {sub}
          {meta && <span className="text-ink-500"> · {meta}</span>}
        </div>
      </div>
    </>
  );
  return (
    <div className="flex items-center gap-3 py-2">
      {href ? (
        <a href={href} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:bg-white/[0.02]">
          {body}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>}
    </div>
  );
}

const ROLE_ICON: Record<Role, typeof Shield> = { owner: Shield, editor: Pencil, commenter: MessageSquare, viewer: Eye };
const ROLE_TONE: Record<Role, string> = {
  owner: 'border-leaf-500/30 bg-leaf-500/10 text-leaf-200',
  editor: 'border-sky-500/25 bg-sky-500/10 text-sky-200',
  commenter: 'border-violet-500/25 bg-violet-500/10 text-violet-200',
  viewer: 'border-white/10 bg-white/[0.04] text-ink-300',
};
export function RoleBadge({ role }: { role: Role }) {
  const Icon = ROLE_ICON[role];
  return (
    <span title={ROLE_HINT[role]} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ROLE_TONE[role]}`}>
      <Icon className="size-3" aria-hidden /> {ROLE_LABEL[role]}
    </span>
  );
}

export function AccessBadge({ access }: { access: Access }) {
  if (access === 'members') return null;
  const Icon = access === 'editors' ? EyeOff : Lock;
  return (
    <span title={ACCESS_HINT[access]} className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
      <Icon className="size-3" aria-hidden /> {ACCESS_LABEL[access]}
    </span>
  );
}

export function OriginBadge({ origin }: { origin: 'created' | 'copy' | 'move' }) {
  if (origin === 'created') return null;
  return (
    <span
      title={origin === 'copy' ? 'Geteilte Kopie – unabhängig vom privaten Original; spätere private Änderungen werden nicht übertragen.' : 'In den Bereich verschoben – gehört zum Bereich.'}
      className="inline-flex items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-200"
    >
      {origin === 'copy' ? <Copy className="size-3" aria-hidden /> : <Users className="size-3" aria-hidden />}
      {origin === 'copy' ? 'Geteilte Kopie' : 'Verschoben'}
    </span>
  );
}

/** Rollenauswahl als Optionsliste mit Erklärung (Eigentum nur per Übertragung). */
export function RolePicker({ value, onChange, name }: { value: Role; onChange: (r: Role) => void; name: string }) {
  const roles: Role[] = ['editor', 'commenter', 'viewer'];
  return (
    <fieldset className="space-y-1.5">
      <legend className="label mb-1.5">Rolle</legend>
      {roles.map((r) => {
        const Icon = ROLE_ICON[r];
        const active = value === r;
        return (
          <label
            key={r}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${active ? 'border-leaf-500/40 bg-leaf-500/[0.07]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
          >
            <input type="radio" name={name} value={r} checked={active} onChange={() => onChange(r)} className="mt-1 accent-[var(--color-leaf-400)]" />
            <Icon className={`mt-0.5 size-4 shrink-0 ${active ? 'text-leaf-300' : 'text-ink-400'}`} aria-hidden />
            <span>
              <span className="block text-[13px] font-medium text-ink-100">{ROLE_LABEL[r]}</span>
              <span className="block text-[12px] text-ink-400">{ROLE_HINT[r]}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">{children}</h2>
      {action}
    </div>
  );
}

export function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  if (s < 7 * 86400) return `vor ${Math.round(s / 86400)} T.`;
  return new Date(iso).toLocaleDateString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}
