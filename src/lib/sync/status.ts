import { t, labels } from '../../i18n';
/**
 * Einheitliche Synchronisationszustände (Phase 5.6) für private Daten und gemeinsame Bereiche.
 * Reine Funktion – gleiche Begriffe überall in der Oberfläche.
 */
export type SyncState = 'synced' | 'pending' | 'offline' | 'syncing' | 'conflict' | 'failed' | 'revoked';

export const SYNC_STATE_LABEL = labels('labels.syncState', ['synced', 'pending', 'offline', 'syncing', 'conflict', 'failed', 'revoked'] as SyncState[]);

export interface SyncInput {
  phase: string;
  pending: number;
  conflicts: number;
  /** App läuft ohne Serververbindung (Offline-Start) */
  offline?: boolean;
}

/** Reihenfolge: Widerruf > Offline > Konflikt > läuft > Fehler > ausstehend > synchronisiert. */
export function deriveSyncState(s: SyncInput): SyncState {
  if (s.phase === 'revoked') return 'revoked';
  if (s.offline || s.phase === 'offline') return 'offline';
  if (s.conflicts > 0) return 'conflict';
  if (s.phase === 'syncing' || s.phase === 'loading') return 'syncing';
  if (s.phase === 'error') return 'failed';
  if (s.pending > 0) return 'pending';
  return 'synced';
}

/** Anzeigetext inkl. Anzahl, wo hilfreich. */
export function syncStateText(s: SyncInput): string {
  const st = deriveSyncState(s);
  if (st === 'offline' && s.pending > 0) return t('shell.sync.offlinePending', { n: s.pending });
  if (st === 'pending') return `${SYNC_STATE_LABEL.pending} (${s.pending})`;
  if (st === 'conflict' && s.conflicts > 1) return t('shell.sync.conflictsN', { n: s.conflicts });
  return SYNC_STATE_LABEL[st];
}
