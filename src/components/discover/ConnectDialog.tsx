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
import { t } from '../../i18n';

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
        if (!plantId) throw new Error(t('discover.connect.pickPlant'));
        await updateRecord('plants', plantId, { strainId: mine.id, strainName: undefined });
        const p = data.plants.find((x) => x.id === plantId);
        toast(t('discover.connect.linked', { plant: p?.name ?? '', strain: strain.name }), { action: { label: t('discover.open'), run: () => (window.location.hash = href(`grows/${p?.growId}/plants/${plantId}`)) } });
      } else {
        if (!growId) throw new Error(t('discover.connect.pickGrow'));
        if (!name.trim()) throw new Error(t('discover.connect.enterName'));
        const g = data.grows.find((x) => x.id === growId);
        const p = await createRecord('plants', { growId, name: name.trim(), strainId: mine.id, startDate: g?.startDate ?? today(), type: 'unknown', phaseDates: {}, notes: '' });
        toast(t('discover.connect.created', { plant: p.name, grow: g?.name ?? '' }), { action: { label: t('discover.open'), run: () => (window.location.hash = href(`grows/${growId}/plants/${p.id}`)) } });
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
      title={t('discover.connect.title', { strain: strain.name })}
      subtitle={t('discover.connect.subtitle')}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="connect-form" className="btn-primary" disabled={saving}>
            {mode === 'plant' ? t('discover.connect.link') : t('discover.connect.createPlant')}
          </button>
        </>
      }
    >
      <form id="connect-form" onSubmit={submit} className="space-y-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'plant', label: t('discover.connect.existing') },
            { value: 'grow', label: t('discover.connect.newInGrow') },
          ]}
        />
        {mode === 'plant' ? (
          plants.length === 0 ? (
            <Callout tone="info">{t('discover.connect.noPlants')}</Callout>
          ) : (
            <SelectField label={t('discover.connect.plant')} value={plantId} onChange={setPlantId} placeholder={t('discover.connect.plantPh')} options={plants.map((p) => ({ value: p.id, label: `${p.name} · ${growName.get(p.growId) ?? ''}` }))} hint={t('discover.connect.plantHint')} />
          )
        ) : data.grows.length === 0 ? (
          <Callout tone="info">{t('discover.connect.noGrows')}</Callout>
        ) : (
          <>
            <SelectField label="Grow" value={growId} onChange={setGrowId} options={data.grows.filter((g) => g.status !== 'archived').map((g) => ({ value: g.id, label: g.name }))} />
            <TextField label={t('discover.connect.plantName')} value={name} onChange={setName} maxLength={60} />
          </>
        )}
      </form>
    </Modal>
  );
}
