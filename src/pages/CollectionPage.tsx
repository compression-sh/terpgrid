import { Camera, Minus, Package, Pencil, Plus, Receipt, Search, Trash2, Wrench, Zap } from 'lucide-react';
import { MaintenanceModal } from '../components/forms/MaintenanceModal';
import { spaceEnergy, spacePlants, warrantyState } from '../lib/grow/equipment';
import { SPACE_KIND_LABEL } from '../lib/grow/labels';
import { today } from '../lib/dates';
import { useMemo, useState } from 'react';
import { useConfirm } from '../app/Confirm';
import { useData, useLookup } from '../app/DataProvider';
import { errorText, useToast } from '../app/Toasts';
import { href } from '../app/router';
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
      title: 'Menge ändern?',
      message: (
        <>
          „{item.name}“: <span className="font-mono">{fmt(current)} {item.unit}</span> → <span className="font-mono text-ink-50">{fmt(next)} {item.unit}</span>
        </>
      ),
      confirmLabel: 'Menge speichern',
    });
    if (!ok) return;
    try {
      await updateRecord('inventory', item.id, { quantity: next });
      toast('Menge aktualisiert');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  async function remove() {
    if (!(await confirm({ title: `„${item.name}“ entfernen?`, message: 'Der Eintrag und seine eigenen Fotos werden gelöscht.', confirmLabel: 'Entfernen', tone: 'danger' }))) return;
    try {
      await deleteInventoryItem(item.id);
      toast('Eintrag entfernt');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-2.5">
      <button type="button" onClick={() => setModal('photo')} className="relative size-14 shrink-0 overflow-hidden rounded-lg" aria-label={cover ? 'Weiteres Foto hinzufügen' : 'Foto hinzufügen'}>
        <PhotoImg photoId={cover} alt="" className="h-full w-full" />
        {!cover && <Camera className="absolute bottom-1 right-1 size-3 text-ink-400" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[14px] font-medium text-ink-50">{item.name}</span>
          <Chip>{item.category === 'space' && item.spaceKind ? SPACE_KIND_LABEL[item.spaceKind] : INVENTORY_CATEGORY_LABEL[item.category]}</Chip>
          {item.archived && <Chip tone="amber">archiviert</Chip>}
          {(item.tags ?? []).map((t) => (
            <span key={t} className="rounded border border-white/[0.07] px-1.5 text-[10px] text-ink-400">
              #{t}
            </span>
          ))}
        </div>
        {(item.manufacturer || item.model || item.powerW !== undefined || warranty || space) && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-400">
            {(item.manufacturer || item.model) && <span>{[item.manufacturer, item.model].filter(Boolean).join(' ')}</span>}
            {item.powerW !== undefined && (
              <span className="font-mono tabular">
                {fmt(item.powerW, 0)} W{item.hoursPerDay !== undefined ? ` · ${fmt(item.hoursPerDay)} h/Tag` : ''}
              </span>
            )}
            {warranty && <span className={warranty === 'expired' ? 'text-ink-500' : warranty === 'soon' ? 'text-amber-300' : ''}>Garantie {warranty === 'expired' ? 'abgelaufen' : 'bis'} {fmtDate(item.warrantyUntil!)}</span>}
            {space && <span>Standort: {space.name}</span>}
          </div>
        )}
        {item.category === 'space' && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-400">
            {item.dimensions && <span>{item.dimensions}</span>}
            <span>{plantsHere.length} {plantsHere.length === 1 ? 'Pflanze' : 'Pflanzen'}</span>
            {energy && energy.devices > 0 && (
              <span className="inline-flex items-center gap-1" title="Summe aus Leistung × Betriebsstunden deiner Geräte in diesem Bereich – Schätzung, keine Messung">
                <Zap className="size-3" /> ≈ {fmt(energy.kWhPerDay)} kWh/Tag geschätzt ({energy.devices} Geräte{energy.missing ? `, ${energy.missing} ohne Leistung/Stunden` : ''})
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
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.quantity !== undefined && (
          <>
            <button type="button" className="btn-ghost p-1.5" aria-label="Menge verringern" onClick={() => adjust(-1)} disabled={(item.quantity ?? 0) <= 0}>
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-[3.5rem] text-center font-mono text-[13px] tabular text-ink-100">
              {fmt(item.quantity)} <span className="text-[11px] text-ink-500">{item.unit}</span>
            </span>
            <button type="button" className="btn-ghost p-1.5" aria-label="Menge erhöhen" onClick={() => adjust(1)}>
              <Plus className="size-3.5" />
            </button>
          </>
        )}
        {item.category === 'equipment' && (
          <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label="Wartung" title={`Wartung (${item.maintenanceLog?.length ?? 0} Einträge)`} onClick={() => setModal('maintenance')}>
            <Wrench className="size-3.5" />
          </button>
        )}
        <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label="Bearbeiten" onClick={() => setModal('edit')}>
          <Pencil className="size-3.5" />
        </button>
        <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5 hover:text-rose-300" aria-label="Entfernen" onClick={remove}>
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
  const { data, settings } = useData();
  const [tab, setTab] = useState<'inventory' | 'expenses' | 'strains'>('inventory');
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.inventory
      .filter((i) => !category || i.category === category)
      .filter((i) => showArchived || !i.archived)
      .filter((i) => !needle || [i.name, i.notes, i.manufacturer ?? '', i.model ?? '', ...(i.tags ?? [])].some((x) => x.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [data.inventory, category, q, showArchived]);
  const archivedCount = data.inventory.filter((i) => i.archived).length;

  const purchaseTotal = data.inventory.reduce((s, i) => s + (i.cost ?? 0), 0);
  const expenseTotal = data.expenses.reduce((s, e) => s + e.amount, 0);
  const favorites = data.strains.filter((s) => s.favorite);

  return (
    <div>
      <PageHeader
        title="Sammlung"
        subtitle="Inventar, Zubehör, Ausrüstung und Ausgaben – Mengen ändern sich nur durch dich."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Hinzufügen
          </button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Einträge', String(data.inventory.length)],
          ['Kaufpreise (Inventar)', money(purchaseTotal, settings.currency)],
          ['Erfasste Ausgaben', money(expenseTotal, settings.currency)],
          ['Favorisierte Sorten', String(favorites.length)],
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
            { value: 'inventory', label: 'Inventar' },
            { value: 'expenses', label: 'Ausgaben' },
            { value: 'strains', label: 'Sorten' },
          ]}
        />
      </div>

      {tab === 'inventory' && (
        <Card title="Inventar" icon={<Package className="size-4" />}>
          {data.inventory.length === 0 ? (
            <EmptyState
              icon={<Package />}
              title="Noch nichts erfasst"
              text="Cannabis, Samen, Zubehör und Grow-Ausrüstung mit Menge, Kaufdatum und Preis."
              action={
                <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                  <Plus className="size-4" /> Ersten Eintrag anlegen
                </button>
              }
            />
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className="relative block">
                  <span className="sr-only">Suche</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
                  <input className="input-base pl-9" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
                </label>
                <SelectField label="" aria-label="Kategorie" value={category} onChange={setCategory} placeholder="Alle Kategorien" options={INVENTORY_CATEGORIES.map((c) => ({ value: c, label: INVENTORY_CATEGORY_LABEL[c] }))} />
              </div>
              {items.length === 0 ? (
                <EmptyState compact title="Keine Treffer" />
              ) : (
                <ul className="space-y-2">
                  {items.map((i) => (
                    <ItemRow key={i.id} item={i} />
                  ))}
                </ul>
              )}
              {archivedCount > 0 && (
                <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-400">
                  <input type="checkbox" className="accent-leaf-500" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archivierte anzeigen ({archivedCount})
                </label>
              )}
              <p className="hint mt-4">Mengen werden nie automatisch angepasst. Änderungen über ± werden vorher bestätigt.</p>
            </>
          )}
        </Card>
      )}
      {tab === 'expenses' && (
        <Card title="Ausgaben" subtitle="Alle erfassten Kosten, optional einem Grow zugeordnet" icon={<Receipt className="size-4" />}>
          <ExpenseList expenses={data.expenses} showGrow />
        </Card>
      )}
      {tab === 'strains' && (
        <Card title="Gespeicherte Sorten" subtitle="Favoriten aus deiner Bibliothek">
          {favorites.length === 0 ? (
            <EmptyState compact title="Keine Favoriten" text="In der Sorten-Bibliothek das Herz antippen." action={<a href={href('strains')} className="btn-ghost">Zur Bibliothek</a>} />
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
