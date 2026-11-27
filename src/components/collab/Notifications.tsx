import { Bell, BellRing, Check, CheckCheck, Loader2, Settings2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { refreshUnread, useCollabAvailable, useUnread } from '../../app/collab';
import { href, navigate, useRoute } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { type NotificationCategory, type NotificationView, collab } from '../../lib/collab/api';
import { CATEGORY_LABEL, notificationLink, notificationText } from '../../lib/collab/labels';
import { Avatar, relTime } from './ui';
import { t } from '../../i18n';

/** Glocke mit Zähler; öffnet ein kompaktes Panel. Nur im Servermodus. */
export function NotificationBell({ compact = false, align }: { compact?: boolean; align?: 'left' | 'right' }) {
  const side = align ?? (compact ? 'right' : 'left');
  const available = useCollabAvailable();
  const { count } = useUnread(available);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const route = useRoute();
  // Beim Seitenwechsel innerhalb der App Zähler aktualisieren (günstige Abfrage)
  useEffect(() => {
    if (available) void refreshUnread();
  }, [available, route.raw]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!available) return null;
  const label = count ? t('collab.notif.unreadLabel', { count }) : t('collab.notif.title');
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={compact ? 'btn-ghost relative p-1.5' : 'relative flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[12.5px] text-ink-300 hover:border-white/[0.12] hover:text-ink-100'}
      >
        {count ? <BellRing className="size-4 text-leaf-300" /> : <Bell className="size-4" />}
        {!compact && <span>{t('collab.notif.title')}</span>}
        {count > 0 && (
          <span className={`${compact ? 'absolute -top-1 -right-1' : 'ml-auto'} grid min-w-[1.15rem] place-items-center rounded-full bg-leaf-500 px-1 text-[10px] font-bold leading-[1.15rem] text-ink-950`}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label={t('collab.notif.title')} className={`absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/[0.08] bg-ink-850 shadow-2xl animate-fade-up ${side === 'right' ? 'right-0' : 'left-0'}`}>
          <NotificationList limit={8} onNavigate={() => setOpen(false)} />
          <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2">
            <a href={href('together/notifications')} onClick={() => setOpen(false)} className="text-[12px] font-medium text-leaf-300 hover:underline">
              {t('collab.notif.showAll')}
            </a>
            <a href={href('together/notifications?tab=prefs')} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-100">
              <Settings2 className="size-3.5" /> {t('shell.nav.settings')}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** Liste der Benachrichtigungen (Panel und Seite). */
export function NotificationList({ limit, category, onNavigate }: { limit?: number; category?: NotificationCategory; onNavigate?: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [more, setMore] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = async (before?: string) => {
    const r = await collab.notifications({ before, category, unread: unreadOnly });
    setItems((cur) => (before && cur ? [...cur, ...r.notifications] : r.notifications));
    setMore(r.more);
  };
  useEffect(() => {
    load().catch((e) => {
      setItems([]);
      toast(errorText(e), { tone: 'error' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, unreadOnly]);

  const open = async (n: NotificationView) => {
    if (!n.read) await collab.markRead([n.id]).catch(() => {});
    void refreshUnread();
    onNavigate?.();
    navigate(notificationLink(n));
  };
  const markAll = async () => {
    await collab.markRead().catch((e) => toast(errorText(e), { tone: 'error' }));
    setItems((cur) => cur?.map((x) => ({ ...x, read: true })) ?? null);
    void refreshUnread();
  };
  const dismiss = async (n: NotificationView) => {
    await collab.dismiss(n.id).catch(() => {});
    setItems((cur) => cur?.filter((x) => x.id !== n.id) ?? null);
    void refreshUnread();
  };

  const shown = limit ? (items ?? []).slice(0, limit) : (items ?? []);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-ink-300">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="accent-[var(--color-leaf-400)]" /> Nur ungelesene
        </label>
        <button type="button" onClick={markAll} className="inline-flex min-h-6 items-center gap-1 text-[12px] text-ink-300 hover:text-ink-50">
          <CheckCheck className="size-3.5" /> {t('collab.notif.allRead')}
        </button>
      </div>
      {items === null ? (
        <div className="grid place-items-center py-8 text-ink-400" role="status">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-400">{unreadOnly ? t('collab.notif.noneUnread') : t('collab.notif.none')}</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-white/[0.04] overflow-y-auto">
          {shown.map((n) => (
            <li key={n.id} className={`group flex items-start gap-3 px-3 py-2.5 ${n.read ? '' : 'bg-leaf-500/[0.04]'}`}>
              <Avatar identity={n.actor} size="sm" />
              <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                <span className={`block text-[13px] leading-snug ${n.read ? 'text-ink-300' : 'text-ink-100'}`}>{notificationText(n)}</span>
                <span className="mt-0.5 block text-[11px] text-ink-500">
                  {CATEGORY_LABEL[n.category]} · {relTime(n.updatedAt)}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                {!n.read && (
                  <button
                    type="button"
                    aria-label={t('collab.notif.markRead')}
                    className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-white/[0.05] hover:text-ink-100"
                    onClick={async () => {
                      await collab.markRead([n.id]).catch(() => {});
                      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
                      void refreshUnread();
                    }}
                  >
                    <Check className="size-3.5" />
                  </button>
                )}
                <button type="button" aria-label={t('collab.notif.remove')} className="grid size-7 place-items-center rounded-md text-ink-500 hover:bg-white/[0.05] hover:text-ink-100" onClick={() => dismiss(n)}>
                  <X className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!limit && more && (
        <div className="p-3 text-center">
          <button type="button" className="btn-ghost text-[12.5px]" onClick={() => load(items?.[items.length - 1]?.id)}>
            {t('collab.notif.loadOlder')}
          </button>
        </div>
      )}
    </div>
  );
}
