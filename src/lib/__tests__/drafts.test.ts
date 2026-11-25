import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectDatabase } from '../db/database';
import { clearDraft, loadDraft, saveDraft } from '../drafts';

class MemoryStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('Formular-Entwürfe', () => {
  beforeEach(() => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = new MemoryStorage();
  });
  afterEach(() => {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it('sind je Konto getrennt und werden beim Löschen entfernt', () => {
    const valid = (d: Record<string, unknown>) => typeof d.notes === 'string';
    selectDatabase('konto-a');
    saveDraft('journal', { notes: 'A' });
    selectDatabase('konto-b');
    expect(loadDraft('journal', valid)).toBeNull();
    saveDraft('journal', { notes: 'B' });
    selectDatabase('konto-a');
    expect(loadDraft<{ notes: string }>('journal', valid)?.notes).toBe('A');
    clearDraft('journal');
    expect(loadDraft('journal', valid)).toBeNull();
    selectDatabase('konto-b');
    expect(loadDraft<{ notes: string }>('journal', valid)?.notes).toBe('B');
  });

  it('verwirft beschädigte oder unpassende Entwürfe und funktioniert ohne Speicher', () => {
    selectDatabase('konto-c');
    (globalThis as unknown as { sessionStorage: MemoryStorage }).sessionStorage.setItem('terpgrid.draft.journal.' + 'x', '{');
    saveDraft('journal', { other: 1 });
    expect(loadDraft('journal', (d) => typeof d.notes === 'string')).toBeNull();
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    expect(() => saveDraft('journal', { notes: 'x' })).not.toThrow();
    expect(loadDraft('journal', () => true)).toBeNull();
  });
});
