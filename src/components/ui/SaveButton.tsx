import { Bookmark, Check } from 'lucide-react';
import { useState } from 'react';

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
          aria-label="Name der Berechnung"
          className="input-base w-36 py-1.5 sm:w-44"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
        <button type="submit" className="btn-primary py-1.5">
          Speichern
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
      title="Lokal im Browser speichern"
    >
      {saved ? <Check className="size-4 text-leaf-400" /> : <Bookmark className="size-4" aria-hidden />}
      <span className="hidden sm:inline">{saved ? 'Gespeichert' : 'Speichern'}</span>
    </button>
  );
}
