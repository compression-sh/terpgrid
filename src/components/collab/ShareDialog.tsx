import { AlertTriangle, ArrowRightLeft, Copy, Loader2, Plus, Share2, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { pendingChanges, useAuth } from '../../app/auth';
import { useCollabAvailable } from '../../app/collab';
import { navigate } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { type ShareOptions, type SharePreview, type ShareableStore, type SpaceKind, type SpaceSummary, collab } from '../../lib/collab/api';
import { KIND_LABEL, ROLE_LABEL, STORE_LABEL } from '../../lib/collab/labels';
import { formatBytes } from '../../lib/media/images';
import { Callout } from '../ui/Callout';
import { Modal } from '../ui/Modal';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/Toggle';
import { t, tDynamic } from '../../i18n';

const MOVABLE: ShareableStore[] = ['grows', 'journal', 'labReports'];

/** Knopf „Teilen“ – nur im Servermodus sichtbar. */
export function ShareButton({ store, ids, label = t('collab.share.button'), compact = false }: { store: ShareableStore; ids: string[]; label?: string; compact?: boolean }) {
  const available = useCollabAvailable();
  const [open, setOpen] = useState(false);
  if (!available || !ids.length) return null;
  return (
    <>
      <button type="button" className={compact ? 'btn-ghost p-1.5' : 'btn-ghost'} onClick={() => setOpen(true)} aria-label={compact ? label : undefined} title={label}>
        <Share2 className="size-4" />
        {!compact && label}
      </button>
      {open && <ShareDialog store={store} ids={ids} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ShareDialog({ store, ids, onClose }: { store: ShareableStore; ids: string[]; onClose: () => void }) {
  const toast = useToast();
  const { engine } = useAuth();
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [spaceId, setSpaceId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<SpaceKind>(store === 'grows' || store === 'plants' ? 'project' : 'collection');
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [opts, setOpts] = useState<ShareOptions>({ photos: true, tasks: true, quantities: false, costs: false, notes: true, documents: true });
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [previewError, setPreviewError] = useState<string>();
  const [synced, setSynced] = useState<'checking' | 'ok' | 'pending'>('checking');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const movable = MOVABLE.includes(store);
  const what = tDynamic(`collab.share.noun.${store}`, String(ids.length), { count: ids.length });

  useEffect(() => {
    collab
      .spaces()
      .then((r) => {
        const writable = r.spaces.filter((s) => s.role === 'owner' || s.role === 'editor');
        setSpaces(writable);
        if (writable[0]) setSpaceId(writable[0].id);
        else setCreating(true);
      })
      .catch((e) => {
        setSpaces([]);
        toast(errorText(e), { tone: 'error' });
      });
    // Nur bestätigte, synchronisierte Daten teilen
    (async () => {
      await engine?.syncNow().catch(() => {});
      setSynced((await pendingChanges()) > 0 ? 'pending' : 'ok');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => ids.map((id) => ({ store, id })), [ids, store]);
  useEffect(() => {
    if (!spaceId && !creating) return setPreview(null);
    let alive = true;
    setPreviewError(undefined);
    const t = setTimeout(() => {
      (creating ? collab.sharePreviewAny(items, mode, opts) : collab.sharePreview(spaceId, items, mode, opts))
        .then((p) => alive && setPreview(p))
        .catch((e) => alive && (setPreview(null), setPreviewError(errorText(e))));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [spaceId, creating, items, mode, opts]);
  useEffect(() => setUnderstood(false), [mode, spaceId]);

  const submit = async () => {
    setBusy(true);
    try {
      let target = spaceId;
      if (creating) {
        if (newName.trim().length < 2) throw new Error(t('collab.share.nameMissing'));
        target = (await collab.createSpace({ name: newName.trim(), kind: newKind })).id;
      }
      const r = await collab.share(target, items, mode, opts);
      if (mode === 'move') await engine?.syncNow().catch(() => {});
      toast(mode === 'copy' ? t('collab.share.copied', { count: r.created }) : t('collab.share.moved', { count: r.created }), { tone: 'ok' });
      onClose();
      navigate(`together/spaces/${target}`);
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const toggles: { key: keyof ShareOptions; label: string; hint: string; show: boolean }[] = [
    { key: 'photos', label: t('collab.share.photos'), hint: t('collab.share.photosHint'), show: store !== 'labReports' },
    { key: 'tasks', label: t('collab.share.tasks'), hint: t('collab.share.tasksHint'), show: store === 'grows' },
    { key: 'notes', label: t('collab.share.notes'), hint: t('collab.share.notesHint'), show: true },
    { key: 'quantities', label: t('collab.share.quantities'), hint: t('collab.share.quantitiesHint'), show: store === 'inventory' },
    { key: 'costs', label: t('collab.share.costs'), hint: t('collab.share.costsHint'), show: store === 'inventory' },
    { key: 'documents', label: t('collab.share.documents'), hint: t('collab.share.documentsHint'), show: store === 'labReports' },
  ];
  const canSubmit = !busy && synced !== 'checking' && synced !== 'pending' && !!preview && (!creating || newName.trim().length >= 2) && (mode === 'copy' || understood);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('collab.share.title', { what })}
      subtitle={t('collab.share.subtitle')}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={mode === 'move' ? 'btn bg-amber-500 text-ink-950 hover:bg-amber-400' : 'btn-primary'} disabled={!canSubmit} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : mode === 'copy' ? <Copy className="size-4" /> : <ArrowRightLeft className="size-4" />}
            {mode === 'copy' ? t('collab.share.copy') : t('collab.share.move')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {synced === 'pending' && (
          <Callout tone="warn" title={t('collab.share.notSynced')}>
            {t('collab.share.notSyncedText')}
          </Callout>
        )}

        <div className="space-y-2">
          <div className="label">{t('collab.share.target')}</div>
          {spaces === null ? (
            <div className="skeleton h-10" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {spaces.map((s) => (
                <label key={s.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${!creating && spaceId === s.id ? 'border-leaf-500/40 bg-leaf-500/[0.07]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
                  <input
                    type="radio"
                    name="share-space"
                    className="mt-1 accent-[var(--color-leaf-400)]"
                    checked={!creating && spaceId === s.id}
                    onChange={() => {
                      setCreating(false);
                      setSpaceId(s.id);
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink-100">{s.name}</span>
                    <span className="block text-[11.5px] text-ink-400">
                      {KIND_LABEL[s.kind]} · {s.members} Mitglieder · deine Rolle: {ROLE_LABEL[s.role]}
                    </span>
                  </span>
                </label>
              ))}
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${creating ? 'border-leaf-500/40 bg-leaf-500/[0.07]' : 'border-dashed border-white/[0.1] hover:border-white/[0.18]'}`}>
                <input type="radio" name="share-space" className="mt-1 accent-[var(--color-leaf-400)]" checked={creating} onChange={() => setCreating(true)} />
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-100">
                  <Plus className="size-4" /> {t('collab.share.newSpace')}
                </span>
              </label>
            </div>
          )}
          {creating && (
            <div className="grid gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:grid-cols-[1fr_auto]">
              <label className="space-y-1.5">
                <span className="label">{t('collab.share.spaceName')}</span>
                <input className="input-base" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('collab.share.spaceNamePh')} />
              </label>
              <Segmented label={t('collab.share.kind')} size="sm" value={newKind} onChange={setNewKind} options={(['project', 'collection', 'general'] as SpaceKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
              <p className="hint sm:col-span-2">{t('collab.share.ownerHint')}</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Segmented
            label={t('collab.share.modeLabel')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'copy', label: t('collab.share.copyDefault') },
              ...(movable ? [{ value: 'move' as const, label: t('collab.share.moveTo') }] : []),
            ]}
          />
          {mode === 'copy' ? (
            <p className="hint">
              <ShieldCheck className="mr-1 inline size-3.5 text-leaf-400" />
              {t('collab.share.copyA')} <strong>{t('collab.share.copyNot')}</strong> {t('collab.share.copyB')}
            </p>
          ) : (
            <Callout tone="warn" title={t('collab.share.moveWarn')}>
              {t('collab.share.moveWarnText')}
            </Callout>
          )}
          {!movable && <p className="hint">{t('collab.share.notMovable')}</p>}
        </div>

        <div className="space-y-3 rounded-xl border border-white/[0.06] p-3">
          {toggles
            .filter((tg) => tg.show)
            .map((tg) => (
              <Toggle key={tg.key} label={tg.label} hint={tg.hint} checked={opts[tg.key] !== false && (tg.key === 'quantities' || tg.key === 'costs' ? opts[tg.key] === true : true)} onChange={(v) => setOpts((o) => ({ ...o, [tg.key]: v }))} />
            ))}
        </div>

        {(
          <section aria-label={t('collab.share.preview')} aria-live="polite" className="space-y-2">
            <div className="label">{t('collab.share.previewTitle')}</div>
            {previewError ? (
              <Callout tone="danger">{previewError}</Callout>
            ) : !preview ? (
              <div className="skeleton h-20" />
            ) : (
              <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[12.5px]">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(preview.summary.counts).map(([k, n]) => (
                    <span key={k} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-ink-200">
                      {n} {STORE_LABEL[k as keyof typeof STORE_LABEL]}
                    </span>
                  ))}
                  {preview.summary.bytes > 0 && <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-ink-300">{t('collab.share.files', { size: formatBytes(preview.summary.bytes) })}</span>}
                </div>
                <ul className="max-h-36 space-y-0.5 overflow-y-auto text-ink-300">
                  {preview.summary.titles.map((ti, i) => (
                    <li key={i} className="truncate">
                      <span className="text-ink-500">{STORE_LABEL[ti.store]}:</span> {ti.title}
                    </li>
                  ))}
                </ul>
                {preview.summary.removed.length > 0 && (
                  <div>
                    <div className="font-medium text-ink-200">{t('collab.share.notShared')}</div>
                    <ul className="ml-4 list-disc text-ink-400">
                      {preview.summary.removed.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {preview.summary.warnings.map((w) => (
                  <p key={w} className="flex gap-1.5 text-amber-200">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        {mode === 'move' && (
          <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-ink-200">
            <input type="checkbox" className="mt-0.5 accent-[var(--color-amber-400)]" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            {t('collab.share.understood')}
          </label>
        )}
      </div>
    </Modal>
  );
}

/** Mehrfachauswahl („Ausgewählte Einträge teilen“) für Listen wie Journal, Sammlung, Laborberichte. */
export function SharePicker({ store, items, label = t('collab.share.sharing') }: { store: ShareableStore; items: { id: string; title: string; sub?: string }[]; label?: string }) {
  const available = useCollabAvailable();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [share, setShare] = useState(false);
  const [q, setQ] = useState('');
  if (!available || !items.length) return null;
  const shown = items.filter((i) => !q || `${i.title} ${i.sub ?? ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        <Share2 className="size-4" /> {label}
      </button>
      {open && !share && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={t('collab.share.pick', { what: STORE_LABEL[store] })}
          subtitle={t('collab.share.pickerSubtitle')}
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn-primary" disabled={!picked.length} onClick={() => setShare(true)}>
                {t('collab.share.next', { n: picked.length })}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <input className="input-base" placeholder={t('collab.share.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('collab.share.searchAria')} />
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
              {shown.map((i) => (
                <li key={i.id}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${picked.includes(i.id) ? 'border-leaf-500/40 bg-leaf-500/[0.07]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--color-leaf-400)]"
                      checked={picked.includes(i.id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id].slice(0, 200) : p.filter((x) => x !== i.id)))}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink-100">{i.title}</span>
                      {i.sub && <span className="block truncate text-[11.5px] text-ink-400">{i.sub}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
      {share && (
        <ShareDialog
          store={store}
          ids={picked}
          onClose={() => {
            setShare(false);
            setOpen(false);
            setPicked([]);
          }}
        />
      )}
    </>
  );
}
