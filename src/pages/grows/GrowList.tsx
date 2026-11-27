import { Columns3, Plus, Search, Sprout } from 'lucide-react';
import { href } from '../../app/router';
import { useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { useQuickActions } from '../../app/QuickActions';
import { Segmented } from '../../components/ui/Segmented';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import type { GrowStatus } from '../../lib/db/types';
import { GrowCard } from '../../components/grow/GrowCard';
import { t } from '../../i18n';

export function GrowList() {
  const { data } = useData();
  const quick = useQuickActions();
  const [status, setStatus] = useState<GrowStatus | 'all'>('active');
  const [q, setQ] = useState('');

  const counts = useMemo(
    () => ({
      active: data.grows.filter((g) => g.status === 'active').length,
      completed: data.grows.filter((g) => g.status === 'completed').length,
      archived: data.grows.filter((g) => g.status === 'archived').length,
    }),
    [data.grows],
  );

  const grows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.grows
      .filter((g) => status === 'all' || g.status === status)
      .filter((g) => !needle || [g.name, g.description, g.medium, g.environment, g.notes].some((t) => t?.toLowerCase().includes(needle)))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [data.grows, status, q]);

  return (
    <div>
      <PageHeader
        title="Grows"
        subtitle={t('grow.list.subtitle')}
        actions={
          <>
            {data.grows.length >= 2 && (
              <a href={href('grows/compare')} className="btn-ghost">
                <Columns3 className="size-4" /> {t('grow.list.compare')}
              </a>
            )}
            <button type="button" className="btn-primary" onClick={() => quick({ kind: 'grow' })}>
              <Plus className="size-4" /> {t('grow.list.new')}
            </button>
          </>
        }
      />
      {data.grows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Sprout />}
            title={t('grow.list.emptyTitle')}
            text={t('grow.list.emptyText')}
            action={
              <button type="button" className="btn-primary" onClick={() => quick({ kind: 'grow' })}>
                <Plus className="size-4" /> {t('grow.list.first')}
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto sm:min-w-[24rem]">
              <Segmented
                size="sm"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'active', label: t('grow.list.active', { n: counts.active }) },
                  { value: 'completed', label: t('grow.list.completed', { n: counts.completed }) },
                  { value: 'archived', label: t('grow.list.archived', { n: counts.archived }) },
                  { value: 'all', label: t('grow.list.all') },
                ]}
              />
            </div>
            <label className="relative block sm:w-64">
              <span className="sr-only">{t('grow.list.searchLabel')}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
              <input className="input-base pl-9" placeholder={t('grow.list.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {grows.length === 0 ? (
            <div className="card">
              <EmptyState compact title={t('grow.list.noneTitle')} text={q ? t('grow.list.adjustSearch') : t('grow.list.otherFilter')} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {grows.map((g) => (
                <GrowCard key={g.id} grow={g} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
