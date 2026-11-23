import { Plus, Search, Sprout } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { useQuickActions } from '../../app/QuickActions';
import { Segmented } from '../../components/ui/Segmented';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import type { GrowStatus } from '../../lib/db/types';
import { GrowCard } from '../Dashboard';

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
        title="Growlogs"
        subtitle="Deine Grow-Projekte mit Pflanzen, Fotos, Messwerten und Ausgaben."
        actions={
          <button type="button" className="btn-primary" onClick={() => quick({ kind: 'grow' })}>
            <Plus className="size-4" /> Neuer Grow
          </button>
        }
      />
      {data.grows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Sprout />}
            title="Noch kein Grow angelegt"
            text="Ein Grow-Projekt hält Startdatum, Meilensteine, Pflanzen, Fotos, Messwerte und Ausgaben zusammen. Tage und Phasendauern werden aus deinen Einträgen berechnet."
            action={
              <button type="button" className="btn-primary" onClick={() => quick({ kind: 'grow' })}>
                <Plus className="size-4" /> Ersten Grow anlegen
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
                  { value: 'active', label: `Aktiv (${counts.active})` },
                  { value: 'completed', label: `Abgeschl. (${counts.completed})` },
                  { value: 'archived', label: `Archiv (${counts.archived})` },
                  { value: 'all', label: 'Alle' },
                ]}
              />
            </div>
            <label className="relative block sm:w-64">
              <span className="sr-only">Grows durchsuchen</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
              <input className="input-base pl-9" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {grows.length === 0 ? (
            <div className="card">
              <EmptyState compact title="Keine Grows in dieser Ansicht" text={q ? 'Suchbegriff anpassen.' : 'Andere Filter wählen.'} />
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
