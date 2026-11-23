import { type FormEvent, useState } from 'react';
import { seedFromCatalog } from '../../app/catalog';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { href } from '../../app/router';
import type { CatalogStrain } from '../../lib/catalog/types';
import { today } from '../../lib/dates';
import { createRecord, ensureStrainForExternal, updateRecord } from '../../lib/db/repo';
import { SelectField, TextField } from '../forms/Fields';
import { Callout } from '../ui/Callout';
import { Modal } from '../ui/Modal';
import { Segmented } from '../ui/Segmented';

/**
 * Verknüpft eine Online-Sorte mit einer bestehenden Pflanze oder legt sie als
 * neue Pflanze in einem Grow an. Die Sorte wird dabei genau einmal in
 * „Meine Sorten“ angelegt (provider:id).
 */
export function ConnectDialog({ strain, onClose, initialMode = 'plant' }: { strain: CatalogStrain; onClose: () => void; initialMode?: 'plant' | 'grow' }) {
  const { data } = useData();
  const toast = useToast();
  const [mode, setMode] = useState<'plant' | 'grow'>(initialMode);
  const [plantId, setPlantId] = useState('');
  const [growId, setGrowId] = useState(data.grows.find((g) => g.status === 'active')?.id ?? '');
  const [name, setName] = useState(strain.name);
  const [saving, setSaving] = useState(false);
  const growName = new Map(data.grows.map((g) => [g.id, g.name]));
  const plants = [...data.plants].sort((a, b) => (growName.get(a.growId) ?? '').localeCompare(growName.get(b.growId) ?? '') || a.name.localeCompare(b.name));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const mine = await ensureStrainForExternal(seedFromCatalog(strain));
      if (mode === 'plant') {
        if (!plantId) throw new Error('Bitte eine Pflanze wählen.');
        await updateRecord('plants', plantId, { strainId: mine.id, strainName: undefined });
        const p = data.plants.find((x) => x.id === plantId);
        toast(`„${p?.name}“ mit ${strain.name} verknüpft`, { action: { label: 'Öffnen', run: () => (window.location.hash = href(`grows/${p?.growId}/plants/${plantId}`)) } });
      } else {
        if (!growId) throw new Error('Bitte einen Grow wählen.');
        if (!name.trim()) throw new Error('Bitte einen Namen eingeben.');
        const g = data.grows.find((x) => x.id === growId);
        const p = await createRecord('plants', { growId, name: name.trim(), strainId: mine.id, startDate: g?.startDate ?? today(), type: 'unknown', phaseDates: {}, notes: '' });
        toast(`Pflanze „${p.name}“ in ${g?.name} angelegt`, { action: { label: 'Öffnen', run: () => (window.location.hash = href(`grows/${growId}/plants/${p.id}`)) } });
      }
      onClose();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${strain.name} verknüpfen`}
      subtitle="Wird als Eintrag in „Meine Sorten“ gespeichert – nur einmal je Quelle."
      size="sm"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form="connect-form" className="btn-primary" disabled={saving}>
            {mode === 'plant' ? 'Verknüpfen' : 'Pflanze anlegen'}
          </button>
        </>
      }
    >
      <form id="connect-form" onSubmit={submit} className="space-y-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'plant', label: 'Bestehende Pflanze' },
            { value: 'grow', label: 'Neue Pflanze im Grow' },
          ]}
        />
        {mode === 'plant' ? (
          plants.length === 0 ? (
            <Callout tone="info">Noch keine Pflanzen vorhanden. Wähle „Neue Pflanze im Grow“.</Callout>
          ) : (
            <SelectField label="Pflanze" value={plantId} onChange={setPlantId} placeholder="Pflanze wählen …" options={plants.map((p) => ({ value: p.id, label: `${p.name} · ${growName.get(p.growId) ?? ''}` }))} hint="Eine bisherige Sortenangabe der Pflanze wird ersetzt." />
          )
        ) : data.grows.length === 0 ? (
          <Callout tone="info">Noch kein Grow vorhanden. Lege zuerst unter „Growlogs“ einen Grow an.</Callout>
        ) : (
          <>
            <SelectField label="Grow" value={growId} onChange={setGrowId} options={data.grows.filter((g) => g.status !== 'archived').map((g) => ({ value: g.id, label: g.name }))} />
            <TextField label="Name der Pflanze" value={name} onChange={setName} maxLength={60} />
          </>
        )}
      </form>
    </Modal>
  );
}
