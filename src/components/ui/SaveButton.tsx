import { Bookmark, Check } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n';

export function SaveButton({ onSave, defaultName }: { onSave: (name: string) => void; defaultName: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(defaultName);
  const [saved, setSaved] = useState(false);

  if (editing) {
    return (
      <form
        className="flex items-center gap-1.5 no-print"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name);
          setEditing(false);
          setSaved(true);
          setTimeout(() => setSaved(false), 1800);
        }}
      >
        <input
          autoFocus
          aria-label={t('common.save.name')}
          className="input-base w-36 py-1.5 sm:w-44"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
        <button type="submit" className="btn-primary py-1.5">
          {t('common.save.button')}
        </button>
      </form>
    );
  }
  return (
    <button
      type="button"
      className="btn-ghost py-1.5 no-print"
      onClick={() => {
        setName(defaultName);
        setEditing(true);
      }}
      title={t('common.save.local')}
    >
      {saved ? <Check className="size-4 text-leaf-400" /> : <Bookmark className="size-4" aria-hidden />}
      <span className="hidden sm:inline">{saved ? t('common.save.saved') : t('common.save.button')}</span>
    </button>
  );
}
