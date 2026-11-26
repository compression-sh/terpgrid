import { describe, expect, it } from 'vitest';
import { SYNC_STATE_LABEL, deriveSyncState, syncStateText } from '../sync/status';
import { detectPlatform } from '../pwa/pwa';

describe('Synchronisationszustände', () => {
  it('verwendet die sieben festgelegten deutschen Begriffe', () => {
    expect(Object.values(SYNC_STATE_LABEL)).toEqual([
      'Synchronisiert',
      'Änderungen ausstehend',
      'Offline',
      'Synchronisierung läuft',
      'Konflikt erkannt',
      'Synchronisierung fehlgeschlagen',
      'Zugriff widerrufen',
    ]);
  });
  it('priorisiert Widerruf, Offline und Konflikte', () => {
    expect(deriveSyncState({ phase: 'revoked', pending: 2, conflicts: 1 })).toBe('revoked');
    expect(deriveSyncState({ phase: 'idle', pending: 2, conflicts: 1, offline: true })).toBe('offline');
    expect(deriveSyncState({ phase: 'syncing', pending: 2, conflicts: 1 })).toBe('conflict');
    expect(deriveSyncState({ phase: 'syncing', pending: 2, conflicts: 0 })).toBe('syncing');
    expect(deriveSyncState({ phase: 'error', pending: 2, conflicts: 0 })).toBe('failed');
    expect(deriveSyncState({ phase: 'idle', pending: 2, conflicts: 0 })).toBe('pending');
    expect(deriveSyncState({ phase: 'idle', pending: 0, conflicts: 0 })).toBe('synced');
  });
  it('„Synchronisiert“ nie bei ausstehenden Änderungen', () => {
    for (const phase of ['idle', 'stopped']) expect(syncStateText({ phase, pending: 1, conflicts: 0 })).not.toBe('Synchronisiert');
    expect(syncStateText({ phase: 'offline', pending: 3, conflicts: 0 })).toBe('Offline · 3 ausstehend');
  });
});

describe('Plattformerkennung (nur für Installationshinweise)', () => {
  it('erkennt iPhone, iPad (auch als Mac getarnt), Android und Desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit', 5)).toBe('ipados');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit', 0)).toBe('desktop');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5)).toBe('android');
  });
});
