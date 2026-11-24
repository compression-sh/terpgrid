import { BellPlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { errorText, useToast } from '../../app/Toasts';
import { fmtDate, today } from '../../lib/dates';
import { updateRecord } from '../../lib/db/repo';
import type { InventoryItem } from '../../lib/db/types';
import { Modal } from '../ui/Modal';
import { ReminderFormModal } from './PersonalForms';

/** Wartungsprotokoll eines Geräts (eigene Einträge) und Absprung zu einer Wartungs-Erinnerung. */
export function MaintenanceModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [reminder, setReminder] = useState(false);
  const log = [...(item.maintenanceLog ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  async function add() {
    if (!note.trim() || !date) return;
    try {
      await updateRecord('inventory', item.id, { maintenanceLog: [...(item.maintenanceLog ?? []), { date, note: note.trim().slice(0, 300) }].slice(-200) });
      setNote('');
      toast('Wartung eingetragen');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }
  async function remove(i: number) {
    const entry = log[i]!;
    if (!(await confirm({ title: 'Eintrag löschen?', message: `${fmtDate(entry.date)}: ${entry.note}`, confirmLabel: 'Löschen', tone: 'danger' }))) return;
    const idx = (item.maintenanceLog ?? []).findIndex((x) => x.date === entry.date && x.note === entry.note);
    await updateRecord('inventory', item.id, { maintenanceLog: (item.maintenanceLog ?? []).filter((_, j) => j !== idx) });
  }

  return (
    <Modal open onClose={onClose} title="Wartung & Prüfungen" subtitle={item.name} size="md">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-end">
          <label className="space-y-1">
            <span className="label">Datum</span>
            <input type="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="label">Was wurde gemacht?</span>
            <input className="input-base" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Filter gewechselt, Lüfter gereinigt" onKeyDown={(e) => e.key === 'Enter' && add()} />
          </label>
          <button type="button" className="btn-primary" onClick={add} disabled={!note.trim()}>
            Eintragen
          </button>
        </div>
        {log.length === 0 ? (
          <p className="text-[13px] text-ink-500">Noch keine Wartung eingetragen.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
            {log.map((e, i) => (
              <li key={`${e.date}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
                <span>
                  <span className="font-mono text-[12px] text-ink-400">{fmtDate(e.date)}</span> <span className="text-ink-200">{e.note}</span>
                </span>
                <button type="button" className="p-1 text-ink-500 hover:text-rose-300" aria-label="Eintrag löschen" onClick={() => remove(i)}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setReminder(true)}>
          <BellPlus className="size-3.5" /> Wartungs-Erinnerung anlegen
        </button>
      </div>
      {reminder && <ReminderFormModal open onClose={() => setReminder(false)} defaults={{ title: `Wartung: ${item.name}`, category: 'maintenance' }} />}
    </Modal>
  );
}
