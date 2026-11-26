import { Bell, LayoutGrid, UserRound, Users } from 'lucide-react';
import { useCollabAvailable, useUnread } from '../../app/collab';
import { href } from '../../app/router';

const TABS = [
  { id: 'overview', label: 'Bereiche', to: 'together', icon: LayoutGrid },
  { id: 'friends', label: 'Freunde', to: 'together/friends', icon: Users },
  { id: 'profile', label: 'Mein Profil', to: 'together/profile', icon: UserRound },
  { id: 'notifications', label: 'Benachrichtigungen', to: 'together/notifications', icon: Bell },
] as const;

/** Unternavigation „Gemeinsam“ (statt zusätzlicher Einträge in der Seitenleiste). */
export function TogetherTabs({ active }: { active: (typeof TABS)[number]['id'] }) {
  const { count } = useUnread(useCollabAvailable());
  return (
    <nav aria-label="Gemeinsam" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {TABS.map((t) => {
        const Icon = t.icon;
        const on = t.id === active;
        return (
          <a
            key={t.id}
            href={href(t.to)}
            aria-current={on ? 'page' : undefined}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${on ? 'bg-white/[0.07] text-ink-50' : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-100'}`}
          >
            <Icon className={`size-4 ${on ? 'text-leaf-400' : ''}`} /> {t.label}
            {t.id === 'notifications' && count > 0 && <span className="rounded-full bg-leaf-500 px-1.5 text-[10px] font-bold text-ink-950">{count}</span>}
          </a>
        );
      })}
    </nav>
  );
}
