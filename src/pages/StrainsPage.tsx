import { PROVIDER_LABEL, externalLink } from '../lib/catalog/links';
import { BadgeCheck, BookOpenText, Camera, Compass, Dna, FlaskRound, GitCompare, Globe, Heart, Leaf, Package, Pencil, Plus, Search, Sprout, Trash2 } from 'lucide-react';
import { useCompare } from '../app/catalog';
import { useMemo, useState } from 'react';
import { useConfirm } from '../app/Confirm';
import { useData } from '../app/DataProvider';
import { errorText, useToast } from '../app/Toasts';
import { href, navigate } from '../app/router';
import { SelectField, Stars } from '../components/forms/Fields';
import { InventoryFormModal, JournalFormModal, StrainFormModal } from '../components/forms/PersonalForms';
import { PhotoGrid } from '../components/photos/PhotoGrid';
import { PhotoImg } from '../components/photos/PhotoImg';
import { PhotoUploadModal } from '../components/photos/PhotoUpload';
import { Card } from '../components/ui/Card';
import { Chip, PhaseChip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { fmtDateTime, today } from '../lib/dates';
import { deleteStrain, updateRecord } from '../lib/db/repo';
import type { ClaimSource, SourcedValue, Strain } from '../lib/db/types';
import { CLAIM_SOURCE_LABEL, METHOD_LABEL } from '../lib/grow/labels';
import { currentPhase } from '../lib/grow/phases';
import { fmt } from '../lib/format';
import { ShareButton } from '../components/collab/ShareDialog';
import { t, intlLocale } from '../i18n';

export function SourceBadge({ source }: { source: ClaimSource }) {
  if (source === 'lab')
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-leaf-500/30 bg-leaf-500/10 px-1.5 py-px text-[10px] font-medium text-leaf-300" title={t('mine.sp.labTitle')}>
        <BadgeCheck className="size-3" /> {t('mine.sp.lab')}
      </span>
    );
  return (
    <span className="rounded-full border border-white/[0.1] px-1.5 py-px text-[10px] text-ink-400" title={CLAIM_SOURCE_LABEL[source]}>
      {source === 'personal' ? t('mine.sp.personal') : t('mine.sp.stated')}
    </span>
  );
}

function Cannabinoid({ label, v }: { label: string; v?: SourcedValue }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      {v ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[14px] tabular text-ink-50">{fmt(v.value)} %</span>
          <SourceBadge source={v.source} />
        </div>
      ) : (
        <div className="text-[13px] text-ink-500">–</div>
      )}
    </div>
  );
}

function StrainCard({ strain }: { strain: Strain }) {
  const { data } = useData();
  const toast = useToast();
  const grows = new Set(data.plants.filter((p) => p.strainId === strain.id).map((p) => p.growId)).size;
  const journal = data.journal.filter((j) => j.strainId === strain.id).length;
  const cover = strain.coverPhotoId ?? data.photos.find((p) => p.strainId === strain.id)?.id;
  return (
    <article className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/60 transition-colors hover:border-white/[0.12]">
      <a href={href(`strains/${strain.id}`)} className="block">
        <div className="relative h-32 overflow-hidden">
          <PhotoImg photoId={cover} alt={strain.name} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 to-transparent" />
          <div className="absolute bottom-2 left-3 right-10">
            <h3 className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-white">
              {strain.name}
              {strain.external && <Globe className="size-3.5 shrink-0 text-leaf-300" aria-label={t('mine.sp.linked')} />}
            </h3>
            <div className="truncate text-[11px] text-ink-300">{strain.breeder || t('mine.sp.noBreeder')}</div>
          </div>
        </div>
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Cannabinoid label="THC" v={strain.thc} />
            <Cannabinoid label="CBD" v={strain.cbd} />
          </div>
          {strain.aromas.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {strain.aromas.slice(0, 4).map((a) => (
                <span key={a} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-ink-300">
                  {a}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] text-ink-500">
            <span>
              {grows} Grows · {journal} Journal
            </span>
            <Stars value={strain.rating} size="xs" />
          </div>
        </div>
      </a>
      <button
        type="button"
        aria-pressed={strain.favorite}
        aria-label={strain.favorite ? t('mine.sp.unfav') : t('mine.sp.fav')}
        onClick={() => updateRecord('strains', strain.id, { favorite: !strain.favorite }).catch((e) => toast(errorText(e), { tone: 'error' }))}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/50 backdrop-blur hover:bg-black/70"
      >
        <Heart className={`size-4 ${strain.favorite ? 'fill-rose-400 text-rose-400' : 'text-ink-200'}`} />
      </button>
    </article>
  );
}

export function StrainsPage(_props: { strainId?: string }) {
  const { data } = useData();
  const [q, setQ] = useState('');
  const [type, setType] = useState<NonNullable<Strain['reportedType']> | ''>('');
  const [filter, setFilter] = useState<'' | 'favorite' | 'lab' | 'rated' | 'grown'>('');
  const [sort, setSort] = useState<'name' | 'rating' | 'updated'>('updated');
  const [creating, setCreating] = useState(false);

  const strains = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const grown = new Set(data.plants.map((p) => p.strainId).filter(Boolean));
    return data.strains
      .filter((s) => !needle || [s.name, s.breeder, s.genetics, s.flavorNotes, s.observations, ...s.aromas, ...s.terpenes.map((tp) => tp.name)].some((x) => x?.toLowerCase().includes(needle)))
      .filter((s) => !type || s.reportedType === type)
      .filter((s) =>
        filter === 'favorite' ? s.favorite : filter === 'lab' ? s.thc?.source === 'lab' || s.cbd?.source === 'lab' || s.terpenes.some((tp) => tp.source === 'lab') : filter === 'rated' ? !!s.rating : filter === 'grown' ? grown.has(s.id) : true,
      )
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'de') : sort === 'rating' ? (b.rating ?? 0) - (a.rating ?? 0) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [data.strains, data.plants, q, type, filter, sort]);

  return (
    <div>
      <PageHeader
        title={t('mine.sp.title')}
        subtitle={t('mine.sp.subtitle')}
        actions={
          <>
            <a href={href('discover')} className="btn-ghost">
              <Compass className="size-4" /> Discover
            </a>
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {t('mine.sp.own')}
            </button>
          </>
        }
      />
      {data.strains.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Leaf />}
            title={t('mine.sp.emptyTitle')}
            text={t('mine.sp.emptyText')}
            action={
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> {t('mine.sp.first')}
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative block space-y-1.5 sm:col-span-2 lg:col-span-1">
              <span className="label">{t('mine.sp.search')}</span>
              <Search className="pointer-events-none absolute left-3 top-[2.35rem] size-4 text-ink-500" />
              <input className="input-base pl-9" placeholder={t('mine.sp.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <SelectField
              label={t('mine.sp.filter')}
              value={filter}
              onChange={setFilter}
              placeholder={t('mine.sp.all')}
              options={[
                { value: 'favorite', label: t('mine.sp.favs') },
                { value: 'lab', label: t('mine.sp.withLab') },
                { value: 'rated', label: t('mine.sp.rated') },
                { value: 'grown', label: t('mine.sp.grown') },
              ]}
            />
            <SelectField
              label={t('mine.sp.type')}
              value={type}
              onChange={setType}
              placeholder={t('mine.sp.allShort')}
              options={[
                { value: 'indica', label: 'Indica' },
                { value: 'sativa', label: 'Sativa' },
                { value: 'hybrid', label: 'Hybrid' },
                { value: 'unknown', label: t('mine.sp.unknown') },
              ]}
            />
            <SelectField
              label={t('mine.sp.sort')}
              value={sort}
              onChange={(v) => setSort((v || 'updated') as typeof sort)}
              options={[
                { value: 'updated', label: t('mine.sp.recent') },
                { value: 'name', label: t('mine.sp.name') },
                { value: 'rating', label: t('mine.sp.rating') },
              ]}
            />
          </div>
          {strains.length === 0 ? (
            <div className="card">
              <EmptyState compact title={t('mine.sp.noHits')} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {strains.map((s) => (
                <StrainCard key={s.id} strain={s} />
              ))}
            </div>
          )}
          <p className="hint mt-5">{t('mine.sp.labNote')}</p>
        </>
      )}
      {creating && <StrainFormModal open onClose={() => setCreating(false)} onSaved={(s) => navigate(`strains/${s.id}`)} />}
    </div>
  );
}

export function StrainDetail({ strainId }: { strainId?: string }) {
  const { data } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState<'edit' | 'photo' | 'journal' | 'inventory' | null>(null);
  const compare = useCompare();
  const strain = data.strains.find((s) => s.id === strainId);
  const photos = useMemo(() => data.photos.filter((p) => p.strainId === strainId), [data.photos, strainId]);
  if (!strain) return <EmptyState title={t('mine.sp.notFound')} action={<a href={href('strains')} className="btn-primary">{t('mine.sp.toLib')}</a>} />;

  const plants = data.plants.filter((p) => p.strainId === strain.id);
  const grows = data.grows.filter((g) => plants.some((p) => p.growId === g.id));
  const journal = data.journal.filter((j) => j.strainId === strain.id).sort((a, b) => b.date.localeCompare(a.date));
  const inventory = data.inventory.filter((i) => i.strainId === strain.id);
  const cover = strain.coverPhotoId ?? [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]?.id;
  const maxTerp = Math.max(0, ...strain.terpenes.map((tp) => tp.percent ?? 0));
  const ratedJournal = journal.filter((j) => j.rating);
  const avgJournal = ratedJournal.length ? ratedJournal.reduce((s, j) => s + j.rating!, 0) / ratedJournal.length : undefined;

  async function remove() {
    const ok = await confirm({
      title: t('mine.sp.deleteTitle', { name: strain!.name }),
      message: t('mine.sp.deleteMsg'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteStrain(strain!.id);
      toast(t('mine.sp.deleted'));
      navigate('strains', { replace: true });
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: t('mine.sp.title'), to: 'strains' }, { label: strain.name }]}
        title={strain.name}
        subtitle={[strain.breeder, strain.genetics].filter(Boolean).join(' · ') || t('mine.sp.noSource')}
        meta={
          <>
            {strain.reportedType && strain.reportedType !== 'unknown' && <Chip>{strain.reportedType} (laut Quelle)</Chip>}
            {strain.favorite && <Chip tone="rose">{t('mine.sp.favorite')}</Chip>}
            <Stars value={strain.rating} />
          </>
        }
        actions={
          <>
            {strain.external && externalLink(strain.external.provider, strain.external.id) && (
              <a href={href(externalLink(strain.external.provider, strain.external.id)!)} className="btn-ghost">
                <Globe className="size-4" /> {t('mine.sp.catalog')}
              </a>
            )}
            {strain.external?.provider === 'strainapi' && (
              <a href={href(`discover/genetics/${strain.external.id}`)} className="btn-ghost">
                <Dna className="size-4" /> {t('mine.sp.genetics')}
              </a>
            )}
            {(() => {
              const key = strain.external && strain.external.provider !== 'cannalib' ? `${strain.external.provider}:${strain.external.id}` : `mine:${strain.id}`;
              const on = compare.has(key);
              return (
                <button type="button" className={`btn-ghost ${on ? 'border-sky-400/30 text-sky-200' : ''}`} aria-pressed={on} onClick={() => compare.toggle(key)}>
                  <GitCompare className="size-4" /> {on ? t('mine.sp.inCompare') : t('mine.sp.compare')}
                </button>
              );
            })()}
            <button type="button" className="btn-ghost" onClick={() => setModal('photo')}>
              <Camera className="size-4" /> {t('mine.sp.photo')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setModal('edit')}>
              <Pencil className="size-4" /> {t('common.edit')}
            </button>
            <ShareButton store="strains" ids={[strain.id]} />
            <button type="button" className="btn-ghost text-rose-300/90" onClick={remove} aria-label={t('mine.sp.deleteStrain')}>
              <Trash2 className="size-4" />
            </button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <div className="card overflow-hidden">
            <PhotoImg photoId={cover} variant="full" alt={strain.name} className="aspect-[4/3] w-full" />
          </div>
          <Card title={t('mine.sp.cann')} subtitle={t('mine.sp.cannSub')}>
            <div className="grid grid-cols-2 gap-4">
              <Cannabinoid label="THC" v={strain.thc} />
              <Cannabinoid label="CBD" v={strain.cbd} />
            </div>
            <p className="hint mt-3">{t('mine.sp.labelNote')}</p>
          </Card>
          {strain.external && (
            <Card title={t('mine.sp.source')} icon={<Globe className="size-4" />}>
              <p className="text-[13px] text-ink-300">
                {t('mine.sp.linkedTo', { provider: PROVIDER_LABEL[strain.external.provider] })}
                {strain.external.linkedAt && !Number.isNaN(Date.parse(strain.external.linkedAt)) ? t('mine.sp.since', { date: new Date(strain.external.linkedAt).toLocaleDateString(intlLocale()) }) : ''}. {t('mine.sp.adopted')}
              </p>
            </Card>
          )}
          <Card title={t('mine.sp.terpenes')}>
            {strain.terpenes.length === 0 ? (
              <p className="hint">{t('mine.sp.noTerp')}</p>
            ) : (
              <ul className="space-y-2.5">
                {strain.terpenes.map((tp) => (
                  <li key={tp.name}>
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="flex items-center gap-2 text-ink-100">
                        {tp.name} <SourceBadge source={tp.source} />
                      </span>
                      <span className="font-mono text-ink-300">{tp.percent !== undefined ? `${fmt(tp.percent)} %` : '–'}</span>
                    </div>
                    {tp.percent !== undefined && maxTerp > 0 && (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                        <div className="h-full rounded-full bg-leaf-500/70" style={{ width: `${(tp.percent / maxTerp) * 100}%` }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title={t('mine.sp.aroma')}>
            {strain.aromas.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {strain.aromas.map((a) => (
                  <Chip key={a} tone="green">
                    {a}
                  </Chip>
                ))}
              </div>
            )}
            {strain.flavorNotes && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-200">{strain.flavorNotes}</p>}
            {strain.observations && (
              <>
                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500">{t('mine.sp.observations')}</h4>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-300">{strain.observations}</p>
              </>
            )}
            {!strain.flavorNotes && !strain.observations && strain.aromas.length === 0 && <p className="hint">{t('mine.sp.noNotes')}</p>}
          </Card>
          <Card title={t('mine.sp.grows')} icon={<Sprout className="size-4" />}>
            {plants.length === 0 ? (
              <p className="hint">{t('mine.sp.noGrows')}</p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {plants.map((p) => {
                  const g = grows.find((x) => x.id === p.growId);
                  const dates = Object.keys(p.phaseDates).length ? p.phaseDates : (g?.phaseDates ?? {});
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <a href={href(`grows/${p.growId}/plants/${p.id}`)} className="min-w-0 hover:text-leaf-200">
                        <div className="truncate text-[13px] font-medium text-ink-100">{p.name}</div>
                        <div className="truncate text-[11px] text-ink-500">{g?.name}</div>
                      </a>
                      <div className="flex items-center gap-2">
                        {p.outcome?.dryWeightG !== undefined && <Chip tone="amber">{fmt(p.outcome.dryWeightG)} g</Chip>}
                        <PhaseChip phase={currentPhase(dates, today())} short />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card
            title={t('mine.sp.journal')}
            icon={<BookOpenText className="size-4" />}
            subtitle={avgJournal ? t('mine.sp.avg', { avg: fmt(avgJournal), count: ratedJournal.length }) : undefined}
            actions={
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setModal('journal')}>
                <Plus className="size-3.5" /> {t('mine.sp.entry')}
              </button>
            }
          >
            {journal.length === 0 ? (
              <p className="hint">{t('mine.sp.noJournal')}</p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {journal.slice(0, 6).map((j) => (
                  <li key={j.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-ink-100">{METHOD_LABEL[j.method]}</span>
                      <Stars value={j.rating} size="xs" />
                    </div>
                    <div className="text-[11px] text-ink-500">{fmtDateTime(j.date)}</div>
                    {j.notes && <p className="mt-1 line-clamp-2 text-xs text-ink-400">{j.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card
            title={t('mine.sp.inCollection')}
            icon={<Package className="size-4" />}
            actions={
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setModal('inventory')}>
                <Plus className="size-3.5" /> {t('mine.sp.add')}
              </button>
            }
          >
            {inventory.length === 0 ? (
              <p className="hint">{t('mine.sp.notInCollection')}</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {inventory.map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <a href={href('collection')} className="text-ink-100 hover:text-leaf-200">
                      {i.name}
                    </a>
                    <span className="font-mono text-ink-400">{i.quantity !== undefined ? `${fmt(i.quantity)} ${i.unit}` : '–'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card
            title={t('mine.sp.labReports')}
            icon={<FlaskRound className="size-4" />}
            actions={
              <a href={href(`lab-reports?strain=${strain.id}`)} className="btn-ghost py-1.5 text-xs">
                <Plus className="size-3.5" /> {t('mine.sp.report')}
              </a>
            }
          >
            {data.labReports.filter((r) => r.strainId === strain.id).length === 0 ? (
              <p className="hint">{t('mine.sp.noReports')}</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {data.labReports
                  .filter((r) => r.strainId === strain.id)
                  .map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <a href={href(`lab-reports?report=${r.id}`)} className="text-ink-100 hover:text-leaf-200">
                        {r.title}
                      </a>
                      <span className="text-[11px] text-ink-500">{r.testDate ? new Date(r.testDate).toLocaleDateString(intlLocale()) : ''}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
          <Card title={t('mine.sp.photos')} actions={<button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setModal('photo')}><Camera className="size-3.5" /> {t('mine.sp.upload')}</button>}>
            {photos.length === 0 ? <p className="hint">{t('mine.sp.noPhotos')}</p> : <PhotoGrid photos={photos} group={false} />}
          </Card>
        </div>
      </div>
      {modal === 'edit' && <StrainFormModal open onClose={() => setModal(null)} strain={strain} />}
      {modal === 'photo' && <PhotoUploadModal open onClose={() => setModal(null)} target={{ strainId: strain.id }} onUploaded={(ids) => !strain.coverPhotoId && ids[0] && updateRecord('strains', strain.id, { coverPhotoId: ids[0] })} />}
      {modal === 'journal' && <JournalFormModal open onClose={() => setModal(null)} strainId={strain.id} />}
      {modal === 'inventory' && <InventoryFormModal open onClose={() => setModal(null)} defaults={{ name: strain.name, category: 'cannabis', unit: 'g', strainId: strain.id }} />}
    </div>
  );
}
