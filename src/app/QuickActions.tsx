import { BookOpenText, Camera, ClipboardList, FlaskRound, Gauge, Leaf, Package, Sprout, Wrench } from 'lucide-react';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GrowFormModal, PlantFormModal } from '../components/forms/GrowForms';
import { InventoryFormModal, JournalFormModal, ReminderFormModal } from '../components/forms/PersonalForms';
import { QuickLogModal } from '../components/forms/QuickLogModal';
import { type PhotoTarget, PhotoUploadModal } from '../components/photos/PhotoUpload';
import { BottomSheet } from '../components/ui/BottomSheet';
import { useAuth } from './auth';
import { useToast } from './Toasts';
import { navigate } from './router';
import { t } from '../i18n';

export type Action =
  | { kind: 'grow' }
  | { kind: 'plant'; growId?: string }
  | { kind: 'photo'; target?: PhotoTarget }
  | { kind: 'journal' }
  | { kind: 'log'; plantId?: string; growId?: string }
  | { kind: 'task' }
  | { kind: 'collection' }
  | { kind: 'equipment' }
  | { kind: 'labReport' }
  /** Auswahl aller Erfassungsarten (mobiler Plus-Knopf) */
  | { kind: 'capture' };

const Ctx = createContext<(a: Action) => void>(() => {});

/** Erfassungsarten der Schnellerfassung – alle nutzen die bestehenden Formulare. */
export const CAPTURE_ITEMS: { kind: Exclude<Action['kind'], 'capture'>; label: string; hint: string; icon: typeof Gauge }[] = [
  { kind: 'log', get label() { return t('shell.capture.log.label'); }, get hint() { return t('shell.capture.log.hint'); }, icon: Gauge },
  { kind: 'photo', get label() { return t('shell.capture.photo.label'); }, get hint() { return t('shell.capture.photo.hint'); }, icon: Camera },
  { kind: 'journal', get label() { return t('shell.capture.journal.label'); }, get hint() { return t('shell.capture.journal.hint'); }, icon: BookOpenText },
  { kind: 'task', get label() { return t('shell.capture.task.label'); }, get hint() { return t('shell.capture.task.hint'); }, icon: ClipboardList },
  { kind: 'collection', get label() { return t('shell.capture.collection.label'); }, get hint() { return t('shell.capture.collection.hint'); }, icon: Package },
  { kind: 'equipment', get label() { return t('shell.capture.equipment.label'); }, get hint() { return t('shell.capture.equipment.hint'); }, icon: Wrench },
  { kind: 'labReport', get label() { return t('shell.capture.labReport.label'); }, get hint() { return t('shell.capture.labReport.hint'); }, icon: FlaskRound },
  { kind: 'plant', get label() { return t('shell.capture.plant.label'); }, get hint() { return t('shell.capture.plant.hint'); }, icon: Leaf },
  { kind: 'grow', get label() { return t('shell.capture.grow.label'); }, get hint() { return t('shell.capture.grow.hint'); }, icon: Sprout },
];

/** Globale Schnellaktionen (Dashboard, Kopfzeile, mobiler Plus-Knopf, App-Verknüpfungen). */
export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<Action | null>(null);
  const { sync, state } = useAuth();
  const toast = useToast();
  const server = state.kind === 'authenticated';
  const offline = server && (state.offline || sync.phase === 'offline');
  // Rückmeldung „lokal gespeichert“ vs. „synchronisiert“: Ausstehendes beim Öffnen merken
  const pendingAtOpen = useRef<number | null>(null);
  const awaitSync = useRef(false);
  const open = useCallback(
    (a: Action) => {
      if (a.kind === 'labReport') return navigate('lab-reports?neu=1');
      if (a.kind !== 'capture') pendingAtOpen.current = sync.pending;
      setAction(a);
    },
    [sync.pending],
  );
  const close = () => {
    setAction(null);
    const before = pendingAtOpen.current;
    pendingAtOpen.current = null;
    if (!server || before === null || sync.pending <= before) return;
    if (offline) toast(t('shell.saved.local'), { tone: 'info' });
    else awaitSync.current = true;
  };
  useEffect(() => {
    if (!awaitSync.current || sync.pending > 0 || sync.phase === 'syncing') return;
    awaitSync.current = false;
    if (sync.phase === 'idle') toast(t('shell.saved.synced'));
    else if (sync.phase === 'offline') toast(t('shell.saved.local'), { tone: 'info' });
  }, [sync.pending, sync.phase, toast]);
  const value = useMemo(() => open, [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {action?.kind === 'capture' && (
        <BottomSheet title={t('shell.capture.title')} onClose={() => setAction(null)}>
          <ul className="grid grid-cols-1 gap-1.5 min-[400px]:grid-cols-2">
            {CAPTURE_ITEMS.map((it) => {
              const Icon = it.icon;
              return (
                <li key={it.kind}>
                  <button
                    type="button"
                    className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left hover:border-white/[0.14] active:bg-white/[0.05]"
                    onClick={() => open({ kind: it.kind } as Action)}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-leaf-500/10 text-leaf-300">
                      <Icon className="size-4.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-ink-50">{it.label}</span>
                      <span className="block truncate text-[12px] text-ink-400">{it.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] leading-snug text-ink-400">
            {server ? t('shell.capture.serverHint') : t('shell.capture.localHint')}
          </p>
        </BottomSheet>
      )}
      {action?.kind === 'grow' && <GrowFormModal open onClose={close} onSaved={(g) => navigate(`grows/${g.id}`)} />}
      {action?.kind === 'plant' && <PlantFormModal open onClose={close} growId={action.growId} />}
      {action?.kind === 'photo' && <PhotoUploadModal open onClose={close} target={action.target} selectable />}
      {action?.kind === 'journal' && <JournalFormModal open onClose={close} />}
      {action?.kind === 'log' && <QuickLogModal onClose={close} plantId={action.plantId} growId={action.growId} />}
      {action?.kind === 'task' && <ReminderFormModal open onClose={close} />}
      {action?.kind === 'collection' && <InventoryFormModal open onClose={close} defaults={{ category: 'cannabis' }} />}
      {action?.kind === 'equipment' && <InventoryFormModal open onClose={close} defaults={{ category: 'equipment' }} />}
    </Ctx.Provider>
  );
}

export const useQuickActions = () => useContext(Ctx);
