import { withQuantityChange } from '../lib/inventory';
import { focusId, useFocusTarget } from '../app/useFocusTarget';
import { Camera, Minus, Package, Pencil, Plus, Receipt, Search, Trash2, Wrench, Zap } from 'lucide-react';
import { MaintenanceModal } from '../components/forms/MaintenanceModal';
import { spaceEnergy, spacePlants, warrantyState } from '../lib/grow/equipment';
import { SPACE_KIND_LABEL } from '../lib/grow/labels';
import { today } from '../lib/dates';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfirm } from '../app/Confirm';
import { useData, useLookup } from '../app/DataProvider';
import { errorText, useToast } from '../app/Toasts';
import { href, useRoute } from '../app/router';
import { SelectField } from '../components/forms/Fields';
import { InventoryFormModal } from '../components/forms/PersonalForms';
import { ExpenseList, money } from '../components/grow/ExpenseList';
import { PhotoImg } from '../components/photos/PhotoImg';
import { PhotoUploadModal } from '../components/photos/PhotoUpload';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Segmented } from '../components/ui/Segmented';
import { fmtDate } from '../lib/dates';
import { deleteInventoryItem, updateRecord } from '../lib/db/repo';
import { INVENTORY_CATEGORIES, type InventoryItem } from '../lib/db/types';
import { INVENTORY_CATEGORY_LABEL } from '../lib/grow/labels';
import { fmt } from '../lib/format';
import { SharePicker } from '../components/collab/ShareDialog';
import { t } from '../i18n';

function ItemRow({ item }: { item: InventoryItem }) {
  const { data, settings } = useData();
  const lookup = useLookup();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState<'edit' | 'photo' | 'maintenance' | null>(null);
  const cover = item.coverPhotoId ?? data.photos.find((p) => p.inventoryId === item.id)?.id;
  const strain = item.strainId ? lookup.strain.get(item.strainId) : undefined;
  const grow = item.growId ? lookup.grow.get(item.growId) : undefined;
  const space = item.spaceId ? data.inventory.find((i) => i.id === item.spaceId) : undefined;
  const energy = item.category === 'space' ? spaceEnergy(item.id, data.inventory) : undefined;
  const plantsHere = item.category === 'space' ? spacePlants(item.id, data.plants) : [];
  const warranty = warrantyState(item.warrantyUntil, today());

  async function adjust(delta: number) {
    const current = item.quantity ?? 0;
    const next = Math.max(0, Math.round((current + delta) * 1000) / 1000);
    const ok = await confirm({
      title: t('mine.cp.qtyTitle'),
      message: (
        <>
          „{item.name}“: <span className="font-mono">{fmt(current)} {item.unit}</span> → <span className="font-mono text-ink-50">{fmt(next)} {item.unit}</span>
        </>
      ),
      confirmLabel: t('mine.cp.qtySave'),
    });
    if (!ok) return;
    try {
      await updateRecord('inventory', item.id, { quantity: next, quantityLog: withQuantityChange(item.quantityLog, current, next, new Date().toISOString()) });
      toast(t('mine.cp.qtyUpdated'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  async function remove() {
    if (!(await confirm({ title: t('mine.cp.removeTitle', { name: item.name }), message: t('mine.cp.removeMsg'), confirmLabel: t('mine.cp.remove'), tone: 'danger' }))) return;
    try {
      await deleteInventoryItem(item.id);
      toast(t('mine.cp.removed'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  return (
    <li id={focusId('item', item.id)} className="flex scroll-mt-24 flex-wrap items-start gap-3 rounded-xl sm:flex-nowrap sm:items-center border border-white/[0.06] bg-ink-900/60 p-2.5">
      <button type="button" onClick={() => setModal('photo')} className="relative size-14 shrink-0 overflow-hidden rounded-lg" aria-label={cover ? t('mine.cp.addMorePhoto') : t('mine.cp.addPhoto')}>
        <PhotoImg photoId={cover} alt="" className="h-full w-full" />
        {!cover && <Camera className="absolute bottom-1 right-1 size-3 text-ink-400" />}
      </button>
      {/* Mobil: Inhalt neben dem Foto, Mengen- und Aktionsknöpfe darunter; ab sm alles in einer Zeile */}
      <div className="min-w-0 flex-1 basis-[calc(100%-4.25rem)] sm:basis-auto">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 max-w-full truncate text-[14px] font-medium text-ink-50">{item.name}</span>
          <Chip>{item.category === 'space' && item.spaceKind ? SPACE_KIND_LABEL[item.spaceKind] : INVENTORY_CATEGORY_LABEL[item.category]}</Chip>
          {item.archived && <Chip tone="amber">archiviert</Chip>}
          {(item.tags ?? []).map((tg) => (
            <span key={tg} className="rounded border border-white/[0.07] px-1.5 text-[10px] text-ink-400">
              #{tg}
            </span>
          ))}
        </div>
        {(item.manufacturer || item.model || item.powerW !== undefined || warranty || space) && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-400">
            {(item.manufacturer || item.model) && <span>{[item.manufacturer, item.model].filter(Boolean).join(' ')}</span>}
            {item.powerW !== undefined && (
              <span className="font-mono tabular">
                {fmt(item.powerW, 0)} W{item.hoursPerDay !== undefined ? t('mine.cp.hPerDay', { h: fmt(item.hoursPerDay) }) : ''}
              </span>
            )}
            {warranty && <span className={warranty === 'expired' ? 'text-ink-500' : warranty === 'soon' ? 'text-amber-300' : ''}>{warranty === 'expired' ? t('mine.cp.warrantyExpired', { date: fmtDate(item.warrantyUntil!) }) : t('mine.cp.warrantyUntil', { date: fmtDate(item.warrantyUntil!) })}</span>}
            {space && <span>{t('mine.cp.location', { name: space.name })}</span>}
          </div>
        )}
        {item.category === 'space' && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-400">
            {item.dimensions && <span>{item.dimensions}</span>}
            <span>{t('mine.cp.plants', { count: plantsHere.length })}</span>
            {energy && energy.devices > 0 && (
              <span className="inline-flex items-center gap-1" title={t('mine.cp.energyHint')}>
                <Zap className="size-3" /> {t('mine.cp.energy', { kwh: fmt(energy.kWhPerDay), n: energy.devices, missing: energy.missing ? t('mine.cp.energyMissing', { n: energy.missing }) : '' })}
              </span>
            )}
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-500">
          {item.purchaseDate && <span>gekauft {fmtDate(item.purchaseDate)}</span>}
          {item.cost !== undefined && <span>{money(item.cost, settings.currency)}</span>}
          {strain && (
            <a href={href(`strains/${strain.id}`)} className="hover:text-ink-200">
              Sorte: {strain.name}
            </a>
          )}
          {grow && (
            <a href={href(`grows/${grow.id}`)} className="hover:text-ink-200">
              aus Grow: {grow.name}
            </a>
          )}
        </div>
        {item.notes && <p className="mt-1 line-clamp-1 text-xs text-ink-400">{item.notes}</p>}
        {(item.quantityLog?.length ?? 0) > 0 && (
          <details className="mt-1 text-[11px] text-ink-500">
            <summary className="cursor-pointer hover:text-ink-300">{t('mine.cp.qtyLog', { n: item.quantityLog!.length })}</summary>
            <ol className="mt-1 space-y-0.5 font-mono">
              {[...item.quantityLog!].reverse().slice(0, 8).map((c) => (
                <li key={c.at}>
                  {fmtDate(c.at.slice(0, 10))}: {fmt(c.from)} → {fmt(c.to)} {item.unit}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <div className="-mt-1 flex w-full shrink-0 items-center justify-end gap-1 border-t border-white/[0.04] pt-1.5 sm:mt-0 sm:w-auto sm:border-0 sm:pt-0">
        {item.quantity !== undefined && (
          <>
            <button type="button" className="btn-ghost p-1.5" aria-label={t('mine.cp.decrease')} onClick={() => adjust(-1)} disabled={(item.quantity ?? 0) <= 0}>
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-[3.5rem] text-center font-mono text-[13px] tabular text-ink-100">
              {fmt(item.quantity)} <span className="text-[11px] text-ink-500">{item.unit}</span>
            </span>
            <button type="button" className="btn-ghost p-1.5" aria-label={t('mine.cp.increase')} onClick={() => adjust(1)}>
              <Plus className="size-3.5" />
            </button>
          </>
        )}
        {item.category === 'equipment' && (
          <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label={t('mine.cp.maintenance')} title={t('mine.cp.maintCount', { count: item.maintenanceLog?.length ?? 0 })} onClick={() => setModal('maintenance')}>
            <Wrench className="size-3.5" />
          </button>
        )}
        <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label={t('common.edit')} onClick={() => setModal('edit')}>
          <Pencil className="size-3.5" />
        </button>
        <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5 hover:text-rose-300" aria-label={t('mine.cp.remove')} onClick={remove}>
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {modal === 'edit' && <InventoryFormModal open onClose={() => setModal(null)} item={item} />}
      {modal === 'maintenance' && <MaintenanceModal item={item} onClose={() => setModal(null)} />}
      {modal === 'photo' && (
        <PhotoUploadModal
          open
          onClose={() => setModal(null)}
          target={{ inventoryId: item.id }}
          onUploaded={(ids) => !item.coverPhotoId && ids[0] && updateRecord('inventory', item.id, { coverPhotoId: ids[0] })}
        />
      )}
    </li>
  );
}

export function CollectionPage() {
  useFocusTarget('item', 'item');
  const { data, settings } = useData();
  const [tab, setTab] = useState<'inventory' | 'expenses' | 'strains'>('inventory');
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [tag, setTag] = useState('');
  const allTags = useMemo(() => [...new Set(data.inventory.flatMap((i) => i.tags ?? []))].sort((a, b) => a.localeCompare(b, 'de')), [data.inventory]);
  // Deeplink auf einen archivierten oder gefilterten Eintrag: Ansicht so öffnen, dass er sichtbar ist
  const target = useRoute().query.get('item');
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const it = target ? data.inventory.find((i) => i.id === target) : undefined;
    if (!it || handled.current === target) return;
    handled.current = target;
    setTab('inventory');
    setCategory('');
    setTag('');
    setQ('');
    if (it.archived) setShowArchived(true);
  }, [target, data.inventory]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.inventory
      .filter((i) => !category || i.category === category)
      .filter((i) => showArchived || !i.archived)
      .filter((i) => !tag || (i.tags ?? []).includes(tag))
      .filter((i) => !needle || [i.name, i.notes, i.manufacturer ?? '', i.model ?? '', ...(i.tags ?? [])].some((x) => x.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [data.inventory, category, q, showArchived, tag]);
  const archivedCount = data.inventory.filter((i) => i.archived).length;

  const purchaseTotal = data.inventory.reduce((s, i) => s + (i.cost ?? 0), 0);
  const expenseTotal = data.expenses.reduce((s, e) => s + e.amount, 0);
  const favorites = data.strains.filter((s) => s.favorite);

  return (
    <div>
      <PageHeader
        title={t('mine.cp.title')}
        subtitle={t('mine.cp.subtitle')}
        actions={
          <>
            <SharePicker store="inventory" items={data.inventory.filter((i) => !i.archived).map((i) => ({ id: i.id, title: i.name, sub: i.manufacturer }))} label={t('mine.cp.shareSel')} />
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {t('mine.cp.add')}
            </button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t('mine.cp.entries'), String(data.inventory.length)],
          [t('mine.cp.purchase'), money(purchaseTotal, settings.currency)],
          [t('mine.cp.expenses'), money(expenseTotal, settings.currency)],
          [t('mine.cp.favs'), String(favorites.length)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <div className="text-xs text-ink-400">{k}</div>
            <div className="mt-1 truncate font-mono text-lg font-semibold tabular text-ink-50">{v}</div>
          </div>
        ))}
      </div>
      <div className="mb-5 max-w-md">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'inventory', label: t('mine.cp.inventory') },
            { value: 'expenses', label: t('mine.cp.expensesTab') },
            { value: 'strains', label: t('mine.cp.strains') },
          ]}
        />
      </div>

      {tab === 'inventory' && (
        <Card title={t('mine.cp.inventory')} icon={<Package className="size-4" />}>
          {data.inventory.length === 0 ? (
            <EmptyState
              icon={<Package />}
              title={t('mine.cp.emptyTitle')}
              text={t('mine.cp.emptyText')}
              action={
                <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                  <Plus className="size-4" /> {t('mine.cp.first')}
                </button>
              }
            />
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className="relative block">
                  <span className="sr-only">{t('mine.cp.search')}</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
                  <input className="input-base pl-9" placeholder={t('mine.cp.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
                </label>
                <SelectField label="" aria-label={t('mine.cp.category')} value={category} onChange={setCategory} placeholder={t('mine.cp.allCats')} options={INVENTORY_CATEGORIES.map((c) => ({ value: c, label: INVENTORY_CATEGORY_LABEL[c] }))} />
              </div>
              {allTags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t('mine.cp.byTag')}>
                  {allTags.map((tg) => (
                    <button key={tg} type="button" aria-pressed={tag === tg} onClick={() => setTag(tag === tg ? '' : tg)} className={`rounded-full border px-2.5 py-0.5 text-[12px] ${tag === tg ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-100' : 'border-white/[0.08] text-ink-400 hover:text-ink-200'}`}>
                      #{tg}
                    </button>
                  ))}
                </div>
              )}
              {items.length === 0 ? (
                <EmptyState compact title={t('mine.cp.noHits')} />
              ) : (
                <ul className="space-y-2">
                  {items.map((i) => (
                    <ItemRow key={i.id} item={i} />
                  ))}
                </ul>
              )}
              {archivedCount > 0 && (
                <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-400">
                  <input type="checkbox" className="accent-leaf-500" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {t('mine.cp.showArchived', { n: archivedCount })}
                </label>
              )}
              <p className="hint mt-4">{t('mine.cp.qtyNever')}</p>
            </>
          )}
        </Card>
      )}
      {tab === 'expenses' && (
        <Card title={t('mine.cp.expensesTab')} subtitle={t('mine.cp.expensesSub')} icon={<Receipt className="size-4" />}>
          <ExpenseList expenses={data.expenses} showGrow />
        </Card>
      )}
      {tab === 'strains' && (
        <Card title={t('mine.cp.saved')} subtitle={t('mine.cp.savedSub')}>
          {favorites.length === 0 ? (
            <EmptyState compact title={t('mine.cp.noFavs')} text={t('mine.cp.noFavsText')} action={<a href={href('strains')} className="btn-ghost">{t('mine.cp.toLib')}</a>} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {favorites.map((s) => (
                <li key={s.id}>
                  <a href={href(`strains/${s.id}`)} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-2.5 hover:border-white/[0.12]">
                    <PhotoImg photoId={s.coverPhotoId} alt="" className="size-12 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink-100">{s.name}</span>
                      <span className="block truncate text-[11px] text-ink-500">{s.breeder || '–'}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {creating && <InventoryFormModal open onClose={() => setCreating(false)} />}
    </div>
  );
}
