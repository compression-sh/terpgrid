import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { GrowFormModal, PlantFormModal } from '../components/forms/GrowForms';
import { JournalFormModal } from '../components/forms/PersonalForms';
import { type PhotoTarget, PhotoUploadModal } from '../components/photos/PhotoUpload';
import { navigate } from './router';

type Action =
  | { kind: 'grow' }
  | { kind: 'plant'; growId?: string }
  | { kind: 'photo'; target?: PhotoTarget }
  | { kind: 'journal' };

const Ctx = createContext<(a: Action) => void>(() => {});

/** Globale Schnellaktionen (Dashboard, Kopfzeile, leere Zustände). */
export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<Action | null>(null);
  const open = useCallback((a: Action) => setAction(a), []);
  const close = () => setAction(null);
  const value = useMemo(() => open, [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {action?.kind === 'grow' && <GrowFormModal open onClose={close} onSaved={(g) => navigate(`grows/${g.id}`)} />}
      {action?.kind === 'plant' && <PlantFormModal open onClose={close} growId={action.growId} />}
      {action?.kind === 'photo' && <PhotoUploadModal open onClose={close} target={action.target} selectable />}
      {action?.kind === 'journal' && <JournalFormModal open onClose={close} />}
    </Ctx.Provider>
  );
}

export const useQuickActions = () => useContext(Ctx);
