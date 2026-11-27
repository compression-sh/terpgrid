import { CalendarClock, Dna, Plug, Repeat } from 'lucide-react';
import { href } from '../../app/router';
import { nextPerReminder, repeatLabel } from '../../lib/calendar';
import { relativeDay } from '../../lib/dates';
import type { InventoryItem, Plant, Reminder, Strain } from '../../lib/db/types';
import { growContext } from '../../lib/grow/context';
import { fmt } from '../../lib/format';
import { Card } from '../ui/Card';
import { t } from '../../i18n';

/** Sorten & Genetik eines Grows – aus den Verknüpfungen der Pflanzen. */
export function GrowStrainsCard({ plants, strains }: { plants: Plant[]; strains: Strain[] }) {
  const rows = growContext(plants, strains, []).strains;
  if (rows.length === 0) return null;
  return (
    <Card title={t('grow.context.strainsTitle')} icon={<Dna className="size-4" />} subtitle={t('grow.context.strainsSub')}>
      <ul className="divide-y divide-white/[0.05]">
        {rows.map((r) => (
          <li key={r.strainId ?? r.name} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              {r.strainId ? (
                <a href={href(`strains/${r.strainId}`)} className="block truncate text-[13.5px] font-medium text-ink-50 hover:underline">
                  {r.name}
                </a>
              ) : (
                <span className="block truncate text-[13.5px] font-medium text-ink-50">{r.name}</span>
              )}
              <span className="block truncate text-[11.5px] text-ink-400">{r.breeder ?? t('grow.context.noBreeder')}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-ink-500 tabular">
                {r.plants} {r.plants === 1 ? 'Pflanze' : 'Pflanzen'}
              </span>
              {r.catalogId && (
                <>
                  <a href={href(`discover/cultivar/${r.catalogId}`)} className="inline-flex min-h-6 items-center rounded-md border border-white/[0.08] px-2 text-[11.5px] text-ink-200 hover:border-white/20">
                    {t('grow.context.catalog')}
                  </a>
                  <a href={href(`discover/genetics/c/${r.catalogId}`)} className="inline-flex min-h-6 items-center rounded-md border border-white/[0.08] px-2 text-[11.5px] text-ink-200 hover:border-white/20">
                    {t('grow.context.lineage')}
                  </a>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Nächste offene Termine dieses Grows (je Erinnerung eine Zeile). */
export function GrowTasksCard({ reminders, today, onAdd }: { reminders: Reminder[]; today: string; onAdd: () => void }) {
  const rows = nextPerReminder(reminders, today, 14).slice(0, 5);
  return (
    <Card
      title={t('grow.context.upcoming')}
      subtitle={t('grow.context.next14')}
      icon={<CalendarClock className="size-4" />}
      actions={
        <button type="button" className="btn-ghost py-1.5 text-xs" onClick={onAdd}>
          {t('grow.context.reminder')}
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="hint">{t('grow.context.noReminders')}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const rep = repeatLabel(r.reminder.repeat);
            return (
              <li key={r.reminder.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink-100">{r.reminder.title}</span>
                  {rep && (
                    <span className="flex items-center gap-1 text-[11px] text-ink-500">
                      <Repeat className="size-3" aria-hidden /> {rep}
                      {r.more > 0 && ` · +${r.more} weitere`}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 text-[12px] tabular ${r.late ? 'text-amber-300' : 'text-ink-300'}`}>{r.late ? t('dashboard.today.overdue', { date: relativeDay(r.date, today) }) : relativeDay(r.date, today)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Grow-Bereiche der Pflanzen mit zugeordneter Ausrüstung und geschätztem Strombedarf aus eigenen Angaben. */
export function GrowEquipmentCard({ plants, inventory }: { plants: Plant[]; inventory: InventoryItem[] }) {
  const spaces = growContext(plants, [], inventory).spaces;
  return (
    <Card title={t('grow.context.spaceTitle')} icon={<Plug className="size-4" />} subtitle={t('grow.context.spaceSub')}>
      {spaces.length === 0 ? (
        <p className="hint">
          {t('grow.context.noSpaceA')}{' '}
          <a href={href('collection')} className="text-leaf-300 hover:underline">
            {t('grow.context.collection')}
          </a>
          {t('grow.context.noSpaceB')}
        </p>
      ) : (
        <div className="space-y-3">
          {spaces.map((s) => (
            <div key={s.space.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13.5px] font-medium text-ink-50">{s.space.name}</span>
                <span className="shrink-0 text-[11px] text-ink-500">
                  {s.plants} {s.plants === 1 ? 'Pflanze' : 'Pflanzen'}
                  {s.space.dimensions ? ` · ${s.space.dimensions}` : ''}
                </span>
              </div>
              {s.equipment.length === 0 ? (
                <p className="hint mt-1">{t('grow.context.noEquipment')}</p>
              ) : (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.equipment.map((e) => (
                    <li key={e.id} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11.5px] text-ink-200">
                      {e.name}
                      {e.powerW !== undefined && <span className="font-mono text-ink-400"> · {fmt(e.powerW)} W</span>}
                    </li>
                  ))}
                </ul>
              )}
              {s.equipment.length > 0 && (
                <p className="mt-1.5 text-[11.5px] text-ink-400">
                  Strom (Schätzung aus deinen Angaben): <span className="font-mono text-ink-200 tabular">{fmt(s.kWhPerDay)} kWh/Tag</span>
                  {s.missing > 0 && ` · ${t('grow.context.missingPower', { count: s.missing })}`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
